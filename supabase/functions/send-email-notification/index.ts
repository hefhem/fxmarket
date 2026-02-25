import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

interface EmailSettings {
  provider: 'resend' | 'sendgrid' | 'brevo' | 'smtp';
  api_key: string;
  from_email: string;
  from_name: string;
  is_active: boolean;
  // SMTP-specific fields (used when provider === 'smtp')
  host: string;
  port: number;
  username: string;
  encrypted_password: string;
  encryption: 'ssl' | 'tls' | 'none';
}

const SMTP_RELAY_URL = Deno.env.get('SMTP_RELAY_URL') ?? '';
const SMTP_RELAY_KEY = Deno.env.get('SMTP_RELAY_KEY') ?? '';

function deriveSignal(biasScore: number, confidence: number): string {
  if (biasScore > 0.5 && confidence > 0.7) return 'STRONG BUY';
  if (biasScore > 0.2 && confidence > 0.5) return 'BUY';
  if (biasScore < -0.5 && confidence > 0.7) return 'STRONG SELL';
  if (biasScore < -0.2 && confidence > 0.5) return 'SELL';
  return 'HOLD';
}

async function sendEmail(
  settings: EmailSettings,
  to: string,
  subject: string,
  htmlBody: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const fromField = `${settings.from_name} <${settings.from_email}>`;

    if (settings.provider === 'resend') {
      // Resend API - https://resend.com/docs/api-reference/emails/send-email
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${settings.api_key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: fromField,
          to: [to],
          subject,
          html: htmlBody
        })
      });
      if (!resp.ok) {
        const err = await resp.text();
        return { success: false, error: `Resend ${resp.status}: ${err}` };
      }
      return { success: true };

    } else if (settings.provider === 'sendgrid') {
      // SendGrid v3 API - https://docs.sendgrid.com/api-reference/mail-send/mail-send
      const resp = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${settings.api_key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: settings.from_email, name: settings.from_name },
          subject,
          content: [{ type: 'text/html', value: htmlBody }]
        })
      });
      if (!resp.ok) {
        const err = await resp.text();
        return { success: false, error: `SendGrid ${resp.status}: ${err}` };
      }
      return { success: true };

    } else if (settings.provider === 'brevo') {
      // Brevo (formerly Sendinblue) API - https://developers.brevo.com/reference/sendtransacemail
      const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': settings.api_key,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sender: { email: settings.from_email, name: settings.from_name },
          to: [{ email: to }],
          subject,
          htmlContent: htmlBody
        })
      });
      if (!resp.ok) {
        const err = await resp.text();
        return { success: false, error: `Brevo ${resp.status}: ${err}` };
      }
      return { success: true };
    }

    } else if (settings.provider === 'smtp') {
      // SMTP via Cloudflare Pages Function relay
      if (!SMTP_RELAY_URL) {
        return { success: false, error: 'SMTP_RELAY_URL not configured in edge function env vars' };
      }
      const resp = await fetch(SMTP_RELAY_URL, {
        method: 'POST',
        headers: {
          'X-Relay-Key': SMTP_RELAY_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          host: settings.host,
          port: settings.port,
          username: settings.username,
          password: settings.encrypted_password,
          encryption: settings.encryption,
          from: fromField,
          to,
          subject,
          html: htmlBody
        })
      });
      if (!resp.ok) {
        const err = await resp.text();
        return { success: false, error: `SMTP relay ${resp.status}: ${err}` };
      }
      return { success: true };
    }

    return { success: false, error: `Unknown provider: ${settings.provider}` };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

function buildSignalEmailHtml(signals: Array<{ symbol: string; signal: string; score: number; confidence: number; reasoning: string; timing?: string }>): string {
  const signalRows = signals.map(s => {
    const color = s.signal.includes('BUY') ? '#4caf50' : s.signal.includes('SELL') ? '#f44336' : '#9e9e9e';
    return `
      <tr>
        <td style="padding:12px;border-bottom:1px solid #2a2a4a;font-weight:bold">${s.symbol}</td>
        <td style="padding:12px;border-bottom:1px solid #2a2a4a;color:${color};font-weight:bold">${s.signal}</td>
        <td style="padding:12px;border-bottom:1px solid #2a2a4a">${(s.score * 100).toFixed(0)}</td>
        <td style="padding:12px;border-bottom:1px solid #2a2a4a">${(s.confidence * 100).toFixed(0)}%</td>
      </tr>
      <tr>
        <td colspan="4" style="padding:8px 12px 16px;color:#b0b0b0;font-size:13px;border-bottom:1px solid #1a1a2e">
          ${s.reasoning}
          ${s.timing ? `<br><span style="color:#ff9800">&#9200; ${s.timing}</span>` : ''}
        </td>
      </tr>`;
  }).join('');

  return `
    <div style="background:#0f0f23;color:#e0e0e0;font-family:Arial,sans-serif;padding:24px;max-width:600px;margin:0 auto">
      <div style="text-align:center;padding:16px 0;border-bottom:2px solid #4caf50">
        <h1 style="color:#4caf50;margin:0;font-size:22px">FX Market Analyzer</h1>
        <p style="color:#888;margin:8px 0 0;font-size:13px">Strong Signal Alert - ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-top:16px">
        <thead>
          <tr style="background:#1a1a2e">
            <th style="padding:10px;text-align:left;color:#888;font-size:12px">PAIR</th>
            <th style="padding:10px;text-align:left;color:#888;font-size:12px">SIGNAL</th>
            <th style="padding:10px;text-align:left;color:#888;font-size:12px">SCORE</th>
            <th style="padding:10px;text-align:left;color:#888;font-size:12px">CONFIDENCE</th>
          </tr>
        </thead>
        <tbody>${signalRows}</tbody>
      </table>
      <div style="margin-top:24px;padding:16px;background:#1a1a2e;border-radius:8px;text-align:center">
        <p style="margin:0;font-size:12px;color:#666">This is an automated alert from FX Market Analyzer. Trade signals are AI-generated and should not be considered financial advice.</p>
      </div>
    </div>`;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Check if this is a test request
    let isTest = false;
    try {
      const body = await req.json();
      isTest = body?.test === true;
    } catch { /* no body */ }

    // Get email settings
    const { data: settingsData } = await supabase
      .from('smtp_settings')
      .select('*')
      .limit(1)
      .single();

    if (!settingsData || !settingsData.is_active) {
      return new Response(JSON.stringify({ message: 'Email notifications are disabled. Configure in Admin > Email/SMTP.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const settings: EmailSettings = {
      provider: settingsData.provider || 'resend',
      api_key: settingsData.api_key || '',
      from_email: settingsData.from_email || '',
      from_name: settingsData.from_name || 'FX Market Analyzer',
      is_active: settingsData.is_active,
      host: settingsData.host || '',
      port: settingsData.port || 587,
      username: settingsData.username || '',
      encrypted_password: settingsData.encrypted_password || '',
      encryption: settingsData.encryption || 'tls'
    };

    // Validate credentials based on provider
    if (settings.provider === 'smtp') {
      if (!settings.host || !settings.username) {
        return new Response(JSON.stringify({ error: 'SMTP host and username are required. Configure in Admin > Email.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    } else if (!settings.api_key) {
      return new Response(JSON.stringify({ error: 'No API key configured. Add your email provider API key in Admin > Email.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Test mode - send to from_email
    if (isTest) {
      const result = await sendEmail(
        settings,
        settings.from_email,
        'FX Market Analyzer - Test Email',
        buildSignalEmailHtml([{
          symbol: 'EUR/USD', signal: 'STRONG BUY', score: 0.75,
          confidence: 0.85, reasoning: 'This is a test email to verify your email configuration is working correctly.',
          timing: 'Test - London Session 08:00-10:00 UTC'
        }])
      );

      if (result.success) {
        return new Response(JSON.stringify({ message: `Test email sent to ${settings.from_email} via ${settings.provider}` }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } else {
        return new Response(JSON.stringify({ error: result.error }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Production mode: send to users with email_notifications enabled
    const today = new Date().toISOString().split('T')[0];

    const { data: biasData } = await supabase
      .from('daily_trade_bias')
      .select('*, currency_pairs(symbol)')
      .eq('analysis_date', today);

    if (!biasData || biasData.length === 0) {
      return new Response(JSON.stringify({ message: 'No bias data for today' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const strongSignals = biasData
      .map((b: any) => ({
        symbol: b.currency_pairs?.symbol ?? '',
        signal: deriveSignal(b.combined_score ?? b.bias_score, b.confidence),
        score: b.combined_score ?? b.bias_score,
        confidence: b.confidence,
        reasoning: b.ai_reasoning ?? '',
        timing: b.recommended_entry_timing ?? ''
      }))
      .filter((s: any) => s.signal === 'STRONG BUY' || s.signal === 'STRONG SELL');

    if (strongSignals.length === 0) {
      return new Response(JSON.stringify({ message: 'No strong signals to email about' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get users with email notifications enabled
    const { data: users } = await supabase
      .from('profiles')
      .select('email')
      .eq('email_notifications', true)
      .eq('is_active', true);

    if (!users || users.length === 0) {
      return new Response(JSON.stringify({ message: 'No users have email notifications enabled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const subject = `FX Alert: ${strongSignals.map((s: any) => `${s.signal} ${s.symbol}`).join(', ')}`;
    const html = buildSignalEmailHtml(strongSignals);

    let sent = 0;
    let failed = 0;

    for (const user of users) {
      const result = await sendEmail(settings, user.email, subject, html);
      if (result.success) {
        sent++;
      } else {
        failed++;
        console.error(`Failed to send email to ${user.email}:`, result.error);
      }
    }

    await supabase.from('system_logs').insert({
      level: 'info',
      source: 'send-email-notification',
      message: `Sent ${sent} emails via ${settings.provider} for ${strongSignals.length} strong signals (${failed} failed)`,
      metadata: { sent, failed, signals: strongSignals.length, provider: settings.provider }
    });

    return new Response(JSON.stringify({
      message: `Email notifications sent via ${settings.provider}`,
      sent,
      failed,
      signals: strongSignals.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('send-email-notification error:', message);

    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      await supabase.from('system_logs').insert({
        level: 'error',
        source: 'send-email-notification',
        message,
        metadata: { error: message }
      });
    } catch (_) {}

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
