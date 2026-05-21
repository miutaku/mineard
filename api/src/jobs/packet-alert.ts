/**
 * パケット残量アラートジョブ
 *
 * Cron: every 10 minutes
 * ロジック:
 *   1. packet_threshold が設定されている全アカウントを取得
 *   2. 各アカウントの総残量を取得（base + charge + forward + gift）
 *   3. 残量 < 閾値 かつ 本日未通知 の場合、Discord に mention 付きで通知
 *   4. 通知済みフラグを app_config に記録（当日スパム防止）
 */

import type { Account, Env, User } from '../types';
import { ensureValidToken } from '../services/token-manager';
import { getCapacity } from '../services/mineo-api';
import { notifyPacketLowAlert, type PacketAlertItem } from '../services/discord';

export async function runPacketAlert(env: Env): Promise<void> {
    const db = env.DB;

    // packet_threshold が設定されていて、かつ通知が有効なアカウントを取得
    const rows = await db
        .prepare(
            `SELECT a.*, u.discord_mention_id
             FROM accounts a
             JOIN users u ON a.user_id = u.id
             WHERE a.packet_threshold IS NOT NULL
               AND a.packet_alert_enabled = 1`
        )
        .all<Account & { discord_mention_id: string | null; packet_alert_mention_enabled: number }>();

    if (!rows.results || rows.results.length === 0) {
        console.log('[PacketAlert] No accounts with packet_threshold set');
        return;
    }

    // 今日の JST 日付文字列（通知済みチェック用）
    const now = new Date();
    const jstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const todayStr = jstDate.toISOString().split('T')[0];

    // 通知済みレコードを一括取得して Map に変換（N+1 回避）
    const configKeys = rows.results.map((a) => `packet_alert_last_notified_${a.id}`);
    const placeholders = configKeys.map(() => '?').join(',');
    const notifiedRows = await db
        .prepare(`SELECT key, value FROM app_config WHERE key IN (${placeholders})`)
        .bind(...configKeys)
        .all<{ key: string; value: string }>();
    const notifiedMap = new Map(notifiedRows.results?.map((r) => [r.key, r.value]) ?? []);

    const alerts: PacketAlertItem[] = [];

    for (const account of rows.results) {
        const threshold = account.packet_threshold!;
        const configKey = `packet_alert_last_notified_${account.id}`;

        // 本日すでに通知済みかチェック
        if (notifiedMap.get(configKey) === todayStr) {
            console.log(`[PacketAlert] ${account.display_name}: already notified today, skipping`);
            continue;
        }

        // トークン取得 → 残量確認
        let remainingMb: number;
        try {
            const idToken = await ensureValidToken(db, account, env.ENCRYPTION_KEY, env);
            const capResult = await getCapacity({ idToken, env }, account.cust_id);

            if (capResult.resultCode !== '00' || !capResult.packetInfo) {
                console.warn(`[PacketAlert] ${account.display_name}: capacity fetch failed (${capResult.resultCode})`);
                continue;
            }

            const p = capResult.packetInfo;
            remainingMb =
                p.baseRemainingCapacity +
                p.chargeRemainingCapacity +
                p.forwardRemainingCapacity +
                p.giftRemainingCapacity;
        } catch (err) {
            console.error(`[PacketAlert] ${account.display_name}: ${err instanceof Error ? err.message : String(err)}`);
            continue;
        }

        console.log(`[PacketAlert] ${account.display_name}: remaining=${remainingMb}MB, threshold=${threshold}MB`);

        if (remainingMb < threshold) {
            alerts.push({
                accountName: account.display_name,
                remainingMb,
                thresholdMb: threshold,
                discordMentionId: account.discord_mention_id,
                mentionEnabled: !!account.packet_alert_mention_enabled,
            });

            // 通知済みとして記録
            await db
                .prepare(
                    `INSERT INTO app_config (key, value) VALUES (?, ?)
                     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
                )
                .bind(configKey, todayStr)
                .run();
        }
    }

    if (alerts.length > 0) {
        console.log(`[PacketAlert] Sending alert for ${alerts.length} account(s)`);
        await notifyPacketLowAlert(env, alerts);
    } else {
        console.log('[PacketAlert] All accounts above threshold, no alert needed');
    }
}
