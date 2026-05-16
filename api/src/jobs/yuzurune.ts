/**
 * ゆずるね。自動宣言ジョブ
 *
 * Cron: 0 4-14 * * * (UTC) = 13:00~23:00 JST 毎時
 * ロジック:
 *   1. yuzurune_enabled=1 の全アカウント取得
 *   2. 各アカウントの当日成功ログ確認 → あればスキップ
 *   3. トークンリフレッシュ → declare_devolve (最大3回リトライ)
 *   4. 結果をjob_logsに記録
 */

import type { Account, Env, User } from '../types';
import { ensureValidToken } from '../services/token-manager';
import { declareDevolve } from '../services/mineo-api';
import { notifyYuzuruneSuccess, notifyYuzuruneFailed } from '../services/discord';

const MAX_RETRIES = 3;

export async function runYuzurune(env: Env): Promise<void> {
    const db = env.DB;

    // Get all enabled accounts with owner's discord_mention_id
    const accounts = await db
        .prepare(
            `SELECT a.*, u.discord_mention_id
             FROM accounts a
             JOIN users u ON a.user_id = u.id
             WHERE a.yuzurune_enabled = 1`
        )
        .all<Account & { discord_mention_id: string | null; yuzurune_mention_level: string | null }>();

    if (!accounts.results || accounts.results.length === 0) {
        console.log('[Yuzurune] No enabled accounts found');
        return;
    }

    // Today's date in JST (UTC+9)
    const now = new Date();
    const jstOffset = 9 * 60 * 60 * 1000;
    const jstDate = new Date(now.getTime() + jstOffset);
    const todayStr = jstDate.toISOString().split('T')[0]; // yyyy-MM-dd

    for (const account of accounts.results) {
        await processAccount(db, account, todayStr, env.ENCRYPTION_KEY, env);
    }

}


async function processAccount(
    db: D1Database,
    account: Account & { discord_mention_id: string | null; yuzurune_mention_level: string | null },
    todayStr: string,
    encKey: string,
    env: Env
): Promise<void> {
    const displayName = account.display_name;
    const level = account.yuzurune_mention_level ?? 'failure_only';
    const successMentionId = account.yuzurune_notify_enabled && level === 'always'
        ? account.discord_mention_id
        : null;
    const failureMentionId = account.yuzurune_notify_enabled && (level === 'always' || level === 'failure_only')
        ? account.discord_mention_id
        : null;

    // Check if already succeeded today
    const existingLog = await db
        .prepare(
            `SELECT id FROM job_logs
       WHERE job_type = 'yuzurune'
         AND account_id = ?
         AND status = 'success'
         AND date(executed_at) = ?`
        )
        .bind(account.id, todayStr)
        .first();

    if (existingLog) {
        console.log(`[Yuzurune] ${displayName}: Already succeeded today, skipping`);
        return;
    }

    // Try to get a valid token
    let idToken: string;
    try {
        idToken = await ensureValidToken(db, account, encKey, env);
    } catch (err) {
        const message = `Token refresh failed: ${err instanceof Error ? err.message : String(err)}`;
        console.error(`[Yuzurune] ${displayName}: ${message}`);
        await insertLog(db, account.id, 'failed', message);
        await notifyYuzuruneFailed(env, displayName, message, failureMentionId);
        return;
    }

    // Try declare_devolve with retries
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const result = await declareDevolve({ idToken, env }, account.cust_id);

            if (result.resultCode === '00') {
                console.log(`[Yuzurune] ${displayName}: Declaration succeeded (attempt ${attempt})`);
                await insertLog(db, account.id, 'success', `宣言完了 (attempt ${attempt})`);
                await notifyYuzuruneSuccess(env, displayName, `宣言完了 (attempt ${attempt})`, successMentionId);
                return;
            }

            if (result.resultCode === '05') {
                console.log(`[Yuzurune] ${displayName}: Already declared today`);
                await insertLog(db, account.id, 'success', '宣言済み');
                return;
            }

            // Other result codes → log and retry
            const msg = result.messages?.[0] ?? `resultCode: ${result.resultCode}`;
            console.warn(`[Yuzurune] ${displayName}: Attempt ${attempt} failed: ${msg}`);

            if (attempt === MAX_RETRIES) {
                const failMessage = `${MAX_RETRIES}回リトライ後失敗: ${msg}`;
                await insertLog(db, account.id, 'failed', failMessage);
                await notifyYuzuruneFailed(env, displayName, failMessage, failureMentionId);
            }
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            console.error(`[Yuzurune] ${displayName}: Attempt ${attempt} error: ${errMsg}`);

            if (attempt === MAX_RETRIES) {
                const failMessage = `${MAX_RETRIES}回リトライ後エラー: ${errMsg}`;
                await insertLog(db, account.id, 'failed', failMessage);
                await notifyYuzuruneFailed(env, displayName, failMessage, failureMentionId);
            }
        }
    }
}

async function insertLog(
    db: D1Database,
    accountId: number,
    status: string,
    message: string
): Promise<void> {
    await db
        .prepare(
            `INSERT INTO job_logs (job_type, account_id, status, message, executed_at)
       VALUES ('yuzurune', ?, ?, ?, datetime('now'))`
        )
        .bind(accountId, status, message)
        .run();
}
