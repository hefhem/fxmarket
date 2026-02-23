import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

interface Candle {
  open_time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface IndicatorRow {
  pair_id: string;
  indicator_date: string;
  timeframe: string;
  rsi_14: number | null;
  macd_line: number | null;
  macd_signal: number | null;
  macd_histogram: number | null;
  sma_20: number | null;
  sma_50: number | null;
  sma_200: number | null;
  ema_12: number | null;
  ema_26: number | null;
  support_level: number | null;
  resistance_level: number | null;
  atr_14: number | null;
  ta_signal: string;
  ta_score: number;
}

// ============================================================
// Technical Indicator Calculations
// ============================================================

function computeSMA(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const slice = closes.slice(closes.length - period);
  return slice.reduce((sum, v) => sum + v, 0) / period;
}

function computeEMA(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const multiplier = 2 / (period + 1);
  // Seed EMA with SMA of first `period` values
  let ema = closes.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < closes.length; i++) {
    ema = (closes[i] - ema) * multiplier + ema;
  }
  return ema;
}

function computeRSI(closes: number[], period: number): number | null {
  if (closes.length < period + 1) return null;

  let avgGain = 0;
  let avgLoss = 0;

  // Initial average using Wilder's smoothing
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;

  // Wilder's smoothing for remaining values
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (change > 0 ? change : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (change < 0 ? Math.abs(change) : 0)) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function computeMACD(closes: number[]): {
  line: number | null;
  signal: number | null;
  histogram: number | null;
} {
  if (closes.length < 35) return { line: null, signal: null, histogram: null };

  // Compute full EMA-12 and EMA-26 series for MACD signal calculation
  const ema12Series: number[] = [];
  const ema26Series: number[] = [];

  // Seed EMA-12
  let ema12 = closes.slice(0, 12).reduce((s, v) => s + v, 0) / 12;
  ema12Series.push(ema12);
  const m12 = 2 / 13;
  for (let i = 12; i < closes.length; i++) {
    ema12 = (closes[i] - ema12) * m12 + ema12;
    ema12Series.push(ema12);
  }

  // Seed EMA-26
  let ema26 = closes.slice(0, 26).reduce((s, v) => s + v, 0) / 26;
  ema26Series.push(ema26);
  const m26 = 2 / 27;
  for (let i = 26; i < closes.length; i++) {
    ema26 = (closes[i] - ema26) * m26 + ema26;
    ema26Series.push(ema26);
  }

  // MACD line = EMA-12 - EMA-26 (aligned from index 26 onwards)
  // ema12Series starts from index 12, ema26Series from index 26
  // At closes[26], ema12Series index = 26-12 = 14, ema26Series index = 0
  const macdLine: number[] = [];
  const startIdx = 26; // First close index where both EMAs exist
  for (let i = startIdx; i < closes.length; i++) {
    const e12idx = i - 12; // index into ema12Series
    const e26idx = i - 26; // index into ema26Series
    if (e12idx >= 0 && e12idx < ema12Series.length && e26idx >= 0 && e26idx < ema26Series.length) {
      macdLine.push(ema12Series[e12idx] - ema26Series[e26idx]);
    }
  }

  if (macdLine.length < 9) return { line: macdLine[macdLine.length - 1] ?? null, signal: null, histogram: null };

  // Signal line = 9-period EMA of MACD line
  const m9 = 2 / 10;
  let signal = macdLine.slice(0, 9).reduce((s, v) => s + v, 0) / 9;
  for (let i = 9; i < macdLine.length; i++) {
    signal = (macdLine[i] - signal) * m9 + signal;
  }

  const line = macdLine[macdLine.length - 1];
  const histogram = line - signal;

  return { line, signal, histogram };
}

function computeATR(candles: Candle[], period: number): number | null {
  if (candles.length < period + 1) return null;

  const trueRanges: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trueRanges.push(tr);
  }

  if (trueRanges.length < period) return null;

  // Wilder's smoothing for ATR
  let atr = trueRanges.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
  }

  return atr;
}

function computeSupportResistance(candles: Candle[], lookback: number = 20): {
  support: number | null;
  resistance: number | null;
} {
  if (candles.length < lookback) return { support: null, resistance: null };

  const recent = candles.slice(candles.length - lookback);

  // Find swing lows (support) and swing highs (resistance)
  let lowestLow = Infinity;
  let highestHigh = -Infinity;

  for (const c of recent) {
    if (c.low < lowestLow) lowestLow = c.low;
    if (c.high > highestHigh) highestHigh = c.high;
  }

  return {
    support: lowestLow === Infinity ? null : lowestLow,
    resistance: highestHigh === -Infinity ? null : highestHigh,
  };
}

function computeTAScore(
  rsi: number | null,
  macdHistogram: number | null,
  currentPrice: number,
  sma50: number | null,
  sma200: number | null,
  prevSma50: number | null,
  prevSma200: number | null
): { score: number; signal: string } {
  let score = 0;

  // RSI contribution (+/- 0.3)
  if (rsi !== null) {
    if (rsi < 30) score += 0.3;
    else if (rsi < 40) score += 0.15;
    else if (rsi > 70) score -= 0.3;
    else if (rsi > 60) score -= 0.15;
  }

  // MACD histogram contribution (+/- 0.2)
  if (macdHistogram !== null) {
    if (macdHistogram > 0) score += 0.2;
    else if (macdHistogram < 0) score -= 0.2;
  }

  // Price vs SMA-50 (+/- 0.15)
  if (sma50 !== null) {
    if (currentPrice > sma50) score += 0.15;
    else score -= 0.15;
  }

  // Price vs SMA-200 (+/- 0.2)
  if (sma200 !== null) {
    if (currentPrice > sma200) score += 0.2;
    else score -= 0.2;
  }

  // Golden cross / Death cross bonus (+/- 0.15)
  if (sma50 !== null && sma200 !== null && prevSma50 !== null && prevSma200 !== null) {
    const currentAbove = sma50 > sma200;
    const prevAbove = prevSma50 > prevSma200;
    if (currentAbove && !prevAbove) score += 0.15; // Golden cross
    else if (!currentAbove && prevAbove) score -= 0.15; // Death cross
  }

  // Clamp to [-1, 1]
  score = Math.max(-1, Math.min(1, score));

  // Derive signal from score
  let signal: string;
  if (score > 0.5) signal = 'strong_buy';
  else if (score > 0.2) signal = 'buy';
  else if (score < -0.5) signal = 'strong_sell';
  else if (score < -0.2) signal = 'sell';
  else signal = 'neutral';

  return { score: Math.round(score * 100) / 100, signal };
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
        .eq('source', 'compute-indicators')
        .order('created_at', { ascending: false })
        .limit(5);

      return new Response(JSON.stringify({ status: 'ok', recent_logs: logs }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get all active currency pairs
    const { data: pairs, error: pairsError } = await supabase
      .from('currency_pairs')
      .select('id, symbol')
      .eq('is_active', true);

    if (pairsError) throw pairsError;
    if (!pairs || pairs.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No active pairs found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const today = new Date().toISOString().split('T')[0];
    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    for (const pair of pairs) {
      try {
        // Fetch last 200 daily candles for this pair
        const { data: candles, error: candleError } = await supabase
          .from('price_candles')
          .select('open_time, open, high, low, close, volume')
          .eq('pair_id', pair.id)
          .eq('timeframe', 'D')
          .order('open_time', { ascending: true })
          .limit(200);

        if (candleError) throw candleError;
        if (!candles || candles.length < 14) {
          // Need at least 14 candles for RSI
          errors.push(`${pair.symbol}: insufficient data (${candles?.length ?? 0} candles)`);
          failCount++;
          continue;
        }

        const closes = candles.map((c: Candle) => c.close);
        const currentPrice = closes[closes.length - 1];

        // Compute all indicators
        const rsi = computeRSI(closes, 14);
        const macd = computeMACD(closes);
        const sma20 = computeSMA(closes, 20);
        const sma50 = computeSMA(closes, 50);
        const sma200 = computeSMA(closes, 200);
        const ema12 = computeEMA(closes, 12);
        const ema26 = computeEMA(closes, 26);
        const atr = computeATR(candles as Candle[], 14);
        const sr = computeSupportResistance(candles as Candle[], 20);

        // For golden/death cross detection, compute previous day's SMAs
        const prevCloses = closes.slice(0, -1);
        const prevSma50 = computeSMA(prevCloses, 50);
        const prevSma200 = computeSMA(prevCloses, 200);

        const { score, signal } = computeTAScore(
          rsi,
          macd.histogram,
          currentPrice,
          sma50,
          sma200,
          prevSma50,
          prevSma200
        );

        const indicator: IndicatorRow = {
          pair_id: pair.id,
          indicator_date: today,
          timeframe: 'D',
          rsi_14: rsi !== null ? Math.round(rsi * 100) / 100 : null,
          macd_line: macd.line !== null ? Math.round(macd.line * 1000000) / 1000000 : null,
          macd_signal: macd.signal !== null ? Math.round(macd.signal * 1000000) / 1000000 : null,
          macd_histogram: macd.histogram !== null ? Math.round(macd.histogram * 1000000) / 1000000 : null,
          sma_20: sma20 !== null ? Math.round(sma20 * 1000000) / 1000000 : null,
          sma_50: sma50 !== null ? Math.round(sma50 * 1000000) / 1000000 : null,
          sma_200: sma200 !== null ? Math.round(sma200 * 1000000) / 1000000 : null,
          ema_12: ema12 !== null ? Math.round(ema12 * 1000000) / 1000000 : null,
          ema_26: ema26 !== null ? Math.round(ema26 * 1000000) / 1000000 : null,
          support_level: sr.support !== null ? Math.round(sr.support * 1000000) / 1000000 : null,
          resistance_level: sr.resistance !== null ? Math.round(sr.resistance * 1000000) / 1000000 : null,
          atr_14: atr !== null ? Math.round(atr * 1000000) / 1000000 : null,
          ta_signal: signal,
          ta_score: score,
        };

        const { error: upsertError } = await supabase
          .from('technical_indicators')
          .upsert(indicator, {
            onConflict: 'pair_id,timeframe,indicator_date',
            ignoreDuplicates: false,
          });

        if (upsertError) throw upsertError;
        successCount++;
      } catch (err) {
        failCount++;
        errors.push(`${pair.symbol}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Log results
    const level = failCount === 0 ? 'info' : failCount < pairs.length ? 'warn' : 'error';
    const message = `compute-indicators: ${successCount}/${pairs.length} pairs computed${failCount > 0 ? `, ${failCount} failed` : ''}`;

    await supabase.from('system_logs').insert({
      level,
      source: 'compute-indicators',
      message,
      metadata: { successCount, failCount, errors: errors.slice(0, 10) },
    });

    return new Response(
      JSON.stringify({
        message,
        success: successCount,
        failed: failCount,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('compute-indicators error:', errorMessage);

    await supabase.from('system_logs').insert({
      level: 'error',
      source: 'compute-indicators',
      message: `compute-indicators failed: ${errorMessage}`,
    });

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
