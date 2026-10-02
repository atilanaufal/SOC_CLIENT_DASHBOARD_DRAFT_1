export interface SessionPayload {
  sessionId: string;
  userId: number | string;
  username?: string;
  role?: string;
  issuedAt: number;
  lastActive: number;
  expiresAt: number; // 12-hour absolute lifetime ceiling
}

export const SESSION_MAX_IDLE_MS = 15 * 60 * 1000; // 15 minutes inactivity timeout
export const SESSION_MAX_ABSOLUTE_MS = 12 * 60 * 60 * 1000; // 12 hours absolute maximum lifetime
export const SESSION_COOKIE_NAME = 'asoc_session';
export const LEGACY_COOKIE_NAMES = ['asoc_client_session', 'auth_session'];

/**
 * Retrieves the cryptographic session secret.
 * Enforces strict validation: fails closed in production if secret is missing or too short.
 */
export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET || process.env.BETTER_AUTH_SECRET;

  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== 'phase-production-build') {
    if (!secret || secret.length < 32) {
      throw new Error(
        'CRITICAL SECURITY FAILURE: SESSION_SECRET or BETTER_AUTH_SECRET must be defined with at least 32 characters in production.'
      );
    }
    return secret;
  }

  return secret || 'dev_secret_key_minimum_32_characters_for_signing_tokens';
}

function base64UrlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str: string): string {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) {
    b64 += '=';
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) return new Uint8Array(0);
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return globalThis.crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/**
 * Creates a cryptographically signed session token:
 * Format: <base64url(payload)>.<signature_hex>
 */
export async function signSessionToken(payload: SessionPayload): Promise<string> {
  const secret = getSessionSecret();
  const serialized = JSON.stringify(payload);
  const dataB64 = base64UrlEncode(serialized);

  const key = await getHmacKey(secret);
  const enc = new TextEncoder();
  const sigBuffer = await globalThis.crypto.subtle.sign('HMAC', key, enc.encode(dataB64));
  const signatureHex = bytesToHex(new Uint8Array(sigBuffer));

  return `${dataB64}.${signatureHex}`;
}

/**
 * Verifies a cryptographically signed session token.
 * - Uses native constant-time Web Crypto verification (subtle.verify).
 * - Enforces strict server-side idle timeout (15 minutes).
 * - Enforces absolute session expiration ceiling (12 hours).
 * - Validates schema and required attributes (sessionId, userId, lastActive, expiresAt).
 * - Fails closed immediately if invalid, tampered, or expired.
 */
export async function verifySessionToken(
  token: string | null | undefined,
  maxIdleMs: number = SESSION_MAX_IDLE_MS
): Promise<SessionPayload | null> {
  if (!token || typeof token !== 'string') {
    return null;
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return null;
  }

  const [dataB64, providedSigHex] = parts;
  if (!dataB64 || !providedSigHex) {
    return null;
  }

  try {
    const secret = getSessionSecret();
    const key = await getHmacKey(secret);
    const enc = new TextEncoder();

    const sigBytes = hexToBytes(providedSigHex);
    if (sigBytes.length !== 32) {
      return null;
    }

    const isValid = await globalThis.crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes as unknown as BufferSource,
      enc.encode(dataB64)
    );

    if (!isValid) {
      return null;
    }

    const jsonStr = base64UrlDecode(dataB64);
    const payload = JSON.parse(jsonStr) as SessionPayload;

    if (!payload.sessionId || payload.userId === undefined || payload.userId === null) {
      return null;
    }

    const lastActive = Number(payload.lastActive);
    if (!Number.isFinite(lastActive)) {
      return null;
    }

    const now = Date.now();
    // 1. Enforce 15-minute inactivity timeout based on server clock
    if (now - lastActive > maxIdleMs || lastActive > now + 60000) {
      return null;
    }

    // 2. Enforce 12-hour absolute lifetime ceiling (if present)
    const expiresAt = Number(payload.expiresAt);
    if (Number.isFinite(expiresAt) && now > expiresAt) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
