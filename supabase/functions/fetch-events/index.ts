import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FINNHUB_API_KEY = Deno.env.get('FINNHUB_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CURRENCY_COUNTRY_MAP: Record<string, string> = {
  USD: 'US', EUR: 'EU', GBP: 'GB', JPY: 'JP',
  CHF: 'CH', AUD: 'AU', CAD: 'CA', NZD: 'NZ'
};

const IMPACT_MAP: Record<string, string> = {
  '1': 'low', '2': 'medium', '3': 'high',
  low: 'low', medium: 'medium', high: 'high'
};

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

function countryToCurrency(country: string): string | null {
  const map: Record<string, string> = {
    US: 'USD', EU: 'EUR', GB: 'GBP', JP: 'JPY',
    CH: 'CHF', AU: 'AUD', CA: 'CAD', NZ: 'NZD'
  };
  return map[country] ?? null;
}

async function fetchFinnhubEvents(): Promise<FinnhubEvent[]> {
  const { from, to } = getDateRange();
  const url = `https://finnhub.io/api/v1/calendar/economic?from=${from}&to=${to}&token=${FINNHUB_API_KEY}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Finnhub API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.economicCalendar || [];
}

function mapFinnhubToEvent(event: FinnhubEvent) {
  const currency = countryToCurrency(event.country);
  if (!currency) return null;

  const impact = IMPACT_MAP[event.impact] || 'low';
  const sourceId = `${event.country}-${event.event}-${event.time}`.replace(/\s+/g, '-').toLowerCase();

  return {
    source: 'finnhub',
    event_name: event.event,
    country: event.country,
    currency,
    impact,
    event_datetime: event.time,
    actual: event.actual != null ? String(event.actual) : null,
    forecast: event.estimate != null ? String(event.estimate) : null,
    previous: event.prev != null ? String(event.prev) : null,
    source_event_id: sourceId,
    raw_data: event
  };
}

Deno.serve(async (req) => {
  try {
    // Allow only POST or GET (for cron invocations)
    if (req.method !== 'POST' && req.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch from Finnhub
    const finnhubEvents = await fetchFinnhubEvents();
    const mappedEvents = finnhubEvents
      .map(mapFinnhubToEvent)
      .filter((e): e is NonNullable<typeof e> => e !== null);

    if (mappedEvents.length === 0) {
      return new Response(JSON.stringify({ message: 'No relevant events found', count: 0 }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Upsert events (deduplicate by source + source_event_id)
    const { data, error } = await supabase
      .from('economic_events')
      .upsert(mappedEvents, {
        onConflict: 'source,source_event_id',
        ignoreDuplicates: false
      })
      .select('id');

    if (error) {
      throw new Error(`Database upsert error: ${error.message}`);
    }

    // Log success
    await supabase.from('system_logs').insert({
      level: 'info',
      source: 'fetch-events',
      message: `Fetched ${mappedEvents.length} events from Finnhub, upserted ${data?.length ?? 0}`,
      metadata: { source: 'finnhub', count: mappedEvents.length }
    });

    return new Response(JSON.stringify({
      message: 'Events fetched successfully',
      fetched: mappedEvents.length,
      upserted: data?.length ?? 0
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('fetch-events error:', message);

    // Try to log the error
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      await supabase.from('system_logs').insert({
        level: 'error',
        source: 'fetch-events',
        message,
        metadata: { error: message }
      });
    } catch (_) { /* ignore logging errors */ }

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
