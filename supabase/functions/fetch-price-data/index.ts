import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FINNHUB_API_KEY = Deno.env.get('FINNHUB_API_KEY') ?? '';
const TWELVE_DATA_API_KEY = Deno.env.get('TWELVE_DATA_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

interface CandleRow {
  pair_id: string;
  timeframe: string;
  open_time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  source: string;
}

// ============================================================
// Retry utility with exponential backoff
// ============================================================

async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries = 3,
  baseDelay = 1000
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.ok) return response;

      if (response.status === 429 || response.status >= 500) {
        lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError ?? new Error('fetchWithRetry failed');
}

// ============================================================
// Finnhub: Fetch forex candles
// ============================================================

function getFinnhubSymbol(base: string, quote: string): string[] {
  // OANDA feed supports forex pairs and commodities (XAU, XAG)
  return [`OANDA:${base}_${quote}`];
}

async function fetchFinnhubCandles(
  pairId: string,
  base: string,
  quote: string,
  fromTs: number,
  toTs: number
): Promise<CandleRow[]> {
  const symbols = getFinnhubSymbol(base, quote);

  for (const symbol of symbols) {
    const url = `https://finnhub.io/api/v1/forex/candle?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${fromTs}&to=${toTs}&token=${FINNHUB_API_KEY}`;

    try {
      const res = await fetchWithRetry(url);
      const data = await res.json();

      if (data.s === 'ok' && data.t && Array.isArray(data.t) && data.t.length > 0) {
        const candles: CandleRow[] = [];
        for (let i = 0; i < data.t.length; i++) {
          candles.push({
            pair_id: pairId,
            timeframe: 'D',
            open_time: new Date(data.t[i] * 1000).toISOString(),
            open: data.o[i],
            high: data.h[i],
            low: data.l[i],
            close: data.c[i],
            volume: data.v?.[i] ?? 0,
            source: 'finnhub',
          });
        }
        return candles;
      }
    } catch (err) {
      console.warn(`Finnhub symbol ${symbol} failed:`, err);
    }
  }

  return [];
}

// Legacy single-symbol version reference removed

// ============================================================
// Twelve Data: Fallback fetch forex candles
// ============================================================

async function fetchTwelveDataCandles(
  pairId: string,
  base: string,
  quote: string
): Promise<CandleRow[]> {
  if (!TWELVE_DATA_API_KEY) return [];

  const symbol = `${base}/${quote}`;
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=1day&outputsize=200&apikey=${TWELVE_DATA_API_KEY}`;

  const res = await fetchWithRetry(url);
  const data = await res.json();

  if (data.status === 'error' || !data.values || !Array.isArray(data.values)) {
    return [];
  }

  const candles: CandleRow[] = [];
  for (const v of data.values) {
    candles.push({
      pair_id: pairId,
      timeframe: 'D',
      open_time: new Date(v.datetime + 'T00:00:00Z').toISOString(),
      open: parseFloat(v.open),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close),
      volume: parseFloat(v.volume || '0'),
      source: 'twelvedata',
    });
  }

  return candles;
}

// ============================================================
// Main handler
// ============================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Health check
    const url = new URL(req.url);
    if (url.searchParams.get('health') === 'true') {
      const { data: logs } = await supabase
        .from('system_logs')
        .select('level, message, created_at')
        .eq('source', 'fetch-price-data')
        .order('created_at', { ascending: false })
        .limit(5);

      return new Response(JSON.stringify({ status: 'ok', recent_logs: logs }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get all active currency pairs
    const { data: pairs, error: pairsError } = await supabase
      .from('currency_pairs')
      .select('id, base_currency, quote_currency, symbol')
      .eq('is_active', true);

    if (pairsError) throw pairsError;
    if (!pairs || pairs.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No active pairs found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Time range: last 200 trading days (~280 calendar days)
    const toTs = Math.floor(Date.now() / 1000);
    const fromTs = toTs - 280 * 24 * 60 * 60;

    let totalUpserted = 0;
    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    // Process pairs in batches of 5 to respect rate limits
    const batchSize = 5;
    for (let i = 0; i < pairs.length; i += batchSize) {
      const batch = pairs.slice(i, i + batchSize);

      const results = await Promise.allSettled(
        batch.map(async (pair) => {
          let candles: CandleRow[] = [];

          // Try Finnhub first
          if (FINNHUB_API_KEY) {
            try {
              candles = await fetchFinnhubCandles(
                pair.id,
                pair.base_currency,
                pair.quote_currency,
                fromTs,
                toTs
              );
            } catch (err) {
              console.warn(`Finnhub failed for ${pair.symbol}:`, err);
            }
          }

          // Fallback to Twelve Data
          if (candles.length === 0 && TWELVE_DATA_API_KEY) {
            try {
              candles = await fetchTwelveDataCandles(
                pair.id,
                pair.base_currency,
                pair.quote_currency
              );
            } catch (err) {
              console.warn(`TwelveData failed for ${pair.symbol}:`, err);
            }
          }

          if (candles.length === 0) {
            throw new Error(`No candle data for ${pair.symbol} from any source (Finnhub key: ${FINNHUB_API_KEY ? 'set' : 'MISSING'}, TwelveData key: ${TWELVE_DATA_API_KEY ? 'set' : 'MISSING'})`);
          }

          // Upsert in batches of 100
          let upserted = 0;
          for (let j = 0; j < candles.length; j += 100) {
            const chunk = candles.slice(j, j + 100);
            const { error: upsertError } = await supabase
              .from('price_candles')
              .upsert(chunk, {
                onConflict: 'pair_id,timeframe,open_time',
                ignoreDuplicates: false,
              });

            if (upsertError) {
              throw new Error(`Upsert error for ${pair.symbol}: ${upsertError.message}`);
            }
            upserted += chunk.length;
          }

          return { symbol: pair.symbol, upserted };
        })
      );

      for (const r of results) {
        if (r.status === 'fulfilled') {
          totalUpserted += r.value.upserted;
          successCount++;
        } else {
          failCount++;
          errors.push(r.reason?.message ?? 'Unknown error');
        }
      }

      // Rate limit delay between batches (Finnhub free: 60/min)
      if (i + batchSize < pairs.length) {
        await new Promise((r) => setTimeout(r, 3000));
      }
    }

    // Log results
    const level = failCount === 0 ? 'info' : failCount < pairs.length ? 'warn' : 'error';
    const message = `fetch-price-data: ${successCount}/${pairs.length} pairs fetched, ${totalUpserted} candles upserted${failCount > 0 ? `, ${failCount} failed` : ''}`;

    await supabase.from('system_logs').insert({
      level,
      source: 'fetch-price-data',
      message,
      metadata: { successCount, failCount, totalUpserted, errors: errors.slice(0, 10) },
    });

    return new Response(
      JSON.stringify({
        message,
        success: successCount,
        failed: failCount,
        upserted: totalUpserted,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('fetch-price-data error:', errorMessage);

    await supabase.from('system_logs').insert({
      level: 'error',
      source: 'fetch-price-data',
      message: `fetch-price-data failed: ${errorMessage}`,
    });

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
