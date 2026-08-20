// Self-contained Web Push (VAPID / RFC 8292 + payload encryption / RFC 8291,
// content-encoding aes128gcm) using only Node's built-in crypto — no external
// dependency, so it ships safely via the file-only patch system (no npm install).
const crypto = require('crypto');
const https = require('https');
const { URL } = require('url');

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(str) {
  return Buffer.from(String(str).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function generateVapidKeys() {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const pub = ecdh.getPublicKey(); // 65-byte uncompressed point
  const priv = ecdh.getPrivateKey();
  const d = Buffer.alloc(32);
  priv.copy(d, 32 - priv.length);
  const jwk = { kty: 'EC', crv: 'P-256', x: b64url(pub.slice(1, 33)), y: b64url(pub.slice(33, 65)), d: b64url(d) };
  return { publicKey: b64url(pub), privateJwk: jwk };
}

function vapidAuthHeader(endpoint, publicKey, privateJwk, subject) {
  const u = new URL(endpoint);
  const aud = `${u.protocol}//${u.host}`;
  const header = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const payload = b64url(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject || 'mailto:admin@localhost' }));
  const signingInput = `${header}.${payload}`;
  const key = crypto.createPrivateKey({ key: privateJwk, format: 'jwk' });
  const sig = crypto.sign('sha256', Buffer.from(signingInput), { key, dsaEncoding: 'ieee-p1363' });
  const jwt = `${signingInput}.${b64url(sig)}`;
  return `vapid t=${jwt}, k=${publicKey}`;
}

function encryptPayload(payload, uaPublicB64, authB64) {
  const uaPublic = b64urlDecode(uaPublicB64); // 65 bytes
  const authSecret = b64urlDecode(authB64);   // 16 bytes
  const salt = crypto.randomBytes(16);

  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey(); // 65 bytes
  const sharedSecret = ecdh.computeSecret(uaPublic);

  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', sharedSecret, authSecret, keyInfo, 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));

  const plaintext = Buffer.concat([Buffer.from(payload, 'utf8'), Buffer.from([2])]); // 0x02 record delimiter
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096, 0);
  const header = Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic]);
  return Buffer.concat([header, encrypted, tag]);
}

function sendNotification(subscription, payload, opts) {
  return new Promise((resolve) => {
    try {
      const encrypted = encryptPayload(payload, subscription.keys.p256dh, subscription.keys.auth);
      const u = new URL(subscription.endpoint);
      const req = https.request(
        {
          method: 'POST',
          hostname: u.hostname,
          path: u.pathname + u.search,
          port: u.port || 443,
          headers: {
            'Content-Encoding': 'aes128gcm',
            'Content-Type': 'application/octet-stream',
            'Content-Length': encrypted.length,
            TTL: String((opts && opts.ttl) || 86400),
            Authorization: vapidAuthHeader(subscription.endpoint, opts.publicKey, opts.privateJwk, opts.subject),
          },
        },
        (res) => {
          let d = '';
          res.on('data', (c) => { d += c; });
          res.on('end', () => resolve({ statusCode: res.statusCode, body: d }));
        }
      );
      req.on('error', () => resolve({ statusCode: 0 }));
      req.write(encrypted);
      req.end();
    } catch (e) {
      resolve({ statusCode: -1, error: e.message });
    }
  });
}

module.exports = { generateVapidKeys, vapidAuthHeader, encryptPayload, sendNotification, b64url, b64urlDecode };
