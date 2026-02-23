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
  technical?: {
    current_price: number;
    rsi_14: number | null;
    macd_status: string;
    sma_20: number | null;
    sma_50: number | null;
    sma_200: number | null;
    support: number | null;
    resistance: number | null;
    ta_score: number;
    ta_signal: string;
  };
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

    let taSection = '';
    if (pa.technical) {
      const t = pa.technical;
      const priceVsSma20 = t.sma_20 ? (t.current_price > t.sma_20 ? 'above' : 'below') : 'N/A';
      const priceVsSma50 = t.sma_50 ? (t.current_price > t.sma_50 ? 'above' : 'below') : 'N/A';
      const priceVsSma200 = t.sma_200 ? (t.current_price > t.sma_200 ? 'above' : 'below') : 'N/A';
      taSection = `\n  Technical Analysis:
  - Current Price: ${t.current_price.toFixed(5)} | RSI(14): ${t.rsi_14?.toFixed(1) ?? 'N/A'} | MACD: ${t.macd_status}
  - SMA-20: ${t.sma_20?.toFixed(5) ?? 'N/A'} (${priceVsSma20}) | SMA-50: ${t.sma_50?.toFixed(5) ?? 'N/A'} (${priceVsSma50}) | SMA-200: ${t.sma_200?.toFixed(5) ?? 'N/A'} (${priceVsSma200})
  - Support: ${t.support?.toFixed(5) ?? 'N/A'} | Resistance: ${t.resistance?.toFixed(5) ?? 'N/A'}
  - TA Score: ${t.ta_score > 0 ? '+' : ''}${t.ta_score.toFixed(2)} (${t.ta_signal.replace('_', ' ').toUpperCase()})`;
    }

    return `\n${pa.symbol}:\n${events}${taSection}`;
  }).join('\n');

  const hasTechnical = pairAnalyses.some(pa => pa.technical);
  const taInstructions = hasTechnical
    ? `\n- IMPORTANT: Also consider the technical analysis data provided for each pair
- When technicals and fundamentals agree, increase confidence
- When they conflict, reduce confidence and explain the divergence
- Weight fundamentals at 60% and technicals at 40% in your bias_score`
    : '';

  const prompt = `You are a senior forex analyst. Based on today's analyzed economic events${hasTechnical ? ' and technical analysis data' : ''}, generate a daily trade bias for each currency pair.

For each pair, consider:
- Weight high-confidence analyses more heavily
- Consider the net effect of multiple events on a pair
- A pair like EUR/USD: bullish EUR events push the pair up, bullish USD events push it down${taInstructions}

Provide for each pair:
- bias_score: -1.0 (strongly bearish) to +1.0 (strongly bullish), with 0 being neutral
- direction: "bullish" (score > 0.1), "bearish" (score < -0.1), or "neutral"
- confidence: 0.0 to 1.0
- reasoning: 2-3 sentence summary of the directional bias${hasTechnical ? ' incorporating both fundamental and technical factors' : ''}

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
    const today = new Date().toISOString().split('T')[0];

    // Get all currency pairs
    const { data: pairs } = await supabase
      .from('currency_pairs')
      .select('*')
      .eq('is_active', true);

    if (!pairs || pairs.length === 0) {
      return new Response(JSON.stringify({ message: 'No active pairs found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Fetch latest technical indicators for all active pairs
    const taMap = new Map<string, any>();
    try {
      const { data: indicators } = await supabase
        .from('technical_indicators')
        .select('pair_id, rsi_14, macd_line, macd_signal, macd_histogram, sma_20, sma_50, sma_200, support_level, resistance_level, ta_score, ta_signal')
        .order('indicator_date', { ascending: false });

      // Get latest per pair
      if (indicators) {
        for (const ind of indicators) {
          if (!taMap.has(ind.pair_id)) {
            taMap.set(ind.pair_id, ind);
          }
        }
      }

      // Get latest candle close price for each pair
      const { data: latestCandles } = await supabase
        .from('price_candles')
        .select('pair_id, close')
        .eq('timeframe', 'D')
        .order('open_time', { ascending: false });

      const priceMap = new Map<string, number>();
      if (latestCandles) {
        for (const c of latestCandles) {
          if (!priceMap.has(c.pair_id)) {
            priceMap.set(c.pair_id, c.close);
          }
        }
      }

      // Attach TA data to pair analyses
      for (const pa of pairAnalyses) {
        const ind = taMap.get(pa.pair_id);
        const price = priceMap.get(pa.pair_id);
        if (ind && price) {
          const macdStatus = ind.macd_histogram > 0 ? 'bullish'
            : ind.macd_histogram < 0 ? 'bearish' : 'neutral';
          pa.technical = {
            current_price: price,
            rsi_14: ind.rsi_14,
            macd_status: ind.macd_line > ind.macd_signal ? 'bullish cross' : 'bearish cross',
            sma_20: ind.sma_20,
            sma_50: ind.sma_50,
            sma_200: ind.sma_200,
            support: ind.support_level,
            resistance: ind.resistance_level,
            ta_score: ind.ta_score,
            ta_signal: ind.ta_signal,
          };
        }
      }
    } catch (taErr) {
      console.warn('Failed to fetch TA data (proceeding without):', taErr);
    }

    // Generate bias with Claude
    const biases = await generateBiasWithClaude(pairAnalyses);

    // Upsert daily bias with TA score and combined score
    const toUpsert = biases.map(b => {
      const ta = taMap.get(b.pair_id);
      const taScore = ta?.ta_score ?? null;
      const combinedScore = taScore !== null
        ? Math.max(-1, Math.min(1, b.bias_score * 0.6 + taScore * 0.4))
        : null;

      return {
        pair_id: b.pair_id,
        analysis_date: today,
        bias_score: b.bias_score,
        direction: b.direction,
        confidence: b.confidence,
        contributing_events: b.contributing_event_ids,
        ai_reasoning: b.reasoning,
        ta_score: taScore,
        combined_score: combinedScore !== null ? Math.round(combinedScore * 100) / 100 : null,
      };
    });

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
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
