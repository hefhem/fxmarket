export interface EconomicEvent {
  id: string;
  source: 'finnhub' | 'forexfactory' | 'rss';
  event_name: string;
  country: string;
  currency: string;
  impact: 'low' | 'medium' | 'high';
  event_datetime: string;
  actual?: string;
  forecast?: string;
  previous?: string;
  source_event_id?: string;
  raw_data?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface EventAnalysis {
  id: string;
  event_id: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  affected_pairs: string[];
  reasoning: string;
  model_used: string;
  created_at: string;
}

export type SignalType = 'STRONG BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG SELL';

export interface TradeSignal {
  pair_id: string;
  pair_symbol: string;
  display_name: string;
  signal: SignalType;
  bias_score: number;
  confidence: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  ai_reasoning: string;
  analysis_date: string;
  updated_at: string;
  ta_score?: number | null;
  combined_score?: number | null;
  recommended_entry_timing?: string | null;
  trade_session?: TradeSession | null;
}

export type TradeSession = 'asian' | 'london' | 'new_york' | 'london_ny_overlap';

export interface DailyTradeBias {
  id: string;
  pair_id: string;
  pair_symbol?: string;
  analysis_date: string;
  bias_score: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  contributing_events: string[];
  ai_reasoning: string;
  ta_score?: number | null;
  combined_score?: number | null;
  recommended_entry_timing?: string | null;
  trade_session?: TradeSession | null;
  created_at: string;
  updated_at: string;
}
