/**
 * Cloudflare Pages Function — SMTP Relay
 *
 * Supabase Edge Functions (Deno Deploy) cannot open raw TCP sockets.
 * Cloudflare Workers CAN via `connect()` from "cloudflare:sockets".
 * This function receives an HTTP POST with email details and relays
 * them to an SMTP server over SSL (465) or STARTTLS (587).
 *
 * Auth: X-Relay-Key header must match the SMTP_RELAY_KEY env var.
 *
 * POST /api/send-email
 * Body: { host, port, username, password, encryption, from, to, subject, html }
 */

import { connect } from 'cloudflare:sockets';

interface Env {
  SMTP_RELAY_KEY: string;
}

interface SmtpRequest {
  host: string;
  port: number;
  username: string;
  password: string;
  encryption: 'ssl' | 'tls' | 'none';
  from: string;
  to: string;
  subject: string;
  html: string;
}

// ---------- helpers ----------

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Read a complete SMTP response (may span multiple lines). */
async function readResponse(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  let buf = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    // SMTP multi-line responses use "NNN-" for continuation, "NNN " for last line
    const lines = buf.split('\r\n');
    // Check if the last complete line signals end of response
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.length >= 4 && line[3] === ' ') {
        // This is the final line — return everything
        return buf;
      }
    }
    // If we have data ending with \r\n and the last non-empty line has ' ' at [3]
    if (buf.endsWith('\r\n')) {
      const completeLines = buf.trimEnd().split('\r\n');
      const lastLine = completeLines[completeLines.length - 1];
      if (lastLine.length >= 4 && lastLine[3] === ' ') {
        return buf;
      }
    }
  }
  return buf;
}

/** Send a command and read the response. */
async function command(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  reader: ReadableStreamDefaultReader<Uint8Array>,
  cmd: string
): Promise<string> {
  await writer.write(encoder.encode(cmd + '\r\n'));
  return readResponse(reader);
}

/** Assert the response starts with one of the expected codes. */
function assertCode(response: string, ...codes: number[]): void {
  const code = parseInt(response.substring(0, 3), 10);
  if (!codes.includes(code)) {
    throw new Error(`SMTP error: expected ${codes.join('/')}, got: ${response.trim()}`);
  }
}

/** Build an RFC 2822 email message with base64-encoded HTML body. */
function buildMessage(from: string, to: string, subject: string, html: string): string {
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const date = new Date().toUTCString();
  const msgId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@fxmarket>`;

  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Date: ${date}`,
    `Message-ID: ${msgId}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    btoa(unescape(encodeURIComponent(html))).match(/.{1,76}/g)!.join('\r\n'),
    ``,
    `--${boundary}--`,
    ``
  ].join('\r\n');
}

// ---------- handler ----------

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type, x-relay-key',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  // Auth check
  const relayKey = context.request.headers.get('X-Relay-Key');
  if (!context.env.SMTP_RELAY_KEY || relayKey !== context.env.SMTP_RELAY_KEY) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: SmtpRequest;
  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { host, port, username, password, encryption, from, to, subject, html } = body;

  if (!host || !port || !username || !password || !from || !to || !subject || !html) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Connect with or without TLS depending on encryption type
    const useImplicitTls = encryption === 'ssl' || port === 465;

    const socket = connect(
      { hostname: host, port },
      { secureTransport: useImplicitTls ? 'on' : encryption === 'tls' ? 'starttls' : 'off' }
    );

    let readable = socket.readable;
    let writable = socket.writable;

    let reader = readable.getReader();
    let writer = writable.getWriter();

    // Read server greeting
    const greeting = await readResponse(reader);
    assertCode(greeting, 220);

    // EHLO
    let ehloResp = await command(writer, reader, `EHLO fxmarket`);
    assertCode(ehloResp, 250);

    // STARTTLS for port 587 / encryption=tls
    if (!useImplicitTls && encryption === 'tls') {
      const starttlsResp = await command(writer, reader, 'STARTTLS');
      assertCode(starttlsResp, 220);

      // Upgrade to TLS
      reader.releaseLock();
      writer.releaseLock();

      const tlsSocket = socket.startTls();
      readable = tlsSocket.readable;
      writable = tlsSocket.writable;
      reader = readable.getReader();
      writer = writable.getWriter();

      // Re-EHLO after TLS upgrade
      ehloResp = await command(writer, reader, `EHLO fxmarket`);
      assertCode(ehloResp, 250);
    }

    // AUTH LOGIN
    const authResp = await command(writer, reader, 'AUTH LOGIN');
    assertCode(authResp, 334);

    const userResp = await command(writer, reader, btoa(username));
    assertCode(userResp, 334);

    const passResp = await command(writer, reader, btoa(password));
    assertCode(passResp, 235);

    // Extract just the email address from "Name <email>" format
    const fromEmail = from.includes('<') ? from.match(/<([^>]+)>/)![1] : from;
    const toEmail = to.includes('<') ? to.match(/<([^>]+)>/)![1] : to;

    // MAIL FROM
    const mailFromResp = await command(writer, reader, `MAIL FROM:<${fromEmail}>`);
    assertCode(mailFromResp, 250);

    // RCPT TO
    const rcptResp = await command(writer, reader, `RCPT TO:<${toEmail}>`);
    assertCode(rcptResp, 250);

    // DATA
    const dataResp = await command(writer, reader, 'DATA');
    assertCode(dataResp, 354);

    // Send message body (base64 encoded to avoid dot-stuffing issues)
    const message = buildMessage(from, to, subject, html);
    await writer.write(encoder.encode(message + '\r\n.\r\n'));
    const endResp = await readResponse(reader);
    assertCode(endResp, 250);

    // QUIT
    await command(writer, reader, 'QUIT');

    reader.releaseLock();
    writer.releaseLock();
    await socket.close();

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'SMTP relay failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};

// Handle CORS preflight
export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'content-type, x-relay-key',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
  });
};
