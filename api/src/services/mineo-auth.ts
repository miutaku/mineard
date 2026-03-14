/**
 * Mineo OIDC Authentication Service
 *
 * Exchanges a refresh_token for new tokens via the mineo OIDC endpoint.
 */

import type { Env } from '../types';

interface TokenResponse {
    access_token: string;
    expires_in: string;
    id_token: string;
    refresh_token: string;
    token_type: string;
}

interface TokenError {
    error: string;
    error_description: string;
}

/**
 * Exchange a refresh_token for new tokens (for manual token input flow).
 */
export async function loginWithRefreshToken(
    refreshToken: string,
    env: Env
): Promise<{ tokens: TokenResponse } | { error: string }> {
    const params = new URLSearchParams();
    params.set('grant_type', 'refresh_token');
    params.set('refresh_token', refreshToken);
    params.set('client_id', env.MINEO_OIDC_CLIENT_ID);

    const res = await fetch(env.MINEO_OIDC_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
    });

    if (res.ok) {
        const tokens = (await res.json()) as TokenResponse;
        return { tokens };
    }

    const body = (await res.json().catch(() => ({}))) as Partial<TokenError>;
    return { error: body.error_description || body.error || 'refresh_failed' };
}
