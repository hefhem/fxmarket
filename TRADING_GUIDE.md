# FX Market Analyzer — Trading Guide

A practical guide to understanding the signals and indicators produced by this application, and how to use them to make informed trading decisions.

---

## Glossary of Terms

| Term | Full Name | What It Means |
|------|-----------|---------------|
| **TA** | Technical Analysis | Studying price charts and mathematical indicators to predict future price direction |
| **FA** | Fundamental Analysis | Studying economic events, news, and data releases to predict currency strength/weakness |
| **OHLCV** | Open, High, Low, Close, Volume | The 5 data points that make up a single price candle |
| **RSI** | Relative Strength Index | Measures how fast price is rising or falling (0-100 scale) |
| **MACD** | Moving Average Convergence Divergence | Shows the relationship between two moving averages to detect momentum shifts |
| **SMA** | Simple Moving Average | Average closing price over a set number of periods (e.g., SMA-50 = average of last 50 days) |
| **EMA** | Exponential Moving Average | Like SMA but gives more weight to recent prices, reacts faster |
| **ATR** | Average True Range | Measures how much a pair typically moves per day (volatility) |
| **S/R** | Support and Resistance | Price levels where the market has historically bounced (support) or reversed down (resistance) |
| **Bias** | Directional Bias | The expected direction of a currency pair (bullish = up, bearish = down, neutral = sideways) |
| **Pip** | Percentage in Point | The smallest standard price movement in forex (0.0001 for most pairs, 0.01 for JPY pairs) |

---

## Understanding the Application's Signals

### 1. Signal Types

The app produces 5 signal levels based on combined fundamental + technical analysis:

| Signal | Meaning | Action Suggestion |
|--------|---------|-------------------|
| **STRONG BUY** | Both fundamentals and technicals strongly favour upward movement | High-confidence buy opportunity |
| **BUY** | Moderate evidence favouring upward movement | Consider buying with proper risk management |
| **HOLD** | No clear direction or low confidence | Stay out or hold existing positions |
| **SELL** | Moderate evidence favouring downward movement | Consider selling with proper risk management |
| **STRONG SELL** | Both fundamentals and technicals strongly favour downward movement | High-confidence sell opportunity |

### 2. The Three Scores

Each pair shows three scores on the Trade Signals page:

- **Fundamental Score** (-100 to +100): Based on economic events and AI analysis of news. Positive = bullish for the pair, negative = bearish.
- **Technical Score** (-100 to +100): Based on price indicators (RSI, MACD, moving averages). Positive = bullish, negative = bearish.
- **Combined Score** (-100 to +100): Weighted blend of 60% fundamental + 40% technical. This is what determines the final signal.

### 3. Agreement Indicator

- **Green checkmark** ("Fundamentals & Technicals agree") — Both analyses point the same direction. Higher confidence trade.
- **Orange warning** ("Fundamentals & Technicals diverge") — Analyses disagree. Be cautious, reduce position size, or wait for clarity.

---

## Understanding Each Indicator

### RSI (Relative Strength Index)

RSI measures whether a pair is being bought or sold too aggressively.

| RSI Value | Zone | What It Means |
|-----------|------|---------------|
| Below 30 | Oversold (Green) | Price has fallen sharply — may bounce up. Look for buy opportunities. |
| 30 to 70 | Neutral (Grey) | Normal trading range — no extreme signal. |
| Above 70 | Overbought (Red) | Price has risen sharply — may pull back down. Look for sell opportunities. |

**How to use:** RSI below 30 on a pair with a bullish fundamental bias = strong buy signal. RSI above 70 with bearish fundamentals = strong sell signal.

### MACD (Moving Average Convergence Divergence)

MACD detects momentum shifts — when a trend is starting or ending.

| Status | What It Means |
|--------|---------------|
| **Bullish Cross** | MACD line crosses above signal line — upward momentum building |
| **Bearish Cross** | MACD line crosses below signal line — downward momentum building |
| **Green Histogram** | Bullish momentum is active and strengthening |
| **Red Histogram** | Bearish momentum is active and strengthening |

**How to use:** A bullish MACD cross that aligns with a positive fundamental bias is a strong confirmation to buy.

### Moving Averages (SMA-20, SMA-50, SMA-200)

Moving averages show the average price over time. They act as dynamic support/resistance.

| Condition | What It Means |
|-----------|---------------|
| Price above SMA-20 | Short-term trend is up |
| Price above SMA-50 | Medium-term trend is up |
| Price above SMA-200 | Long-term trend is up |
| Price above ALL three | Strong uptrend — favour buy trades |
| Price below ALL three | Strong downtrend — favour sell trades |
| **Golden Cross** (SMA-50 crosses above SMA-200) | Major bullish signal — long-term trend shifting up |
| **Death Cross** (SMA-50 crosses below SMA-200) | Major bearish signal — long-term trend shifting down |

**How to use:** If price is above all 3 SMAs and the app shows a BUY or STRONG BUY signal, this is a high-probability setup.

### Support and Resistance

- **Support** — A price level where the pair has bounced upward before. Think of it as a "floor."
- **Resistance** — A price level where the pair has reversed downward before. Think of it as a "ceiling."

**How to use:**
- Buy near support levels (price is at a discount)
- Sell near resistance levels (price is at a premium)
- If price breaks through resistance, it often becomes the new support (and vice versa)

### ATR (Average True Range)

ATR tells you how much a pair typically moves in a day. It is not a directional indicator — it measures volatility.

**How to use:**
- Use ATR to set your stop loss. A common approach: place stop loss 1.5x ATR away from entry.
- High ATR = more risk per trade, use smaller position sizes.
- Low ATR = less movement, wider targets may take longer to reach.

---

## Step-by-Step: How to Trade Using This App

### Before You Start

1. Run the initial data pipeline from Admin (Fetch Price Data → Compute Indicators → Generate Daily Bias)
2. Ensure cron jobs are running so data stays fresh automatically
3. Open a demo/practice account with your forex broker first

### Daily Routine

#### Morning (After 8:00 UTC Bias Update)

1. **Check the Dashboard** — See the overall market sentiment. Note which pairs are bullish/bearish and check TA chips for agreement.

2. **Review Trade Signals page** — Focus on:
   - STRONG BUY and STRONG SELL signals (highest conviction)
   - Signals where fundamentals and technicals **agree** (green checkmark)
   - Signals with **confidence above 70%**

3. **Drill into Pair Analysis** for your top candidates:
   - Is the price chart trending in the signal direction?
   - Is RSI supporting the move (not overbought for buys, not oversold for sells)?
   - Is MACD confirming momentum in the right direction?
   - Where are support and resistance relative to current price?

#### Taking a Trade

| Step | Action | App Feature to Check |
|------|--------|---------------------|
| 1 | Identify a STRONG BUY or STRONG SELL signal | Trade Signals page |
| 2 | Confirm fundamentals and technicals agree | Agreement indicator (green check) |
| 3 | Check the price chart for trend confirmation | Pair Analysis → Price Chart |
| 4 | Verify RSI is not at an extreme against your trade | Indicators Panel → RSI |
| 5 | Note support/resistance levels for entry and exit | Indicators Panel → S/R |
| 6 | Use ATR to calculate stop loss distance | Indicators Panel → ATR |
| 7 | Enter the trade on your broker platform | — |
| 8 | Monitor bias updates throughout the day | Dashboard / Push Notifications |

#### Example Trade

> **EUR/USD shows STRONG BUY** with:
> - Fundamental score: +65 (positive economic data for EUR)
> - Technical score: +45 (RSI at 42, MACD bullish cross, price above SMA-50 and SMA-200)
> - Combined score: +57
> - Agreement: Green checkmark
> - Support at 1.0800, Resistance at 1.0920
> - ATR: 0.0065 (65 pips daily range)
>
> **Action:** Buy EUR/USD near 1.0850 (close to support)
> **Stop Loss:** 1.0750 (below support, ~1.5x ATR = 97 pips)
> **Take Profit:** 1.0920 (resistance level, 70 pips)
> **Risk:Reward = ~1:0.7** — Acceptable but consider adjusting based on your risk appetite.

---

## Risk Management Rules

These rules are critical regardless of what the app signals:

1. **Never risk more than 1-2% of your account per trade.** If your account is $10,000, risk no more than $100-$200 per trade.

2. **Always use a stop loss.** Use ATR to determine a reasonable distance. Never move your stop loss further from your entry.

3. **Don't trade every signal.** Focus on STRONG BUY/SELL with agreement between fundamentals and technicals. Quality over quantity.

4. **Avoid trading during major news releases.** Even if the app shows a signal, spreads widen and prices can spike violently during high-impact events. Wait for the dust to settle.

5. **Check the confidence level.** Signals with confidence below 50% are less reliable. Treat them as informational, not actionable.

6. **Respect divergence warnings.** When fundamentals and technicals disagree (orange warning), either skip the trade or reduce your position size by half.

7. **Don't overtrade.** 2-3 well-selected trades per week is better than 10 mediocre ones.

8. **Keep a trading journal.** Record each trade, why you entered, and the outcome. Review weekly to improve.

---

## What the App Does NOT Do

- **It does not execute trades.** You must place trades manually on your broker platform.
- **It does not guarantee profits.** Signals are probabilistic, not certain.
- **It does not account for your personal risk tolerance.** You must apply your own position sizing and risk management.
- **It does not provide real-time tick data.** Price data is daily candles, updated twice per day. For intraday scalping, use your broker's charts.
- **It does not replace learning.** Use this as a tool alongside your own market knowledge, not as a substitute for it.

---

## Quick Reference: Signal Decision Matrix

| Fundamental | Technical | Agreement | Combined Score | Recommended Action |
|------------|-----------|-----------|---------------|-------------------|
| Strong Bullish | Bullish | Agree | > +50 | STRONG BUY — High confidence |
| Bullish | Bullish | Agree | +20 to +50 | BUY — Good setup |
| Bullish | Bearish | Diverge | Near 0 | WAIT — Mixed signals |
| Bearish | Bullish | Diverge | Near 0 | WAIT — Mixed signals |
| Bearish | Bearish | Agree | -20 to -50 | SELL — Good setup |
| Strong Bearish | Bearish | Agree | < -50 | STRONG SELL — High confidence |
| Any | Any | Any | -20 to +20 | HOLD — No clear edge |

---

## Data Update Schedule

| Time (UTC) | What Updates |
|------------|-------------|
| 7:00 | Price candles fetched |
| 7:30 | Technical indicators computed |
| 8:00 | AI bias generated (1st daily update) |
| Every 4 hours | Economic events fetched |
| 14:00 | AI bias generated (2nd daily update) |
| 19:00 | Price candles fetched |
| 19:30 | Technical indicators computed |
| 20:00 | AI bias generated (3rd daily update) |

Best times to check the app: **After 8:00 UTC** (London open) and **after 14:00 UTC** (New York open).

---

*This guide is for educational purposes. Forex trading involves significant risk of loss. Never trade with money you cannot afford to lose.*
