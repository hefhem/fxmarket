export interface PriceCandle {
  pair_id: string;
  open_time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  source?: string;
}

export type TASignal = 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell';

export interface TechnicalIndicator {
  id?: string;
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
  ta_signal: TASignal;
  ta_score: number;
  created_at?: string;
  updated_at?: string;
}

export const TA_SIGNAL_LABELS: Record<TASignal, string> = {
  strong_buy: 'STRONG BUY',
  buy: 'BUY',
  neutral: 'NEUTRAL',
  sell: 'SELL',
  strong_sell: 'STRONG SELL',
};

export const TA_SIGNAL_COLORS: Record<TASignal, string> = {
  strong_buy: '#00c853',
  buy: '#4caf50',
  neutral: '#9e9e9e',
  sell: '#f44336',
  strong_sell: '#b71c1c',
};
