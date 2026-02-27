-- Migration 015: Add trade level columns (open_price, stop_loss, take_profit) to daily_trade_bias
-- These columns store AI-generated specific entry, stop loss, and take profit prices

ALTER TABLE daily_trade_bias
  ADD COLUMN IF NOT EXISTS open_price DECIMAL(10,5),
  ADD COLUMN IF NOT EXISTS stop_loss DECIMAL(10,5),
  ADD COLUMN IF NOT EXISTS take_profit DECIMAL(10,5);

-- Add comment for documentation
COMMENT ON COLUMN daily_trade_bias.open_price IS 'AI-recommended entry price based on support/resistance/ATR';
COMMENT ON COLUMN daily_trade_bias.stop_loss IS 'AI-recommended stop loss price';
COMMENT ON COLUMN daily_trade_bias.take_profit IS 'AI-recommended take profit price';
