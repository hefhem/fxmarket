-- Migration 007: Expand economic_events source CHECK constraint
-- Add 'alphavantage' and 'fred' as valid data sources

ALTER TABLE economic_events DROP CONSTRAINT IF EXISTS economic_events_source_check;
ALTER TABLE economic_events ADD CONSTRAINT economic_events_source_check
  CHECK (source IN ('finnhub', 'forexfactory', 'rss', 'alphavantage', 'fred'));
