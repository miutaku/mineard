/**
 * Dashboard routes (user-scoped)
 */

import { Hono } from 'hono';
import type { HonoEnv, Account } from '../types';
import { ensureValidToken } from '../services/token-manager';
import { getCapacity, getDevolveDeclareState } from '../services/mineo-api';
import { runYuzurune } from '../jobs/yuzurune';

const dashboard = new Hono<HonoEnv>();

/** Get dashboard data for the logged-in user */
dashboard.get('/', async (c) => {
    const userId = c.get('userId');
    const db = c.env.DB;

    // Fetch this user's accounts
    const accountsResult = await db
        .prepare('SELECT * FROM accounts WHERE user_id = ? ORDER BY id')
        .bind(userId)
        .all<Account>();
    const accounts = accountsResult.results ?? [];

    // Enrich each account with live data
    const enriched = await Promise.all(
        accounts.map(async (account) => {
            let capacity = null;
            let yuzuruneStatus: string | null = null;
            let tokenValid = false;

            try {
                const idToken = await ensureValidToken(c.env.DB, account, c.env.ENCRYPTION_KEY, c.env);
                tokenValid = true;

                const [capResult, yuzResult] = await Promise.all([
                    getCapacity({ idToken, env: c.env }, account.cust_id),
                    getDevolveDeclareState({ idToken, env: c.env }, account.cust_id),
                ]);

                if (capResult.resultCode === '00') capacity = capResult.packetInfo;
                if (yuzResult.resultCode === '00') {
                    yuzuruneStatus = yuzResult.devolveDeclareStat === '1' ? 'declared' : 'pending';
                }
            } catch {
                // Token invalid or API error
            }

            return {
                id: account.id,
                display_name: account.display_name,
                cust_id: account.cust_id,
                yuzurune_enabled: !!account.yuzurune_enabled,
                token_valid: tokenValid,
                capacity,
                yuzurune_status: yuzuruneStatus,
            };
        })
    );

    // Recent logs for this user's accounts
    const accountIds = accounts.map((a) => a.id);
    let recentLogs: unknown[] = [];

    if (accountIds.length > 0) {
        const placeholders = accountIds.map(() => '?').join(',');
        const logResult = await db
            .prepare(
                `SELECT jl.*, a.display_name as account_name
                 FROM job_logs jl
                 LEFT JOIN accounts a ON jl.account_id = a.id
                 WHERE jl.account_id IN (${placeholders}) OR jl.account_id IS NULL
                 ORDER BY jl.executed_at DESC
                 LIMIT 20`
            )
            .bind(...accountIds)
            .all();
        recentLogs = logResult.results ?? [];
    }

    return c.json({
        accounts: enriched,
        recent_logs: recentLogs,
    });
});

/** Manually trigger yuzurune for all accounts */
dashboard.post('/yuzurune/execute', async (c) => {
    try {
        await runYuzurune(c.env);
        return c.json({ success: true, message: 'ゆずるね。宣言を実行しました' });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return c.json({ error: msg }, 500);
    }
});

export default dashboard;
