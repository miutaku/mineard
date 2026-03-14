/**
 * TOTP authentication with JWT session cookies.
 * Uses the 'otpauth' library for TOTP verification.
 *
 * Each user has their own TOTP secret stored in the `users` table.
 */

import * as OTPAuth from 'otpauth';

const ISSUER = 'Mineard';
const TOKEN_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days

/** Generate a new TOTP secret and return base32-encoded string */
export function generateSecret(): string {
    const secret = new OTPAuth.Secret({ size: 20 });
    return secret.base32;
}

/** Generate otpauth:// URI for QR code */
export function getTotpUri(secretBase32: string, email: string): string {
    const totp = new OTPAuth.TOTP({
        issuer: ISSUER,
        label: email,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(secretBase32),
    });
    return totp.toString();
}

/** Verify a TOTP code */
export function verifyTotp(secretBase32: string, code: string): boolean {
    const totp = new OTPAuth.TOTP({
        issuer: ISSUER,
        label: 'mineard',
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(secretBase32),
    });
    const delta = totp.validate({ token: code, window: 1 });
    return delta !== null;
}

// ---------- JWT Session ----------

async function hmacSign(payload: string, secret: string): Promise<string> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
    const bytes = new Uint8Array(sig);
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmacVerify(payload: string, signature: string, secret: string): Promise<boolean> {
    const expected = await hmacSign(payload, secret);
    return expected === signature;
}

function base64UrlEncode(str: string): string {
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): string {
    const padded = str + '==='.slice(0, (4 - (str.length % 4)) % 4);
    return atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
}

/** Create a session token with userId embedded */
export async function createSessionToken(userId: number, secret: string): Promise<string> {
    const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = base64UrlEncode(
        JSON.stringify({
            sub: userId,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_SECONDS,
        })
    );
    const data = `${header}.${payload}`;
    const signature = await hmacSign(data, secret);
    return `${data}.${signature}`;
}

/** Verify a session token and return userId if valid, null otherwise */
export async function verifySessionToken(token: string, secret: string): Promise<number | null> {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [header, payload, signature] = parts;
    const data = `${header}.${payload}`;

    if (!(await hmacVerify(data, signature, secret))) return null;

    try {
        const decoded = JSON.parse(base64UrlDecode(payload));
        if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) return null;
        if (!decoded.sub) return null;
        return decoded.sub as number;
    } catch {
        return null;
    }
}
