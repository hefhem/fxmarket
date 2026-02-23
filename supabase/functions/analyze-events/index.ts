import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';

const BATCH_SIZE = 15;

interface EventForAnalysis {
  id: string;
  event_name: string;
  country: string;
  currency: string;
  impact: string;
  event_datetime: string;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
}

interface AnalysisResult {
  event_id: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  affected_pairs: string[];
  reasoning: string;
}

async function analyzeWithClaude(events: EventForAnalysis[]): Promise<AnalysisResult[]> {
  const eventsDescription = events.map((e, i) => (
    `${i + 1}. Event: "${e.event_name}" | Country: ${e.country} | Currency: ${e.currency} | ` +
    `Impact: ${e.impact} | DateTime: ${e.event_datetime} | ` +
    `Actual: ${e.actual ?? 'N/A'} | Forecast: ${e.forecast ?? 'N/A'} | Previous: ${e.previous ?? 'N/A'}`
  )).join('\n');

  const prompt = `You are a forex fundamental analyst. Analyze these economic events and determine their impact on currency pairs.

For each event, provide:
- sentiment: "bullish", "bearish", or "neutral" for the event's currency
- confidence: 0.0 to 1.0 (how confident in the sentiment)
- affected_pairs: which G7 pairs are affected (from: EUR/USD, GBP/USD, USD/JPY, USD/CHF, AUD/USD, USD/CAD, NZD/USD)
- reasoning: brief explanation (1-2 sentences)

Key rules:
- If actual > forecast, generally bullish for that currency
- If actual < forecast, generally bearish for that currency
- If no actual data yet, analyze based on the event type and historical significance
- High-impact events get higher confidence scores
- Consider cross-currency effects

Events to analyze:
${eventsDescription}

Respond with ONLY a valid JSON array of objects. Each object must have: event_index (1-based), sentiment, confidence, affected_pairs, reasoning.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: prompt
      }]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${errText}`);
  }

  const result = await response.json();
  const content = result.content[0]?.text ?? '[]';

  // Extract JSON from response (handle markdown code blocks)
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('Failed to parse Claude response as JSON array');
  }

  const analyses = JSON.parse(jsonMatch[0]);

  return analyses.map((a: any) => ({
    event_id: events[a.event_index - 1]?.id,
    sentiment: a.sentiment,
    confidence: Math.max(0, Math.min(1, a.confidence)),
    affected_pairs: a.affected_pairs,
    reasoning: a.reasoning
  })).filter((a: any) => a.event_id);
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST' && req.method !== 'GET') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get unanalyzed events (no matching entry in event_analyses)
    const { data: events, error: fetchError } = await supabase
      .from('economic_events')
      .select('id, event_name, country, currency, impact, event_datetime, actual, forecast, previous')
      .not('id', 'in', `(SELECT event_id FROM event_analyses)`)
      .order('event_datetime', { ascending: false })
      .limit(BATCH_SIZE);

    // Fallback: use a LEFT JOIN approach if subquery doesn't work
    let eventsToAnalyze = events as EventForAnalysis[] | null;

    if (fetchError) {
      // Alternative approach: fetch events and filter
      const { data: allEvents } = await supabase
        .from('economic_events')
        .select('id, event_name, country, currency, impact, event_datetime, actual, forecast, previous')
        .order('event_datetime', { ascending: false })
        .limit(50);

      const { data: existingAnalyses } = await supabase
        .from('event_analyses')
        .select('event_id');

      const analyzedIds = new Set((existingAnalyses ?? []).map((a: any) => a.event_id));
      eventsToAnalyze = ((allEvents ?? []) as EventForAnalysis[]).filter(e => !analyzedIds.has(e.id)).slice(0, BATCH_SIZE);
    }

    if (!eventsToAnalyze || eventsToAnalyze.length === 0) {
      return new Response(JSON.stringify({ message: 'No events to analyze', count: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Analyze with Claude
    const analyses = await analyzeWithClaude(eventsToAnalyze);

    // Insert analyses
    const toInsert = analyses.map(a => ({
      event_id: a.event_id,
      sentiment: a.sentiment,
      confidence: a.confidence,
      affected_pairs: a.affected_pairs,
      reasoning: a.reasoning,
      model_used: 'claude-haiku-4-5'
    }));

    const { error: insertError } = await supabase
      .from('event_analyses')
      .upsert(toInsert, { onConflict: 'event_id' });

    if (insertError) {
      throw new Error(`Failed to insert analyses: ${insertError.message}`);
    }

    await supabase.from('system_logs').insert({
      level: 'info',
      source: 'analyze-events',
      message: `Analyzed ${analyses.length} events with Claude`,
      metadata: { count: analyses.length }
    });

    return new Response(JSON.stringify({
      message: 'Events analyzed successfully',
      analyzed: analyses.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('analyze-events error:', message);

    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      await supabase.from('system_logs').insert({
        level: 'error',
        source: 'analyze-events',
        message,
        metadata: { error: message }
      });
    } catch (_) {}

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
