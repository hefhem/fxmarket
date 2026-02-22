import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@fxanalyzer.com';

function deriveSignal(biasScore: number, confidence: number): string {
  if (biasScore > 0.5 && confidence > 0.7) return 'STRONG BUY';
  if (biasScore > 0.2 && confidence > 0.5) return 'BUY';
  if (biasScore < -0.5 && confidence > 0.7) return 'STRONG SELL';
  if (biasScore < -0.2 && confidence > 0.5) return 'SELL';
  return 'HOLD';
}

// Base64url encoding helpers for VAPID
function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - base64.length % 4) % 4);
  const raw = atob(base64 + padding);
  return new Uint8Array([...raw].map(c => c.charCodeAt(0)));
}

function uint8ArrayToBase64Url(arr: Uint8Array): string {
  let binary = '';
  for (const byte of arr) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function createVapidJwt(endpoint: string): Promise<string> {
  const audience = new URL(endpoint).origin;
  const header = { typ: 'JWT', alg: 'ES256' };
  const now = Math.floor(Date.now() / 1000);
  const payload = { aud: audience, exp: now + 86400, sub: VAPID_SUBJECT };

  const headerB64 = uint8ArrayToBase64Url(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = uint8ArrayToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  // Import the VAPID private key for signing
  const privateKeyBytes = base64UrlToUint8Array(VAPID_PRIVATE_KEY);
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    privateKeyBytes,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );

  const sigB64 = uint8ArrayToBase64Url(new Uint8Array(signature));
  return `${unsignedToken}.${sigB64}`;
}

async function sendWebPush(subscription: { endpoint: string; p256dh: string; auth_key: string }, payload: string) {
  try {
    const jwt = await createVapidJwt(subscription.endpoint);

    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'TTL': '86400',
        'Authorization': `vapid t=${jwt}, k=${VAPID_PUBLIC_KEY}`,
      },
      body: payload
    });

    return { success: response.ok, status: response.status };
  } catch (err) {
    return { success: false, status: 0, error: String(err) };
  }
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST' && req.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const today = new Date().toISOString().split('T')[0];

    // Fetch today's bias data with pair symbols
    const { data: biasData, error: biasError } = await supabase
      .from('daily_trade_bias')
      .select('*, currency_pairs(symbol)')
      .eq('analysis_date', today);

    if (biasError) throw biasError;
    if (!biasData || biasData.length === 0) {
      return new Response(JSON.stringify({ message: 'No bias data for today' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Find strong signals
    const strongSignals = biasData
      .map((b: any) => ({
        symbol: b.currency_pairs?.symbol ?? '',
        signal: deriveSignal(b.bias_score, b.confidence),
        bias_score: b.bias_score,
        confidence: b.confidence
      }))
      .filter((s: any) => s.signal === 'STRONG BUY' || s.signal === 'STRONG SELL');

    if (strongSignals.length === 0) {
      return new Response(JSON.stringify({ message: 'No strong signals to notify about' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Create in-app notifications for all users
    const { data: profiles } = await supabase.from('profiles').select('id');
    if (profiles && profiles.length > 0) {
      const notifications = [];
      for (const profile of profiles) {
        for (const sig of strongSignals) {
          notifications.push({
            user_id: profile.id,
            title: `${sig.signal}: ${sig.symbol}`,
            message: `${sig.symbol} has a ${sig.signal} signal (score: ${(sig.bias_score * 100).toFixed(0)}, confidence: ${(sig.confidence * 100).toFixed(0)}%)`,
            type: 'signal',
            is_read: false
          });
        }
      }

      if (notifications.length > 0) {
        await supabase.from('notifications').insert(notifications);
      }
    }

    // Send push notifications
    const { data: subscriptions } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('is_active', true);

    let pushSent = 0;
    let pushFailed = 0;

    if (subscriptions && subscriptions.length > 0 && VAPID_PRIVATE_KEY) {
      const signalSummary = strongSignals
        .map((s: any) => `${s.signal}: ${s.symbol}`)
        .join(', ');

      const payload = JSON.stringify({
        notification: {
          title: 'FX Market - Strong Signal Alert',
          body: signalSummary,
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-72x72.png',
          data: { url: '/signals' },
          actions: [{ action: 'view', title: 'View Signals' }]
        }
      });

      for (const sub of subscriptions) {
        const result = await sendWebPush(sub, payload);
        if (result.success) {
          pushSent++;
        } else {
          pushFailed++;
          // If subscription is gone (410), deactivate it
          if (result.status === 410) {
            await supabase.from('push_subscriptions')
              .update({ is_active: false })
              .eq('id', sub.id);
          }
        }
      }
    }

    await supabase.from('system_logs').insert({
      level: 'info',
      source: 'send-push-notification',
      message: `Sent ${pushSent} push notifications for ${strongSignals.length} strong signals`,
      metadata: { date: today, strongSignals: strongSignals.length, pushSent, pushFailed }
    });

    return new Response(JSON.stringify({
      message: 'Push notifications sent',
      strongSignals: strongSignals.length,
      pushSent,
      pushFailed
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('send-push-notification error:', message);

    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      await supabase.from('system_logs').insert({
        level: 'error',
        source: 'send-push-notification',
        message,
        metadata: { error: message }
      });
    } catch (_) {}

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
