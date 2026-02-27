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

// --- Web Push Content Encryption (RFC 8291 / aes128gcm) ---

function concatUint8Arrays(...arrays: Uint8Array[]): Uint8Array {
  const totalLen = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}

async function hkdfExtract(salt: Uint8Array, ikm: Uint8Array): Promise<CryptoKey> {
  const key = await crypto.subtle.importKey('raw', salt, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const prk = await crypto.subtle.sign('HMAC', key, ikm);
  return crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, true, ['sign']);
}

async function hkdfExpand(prk: CryptoKey, info: Uint8Array, length: number): Promise<Uint8Array> {
  const infoWithCounter = concatUint8Arrays(info, new Uint8Array([1]));
  const output = await crypto.subtle.sign('HMAC', prk, infoWithCounter);
  return new Uint8Array(output).slice(0, length);
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const prk = await hkdfExtract(salt, ikm);
  return hkdfExpand(prk, info, length);
}

function createInfo(type: string, clientPublicKey: Uint8Array, serverPublicKey: Uint8Array): Uint8Array {
  const encoder = new TextEncoder();
  const typeBytes = encoder.encode(type);
  // "Content-Encoding: <type>\0" + "P-256\0" + len(client) + client + len(server) + server
  const info = concatUint8Arrays(
    encoder.encode('Content-Encoding: '),
    typeBytes,
    new Uint8Array([0]),
    encoder.encode('P-256'),
    new Uint8Array([0]),
    new Uint8Array([0, 65]), // client key length (65 bytes for uncompressed P-256)
    clientPublicKey,
    new Uint8Array([0, 65]), // server key length
    serverPublicKey,
  );
  return info;
}

async function encryptPayload(
  clientPublicKeyBytes: Uint8Array,
  clientAuthSecret: Uint8Array,
  payload: Uint8Array
): Promise<{ body: Uint8Array; salt: Uint8Array; serverPublicKey: Uint8Array }> {
  // 1. Generate ephemeral ECDH key pair
  const serverKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );

  // 2. Export server public key (uncompressed, 65 bytes)
  const serverPublicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey('raw', serverKeyPair.publicKey)
  );

  // 3. Import client public key
  const clientPublicKey = await crypto.subtle.importKey(
    'raw',
    clientPublicKeyBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );

  // 4. Derive shared secret via ECDH
  const sharedSecretBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: clientPublicKey },
    serverKeyPair.privateKey,
    256
  );
  const sharedSecret = new Uint8Array(sharedSecretBits);

  // 5. Generate 16-byte salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // 6. HKDF: derive IKM from shared secret + auth secret (RFC 8291 Section 3.3)
  const encoder = new TextEncoder();
  const authInfo = encoder.encode('Content-Encoding: auth\0');
  const ikm = await hkdf(clientAuthSecret, sharedSecret, authInfo, 32);

  // 7. Derive content encryption key (CEK) and nonce using aesgcm encoding
  const cekInfo = createInfo('aesgcm', clientPublicKeyBytes, serverPublicKeyRaw);
  const nonceInfo = createInfo('nonce', clientPublicKeyBytes, serverPublicKeyRaw);

  const cek = await hkdf(salt, ikm, cekInfo, 16);
  const nonce = await hkdf(salt, ikm, nonceInfo, 12);

  // 8. Add 2-byte big-endian padding length prefix (0 = no padding)
  const paddedPayload = concatUint8Arrays(new Uint8Array([0, 0]), payload);

  // 9. Encrypt with AES-128-GCM
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    aesKey,
    paddedPayload
  );

  return {
    body: new Uint8Array(encrypted),
    salt,
    serverPublicKey: serverPublicKeyRaw,
  };
}

async function sendWebPush(subscription: { endpoint: string; p256dh: string; auth_key: string }, payload: string) {
  try {
    const jwt = await createVapidJwt(subscription.endpoint);

    // Encrypt payload per RFC 8291 (aesgcm encoding)
    const clientPublicKey = base64UrlToUint8Array(subscription.p256dh);
    const clientAuth = base64UrlToUint8Array(subscription.auth_key);
    const payloadBytes = new TextEncoder().encode(payload);
    const { body: encryptedBody, salt, serverPublicKey } = await encryptPayload(clientPublicKey, clientAuth, payloadBytes);

    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aesgcm',
        'TTL': '86400',
        'Authorization': `WebPush ${jwt}`,
        'Crypto-Key': `dh=${uint8ArrayToBase64Url(serverPublicKey)};p256ecdsa=${VAPID_PUBLIC_KEY}`,
        'Encryption': `salt=${uint8ArrayToBase64Url(salt)}`,
      },
      body: encryptedBody
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error(`Push failed ${response.status}: ${errText}`);
    }

    return { success: response.ok, status: response.status };
  } catch (err) {
    return { success: false, status: 0, error: String(err) };
  }
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
    if (req.method !== 'POST' && req.method !== 'GET') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders });
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
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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

    // Trigger email notifications
    let emailResult = 'skipped';
    try {
      const emailResp = await fetch(`${SUPABASE_URL}/functions/v1/send-email-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        }
      });
      const emailData = await emailResp.json();
      emailResult = emailData.message || 'triggered';
    } catch (emailErr) {
      emailResult = `error: ${String(emailErr)}`;
    }

    await supabase.from('system_logs').insert({
      level: 'info',
      source: 'send-push-notification',
      message: `Sent ${pushSent} push notifications for ${strongSignals.length} strong signals`,
      metadata: { date: today, strongSignals: strongSignals.length, pushSent, pushFailed, emailResult }
    });

    return new Response(JSON.stringify({
      message: 'Push notifications sent',
      strongSignals: strongSignals.length,
      pushSent,
      pushFailed
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
