import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FINNHUB_API_KEY = Deno.env.get('FINNHUB_API_KEY') ?? '';
const ALPHA_VANTAGE_API_KEY = Deno.env.get('ALPHA_VANTAGE_API_KEY') ?? '';
const FRED_API_KEY = Deno.env.get('FRED_API_KEY') ?? '';
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
// Shared helpers
// ============================================================

const CURRENCY_TO_COUNTRY: Record<string, string> = {
  USD: 'US', EUR: 'EU', GBP: 'GB', JPY: 'JP',
  CHF: 'CH', AUD: 'AU', CAD: 'CA', NZD: 'NZ'
};

function extractCurrencyFromTitle(title: string): string | null {
  const patterns: Record<string, string[]> = {
    USD: ['U.S.', 'US ', 'United States', 'Fed ', 'FOMC', 'Nonfarm', 'CPI (US)', 'GDP (US)', 'Dollar', 'Treasury'],
    EUR: ['Euro', 'ECB', 'Eurozone', 'EU ', 'Lagarde'],
    GBP: ['UK ', 'British', 'BOE', 'Bank of England', 'Sterling', 'Pound'],
    JPY: ['Japan', 'BOJ', 'Bank of Japan', 'Yen'],
    CHF: ['Swiss', 'SNB', 'Switzerland', 'Franc'],
    AUD: ['Australia', 'RBA', 'Reserve Bank of Australia', 'Aussie'],
    CAD: ['Canada', 'BOC', 'Bank of Canada', 'Loonie'],
    NZD: ['New Zealand', 'RBNZ', 'Kiwi']
  };
  for (const [currency, keywords] of Object.entries(patterns)) {
    if (keywords.some(kw => title.includes(kw))) return currency;
  }
  return null;
}

function guessImpact(title: string): string {
  const highKeywords = ['Interest Rate', 'GDP', 'CPI', 'Nonfarm', 'NFP', 'Employment', 'Inflation', 'FOMC', 'ECB', 'BOE', 'BOJ', 'Fed ', 'Rate Decision', 'Payroll'];
  const mediumKeywords = ['PMI', 'Retail Sales', 'Trade Balance', 'Unemployment', 'Consumer Confidence', 'Manufacturing', 'Housing', 'ISM', 'Durable Goods'];
  if (highKeywords.some(kw => title.includes(kw))) return 'high';
  if (mediumKeywords.some(kw => title.includes(kw))) return 'medium';
  return 'low';
}

function parseRSSDate(dateStr: string): string {
  try {
    return new Date(dateStr).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

// ============================================================
// 1. Finnhub Source — Forex News (free endpoint)
// ============================================================

interface FinnhubNewsItem {
  id: number;
  headline: string;
  summary: string;
  datetime: number;
  source: string;
  url: string;
  category: string;
  related?: string;
  image?: string;
}

async function fetchFinnhubEvents(): Promise<SourceResult> {
  if (!FINNHUB_API_KEY) {
    return { source: 'finnhub', events: [], status: 'failed', error: 'No API key configured', attempts: 0 };
  }

  let attempts = 0;
  try {
    const url = `https://finnhub.io/api/v1/news?category=forex&token=${FINNHUB_API_KEY}`;
    attempts++;
    const response = await fetchWithRetry(url, {}, 3, 1000);
    const articles: FinnhubNewsItem[] = await response.json();

    const mapped: MappedEvent[] = [];
    for (const article of articles.slice(0, 100)) {
      const currency = extractCurrencyFromTitle(article.headline);
      if (!currency) continue;

      mapped.push({
        source: 'finnhub',
        event_name: article.headline.substring(0, 200),
        country: CURRENCY_TO_COUNTRY[currency] ?? 'US',
        currency,
        impact: guessImpact(article.headline),
        event_datetime: new Date(article.datetime * 1000).toISOString(),
        actual: null,
        forecast: null,
        previous: null,
        source_event_id: `finnhub-news-${article.id}`,
        raw_data: { headline: article.headline, summary: article.summary?.substring(0, 500), source: article.source, url: article.url }
      });
    }

    return { source: 'finnhub', events: mapped, status: 'success', attempts };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('Finnhub fetch error:', error);
    return { source: 'finnhub', events: [], status: 'failed', error, attempts };
  }
}

// ============================================================
// 2. ForexFactory Calendar Source (via FairEconomy mirror)
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
          country: CURRENCY_TO_COUNTRY[currency] ?? currency,
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
// 3. RSS Feed Sources (with multiple feeds)
// ============================================================

const RSS_FEEDS = [
  'https://www.investing.com/rss/economic_calendar.rss',
  'https://www.investing.com/rss/news_14.rss',
  'https://feeds.content.dowjones.io/public/rss/mw_realtimeheadlines',
  'https://feeds.reuters.com/reuters/businessNews',
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
          country: CURRENCY_TO_COUNTRY[currency] ?? 'US',
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
// 4. Alpha Vantage News Sentiment (free, 25 req/day)
// ============================================================

interface AVFeedItem {
  title: string;
  summary: string;
  time_published: string;
  source: string;
  url: string;
  topics?: Array<{ topic: string; relevance_score: string }>;
  ticker_sentiment?: Array<{ ticker: string; relevance_score: string; ticker_sentiment_score: string }>;
}

async function fetchAlphaVantageEvents(): Promise<SourceResult> {
  if (!ALPHA_VANTAGE_API_KEY) {
    return { source: 'alphavantage', events: [], status: 'failed', error: 'No API key configured', attempts: 0 };
  }

  let attempts = 0;
  try {
    const url = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&topics=economy_macro&apikey=${ALPHA_VANTAGE_API_KEY}`;
    attempts++;
    const response = await fetchWithRetry(url, {}, 2, 2000);
    const data = await response.json();

    if (data.Information || data.Note) {
      // Rate limit or API message
      return { source: 'alphavantage', events: [], status: 'failed', error: data.Information || data.Note, attempts };
    }

    const feed: AVFeedItem[] = data.feed || [];
    const mapped: MappedEvent[] = [];

    for (const article of feed.slice(0, 50)) {
      const currency = extractCurrencyFromTitle(article.title);
      if (!currency) continue;

      // Parse time_published format: "20260222T120000"
      let eventDatetime: string;
      try {
        const tp = article.time_published;
        const isoStr = `${tp.substring(0, 4)}-${tp.substring(4, 6)}-${tp.substring(6, 8)}T${tp.substring(9, 11)}:${tp.substring(11, 13)}:${tp.substring(13, 15)}Z`;
        eventDatetime = new Date(isoStr).toISOString();
      } catch {
        eventDatetime = new Date().toISOString();
      }

      mapped.push({
        source: 'alphavantage',
        event_name: article.title.substring(0, 200),
        country: CURRENCY_TO_COUNTRY[currency] ?? 'US',
        currency,
        impact: guessImpact(article.title),
        event_datetime: eventDatetime,
        actual: null,
        forecast: null,
        previous: null,
        source_event_id: `av-${article.time_published}-${article.title}`.replace(/\s+/g, '-').toLowerCase().substring(0, 250),
        raw_data: {
          title: article.title,
          summary: article.summary?.substring(0, 500),
          source: article.source,
          url: article.url,
          topics: article.topics,
          ticker_sentiment: article.ticker_sentiment
        }
      });
    }

    return { source: 'alphavantage', events: mapped, status: 'success', attempts };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('Alpha Vantage fetch error:', error);
    return { source: 'alphavantage', events: [], status: 'failed', error, attempts };
  }
}

// ============================================================
// 5. FRED — Federal Reserve Economic Data (free, official)
// ============================================================

// Key FRED series for forex-relevant US economic indicators
const FRED_SERIES: Record<string, { name: string; impact: string }> = {
  UNRATE:    { name: 'US Unemployment Rate', impact: 'high' },
  PAYEMS:    { name: 'US Nonfarm Payrolls', impact: 'high' },
  CPIAUCSL:  { name: 'US Consumer Price Index (CPI)', impact: 'high' },
  GDP:       { name: 'US Gross Domestic Product (GDP)', impact: 'high' },
  FEDFUNDS:  { name: 'Federal Funds Rate', impact: 'high' },
  RSAFS:     { name: 'US Retail Sales', impact: 'medium' },
  INDPRO:    { name: 'US Industrial Production', impact: 'medium' },
  HOUST:     { name: 'US Housing Starts', impact: 'medium' },
  UMCSENT:   { name: 'US Consumer Sentiment', impact: 'medium' },
  DEXUSEU:   { name: 'USD/EUR Exchange Rate', impact: 'low' },
};

async function fetchFREDEvents(): Promise<SourceResult> {
  if (!FRED_API_KEY) {
    return { source: 'fred', events: [], status: 'failed', error: 'No API key configured', attempts: 0 };
  }

  let attempts = 0;
  const allEvents: MappedEvent[] = [];
  let anySuccess = false;
  let lastError = '';

  for (const [seriesId, meta] of Object.entries(FRED_SERIES)) {
    try {
      const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=2`;
      attempts++;
      const response = await fetchWithRetry(url, {}, 2, 1500);
      const data = await response.json();

      const observations = data.observations || [];
      if (observations.length === 0) continue;
      anySuccess = true;

      const latest = observations[0];
      const prev = observations.length > 1 ? observations[1] : null;

      // Skip if the latest observation value is "."  (FRED uses "." for pending data)
      if (latest.value === '.') continue;

      allEvents.push({
        source: 'fred',
        event_name: meta.name,
        country: 'US',
        currency: 'USD',
        impact: meta.impact,
        event_datetime: new Date(latest.date).toISOString(),
        actual: latest.value !== '.' ? latest.value : null,
        forecast: null,
        previous: prev && prev.value !== '.' ? prev.value : null,
        source_event_id: `fred-${seriesId}-${latest.date}`,
        raw_data: { series_id: seriesId, observations: observations.slice(0, 2) }
      });
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.error(`FRED fetch error for ${seriesId}:`, lastError);
    }
  }

  return {
    source: 'fred',
    events: allEvents,
    status: anySuccess ? 'success' : allEvents.length === 0 && lastError ? 'failed' : 'success',
    error: anySuccess ? undefined : lastError || undefined,
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

    // Fetch from all 5 sources in parallel
    const [finnhubResult, forexFactoryResult, rssResult, alphaVantageResult, fredResult] = await Promise.all([
      fetchFinnhubEvents(),
      fetchForexFactoryEvents(),
      fetchRSSEvents(),
      fetchAlphaVantageEvents(),
      fetchFREDEvents()
    ]);

    const results = [finnhubResult, forexFactoryResult, rssResult, alphaVantageResult, fredResult];
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

    const countsBySource = results.map(r => `${r.source}: ${r.events.length}`).join(', ');

    await supabase.from('system_logs').insert({
      level: logLevel,
      source: 'fetch-events',
      message: `Fetched ${allEvents.length} events (${countsBySource}), upserted ${totalUpserted}${upsertErrors > 0 ? `, ${upsertErrors} batch errors` : ''}${failedSources.length > 0 ? `. Failed sources: ${failedSources.map(f => f.source).join(', ')}` : ''}`,
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
