-- Migration 011: Add trade timing recommendations to daily_trade_bias
-- Helps traders know the best time to enter trades based on AI analysis

ALTER TABLE daily_trade_bias
  ADD COLUMN IF NOT EXISTS recommended_entry_timing TEXT,
  ADD COLUMN IF NOT EXISTS trade_session VARCHAR(20);

-- Add comment for documentation
COMMENT ON COLUMN daily_trade_bias.recommended_entry_timing IS 'AI-recommended entry window with date/time and reasoning';
COMMENT ON COLUMN daily_trade_bias.trade_session IS 'Recommended trading session: london, new_york, asian, london_ny_overlap';
