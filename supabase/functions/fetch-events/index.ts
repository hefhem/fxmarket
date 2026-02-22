import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FINNHUB_API_KEY = Deno.env.get('FINNHUB_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const IMPACT_MAP: Record<string, string> = {
  '1': 'low', '2': 'medium', '3': 'high',
  low: 'low', medium: 'medium', high: 'high'
};

const G7_CURRENCIES = new Set(['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD']);

interface MappedEvent {
  source: string;
  event_name: string;
  country: string;
  currency: string;
  impact: string;
  event_datetime: string;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
  source_event_id: string;
  raw_data: unknown;
}

interface SourceResult {
  source: string;
  events: MappedEvent[];
  status: 'success' | 'partial' | 'failed';
  error?: string;
  attempts: number;
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
      const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (response.ok) return response;

      // Retry on 429 (rate limit) and 5xx errors
      if (response.status === 429 || response.status >= 500) {
        lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500;
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      // Non-retryable error
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500;
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  throw lastError ?? new Error('Max retries exceeded');
}

// ============================================================
// Finnhub Source (primary + fallback endpoint)
// ============================================================

interface FinnhubEvent {
  country: string;
  actual?: number;
  estimate?: number;
  event: string;
  impact: string;
  prev?: number;
  time: string;
  unit: string;
}

function countryToCurrency(country: string): string | null {
  const map: Record<string, string> = {
    US: 'USD', EU: 'EUR', GB: 'GBP', JP: 'JPY',
    CH: 'CHF', AU: 'AUD', CA: 'CAD', NZ: 'NZD'
  };
  return map[country] ?? null;
}

function getDateRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - 1);
  const to = new Date(now);
  to.setDate(to.getDate() + 7);
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0]
  };
}

async function fetchFinnhubEvents(): Promise<SourceResult> {
  if (!FINNHUB_API_KEY) {
    return { source: 'finnhub', events: [], status: 'failed', error: 'No API key configured', attempts: 0 };
  }

  let attempts = 0;
  try {
    const { from, to } = getDateRange();
    const url = `https://finnhub.io/api/v1/calendar/economic?from=${from}&to=${to}&token=${FINNHUB_API_KEY}`;
    attempts++;
    const response = await fetchWithRetry(url, {}, 3, 1000);
    const data = await response.json();
    const events: FinnhubEvent[] = data.economicCalendar || [];

    const mapped = events
      .map(e => {
        const currency = countryToCurrency(e.country);
        if (!currency) return null;
        return {
          source: 'finnhub' as const,
          event_name: e.event,
          country: e.country,
          currency,
          impact: IMPACT_MAP[e.impact] || 'low',
          event_datetime: e.time,
          actual: e.actual != null ? String(e.actual) : null,
          forecast: e.estimate != null ? String(e.estimate) : null,
          previous: e.prev != null ? String(e.prev) : null,
          source_event_id: `${e.country}-${e.event}-${e.time}`.replace(/\s+/g, '-').toLowerCase(),
          raw_data: e
        };
      })
      .filter((e): e is MappedEvent => e !== null);

    return { source: 'finnhub', events: mapped, status: 'success', attempts };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('Finnhub fetch error:', error);
    return { source: 'finnhub', events: [], status: 'failed', error, attempts };
  }
}

// ============================================================
// ForexFactory Calendar Source (via FairEconomy mirror)
// ============================================================

interface FFCalendarEvent {
  title: string;
  country: string;
  date: string;
  impact: string;
  forecast?: string;
  previous?: string;
  actual?: string;
}

function ffImpact(impact: string): string {
  const lower = impact.toLowerCase();
  if (lower === 'high' || lower === 'red') return 'high';
  if (lower === 'medium' || lower === 'orange') return 'medium';
  if (lower === 'holiday') return 'low';
  return 'low';
}

const FF_CALENDAR_URLS = [
  'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
  'https://nfs.faireconomy.media/ff_calendar_nextweek.json',
];

async function fetchForexFactoryEvents(): Promise<SourceResult> {
  const allEvents: MappedEvent[] = [];
  let attempts = 0;
  let lastError = '';
  let anySuccess = false;

  for (const url of FF_CALENDAR_URLS) {
    try {
      attempts++;
      const response = await fetchWithRetry(url, {
        headers: { 'Accept': 'application/json' }
      }, 2, 1500);

      const events: FFCalendarEvent[] = await response.json();
      anySuccess = true;

      for (const e of events) {
        const currency = e.country?.toUpperCase();
        if (!currency || !G7_CURRENCIES.has(currency)) continue;
        if (e.impact?.toLowerCase() === 'holiday') continue;

        allEvents.push({
          source: 'forexfactory',
          event_name: e.title,
          country: Object.entries({ USD: 'US', EUR: 'EU', GBP: 'GB', JPY: 'JP', CHF: 'CH', AUD: 'AU', CAD: 'CA', NZD: 'NZ' })
            .find(([k]) => k === currency)?.[1] ?? currency,
          currency,
          impact: ffImpact(e.impact),
          event_datetime: new Date(e.date).toISOString(),
          actual: e.actual || null,
          forecast: e.forecast || null,
          previous: e.previous || null,
          source_event_id: `ff-${currency}-${e.title}-${e.date}`.replace(/\s+/g, '-').toLowerCase().substring(0, 250),
          raw_data: e
        });
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.error(`ForexFactory fetch error (${url}):`, lastError);
    }
  }

  return {
    source: 'forexfactory',
    events: allEvents,
    status: anySuccess ? 'success' : 'failed',
    error: anySuccess ? undefined : lastError,
    attempts
  };
}

// ============================================================
// RSS Feed Sources (with multiple fallback feeds)
// ============================================================

function parseRSSDate(dateStr: string): string {
  try {
    return new Date(dateStr).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function extractCurrencyFromTitle(title: string): string | null {
  const patterns: Record<string, string[]> = {
    USD: ['U.S.', 'US ', 'United States', 'Fed ', 'FOMC', 'Nonfarm', 'CPI (US)', 'GDP (US)'],
    EUR: ['Euro', 'ECB', 'Eurozone', 'EU '],
    GBP: ['UK ', 'British', 'BOE', 'Bank of England'],
    JPY: ['Japan', 'BOJ', 'Bank of Japan'],
    CHF: ['Swiss', 'SNB', 'Switzerland'],
    AUD: ['Australia', 'RBA', 'Reserve Bank of Australia'],
    CAD: ['Canada', 'BOC', 'Bank of Canada'],
    NZD: ['New Zealand', 'RBNZ']
  };
  for (const [currency, keywords] of Object.entries(patterns)) {
    if (keywords.some(kw => title.includes(kw))) return currency;
  }
  return null;
}

function guessImpact(title: string): string {
  const highKeywords = ['Interest Rate', 'GDP', 'CPI', 'Nonfarm', 'NFP', 'Employment', 'Inflation', 'FOMC', 'ECB', 'BOE', 'BOJ'];
  const mediumKeywords = ['PMI', 'Retail Sales', 'Trade Balance', 'Unemployment', 'Consumer Confidence', 'Manufacturing'];
  if (highKeywords.some(kw => title.includes(kw))) return 'high';
  if (mediumKeywords.some(kw => title.includes(kw))) return 'medium';
  return 'low';
}

const RSS_FEEDS = [
  'https://www.investing.com/rss/economic_calendar.rss',
  'https://www.investing.com/rss/news_14.rss',
];

async function fetchRSSEvents(): Promise<SourceResult> {
  const allEvents: MappedEvent[] = [];
  let attempts = 0;
  let lastError = '';
  let anySuccess = false;

  for (const feedUrl of RSS_FEEDS) {
    try {
      attempts++;
      const response = await fetchWithRetry(feedUrl, {
        headers: {
          'User-Agent': 'FXMarketAnalyzer/1.0',
          'Accept': 'application/rss+xml, application/xml, text/xml'
        }
      }, 2, 2000);

      const text = await response.text();
      const items = text.match(/<item>([\s\S]*?)<\/item>/g) || [];
      anySuccess = true;

      for (const item of items.slice(0, 50)) {
        const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || item.match(/<title>(.*?)<\/title>/);
        const dateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);
        const descMatch = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) || item.match(/<description>(.*?)<\/description>/);

        if (!titleMatch) continue;

        const title = titleMatch[1];
        const currency = extractCurrencyFromTitle(title);
        if (!currency) continue;

        const eventDate = dateMatch ? parseRSSDate(dateMatch[1]) : new Date().toISOString();
        const description = descMatch ? descMatch[1] : '';

        const actualMatch = description.match(/Actual:\s*([\d.-]+)/);
        const forecastMatch = description.match(/Forecast:\s*([\d.-]+)/);
        const previousMatch = description.match(/Previous:\s*([\d.-]+)/);

        allEvents.push({
          source: 'rss',
          event_name: title.substring(0, 200),
          country: Object.entries({ USD: 'US', EUR: 'EU', GBP: 'GB', JPY: 'JP', CHF: 'CH', AUD: 'AU', CAD: 'CA', NZD: 'NZ' })
            .find(([k]) => k === currency)?.[1] ?? 'US',
          currency,
          impact: guessImpact(title),
          event_datetime: eventDate,
          actual: actualMatch?.[1] ?? null,
          forecast: forecastMatch?.[1] ?? null,
          previous: previousMatch?.[1] ?? null,
          source_event_id: `rss-${title}-${eventDate}`.replace(/\s+/g, '-').toLowerCase().substring(0, 250),
          raw_data: { title, description: description.substring(0, 500), pubDate: dateMatch?.[1] }
        });
      }

      // If we got events from first feed, no need to try fallbacks
      if (allEvents.length > 0) break;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.error(`RSS fetch error for ${feedUrl}:`, lastError);
    }
  }

  return {
    source: 'rss',
    events: allEvents,
    status: anySuccess ? 'success' : 'failed',
    error: anySuccess ? undefined : lastError,
    attempts
  };
}

// ============================================================
// Main Handler
// ============================================================

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST' && req.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Check if this is a health check request
    const url = new URL(req.url);
    if (url.searchParams.get('health') === 'true') {
      const { data: lastLog } = await supabase.from('system_logs')
        .select('created_at, message, level, metadata')
        .eq('source', 'fetch-events')
        .order('created_at', { ascending: false })
        .limit(5);

      const { count: eventCount } = await supabase.from('economic_events')
        .select('id', { count: 'exact', head: true })
        .gte('event_datetime', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      return new Response(JSON.stringify({
        status: 'ok',
        recentEvents24h: eventCount ?? 0,
        recentLogs: lastLog ?? []
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Fetch from all sources in parallel
    const [finnhubResult, forexFactoryResult, rssResult] = await Promise.all([
      fetchFinnhubEvents(),
      fetchForexFactoryEvents(),
      fetchRSSEvents()
    ]);

    const results = [finnhubResult, forexFactoryResult, rssResult];
    const allEvents = results.flatMap(r => r.events);

    const sourceSummary = results.map(r => ({
      source: r.source,
      count: r.events.length,
      status: r.status,
      error: r.error,
      attempts: r.attempts
    }));

    const failedSources = results.filter(r => r.status === 'failed');
    const logLevel = failedSources.length === results.length ? 'error'
      : failedSources.length > 0 ? 'warn' : 'info';

    if (allEvents.length === 0) {
      await supabase.from('system_logs').insert({
        level: 'warn',
        source: 'fetch-events',
        message: `No events fetched from any source. Failed: ${failedSources.map(f => f.source).join(', ')}`,
        metadata: { sources: sourceSummary }
      });

      return new Response(JSON.stringify({
        message: 'No relevant events found from any source',
        sources: sourceSummary
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Upsert events in batches
    const BATCH_SIZE = 50;
    let totalUpserted = 0;
    let upsertErrors = 0;

    for (let i = 0; i < allEvents.length; i += BATCH_SIZE) {
      const batch = allEvents.slice(i, i + BATCH_SIZE);
      const { data, error } = await supabase
        .from('economic_events')
        .upsert(batch, {
          onConflict: 'source,source_event_id',
          ignoreDuplicates: false
        })
        .select('id');

      if (error) {
        console.error(`Batch upsert error at offset ${i}:`, error.message);
        upsertErrors++;
      } else {
        totalUpserted += data?.length ?? 0;
      }
    }

    await supabase.from('system_logs').insert({
      level: logLevel,
      source: 'fetch-events',
      message: `Fetched ${allEvents.length} events (Finnhub: ${finnhubResult.events.length}, ForexFactory: ${forexFactoryResult.events.length}, RSS: ${rssResult.events.length}), upserted ${totalUpserted}${upsertErrors > 0 ? `, ${upsertErrors} batch errors` : ''}${failedSources.length > 0 ? `. Failed sources: ${failedSources.map(f => f.source).join(', ')}` : ''}`,
      metadata: { sources: sourceSummary, upserted: totalUpserted, upsertErrors }
    });

    return new Response(JSON.stringify({
      message: 'Events fetched successfully',
      sources: sourceSummary,
      upserted: totalUpserted
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('fetch-events error:', message);

    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      await supabase.from('system_logs').insert({
        level: 'error',
        source: 'fetch-events',
        message,
        metadata: { error: message }
      });
    } catch (_) {}

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
