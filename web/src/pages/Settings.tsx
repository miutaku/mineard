import { useState, useEffect } from 'react';
import {
    Title,
    Card,
    TextInput,
    Button,
    Stack,
    Text,
    Alert,
    Skeleton,
    Anchor,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle, IconBrandDiscord } from '@tabler/icons-react';
import { api } from '../lib/api-client';

export default function Settings() {
    const [discordMentionId, setDiscordMentionId] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        api.get<{ discord_mention_id: string | null }>('/profile')
            .then((data) => {
                setDiscordMentionId(data.discord_mention_id ?? '');
            })
            .catch((err) => setError(err instanceof Error ? err.message : 'エラーが発生しました'))
            .finally(() => setLoading(false));
    }, []);

    async function handleSave() {
        setSaving(true);
        try {
            await api.put('/profile', {
                discord_mention_id: discordMentionId.trim() || null,
            });
            notifications.show({
                title: '保存完了',
                message: 'Discord ユーザーIDを保存しました',
                color: 'green',
            });
        } catch (err) {
            notifications.show({
                title: 'エラー',
                message: err instanceof Error ? err.message : 'エラーが発生しました',
                color: 'red',
            });
        } finally {
            setSaving(false);
        }
    }

    if (error) {
        return <Alert icon={<IconAlertCircle />} title="エラー" color="red">{error}</Alert>;
    }

    return (
        <Stack>
            <Title order={2}>設定</Title>

            <Card withBorder radius="md" shadow="sm">
                <Stack gap="md">
                    <Title order={4}>
                        <IconBrandDiscord size={20} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                        Discord 通知設定
                    </Title>

                    <Text size="sm" c="dimmed">
                        パケット残量が閾値を下回ったとき、Discord でメンション通知を受け取るには
                        あなたの Discord ユーザーID を設定してください。
                    </Text>

                    <Text size="xs" c="dimmed">
                        ユーザーIDの確認方法: Discord の設定 → 詳細設定 → 開発者モードを ON にして、
                        自分のアイコンを右クリック →「ユーザーIDをコピー」
                    </Text>

                    {loading ? (
                        <Skeleton height={36} />
                    ) : (
                        <TextInput
                            label="Discord ユーザーID"
                            placeholder="例: 123456789012345678"
                            value={discordMentionId}
                            onChange={(e) => setDiscordMentionId(e.currentTarget.value)}
                            description="数字のみ（空欄にするとメンションなしで通知されます）"
                        />
                    )}

                    <Button onClick={handleSave} loading={saving} disabled={loading}>
                        保存
                    </Button>
                </Stack>
            </Card>

            <Card withBorder radius="md" shadow="sm">
                <Stack gap="sm">
                    <Title order={4}>パケット残量アラートについて</Title>
                    <Text size="sm">
                        各アカウントに「パケット残量通知閾値 (MB)」と「アラート有効化」を設定すると、
                        <strong>10分ごと</strong>に残量チェックが実行されます。
                        総残量（基本＋追加＋繰越＋ギフト）が閾値を下回ると、
                        Discord へ通知が送信されます（当日1回まで）。
                        通知を止めたいときはアカウント編集でスイッチを OFF にしてください。
                    </Text>
                    <Text size="sm">
                        閾値は
                        <Anchor href="/accounts" ml={4} mr={4}>
                            mineoアカウント
                        </Anchor>
                        の編集画面で設定できます。
                    </Text>
                </Stack>
            </Card>
        </Stack>
    );
}
