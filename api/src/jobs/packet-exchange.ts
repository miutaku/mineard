/**
 * パケットギフト交換ジョブ
 *
 * Cron: 0 0 26 * * (UTC) = 26日 09:00 JST
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runPacketExchange(env: Env): Promise<void> {
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
    log(`繰越パケット残量: ${forwardRemaining}MB`);

    if (forwardRemaining < MIN_GIFT_AMOUNT) {
        log(`繰越パケットが${MIN_GIFT_AMOUNT}MB未満のためスキップ`);
        await insertLog(db, pair.source_account_id, 'skipped', `繰越パケット${forwardRemaining}MBのためスキップ`);
        return { sourceName: pair.source_name, targetName: pair.target_name, status: 'skipped', message: `繰越パケット${forwardRemaining}MB` };
    }

    // Step 2: Check gift-able capacity
    const giftCapacity = await getCapacityForGift({ idToken: sourceToken, env }, pair.source_cust_id);
    if (giftCapacity.resultCode !== '00' || giftCapacity.capacityForGift === null) {
        throw new Error(`get_capacity_for_gift failed: ${giftCapacity.resultCode}`);
    }

    const giftableAmount = Math.min(forwardRemaining, giftCapacity.capacityForGift);
    if (giftableAmount < MIN_GIFT_AMOUNT) {
        log(`ギフト可能容量${giftableAmount}MB未満のためスキップ`);
        await insertLog(db, pair.source_account_id, 'skipped', `ギフト可能容量不足: ${giftableAmount}MB`);
        return { sourceName: pair.source_name, targetName: pair.target_name, status: 'skipped', message: `ギフト可能容量不足: ${giftableAmount}MB` };
    }

    log(`ギフト対象: ${giftableAmount}MB`);

    // Step 3: Source issues gift(s) to Target (split into <=9999MB chunks)
    const giftCodes: { code: string; amount: number }[] = [];
    let remaining = giftableAmount;

    // Refresh source token (might have expired during checks)
    const freshSourceAccount = await db.prepare('SELECT * FROM accounts WHERE id = ?').bind(pair.source_account_id).first<Account>();
    const freshSourceToken = freshSourceAccount ? await ensureValidToken(db, freshSourceAccount, encKey, env) : sourceToken;

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

        giftCodes.push({ code: issueResult.giftCode, amount: chunk });
        log(`ギフト発行: ${chunk}MB (code: ${issueResult.giftCode})`);
        await insertLog(db, pair.source_account_id, 'success',
            `ギフト発行: ${chunk}MB → ${pair.target_name}`, issueResult.giftCode, chunk);

        remaining -= chunk;
        if (remaining >= MIN_GIFT_AMOUNT) await sleep(1000);
    }

    // Step 4: Target receives all gifts
    const targetToken = await ensureValidToken(db, targetAccount, encKey, env);

    for (const gift of giftCodes) {
        const receiveResult = await changeGift(
            { idToken: targetToken, env },
            pair.target_cust_id,
            gift.code
        );

        if (receiveResult.resultCode !== '00') {
            throw new Error(`change_gift failed for ${gift.code}: ${receiveResult.resultCode}`);
        }

        log(`${pair.target_name}が受取完了: ${gift.amount}MB`);
        await insertLog(db, pair.target_account_id, 'success',
            `ギフト受取: ${gift.amount}MB from ${pair.source_name}`, gift.code, gift.amount);
    }

    // Step 5: Target issues same amount back to Source
    const returnCodes: { code: string; amount: number }[] = [];
    let returnRemaining = giftableAmount;

    // Refresh target token
    const freshTargetAccount = await db.prepare('SELECT * FROM accounts WHERE id = ?').bind(pair.target_account_id).first<Account>();
    const freshTargetToken = freshTargetAccount ? await ensureValidToken(db, freshTargetAccount, encKey, env) : targetToken;

    while (returnRemaining >= MIN_GIFT_AMOUNT) {
        const chunk = Math.min(returnRemaining, MAX_GIFT_PER_ISSUE);
        const returnResult = await issueGift(
            { idToken: freshTargetToken, env },
            pair.target_cust_id,
            chunk
        );

        if (returnResult.resultCode !== '00' || !returnResult.giftCode) {
            throw new Error(`Return issue_gift failed: ${returnResult.resultCode}`);
        }

        returnCodes.push({ code: returnResult.giftCode, amount: chunk });
        log(`返送ギフト発行: ${chunk}MB (code: ${returnResult.giftCode})`);
        await insertLog(db, pair.target_account_id, 'success',
            `返送ギフト発行: ${chunk}MB → ${pair.source_name}`, returnResult.giftCode, chunk);

        returnRemaining -= chunk;
        if (returnRemaining >= MIN_GIFT_AMOUNT) await sleep(1000);
    }

    // Step 6: Source receives returned gifts
    const finalSourceAccount = await db.prepare('SELECT * FROM accounts WHERE id = ?').bind(pair.source_account_id).first<Account>();
    const finalSourceToken = finalSourceAccount ? await ensureValidToken(db, finalSourceAccount, encKey, env) : freshSourceToken;

    for (const gift of returnCodes) {
        const receiveReturn = await changeGift(
            { idToken: finalSourceToken, env },
            pair.source_cust_id,
            gift.code
        );

        if (receiveReturn.resultCode !== '00') {
            throw new Error(`Return change_gift failed for ${gift.code}: ${receiveReturn.resultCode}`);
        }

        log(`${pair.source_name}が返送受取完了: ${gift.amount}MB`);
        await insertLog(db, pair.source_account_id, 'success',
            `返送ギフト受取: ${gift.amount}MB from ${pair.target_name}`, gift.code, gift.amount);
    }

    log(`交換完了！合計: ${giftableAmount}MB`);
    return { sourceName: pair.source_name, targetName: pair.target_name, status: 'success', amount: giftableAmount };
}

async function insertLog(
    db: D1Database,
    accountId: number,
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
