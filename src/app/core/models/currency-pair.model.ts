export interface CurrencyPair {
  id: string;
  base_currency: string;
  quote_currency: string;
  symbol: string;
  display_name: string;
  is_active: boolean;
  created_at: string;
}

export const G7_PAIRS: string[] = [
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF',
  'AUD/USD', 'USD/CAD', 'NZD/USD'
];

export const ALL_PAIRS: string[] = [
  // G7 Majors
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF',
  'AUD/USD', 'USD/CAD', 'NZD/USD',
  // Crosses
  'EUR/GBP', 'EUR/JPY', 'GBP/JPY', 'EUR/AUD',
  'GBP/AUD', 'EUR/CAD', 'AUD/JPY', 'CAD/JPY',
  'NZD/JPY', 'GBP/CAD', 'AUD/CAD', 'AUD/NZD',
  'EUR/NZD', 'GBP/NZD', 'EUR/CHF', 'GBP/CHF',
  // Commodities
  'XAU/USD', 'XAG/USD'
];

export const CURRENCY_FLAGS: Record<string, string> = {
  EUR: '\u{1F1EA}\u{1F1FA}',
  USD: '\u{1F1FA}\u{1F1F8}',
  GBP: '\u{1F1EC}\u{1F1E7}',
  JPY: '\u{1F1EF}\u{1F1F5}',
  CHF: '\u{1F1E8}\u{1F1ED}',
  AUD: '\u{1F1E6}\u{1F1FA}',
  CAD: '\u{1F1E8}\u{1F1E6}',
  NZD: '\u{1F1F3}\u{1F1FF}',
  XAU: '\u{1F947}',
  XAG: '\u{1FA99}',
};
