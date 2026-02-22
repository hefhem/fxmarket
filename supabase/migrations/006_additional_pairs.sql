-- ============================================================
-- Additional Currency Pairs: Crosses + Commodities (Gold, Silver)
-- ============================================================

INSERT INTO currency_pairs (base_currency, quote_currency, symbol, display_name) VALUES
  -- Major Crosses
  ('EUR', 'GBP', 'EUR/GBP', 'Euro / British Pound'),
  ('EUR', 'JPY', 'EUR/JPY', 'Euro / Japanese Yen'),
  ('GBP', 'JPY', 'GBP/JPY', 'British Pound / Japanese Yen'),
  ('EUR', 'AUD', 'EUR/AUD', 'Euro / Australian Dollar'),
  ('GBP', 'AUD', 'GBP/AUD', 'British Pound / Australian Dollar'),
  ('EUR', 'CAD', 'EUR/CAD', 'Euro / Canadian Dollar'),
  ('AUD', 'JPY', 'AUD/JPY', 'Australian Dollar / Japanese Yen'),
  ('CAD', 'JPY', 'CAD/JPY', 'Canadian Dollar / Japanese Yen'),
  ('NZD', 'JPY', 'NZD/JPY', 'New Zealand Dollar / Japanese Yen'),
  ('GBP', 'CAD', 'GBP/CAD', 'British Pound / Canadian Dollar'),
  ('AUD', 'CAD', 'AUD/CAD', 'Australian Dollar / Canadian Dollar'),
  ('AUD', 'NZD', 'AUD/NZD', 'Australian Dollar / New Zealand Dollar'),
  ('EUR', 'NZD', 'EUR/NZD', 'Euro / New Zealand Dollar'),
  ('GBP', 'NZD', 'GBP/NZD', 'British Pound / New Zealand Dollar'),
  ('EUR', 'CHF', 'EUR/CHF', 'Euro / Swiss Franc'),
  ('GBP', 'CHF', 'GBP/CHF', 'British Pound / Swiss Franc'),
  -- Commodities
  ('XAU', 'USD', 'XAU/USD', 'Gold / US Dollar'),
  ('XAG', 'USD', 'XAG/USD', 'Silver / US Dollar')
ON CONFLICT (symbol) DO NOTHING;
