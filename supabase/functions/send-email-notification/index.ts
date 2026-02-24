import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

interface SmtpSettings {
  host: string;
  port: number;
  username: string;
  encrypted_password: string;
  from_email: string;
  from_name: string;
  encryption: 'none' | 'ssl' | 'tls';
  is_active: boolean;
}

function deriveSignal(biasScore: number, confidence: number): string {
  if (biasScore > 0.5 && confidence > 0.7) return 'STRONG BUY';
  if (biasScore > 0.2 && confidence > 0.5) return 'BUY';
  if (biasScore < -0.5 && confidence > 0.7) return 'STRONG SELL';
  if (biasScore < -0.2 && confidence > 0.5) return 'SELL';
  return 'HOLD';
}

function base64Encode(str: string): string {
  return btoa(str);
}

async function sendSmtpEmail(
  smtp: SmtpSettings,
  to: string,
  subject: string,
  htmlBody: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Use Deno's built-in SMTP via the denopkg SMTPClient
    // For Deno edge functions, we use raw SMTP socket connection
    const conn = smtp.encryption === 'ssl'
      ? await Deno.connectTls({ hostname: smtp.host, port: smtp.port })
      : await Deno.connect({ hostname: smtp.host, port: smtp.port });

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    async function readResponse(): Promise<string> {
      const buf = new Uint8Array(4096);
      const n = await conn.read(buf);
      return n ? decoder.decode(buf.subarray(0, n)) : '';
    }

    async function sendCommand(cmd: string): Promise<string> {
      await conn.write(encoder.encode(cmd + '\r\n'));
      return await readResponse();
    }

    // Read greeting
    await readResponse();

    // EHLO
    let ehloResp = await sendCommand(`EHLO fxanalyzer`);

    // STARTTLS for TLS
    if (smtp.encryption === 'tls') {
      await sendCommand('STARTTLS');
      const tlsConn = await Deno.startTls(conn as Deno.TcpConn, { hostname: smtp.host });
      // Re-assign for further communication
      const tlsEncoder = new TextEncoder();
      const tlsDecoder = new TextDecoder();

      async function tlsRead(): Promise<string> {
        const buf = new Uint8Array(4096);
        const n = await tlsConn.read(buf);
        return n ? tlsDecoder.decode(buf.subarray(0, n)) : '';
      }

      async function tlsSend(cmd: string): Promise<string> {
        await tlsConn.write(tlsEncoder.encode(cmd + '\r\n'));
        return await tlsRead();
      }

      await tlsSend(`EHLO fxanalyzer`);

      // AUTH LOGIN
      await tlsSend('AUTH LOGIN');
      await tlsSend(base64Encode(smtp.username));
      const authResp = await tlsSend(base64Encode(smtp.encrypted_password));
      if (!authResp.startsWith('235')) {
        tlsConn.close();
        return { success: false, error: `Auth failed: ${authResp.trim()}` };
      }

      await tlsSend(`MAIL FROM:<${smtp.from_email}>`);
      await tlsSend(`RCPT TO:<${to}>`);
      await tlsSend('DATA');

      const message = [
        `From: "${smtp.from_name}" <${smtp.from_email}>`,
        `To: ${to}`,
        `Subject: ${subject}`,
        `MIME-Version: 1.0`,
        `Content-Type: text/html; charset=UTF-8`,
        ``,
        htmlBody,
        `.`
      ].join('\r\n');
      const dataResp = await tlsSend(message);
      await tlsSend('QUIT');
      tlsConn.close();
      return { success: dataResp.startsWith('250') };
    }

    // Plain / SSL (already connected)
    // AUTH LOGIN
    await sendCommand('AUTH LOGIN');
    await sendCommand(base64Encode(smtp.username));
    const authResp = await sendCommand(base64Encode(smtp.encrypted_password));
    if (!authResp.startsWith('235')) {
      conn.close();
      return { success: false, error: `Auth failed: ${authResp.trim()}` };
    }

    await sendCommand(`MAIL FROM:<${smtp.from_email}>`);
    await sendCommand(`RCPT TO:<${to}>`);
    await sendCommand('DATA');

    const message = [
      `From: "${smtp.from_name}" <${smtp.from_email}>`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=UTF-8`,
      ``,
      htmlBody,
      `.`
    ].join('\r\n');
    const dataResp = await sendCommand(message);
    await sendCommand('QUIT');
    conn.close();
    return { success: dataResp.startsWith('250') };
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
          ${s.timing ? `<br><span style="color:#ff9800">⏰ ${s.timing}</span>` : ''}
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

    // Get SMTP settings
    const { data: smtpData } = await supabase
      .from('smtp_settings')
      .select('*')
      .limit(1)
      .single();

    if (!smtpData || !smtpData.is_active) {
      return new Response(JSON.stringify({ message: 'Email notifications are disabled. Configure SMTP in Admin > Email/SMTP.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const smtp = smtpData as SmtpSettings;

    // Test mode - send to admin's from_email
    if (isTest) {
      const result = await sendSmtpEmail(
        smtp,
        smtp.from_email,
        'FX Market Analyzer - Test Email',
        buildSignalEmailHtml([{
          symbol: 'EUR/USD', signal: 'STRONG BUY', score: 0.75,
          confidence: 0.85, reasoning: 'This is a test email to verify SMTP configuration.',
          timing: 'Test - London Session 08:00-10:00 UTC'
        }])
      );

      if (result.success) {
        return new Response(JSON.stringify({ message: `Test email sent to ${smtp.from_email}` }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } else {
        throw new Error(`SMTP error: ${result.error}`);
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
      const result = await sendSmtpEmail(smtp, user.email, subject, html);
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
      message: `Sent ${sent} emails for ${strongSignals.length} strong signals (${failed} failed)`,
      metadata: { sent, failed, signals: strongSignals.length }
    });

    return new Response(JSON.stringify({
      message: `Email notifications sent`,
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
