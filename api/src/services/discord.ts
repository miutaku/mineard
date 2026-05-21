import type { Env } from '../types';

interface DiscordEmbed {
    title?: string;
    description?: string;
    color?: number;
    fields?: { name: string; value: string; inline?: boolean }[];
    footer?: { text: string };
    timestamp?: string;
}

interface DiscordWebhookPayload {
    username?: string;
    content?: string;
    embeds?: DiscordEmbed[];
}

export interface ExchangeResult {
    sourceName: string;
    targetName: string;
    status: 'success' | 'failed' | 'skipped';
    amount?: number;
    message?: string;
}

async function sendWebhook(webhookUrl: string, payload: DiscordWebhookPayload): Promise<void> {
    const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        console.error(`[Discord] Webhook failed: ${res.status} ${res.statusText}`);
    }
}

// ゆずるね。成功通知
export async function notifyYuzuruneSuccess(env: Env, accountName: string, message: string, discordMentionId?: string | null): Promise<void> {
    if (!env.DISCORD_WEBHOOK_APP) return;
    await sendWebhook(env.DISCORD_WEBHOOK_APP, {
        username: 'Mineard',
        ...(discordMentionId ? { content: `<@${discordMentionId}>` } : {}),
        embeds: [{
            title: ':white_check_mark: ゆずるね。宣言 完了',
            description: `**${accountName}** のゆずるね。宣言が完了しました`,
            color: 0x44cc44,
            fields: [{ name: '結果', value: message }],
            timestamp: new Date().toISOString(),
        }],
    });
}

// ゆずるね。失敗通知（MAX_RETRIESを超えた場合）
export async function notifyYuzuruneFailed(env: Env, accountName: string, message: string, discordMentionId?: string | null): Promise<void> {
    if (!env.DISCORD_WEBHOOK_APP) return;
    await sendWebhook(env.DISCORD_WEBHOOK_APP, {
        username: 'Mineard',
        ...(discordMentionId ? { content: `<@${discordMentionId}>` } : {}),
        embeds: [{
            title: ':warning: ゆずるね。宣言 失敗',
            description: `**${accountName}** のゆずるね。宣言に失敗しました`,
            color: 0xff4444,
            fields: [{ name: 'エラー内容', value: message }],
            timestamp: new Date().toISOString(),
        }],
    });
}

// パケット残量低下アラート通知
export interface PacketAlertItem {
    accountName: string;
    remainingMb: number;
    thresholdMb: number;
    discordMentionId: string | null;
    mentionEnabled: boolean;
}

export async function notifyPacketLowAlert(env: Env, alerts: PacketAlertItem[]): Promise<void> {
    if (!env.DISCORD_WEBHOOK_APP || alerts.length === 0) return;

    const mentionIds = [...new Set(
        alerts.filter((a) => a.mentionEnabled).map((a) => a.discordMentionId).filter(Boolean)
    )];
    const mentionStr = mentionIds.map((id) => `<@${id}>`).join(' ');

    const fields = alerts.map((a) => ({
        name: `📉 ${a.accountName}`,
        value: `残量: **${a.remainingMb.toLocaleString()} MB** （閾値: ${a.thresholdMb.toLocaleString()} MB）`,
        inline: false,
    }));

    await sendWebhook(env.DISCORD_WEBHOOK_APP, {
        username: 'Mineard',
        ...(mentionStr ? { content: `${mentionStr} パケット残量が閾値を下回りました` } : {}),
        embeds: [{
            title: ':warning: パケット残量アラート',
            description: `以下のアカウントで残量が閾値を下回っています`,
            color: 0xff8800,
            fields,
            timestamp: new Date().toISOString(),
        }],
    });
}

// パケット交換ジョブのサマリー通知
export async function notifyPacketExchangeResult(env: Env, results: ExchangeResult[]): Promise<void> {
    if (!env.DISCORD_WEBHOOK_APP) return;

    const successCount = results.filter(r => r.status === 'success').length;
    const failedCount = results.filter(r => r.status === 'failed').length;
    const skippedCount = results.filter(r => r.status === 'skipped').length;
    const totalAmount = results
        .filter(r => r.status === 'success')
        .reduce((sum, r) => sum + (r.amount ?? 0), 0);

    const color = failedCount > 0 ? 0xff4444 : successCount > 0 ? 0x44cc44 : 0xffcc00;
    const title =
        failedCount > 0
            ? ':x: パケット交換 完了（エラーあり）'
            : successCount > 0
            ? ':white_check_mark: パケット交換 完了'
            : ':next_track_button: パケット交換 スキップ';

    const fields = results.map(r => {
        const icon = r.status === 'success' ? '✅' : r.status === 'failed' ? '❌' : '⏭️';
        const value = r.status === 'success'
            ? `${r.amount?.toLocaleString() ?? 0}MB`
            : r.message ?? '​';
        return { name: `${icon} ${r.sourceName} → ${r.targetName}`, value, inline: false };
    });

    if (totalAmount > 0) {
        fields.push({ name: '合計交換量', value: `**${totalAmount.toLocaleString()}MB**`, inline: false });
    }

    await sendWebhook(env.DISCORD_WEBHOOK_APP, {
        username: 'Mineard',
        embeds: [{
            title,
            color,
            fields,
            footer: { text: `成功: ${successCount}  失敗: ${failedCount}  スキップ: ${skippedCount}` },
            timestamp: new Date().toISOString(),
        }],
    });
}
