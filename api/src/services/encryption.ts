/**
 * AES-GCM encryption/decryption for sensitive data (tokens).
 * Uses Web Crypto API available in Cloudflare Workers.
 */

const ALGORITHM = 'AES-GCM';
const IV_LENGTH = 12;

async function getKey(secret: string): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret).slice(0, 32).buffer as ArrayBuffer,
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: encoder.encode('mineard-salt'),
            iterations: 100000,
            hash: 'SHA-256',
        },
        keyMaterial,
        { name: ALGORITHM, length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer as ArrayBuffer;
}

export async function encrypt(plaintext: string, secret: string): Promise<string> {
    const key = await getKey(secret);
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const encoder = new TextEncoder();

    const ciphertext = await crypto.subtle.encrypt(
        { name: ALGORITHM, iv },
        key,
        encoder.encode(plaintext)
    );

    // Format: base64(iv):base64(ciphertext)
    return `${arrayBufferToBase64(iv.buffer as ArrayBuffer)}:${arrayBufferToBase64(ciphertext)}`;
}

export async function decrypt(encrypted: string, secret: string): Promise<string> {
    const key = await getKey(secret);
    const [ivBase64, ciphertextBase64] = encrypted.split(':');

    if (!ivBase64 || !ciphertextBase64) {
        throw new Error('Invalid encrypted data format');
    }

    const iv = new Uint8Array(base64ToArrayBuffer(ivBase64));
    const ciphertext = base64ToArrayBuffer(ciphertextBase64);

    const plaintext = await crypto.subtle.decrypt(
        { name: ALGORITHM, iv },
        key,
        ciphertext
    );

    return new TextDecoder().decode(plaintext);
}
