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

// ============================================================
// Finnhub Source
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

async function fetchFinnhubEvents(): Promise<MappedEvent[]> {
  if (!FINNHUB_API_KEY) return [];

  try {
    const { from, to } = getDateRange();
    const url = `https://finnhub.io/api/v1/calendar/economic?from=${from}&to=${to}&token=${FINNHUB_API_KEY}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Finnhub: ${response.status}`);

    const data = await response.json();
    const events: FinnhubEvent[] = data.economicCalendar || [];

    return events
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
  } catch (err) {
    console.error('Finnhub fetch error:', err);
    return [];
  }
}

// ============================================================
// JBlanked Calendar API Source
// ============================================================

interface JBlankedEvent {
  title: string;
  country: string;
  date: string;
  impact: string;
  forecast?: string;
  previous?: string;
  actual?: string;
  currency?: string;
}

function jblankedImpact(impact: string): string {
  const lower = impact.toLowerCase();
  if (lower.includes('high') || lower === 'red') return 'high';
  if (lower.includes('medium') || lower === 'orange') return 'medium';
  return 'low';
}

async function fetchJBlankedEvents(): Promise<MappedEvent[]> {
  try {
    const url = 'https://www.jblanked.com/api/news/calendar/today/';
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });
    if (!response.ok) throw new Error(`JBlanked: ${response.status}`);

    const events: JBlankedEvent[] = await response.json();

    return events
      .map(e => {
        const currency = e.currency?.toUpperCase() ?? countryToCurrency(e.country) ?? '';
        if (!G7_CURRENCIES.has(currency)) return null;

        return {
          source: 'jblanked' as const,
          event_name: e.title,
          country: e.country,
          currency,
          impact: jblankedImpact(e.impact),
          event_datetime: e.date,
          actual: e.actual || null,
          forecast: e.forecast || null,
          previous: e.previous || null,
          source_event_id: `jb-${e.country}-${e.title}-${e.date}`.replace(/\s+/g, '-').toLowerCase().substring(0, 250),
          raw_data: e
        };
      })
      .filter((e): e is MappedEvent => e !== null);
  } catch (err) {
    console.error('JBlanked fetch error:', err);
    return [];
  }
}

// ============================================================
// RSS Feed Sources (Investing.com Economic Calendar)
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

async function fetchRSSEvents(): Promise<MappedEvent[]> {
  const feeds = [
    'https://www.investing.com/rss/economic_calendar.rss'
  ];

  const allEvents: MappedEvent[] = [];

  for (const feedUrl of feeds) {
    try {
      const response = await fetch(feedUrl, {
        headers: {
          'User-Agent': 'FXMarketAnalyzer/1.0',
          'Accept': 'application/rss+xml, application/xml, text/xml'
        }
      });
      if (!response.ok) continue;

      const text = await response.text();

      // Simple XML parsing for RSS items
      const items = text.match(/<item>([\s\S]*?)<\/item>/g) || [];

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

        // Try to extract actual/forecast/previous from description
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
    } catch (err) {
      console.error(`RSS fetch error for ${feedUrl}:`, err);
    }
  }

  return allEvents;
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

    // Fetch from all sources in parallel
    const [finnhubEvents, jblankedEvents, rssEvents] = await Promise.all([
      fetchFinnhubEvents(),
      fetchJBlankedEvents(),
      fetchRSSEvents()
    ]);

    const allEvents = [...finnhubEvents, ...jblankedEvents, ...rssEvents];

    const sourceCounts = {
      finnhub: finnhubEvents.length,
      jblanked: jblankedEvents.length,
      rss: rssEvents.length,
      total: allEvents.length
    };

    if (allEvents.length === 0) {
      return new Response(JSON.stringify({
        message: 'No relevant events found from any source',
        sources: sourceCounts
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Upsert events (deduplicate by source + source_event_id)
    // Process in batches to avoid payload size limits
    const BATCH_SIZE = 50;
    let totalUpserted = 0;

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
      } else {
        totalUpserted += data?.length ?? 0;
      }
    }

    await supabase.from('system_logs').insert({
      level: 'info',
      source: 'fetch-events',
      message: `Fetched ${allEvents.length} events (Finnhub: ${finnhubEvents.length}, JBlanked: ${jblankedEvents.length}, RSS: ${rssEvents.length}), upserted ${totalUpserted}`,
      metadata: sourceCounts
    });

    return new Response(JSON.stringify({
      message: 'Events fetched successfully',
      sources: sourceCounts,
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
