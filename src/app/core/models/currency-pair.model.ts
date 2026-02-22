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
