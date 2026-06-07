/**
 * パケットギフト交換ジョブ
 *
 * Cron: 0 0 1 * * (UTC) = 1日 09:00 JST
 * ロジック:
 *   有効な各GiftPairについて:
 *   1. Source: get_capacity → forwardRemainingCapacity 確認
 *   2. Source: get_capacity_for_gift → ギフト可能容量確認
 *   3. Source: issue_gift (最大9999MBずつ分割発行)
 *   4. Target: change_gift で受取
 *   5. Target: issue_gift で同額を返送
 *   6. Source: change_gift で受取
 *   7. 全ステップをjob_logsに記録
 */

import type { Account, GiftPair, Env } from '../types';
import { ensureValidToken } from '../services/token-manager';
import {
    getCapacity,
    getCapacityForGift,
    issueGift,
    changeGift,
} from '../services/mineo-api';
import { notifyPacketExchangeResult, type ExchangeResult } from '../services/discord';

const MAX_GIFT_PER_ISSUE = 9999; // mineo gift limit per issue
const MIN_GIFT_AMOUNT = 10; // mineo minimum
const JOB_LOCK_KEY = 'packet_exchange_lock';
const JOB_LOCK_TTL_MS = 15 * 60 * 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runPacketExchange(env: Env): Promise<void> {
    const db = env.DB;
    const lockValue = await acquireJobLock(db);

    if (!lockValue) {
        console.warn('[PacketExchange] Another packet exchange job is already running; skipped');
        await insertLog(db, null, 'skipped', '別のパケット交換が実行中のためスキップ');
        return;
    }

    try {
        await runPacketExchangeLocked(env);
    } finally {
        await releaseJobLock(db, lockValue);
    }
}

export async function runPacketOneWayTransfer(
    env: Env,
    sourceAccountId: number,
    targetAccountId: number,
    amount: number
): Promise<void> {
    const db = env.DB;
    const lockValue = await acquireJobLock(db);

    if (!lockValue) {
        console.warn('[PacketTransfer] Another packet job is already running; skipped');
        await insertLog(db, sourceAccountId, 'skipped', '別のパケット処理が実行中のためパケット送信をスキップ');
        return;
    }

    try {
        await processOneWayTransfer(db, sourceAccountId, targetAccountId, amount, env.ENCRYPTION_KEY, env);
    } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[PacketTransfer] ${sourceAccountId} → ${targetAccountId}: ${errMsg}`);
        await insertLog(db, sourceAccountId, 'failed', `パケット送信エラー: ${errMsg}`);
        throw err;
    } finally {
        await releaseJobLock(db, lockValue);
    }
}

async function runPacketExchangeLocked(env: Env): Promise<void> {
    const db = env.DB;
    // Get all enabled gift pairs with joined account info
    const pairs = await db
        .prepare(
            `SELECT gp.*,
              sa.cust_id as source_cust_id, sa.display_name as source_name,
              ta.cust_id as target_cust_id, ta.display_name as target_name
       FROM gift_pairs gp
       JOIN accounts sa ON gp.source_account_id = sa.id
       JOIN accounts ta ON gp.target_account_id = ta.id
       WHERE gp.enabled = 1`
        )
        .all<GiftPair & {
            source_cust_id: string;
            source_name: string;
            target_cust_id: string;
            target_name: string;
        }>();

    if (!pairs.results || pairs.results.length === 0) {
        console.log('[PacketExchange] No enabled gift pairs found');
        return;
    }

    const results: ExchangeResult[] = [];

    for (let i = 0; i < pairs.results.length; i++) {
        const pair = pairs.results[i];
        try {
            const result = await processPair(db, pair, env.ENCRYPTION_KEY, env);
            results.push(result);
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            console.error(`[PacketExchange] Pair ${pair.source_name} → ${pair.target_name}: ${errMsg}`);
            await insertLog(db, pair.source_account_id, 'failed', `交換処理エラー: ${errMsg}`);
            results.push({
                sourceName: pair.source_name,
                targetName: pair.target_name,
                status: 'failed',
                message: errMsg,
            });
        }
        if (i < pairs.results.length - 1) await sleep(2000);
    }

    await notifyPacketExchangeResult(env, results);
}

async function acquireJobLock(db: D1Database): Promise<string | null> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + JOB_LOCK_TTL_MS).toISOString();
    const result = await db
        .prepare(
            `INSERT INTO app_config (key, value) VALUES (?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value
             WHERE app_config.value < ?`
        )
        .bind(JOB_LOCK_KEY, expiresAt, now.toISOString())
        .run();

    return result.meta.changes > 0 ? expiresAt : null;
}

async function releaseJobLock(db: D1Database, lockValue: string): Promise<void> {
    await db
        .prepare('DELETE FROM app_config WHERE key = ? AND value = ?')
        .bind(JOB_LOCK_KEY, lockValue)
        .run();
}

async function processPair(
    db: D1Database,
    pair: GiftPair & {
        source_cust_id: string;
        source_name: string;
        target_cust_id: string;
        target_name: string;
    },
    encKey: string,
    env: Env
): Promise<ExchangeResult> {
    const log = (msg: string) =>
        console.log(`[PacketExchange] ${pair.source_name} → ${pair.target_name}: ${msg}`);

    // Get source & target accounts
    const sourceAccount = await db
        .prepare('SELECT * FROM accounts WHERE id = ?')
        .bind(pair.source_account_id)
        .first<Account>();
    const targetAccount = await db
        .prepare('SELECT * FROM accounts WHERE id = ?')
        .bind(pair.target_account_id)
        .first<Account>();

    if (!sourceAccount || !targetAccount) {
        throw new Error('Source or target account not found');
    }

    // Step 1: Refresh source token & check capacity
    const sourceToken = await ensureValidToken(db, sourceAccount, encKey, env);
    const capacity = await getCapacity({ idToken: sourceToken, env }, pair.source_cust_id);

    if (capacity.resultCode !== '00' || !capacity.packetInfo) {
        throw new Error(`get_capacity failed: ${capacity.resultCode}`);
    }

    const forwardRemaining = capacity.packetInfo.forwardRemainingCapacity;
    const giftRemaining = capacity.packetInfo.giftRemainingCapacity;
    const resettableRemaining = forwardRemaining + giftRemaining;
    log(`期限リセット対象: 繰越${forwardRemaining}MB + ギフト${giftRemaining}MB = ${resettableRemaining}MB`);

    if (resettableRemaining < MIN_GIFT_AMOUNT) {
        log(`期限リセット対象パケットが${MIN_GIFT_AMOUNT}MB未満のためスキップ`);
        await insertLog(db, pair.source_account_id, 'skipped', `期限リセット対象パケット${resettableRemaining}MBのためスキップ`);
        return { sourceName: pair.source_name, targetName: pair.target_name, status: 'skipped', message: `対象パケット${resettableRemaining}MB` };
    }

    // Step 2: Check gift-able capacity
    const giftCapacity = await getCapacityForGift({ idToken: sourceToken, env }, pair.source_cust_id);
    if (giftCapacity.resultCode !== '00' || giftCapacity.capacityForGift === null) {
        throw new Error(`get_capacity_for_gift failed: ${giftCapacity.resultCode}`);
    }

    const giftableAmount = Math.min(resettableRemaining, giftCapacity.capacityForGift);
    if (giftableAmount < MIN_GIFT_AMOUNT) {
        log(`ギフト可能容量${giftableAmount}MB未満のためスキップ`);
        await insertLog(db, pair.source_account_id, 'skipped', `ギフト可能容量不足: ${giftableAmount}MB`);
        return { sourceName: pair.source_name, targetName: pair.target_name, status: 'skipped', message: `ギフト可能容量不足: ${giftableAmount}MB` };
    }

    log(`ギフト対象: ${giftableAmount}MB`);

    // Step 3-6: Process one chunk as a full round trip before issuing the next one.
    // This limits the amount stranded on the target if the Worker is interrupted.
    let remaining = giftableAmount;
    let processedAmount = 0;

    // Refresh source token (might have expired during checks)
    const freshSourceAccount = await db.prepare('SELECT * FROM accounts WHERE id = ?').bind(pair.source_account_id).first<Account>();
    const freshSourceToken = freshSourceAccount ? await ensureValidToken(db, freshSourceAccount, encKey, env) : sourceToken;
    const targetToken = await ensureValidToken(db, targetAccount, encKey, env);
    const finalSourceAccount = await db.prepare('SELECT * FROM accounts WHERE id = ?').bind(pair.source_account_id).first<Account>();
    const finalSourceToken = finalSourceAccount ? await ensureValidToken(db, finalSourceAccount, encKey, env) : freshSourceToken;

    while (remaining >= MIN_GIFT_AMOUNT) {
        const chunk = Math.min(remaining, MAX_GIFT_PER_ISSUE);
        const issueResult = await issueGift(
            { idToken: freshSourceToken, env },
            pair.source_cust_id,
            chunk
        );

        if (issueResult.resultCode !== '00' || !issueResult.giftCode) {
            throw new Error(`issue_gift failed: ${issueResult.resultCode} (${issueResult.messages?.[0] ?? 'unknown'})`);
        }

        log(`ギフト発行: ${chunk}MB (code: ${issueResult.giftCode})`);
        await insertLog(db, pair.source_account_id, 'success',
            `ギフト発行: ${chunk}MB → ${pair.target_name}`, issueResult.giftCode, chunk);

        const receiveResult = await changeGift(
            { idToken: targetToken, env },
            pair.target_cust_id,
            issueResult.giftCode
        );

        if (receiveResult.resultCode !== '00') {
            throw new Error(`change_gift failed for ${issueResult.giftCode}: ${receiveResult.resultCode}`);
        }

        log(`${pair.target_name}が受取完了: ${chunk}MB`);
        await insertLog(db, pair.target_account_id, 'success',
            `ギフト受取: ${chunk}MB from ${pair.source_name}`, issueResult.giftCode, chunk);

        const returnResult = await issueGift(
            { idToken: targetToken, env },
            pair.target_cust_id,
            chunk
        );

        if (returnResult.resultCode !== '00' || !returnResult.giftCode) {
            throw new Error(`Return issue_gift failed: ${returnResult.resultCode} (${returnResult.messages?.[0] ?? 'unknown'})`);
        }

        log(`返送ギフト発行: ${chunk}MB (code: ${returnResult.giftCode})`);
        await insertLog(db, pair.target_account_id, 'success',
            `返送ギフト発行: ${chunk}MB → ${pair.source_name}`, returnResult.giftCode, chunk);

        const receiveReturn = await changeGift(
            { idToken: finalSourceToken, env },
            pair.source_cust_id,
            returnResult.giftCode
        );

        if (receiveReturn.resultCode !== '00') {
            throw new Error(`Return change_gift failed for ${returnResult.giftCode}: ${receiveReturn.resultCode}`);
        }

        log(`${pair.source_name}が返送受取完了: ${chunk}MB`);
        await insertLog(db, pair.source_account_id, 'success',
            `返送ギフト受取: ${chunk}MB from ${pair.target_name}`, returnResult.giftCode, chunk);

        processedAmount += chunk;
        remaining -= chunk;
        if (remaining >= MIN_GIFT_AMOUNT) await sleep(1000);
    }

    if (remaining > 0) {
        log(`${MIN_GIFT_AMOUNT}MB未満の端数${remaining}MBはギフト不可のため残しました`);
    }

    log(`交換完了！合計: ${processedAmount}MB`);
    return { sourceName: pair.source_name, targetName: pair.target_name, status: 'success', amount: processedAmount };
}

async function processOneWayTransfer(
    db: D1Database,
    sourceAccountId: number,
    targetAccountId: number,
    amount: number,
    encKey: string,
    env: Env
): Promise<void> {
    if (!Number.isInteger(amount) || amount < MIN_GIFT_AMOUNT) {
        throw new Error(`送信量は${MIN_GIFT_AMOUNT}MB以上の整数で指定してください`);
    }

    const sourceAccount = await db
        .prepare('SELECT * FROM accounts WHERE id = ?')
        .bind(sourceAccountId)
        .first<Account>();
    const targetAccount = await db
        .prepare('SELECT * FROM accounts WHERE id = ?')
        .bind(targetAccountId)
        .first<Account>();

    if (!sourceAccount || !targetAccount) {
        throw new Error('Source or target account not found');
    }

    const log = (msg: string) =>
        console.log(`[PacketTransfer] ${sourceAccount.display_name} → ${targetAccount.display_name}: ${msg}`);

    const sourceToken = await ensureValidToken(db, sourceAccount, encKey, env);
    const giftCapacity = await getCapacityForGift({ idToken: sourceToken, env }, sourceAccount.cust_id);
    if (giftCapacity.resultCode !== '00' || giftCapacity.capacityForGift === null) {
        throw new Error(`get_capacity_for_gift failed: ${giftCapacity.resultCode}`);
    }

    if (amount > giftCapacity.capacityForGift) {
        throw new Error(`ギフト可能容量不足: requested=${amount}MB, available=${giftCapacity.capacityForGift}MB`);
    }

    const targetToken = await ensureValidToken(db, targetAccount, encKey, env);
    let remaining = amount;
    let processedAmount = 0;

    while (remaining >= MIN_GIFT_AMOUNT) {
        const chunk = Math.min(remaining, MAX_GIFT_PER_ISSUE);
        const issueResult = await issueGift(
            { idToken: sourceToken, env },
            sourceAccount.cust_id,
            chunk
        );

        if (issueResult.resultCode !== '00' || !issueResult.giftCode) {
            throw new Error(`one-way issue_gift failed: ${issueResult.resultCode} (${issueResult.messages?.[0] ?? 'unknown'})`);
        }

        log(`パケット送信ギフト発行: ${chunk}MB (code: ${issueResult.giftCode})`);
        await insertLog(db, sourceAccount.id, 'success',
            `パケット送信ギフト発行: ${chunk}MB → ${targetAccount.display_name}`, issueResult.giftCode, chunk);

        const receiveResult = await changeGift(
            { idToken: targetToken, env },
            targetAccount.cust_id,
            issueResult.giftCode
        );

        if (receiveResult.resultCode !== '00') {
            throw new Error(`one-way change_gift failed for ${issueResult.giftCode}: ${receiveResult.resultCode}`);
        }

        log(`${targetAccount.display_name}がパケット送信を受取完了: ${chunk}MB`);
        await insertLog(db, targetAccount.id, 'success',
            `パケット送信ギフト受取: ${chunk}MB from ${sourceAccount.display_name}`, issueResult.giftCode, chunk);

        processedAmount += chunk;
        remaining -= chunk;
        if (remaining >= MIN_GIFT_AMOUNT) await sleep(1000);
    }

    if (remaining > 0) {
        log(`${MIN_GIFT_AMOUNT}MB未満の端数${remaining}MBはギフト不可のため残しました`);
    }

    log(`パケット送信完了！合計: ${processedAmount}MB`);
}

async function insertLog(
    db: D1Database,
    accountId: number | null,
    status: string,
    message: string,
    giftCode?: string,
    packetAmount?: number
): Promise<void> {
    await db
        .prepare(
            `INSERT INTO job_logs (job_type, account_id, status, message, gift_code, packet_amount, executed_at)
       VALUES ('packet_exchange', ?, ?, ?, ?, ?, datetime('now'))`
        )
        .bind(accountId, status, message, giftCode ?? null, packetAmount ?? null)
        .run();
}
