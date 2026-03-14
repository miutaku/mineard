/**
 * Token management: checks expiry and refreshes id_token via refresh_token.
 */

import type { Account, Env, TokenRefreshResponse, TokenRefreshError } from '../types';
import { encrypt, decrypt } from './encryption';

export interface DecryptedTokens {
    idToken: string;
    refreshToken: string;
}

/** Decrypt tokens from DB record */
export async function decryptTokens(account: Account, encKey: string): Promise<DecryptedTokens> {
    const refreshToken = await decrypt(account.refresh_token, encKey);
    const idToken = account.id_token ? await decrypt(account.id_token, encKey) : '';
    return { idToken, refreshToken };
}

/** Check if id_token is still valid (with 5min buffer) */
export function isTokenValid(account: Account): boolean {
    if (!account.id_token || !account.token_expires_at) return false;
    const expiresAt = new Date(account.token_expires_at);
    const bufferMs = 5 * 60 * 1000; // 5 minutes
    return Date.now() < expiresAt.getTime() - bufferMs;
}

/** Refresh id_token and update DB. Returns new decrypted id_token. */
export async function refreshAndSave(
    db: D1Database,
    account: Account,
    encKey: string,
    env: Env
): Promise<string> {
    const { refreshToken } = await decryptTokens(account, encKey);

    // Call OIDC token endpoint
    const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: env.MINEO_OIDC_CLIENT_ID,
    });

    const response = await fetch(env.MINEO_OIDC_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
    });

    const body = await response.json() as TokenRefreshResponse | TokenRefreshError;

    if ('error' in body) {
        const errorDesc = (body as TokenRefreshError).error_description || (body as TokenRefreshError).error;
        if (errorDesc.includes('invalid') || errorDesc.includes('expired')) {
            // Token is definitively dead, wipe it out so UI shows '無効'
            await db.prepare('UPDATE accounts SET id_token = NULL, token_expires_at = NULL WHERE id = ?')
                .bind(account.id)
                .run();
        }
        throw new Error(`Token refresh failed: ${errorDesc}`);
    }

    const tokenResp = body as TokenRefreshResponse;
    const expiresAt = new Date(Date.now() + parseInt(tokenResp.expires_in) * 1000).toISOString();

    // Encrypt new tokens
    const encryptedIdToken = await encrypt(tokenResp.id_token, encKey);
    const encryptedRefreshToken = await encrypt(tokenResp.refresh_token, encKey);

    // Update DB
    await db
        .prepare(
            'UPDATE accounts SET id_token = ?, refresh_token = ?, token_expires_at = ? WHERE id = ?'
        )
        .bind(encryptedIdToken, encryptedRefreshToken, expiresAt, account.id)
        .run();

    return tokenResp.id_token;
}

/**
 * Ensure a valid id_token is available for the account.
 * Refreshes if expired. Returns the decrypted id_token.
 */
export async function ensureValidToken(
    db: D1Database,
    account: Account,
    encKey: string,
    env: Env
): Promise<string> {
    if (isTokenValid(account)) {
        const { idToken } = await decryptTokens(account, encKey);
        return idToken;
    }
    return refreshAndSave(db, account, encKey, env);
}
