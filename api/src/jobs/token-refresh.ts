/**
 * トークン事前リフレッシュジョブ
 *
 * Cron: 50 * * * * (UTC) = 毎時 :50
 * 有効期限切れのトークンを 24 時間常にリフレッシュし、
 * トークンをほぼ常に有効な状態に保つ。
 * トークンが有効なアカウントはスキップする。
 */

import type { Account, Env } from '../types';
import { isTokenValid, refreshAndSave } from '../services/token-manager';

export async function runTokenRefresh(env: Env): Promise<void> {
    const db = env.DB;

    const accounts = await db
        .prepare('SELECT * FROM accounts WHERE yuzurune_enabled = 1')
        .all<Account>();

    if (!accounts.results || accounts.results.length === 0) {
        console.log('[TokenRefresh] No enabled accounts found');
        return;
    }

    for (const account of accounts.results) {
        const displayName = account.display_name;

        if (isTokenValid(account)) {
            console.log(`[TokenRefresh] ${displayName}: Token still valid, skipping`);
            continue;
        }

        try {
            await refreshAndSave(db, account, env.ENCRYPTION_KEY, env);
            console.log(`[TokenRefresh] ${displayName}: Token refreshed`);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`[TokenRefresh] ${displayName}: Refresh failed: ${message}`);
        }
    }
}
