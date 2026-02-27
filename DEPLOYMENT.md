# FX Market Analyzer - Deployment Guide

Complete guide for deploying the FX Market Analyzer from scratch.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Supabase Project Setup](#2-supabase-project-setup)
3. [Database Migrations](#3-database-migrations)
4. [Vault Secrets for Cron Jobs](#4-vault-secrets-for-cron-jobs)
5. [Edge Functions Deployment](#5-edge-functions-deployment)
6. [Edge Function Environment Variables](#6-edge-function-environment-variables)
7. [Frontend Build & Configuration](#7-frontend-build--configuration)
8. [Cloudflare Pages Deployment](#8-cloudflare-pages-deployment)
9. [Post-Deployment Configuration](#9-post-deployment-configuration)
10. [Verification Checklist](#10-verification-checklist)
11. [Troubleshooting](#11-troubleshooting)
12. [Architecture Reference](#12-architecture-reference)

---

## 1. Prerequisites

### Required Accounts

| Service | Purpose | Tier |
|---------|---------|------|
| [Supabase](https://supabase.com) | Backend (DB, Auth, Edge Functions, Realtime) | Free tier works |
| [Cloudflare](https://pages.cloudflare.com) | Frontend hosting | Free tier works |
| [Anthropic](https://console.anthropic.com) | Claude AI for analysis | API key required |
| [Finnhub](https://finnhub.io) | Economic events & price data | Free tier (60 calls/min) |

### Optional Accounts

| Service | Purpose | Tier |
|---------|---------|------|
| [Twelve Data](https://twelvedata.com) | Fallback price data source | Free tier (800 calls/day) |
| [Alpha Vantage](https://www.alphavantage.co) | Macro news sentiment | Free tier (25 calls/day) |
| [FRED](https://fred.stlouisfed.org/docs/api/api_key.html) | US Federal Reserve data | Free |

### Local Tools

```bash
node --version    # Required: v22.x
npm --version     # Required: v10+
npx supabase --version  # Supabase CLI (install: npm i -g supabase)
```

---

## 2. Supabase Project Setup

### 2.1 Create Project

1. Go to [app.supabase.com](https://app.supabase.com) and create a new project
2. Choose a region close to your users
3. Set a strong database password (save it securely)
4. Wait for the project to finish provisioning

### 2.2 Note Your Credentials

From **Project Settings > API**:

| Key | Where to find | Usage |
|-----|--------------|-------|
| Project URL | `https://xxxxx.supabase.co` | Frontend + Edge Functions |
| Anon Key | `eyJ...` (public) | Frontend Supabase client |
| Service Role Key | `eyJ...` (secret!) | Edge Functions + Cron Jobs |

### 2.3 Enable Required Extensions

Go to **Database > Extensions** and enable:

- `uuid-ossp` (usually enabled by default)
- `pg_cron` - Required for scheduled jobs
- `pg_net` - Required for cron jobs to call edge functions
- `pgsodium` - Required for vault secrets

### 2.4 Configure Authentication

Go to **Authentication > URL Configuration**:

- **Site URL**: `https://your-domain.com` (your Cloudflare Pages URL)
- **Redirect URLs**: Add `https://your-domain.com/**`

Go to **Authentication > Email Templates** and customize if desired.

---

## 3. Database Migrations

Run these migrations **in order** via **Supabase Dashboard > SQL Editor**. Each migration file is in `supabase/migrations/`.

| Order | File | Description |
|-------|------|-------------|
| 1 | `001_initial_schema.sql` | Core tables (profiles, currency_pairs, events, analyses, bias, alerts, notifications, RBAC) |
| 2 | `002_rls_policies.sql` | Row Level Security policies for all tables |
| 3 | `003_seed_data.sql` | Seed roles, permissions, G7 currency pairs |
| 4 | `004_cron_schedules.sql` | **SKIP** - Replaced by migration 012 |
| 5 | `005_push_subscriptions.sql` | Push notification subscriptions table |
| 6 | `006_additional_pairs.sql` | 16 cross pairs + XAU/USD, XAG/USD |
| 7 | `007_expand_sources.sql` | Multi-source event support |
| 8 | `008_data_source_settings.sql` | Data source enable/disable settings |
| 9 | `009_admin_seeder_and_user_lock.sql` | Admin user setup + account locking |
| 10 | `010_technical_analysis.sql` | Price candles, technical indicators tables |
| 11 | `011_trade_timing.sql` | Trade timing columns on daily_trade_bias |
| 12 | `012_fix_cron_and_email.sql` | Fixed cron jobs + SMTP settings + email notifications |
| 13 | `013_email_provider.sql` | Add provider + api_key columns for HTTP-based email |
| 14 | `014_smtp_provider.sql` | Add 'smtp' as provider option for direct SMTP relay |
| 15 | `015_trade_levels.sql` | Add open_price, stop_loss, take_profit to daily_trade_bias |

**IMPORTANT** - Before running migration 009, edit the admin email:

```sql
-- In migration 009, find and replace:
-- 'femi@provatix.com' → 'your-admin@email.com'
```

---

## 4. Vault Secrets for Cron Jobs

After running all migrations, the cron jobs need vault secrets to authenticate with edge functions.

Run in **SQL Editor**:

```sql
-- Replace with YOUR actual values from Project Settings > API
SELECT vault.create_secret(
  'https://YOUR_PROJECT_REF.supabase.co',
  'supabase_url'
);

SELECT vault.create_secret(
  'YOUR_SERVICE_ROLE_KEY_HERE',
  'service_role_key'
);
```

**Verify secrets are stored:**

```sql
SELECT name, created_at FROM vault.decrypted_secrets
WHERE name IN ('supabase_url', 'service_role_key');
```

You should see both rows returned.

---

## 5. Edge Functions Deployment

### 5.1 Link Your Project

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

### 5.2 Deploy All Functions

```bash
supabase functions deploy fetch-events --no-verify-jwt
supabase functions deploy analyze-events --no-verify-jwt
supabase functions deploy generate-daily-bias --no-verify-jwt
supabase functions deploy send-push-notification --no-verify-jwt
supabase functions deploy send-email-notification --no-verify-jwt
supabase functions deploy fetch-price-data --no-verify-jwt
supabase functions deploy compute-indicators --no-verify-jwt
```

### 5.3 Functions Overview

| Function | Trigger | Purpose |
|----------|---------|---------|
| `fetch-events` | Cron (every 4h) + Manual | Fetches economic events from Finnhub, Forex Factory, RSS, Alpha Vantage, FRED |
| `analyze-events` | Cron (every 4h +30min) + Manual | Sends events to Claude AI for sentiment analysis |
| `generate-daily-bias` | Cron (8am/2pm/8pm UTC) + Manual | Generates trade bias combining 60% fundamental + 40% technical |
| `fetch-price-data` | Cron (7am/7pm UTC) + Manual | Fetches OHLCV candles from Finnhub/TwelveData |
| `compute-indicators` | Cron (7:30am/7:30pm UTC) + Manual | Computes RSI, MACD, SMA, EMA, ATR, support/resistance |
| `send-push-notification` | Cron (15min after bias) + Manual | Sends browser push + triggers email for strong signals |
| `send-email-notification` | Called by push-notification + Manual | Sends email alerts via Resend/SendGrid/Brevo API or SMTP relay |

---

## 6. Edge Function Environment Variables

Go to **Project Settings > Edge Functions** and add these secrets:

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | Claude API key for AI analysis | `sk-ant-api03-...` |
| `FINNHUB_API_KEY` | Finnhub API key for events + prices | `d6dlsf...` |

### Optional (but recommended)

| Variable | Description | Example |
|----------|-------------|---------|
| `TWELVE_DATA_API_KEY` | TwelveData for fallback price data | `abc123...` |
| `ALPHA_VANTAGE_API_KEY` | Alpha Vantage news sentiment | `ABCDEF...` |
| `FRED_API_KEY` | US Federal Reserve economic data | `abc123...` |

### Push Notifications (optional)

| Variable | Description |
|----------|-------------|
| `VAPID_PUBLIC_KEY` | VAPID public key for Web Push |
| `VAPID_PRIVATE_KEY` | VAPID private key (PKCS8 base64url) |
| `VAPID_SUBJECT` | `mailto:admin@yourdomain.com` |

To generate VAPID keys:
```bash
npx web-push generate-vapid-keys
```

### SMTP Relay (optional, for direct SMTP provider)

If you want to use your own SMTP server (Gmail, Outlook, etc.) instead of an HTTP email provider, you need to set up a Cloudflare Pages Function as an SMTP relay. This is necessary because Supabase Edge Functions cannot make raw TCP connections.

| Variable | Where | Description |
|----------|-------|-------------|
| `SMTP_RELAY_KEY` | Cloudflare Pages env | Shared secret for relay auth |
| `SMTP_RELAY_KEY` | Supabase Edge Functions | Same shared secret |
| `SMTP_RELAY_URL` | Supabase Edge Functions | `https://<your-cf-pages-domain>/api/send-email` |

Generate the shared secret:
```bash
openssl rand -hex 32
```

The relay function is automatically deployed from `functions/api/send-email.ts` when you deploy to Cloudflare Pages. Set the `SMTP_RELAY_KEY` environment variable in Cloudflare Pages dashboard under **Settings > Environment Variables**.

> Note: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are automatically available to edge functions - no need to set them.

---

## 7. Frontend Build & Configuration

### 7.1 Create Production Environment

Create `src/environments/environment.prod.ts` (this file is git-ignored):

```typescript
export const environment = {
  production: true,
  supabaseUrl: 'https://YOUR_PROJECT_REF.supabase.co',
  supabaseAnonKey: 'YOUR_ANON_KEY',
  finnhubApiKey: 'YOUR_FINNHUB_KEY',
  vapidPublicKey: 'YOUR_VAPID_PUBLIC_KEY'
};
```

### 7.2 Install Dependencies & Build

```bash
npm install
npm run build
```

Build output goes to `dist/fxmarket/browser/`.

### 7.3 Verify Build

- No errors in build output
- Initial bundle < 1MB (warning) / 2MB (error)
- Service worker files generated (`ngsw.json`, `ngsw-worker.js`)

---

## 8. Cloudflare Pages Deployment

### Option A: Git Integration (Recommended)

1. Go to [Cloudflare Pages](https://pages.cloudflare.com)
2. Create a new project and connect your GitHub repo
3. Configure build settings:
   - **Build command**: `npm run build`
   - **Build output directory**: `dist/fxmarket/browser`
   - **Node version**: `22` (set as environment variable `NODE_VERSION=22`)
4. Add environment variable: `NODE_VERSION` = `22`
5. Deploy

### Option B: Direct Upload

```bash
npm run build
npx wrangler pages deploy dist/fxmarket/browser --project-name fxmarket
```

### Cloudflare Configuration

The following files are automatically included in the build output:

- `_redirects` - SPA routing (`/* → /index.html 200`)
- `_headers` - Security headers (X-Frame-Options, CSP, etc.)

### Custom Domain

1. In Cloudflare Pages, go to **Custom Domains**
2. Add your domain (e.g., `fxmarket.yourdomain.com`)
3. SSL is automatically provisioned

---

## 9. Post-Deployment Configuration

### 9.1 Create Admin Account

1. Visit your deployed site and **Sign Up** with your admin email
2. Verify the email (check inbox for Supabase confirmation)
3. The migration 009 auto-promotes the configured email to admin role

If you need to manually promote an admin, run in SQL Editor:

```sql
INSERT INTO user_roles (user_id, role_id)
SELECT p.id, r.id
FROM profiles p, roles r
WHERE p.email = 'your-admin@email.com'
  AND r.name = 'admin'
ON CONFLICT DO NOTHING;
```

### 9.2 Configure Email Notifications

#### Option A: HTTP Email Provider (easiest)

1. Sign up for one of these free email providers:

| Provider | Free Tier | Sign Up | API Key Format |
|----------|-----------|---------|----------------|
| **Resend** | 100 emails/day | [resend.com](https://resend.com) | `re_xxxxxxxx` |
| **SendGrid** | 100 emails/day | [sendgrid.com](https://sendgrid.com) | `SG.xxxxxxxx` |
| **Brevo** | 300 emails/day | [brevo.com](https://brevo.com) | `xkeysib-xxxxxxxx` |

2. Log in as admin
3. Go to **Admin Panel > Email** tab
4. Select your provider and paste your API key
5. Set your **From Email** and **From Name**
6. Click **Send Test Email** to verify
7. Toggle **Enable** when ready

> **Resend note**: You must verify a domain or use their onboarding email to send. Follow their setup guide after sign-up.

#### Option B: SMTP Server (Gmail, Outlook, etc.)

Use your own SMTP server directly. Emails are relayed through a Cloudflare Pages Function.

**Prerequisites**: Set up the SMTP relay env vars (see Section 6 > SMTP Relay).

1. Log in as admin
2. Go to **Admin Panel > Email** tab
3. Select **SMTP Server** as the provider
4. Enter your SMTP server details:

| Setting | Gmail | Outlook | Yahoo |
|---------|-------|---------|-------|
| Host | `smtp.gmail.com` | `smtp-mail.outlook.com` | `smtp.mail.yahoo.com` |
| Port | 587 | 587 | 465 |
| Encryption | STARTTLS | STARTTLS | SSL |
| Username | your Gmail address | your Outlook address | your Yahoo address |
| Password | App Password | account password | App Password |

5. Set **From Email** (usually same as username) and **From Name**
6. Click **Send Test Email** to verify
7. Toggle **Enable** when ready

> **Gmail note**: You must enable 2-Factor Authentication, then generate an App Password at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords). Regular Gmail passwords will not work.

### 9.3 Verify Cron Jobs

Run a manual test of each edge function from **Admin Panel > Actions** tab:

1. **Fetch Events** - Should return event count
2. **Analyze Events** - Should return analysis count
3. **Generate Daily Bias** - Should return pair count
4. **Fetch Price Data** - Should return candle count
5. **Compute Indicators** - Should return indicator count
6. **Send Notifications** - Should send push/email for strong signals

Check **Admin Panel > System Logs** for results.

### 9.4 Verify Cron Schedule

Check that cron jobs are registered:

```sql
SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
```

Expected output: 11 jobs (fetch-events, analyze-events, generate-bias, fetch-price x2, compute-indicators x2, send-notifications, cleanup x3).

### 9.5 Update Supabase Auth URLs

In **Supabase Dashboard > Authentication > URL Configuration**:

- **Site URL**: `https://your-production-domain.com`
- **Redirect URLs**: `https://your-production-domain.com/**`

---

## 10. Verification Checklist

### Frontend

- [ ] Site loads at your domain
- [ ] Sign up / sign in works
- [ ] Dashboard shows (may be empty initially)
- [ ] Navigation works (all routes)
- [ ] Settings page loads with timezone options
- [ ] Service worker registers (check DevTools > Application)

### Backend

- [ ] Edge functions deployed (check Supabase Dashboard > Edge Functions)
- [ ] Vault secrets configured (supabase_url + service_role_key)
- [ ] Manual function triggers work from Admin Panel
- [ ] Cron jobs registered (`SELECT * FROM cron.job`)
- [ ] RLS policies active (`SELECT tablename, policyname FROM pg_policies`)

### Data Pipeline

- [ ] Events fetched (run Fetch Events manually, check economic_events table)
- [ ] Events analyzed (run Analyze Events, check event_analyses table)
- [ ] Bias generated (run Generate Daily Bias, check daily_trade_bias table)
- [ ] Price data fetched (run Fetch Price Data, check price_candles table)
- [ ] Indicators computed (run Compute Indicators, check technical_indicators table)
- [ ] Trade signals appear on Signals page
- [ ] Pair analysis shows chart + indicators + trade timing

### Notifications

- [ ] Push notifications work (enable in Settings, trigger from Admin)
- [ ] Email notifications work (configure SMTP, enable in Settings, send test)

---

## 11. Troubleshooting

### Cron Jobs Not Running

**Symptom**: No data appearing automatically.

1. Verify extensions are enabled: `pg_cron`, `pg_net`
2. Check vault secrets exist:
   ```sql
   SELECT name FROM vault.decrypted_secrets WHERE name IN ('supabase_url', 'service_role_key');
   ```
3. Check cron job logs:
   ```sql
   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
   ```
4. Test the helper function directly:
   ```sql
   SELECT invoke_edge_function('fetch-events');
   ```

### Edge Function Errors

1. Check **Supabase Dashboard > Edge Functions > Logs**
2. Check `system_logs` table:
   ```sql
   SELECT * FROM system_logs WHERE level = 'error' ORDER BY created_at DESC LIMIT 10;
   ```
3. Common issues:
   - Missing API keys → Set in Edge Functions secrets
   - CORS errors → All functions have CORS headers (check browser console)
   - Rate limits → Finnhub free tier: 60 calls/min

### Build Errors

- `@angular/animations` version mismatch → Use `^20.x`, not `latest`
- Bundle too large → Check `ng build --stats-json` for bloat
- Service worker issues → Only active in production builds

### Push Notifications Not Working

- Service worker only works on HTTPS (production)
- Browser must grant notification permission
- VAPID keys must match between frontend (`environment.prod.ts`) and backend (edge function env)

### Email Notifications Not Sending

1. Check email provider settings in **Admin > Email** tab
2. Send a test email first to verify API key works
3. Ensure your provider account is active and domain is verified:
   - **Resend**: Verify a sending domain or use onboarding email
   - **SendGrid**: Complete sender verification
   - **Brevo**: Verify sender email address
4. Check `system_logs` table for `send-email-notification` errors
5. Verify users have **email_notifications** enabled in Settings

---

## 12. Architecture Reference

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Angular 20 + Angular Material (dark theme) |
| Backend | Supabase (PostgreSQL, Edge Functions, Auth, Realtime) |
| AI Engine | Claude Haiku 4.5 via Anthropic API |
| Charts | TradingView Lightweight Charts v5 |
| Hosting | Cloudflare Pages (frontend), Supabase (backend) |

### Data Flow

```
Economic Events (Finnhub, Forex Factory, RSS, Alpha Vantage, FRED)
    ↓ [fetch-events - every 4h]
economic_events table
    ↓ [analyze-events - every 4h +30min]
event_analyses table (Claude AI sentiment analysis)
    ↓
Price Data (Finnhub, TwelveData)
    ↓ [fetch-price-data - 7am/7pm UTC]
price_candles table
    ↓ [compute-indicators - 7:30am/7:30pm UTC]
technical_indicators table (RSI, MACD, SMA, EMA, ATR)
    ↓
    ↓ [generate-daily-bias - 8am/2pm/8pm UTC]
    ↓ Combines: 60% fundamental + 40% technical
daily_trade_bias table (score, direction, confidence, timing, session)
    ↓ [send-push-notification - 15min after bias]
    ├→ Browser push notifications (Web Push API)
    ├→ In-app notifications (notifications table)
    └→ Email alerts (Resend/SendGrid/Brevo/SMTP via send-email-notification)
```

### Database Tables

| Table | Description |
|-------|-------------|
| `profiles` | User profiles (name, timezone, email_notifications) |
| `roles` / `permissions` / `role_permissions` / `user_roles` | RBAC system |
| `currency_pairs` | 25 instruments (G7 + crosses + gold/silver) |
| `economic_events` | Economic calendar events from 5 sources |
| `event_analyses` | AI sentiment analysis per event |
| `daily_trade_bias` | Trade bias per pair per day (score, direction, timing) |
| `price_candles` | OHLCV daily candle data |
| `technical_indicators` | Computed technical indicators per pair |
| `watchlists` | User watchlists |
| `alerts` | User alert rules |
| `notifications` | In-app notifications |
| `push_subscriptions` | Web Push subscription endpoints |
| `smtp_settings` | Email provider configuration - Resend/SendGrid/Brevo/SMTP (singleton) |
| `data_source_settings` | Data source enable/disable toggles |
| `system_logs` | System audit trail |

### Scheduled Jobs Summary

| Time (UTC) | Action |
|------------|--------|
| Every 4h (:00) | Fetch economic events |
| Every 4h (:30) | AI analyze events |
| 07:00 / 19:00 | Fetch price candles |
| 07:30 / 19:30 | Compute technical indicators |
| 08:00 / 14:00 / 20:00 | Generate daily trade bias |
| 08:15 / 14:15 / 20:15 | Send push + email notifications |
| Sunday 03:00 | Cleanup events > 90 days |
| Sunday 04:00 | Cleanup logs > 30 days |
| Sunday 05:00 | Cleanup candles > 365 days |

---

## Quick Start (TL;DR)

```bash
# 1. Clone & install
git clone https://github.com/hefhem/fxmarket.git
cd fxmarket
npm install

# 2. Setup Supabase
#    - Create project at supabase.com
#    - Enable extensions: pg_cron, pg_net, pgsodium
#    - Run migrations 001-015 in SQL Editor (skip 004)
#    - Set vault secrets (see Section 4)

# 3. Deploy edge functions
supabase login
supabase link --project-ref YOUR_REF
supabase functions deploy fetch-events --no-verify-jwt
supabase functions deploy analyze-events --no-verify-jwt
supabase functions deploy generate-daily-bias --no-verify-jwt
supabase functions deploy send-push-notification --no-verify-jwt
supabase functions deploy send-email-notification --no-verify-jwt
supabase functions deploy fetch-price-data --no-verify-jwt
supabase functions deploy compute-indicators --no-verify-jwt

# 4. Set edge function secrets in Supabase Dashboard
#    ANTHROPIC_API_KEY, FINNHUB_API_KEY, etc.

# 5. Create environment.prod.ts & build
cp src/environments/environment.ts src/environments/environment.prod.ts
# Edit environment.prod.ts with your production keys
npm run build

# 6. Deploy to Cloudflare Pages
npx wrangler pages deploy dist/fxmarket/browser --project-name fxmarket

# 7. Sign up, promote yourself to admin, configure SMTP
```
