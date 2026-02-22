import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';

interface PairAnalysis {
  pair_id: string;
  symbol: string;
  analyses: Array<{
    event_name: string;
    sentiment: string;
    confidence: number;
    reasoning: string;
  }>;
}

interface BiasResult {
  pair_id: string;
  symbol: string;
  bias_score: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  reasoning: string;
  contributing_event_ids: string[];
}

async function generateBiasWithClaude(pairAnalyses: PairAnalysis[]): Promise<BiasResult[]> {
  const description = pairAnalyses.map(pa => {
    const events = pa.analyses.map((a, i) =>
      `  ${i + 1}. "${a.event_name}" - ${a.sentiment} (confidence: ${a.confidence}) - ${a.reasoning}`
    ).join('\n');
    return `\n${pa.symbol}:\n${events}`;
  }).join('\n');

  const prompt = `You are a senior forex analyst. Based on today's analyzed economic events, generate a daily trade bias for each currency pair.

For each pair, consider:
- Weight high-confidence analyses more heavily
- Consider the net effect of multiple events on a pair
- A pair like EUR/USD: bullish EUR events push the pair up, bullish USD events push it down

Provide for each pair:
- bias_score: -1.0 (strongly bearish) to +1.0 (strongly bullish), with 0 being neutral
- direction: "bullish" (score > 0.1), "bearish" (score < -0.1), or "neutral"
- confidence: 0.0 to 1.0
- reasoning: 2-3 sentence summary of the directional bias

Today's event analyses by pair:
${description}

Respond with ONLY a valid JSON array. Each object: { symbol, bias_score, direction, confidence, reasoning }`;

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
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status}`);
  }

  const result = await response.json();
  const content = result.content[0]?.text ?? '[]';
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('Failed to parse Claude bias response');

  const biases = JSON.parse(jsonMatch[0]);

  return biases.map((b: any) => {
    const pa = pairAnalyses.find(p => p.symbol === b.symbol);
    return {
      pair_id: pa?.pair_id ?? '',
      symbol: b.symbol,
      bias_score: Math.max(-1, Math.min(1, b.bias_score)),
      direction: b.direction,
      confidence: Math.max(0, Math.min(1, b.confidence)),
      reasoning: b.reasoning,
      contributing_event_ids: []
    };
  }).filter((b: any) => b.pair_id);
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST' && req.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const today = new Date().toISOString().split('T')[0];

    // Get all currency pairs
    const { data: pairs } = await supabase
      .from('currency_pairs')
      .select('*')
      .eq('is_active', true);

    if (!pairs || pairs.length === 0) {
      return new Response(JSON.stringify({ message: 'No active pairs found' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get recently analyzed events (analyses created in last 48h)
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    const { data: analyses } = await supabase
      .from('event_analyses')
      .select('id, sentiment, confidence, affected_pairs, reasoning, event_id, economic_events(id, event_name, currency)')
      .gte('created_at', since);

    const analyzedEvents = (analyses ?? [])
      .filter((a: any) => a.economic_events)
      .map((a: any) => ({
        id: a.economic_events.id,
        event_name: a.economic_events.event_name,
        currency: a.economic_events.currency,
        event_analyses: [{ sentiment: a.sentiment, confidence: a.confidence, affected_pairs: a.affected_pairs, reasoning: a.reasoning }]
      }));

    if (analyzedEvents.length === 0) {
      return new Response(JSON.stringify({ message: 'No analyzed events found in last 48h', count: 0 }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Group analyses by pair
    const pairAnalyses: PairAnalysis[] = pairs.map((pair: any) => {
      const relevantAnalyses = analyzedEvents
        .filter((e: any) => {
          const analysis = e.event_analyses[0];
          return analysis.affected_pairs?.includes(pair.symbol) ||
                 e.currency === pair.base_currency ||
                 e.currency === pair.quote_currency;
        })
        .map((e: any) => ({
          event_id: e.id,
          event_name: e.event_name,
          sentiment: e.event_analyses[0].sentiment,
          confidence: e.event_analyses[0].confidence,
          reasoning: e.event_analyses[0].reasoning
        }));

      return {
        pair_id: pair.id,
        symbol: pair.symbol,
        analyses: relevantAnalyses
      };
    }).filter((pa: PairAnalysis) => pa.analyses.length > 0);

    if (pairAnalyses.length === 0) {
      return new Response(JSON.stringify({ message: 'No pair-relevant analyses found' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Generate bias with Claude
    const biases = await generateBiasWithClaude(pairAnalyses);

    // Upsert daily bias
    const toUpsert = biases.map(b => ({
      pair_id: b.pair_id,
      analysis_date: today,
      bias_score: b.bias_score,
      direction: b.direction,
      confidence: b.confidence,
      contributing_events: b.contributing_event_ids,
      ai_reasoning: b.reasoning
    }));

    const { error: upsertError } = await supabase
      .from('daily_trade_bias')
      .upsert(toUpsert, { onConflict: 'pair_id,analysis_date' });

    if (upsertError) {
      throw new Error(`Failed to upsert bias: ${upsertError.message}`);
    }

    await supabase.from('system_logs').insert({
      level: 'info',
      source: 'generate-daily-bias',
      message: `Generated daily bias for ${biases.length} pairs`,
      metadata: { date: today, pairs: biases.map(b => b.symbol) }
    });

    // Trigger push notifications for strong signals
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/send-push-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        }
      });
    } catch (pushErr) {
      console.error('Failed to trigger push notifications:', pushErr);
    }

    return new Response(JSON.stringify({
      message: 'Daily bias generated',
      date: today,
      pairs: biases.length
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('generate-daily-bias error:', message);

    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      await supabase.from('system_logs').insert({
        level: 'error',
        source: 'generate-daily-bias',
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
