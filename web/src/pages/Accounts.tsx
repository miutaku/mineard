import { useState } from 'react';
import {
    Title,
    Card,
    Table,
    Button,
    Group,
    Modal,
    TextInput,
    Textarea,
    NumberInput,
    Switch,
    Stack,
    Badge,
    ActionIcon,
    Tooltip,
    Text,
    Alert,
    Skeleton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useNavigate } from 'react-router-dom';
import {
    IconPlus,
    IconPencil,
    IconTrash,
    IconRefresh,
    IconAlertCircle,
} from '@tabler/icons-react';
import { useApi } from '../hooks/useApi';
import { api } from '../lib/api-client';

interface AccountSummary {
    id: number;
    display_name: string;
    cust_id: string;
    yuzurune_enabled: boolean;
    yuzurune_notify_enabled: boolean;
    packet_threshold: number | null;
    packet_alert_enabled: boolean;
    token_valid: boolean;
    token_expires_at: string | null;
    created_at: string;
}

export default function Accounts() {
    const navigate = useNavigate();
    const { data, loading, error, refetch } = useApi<{ accounts: AccountSummary[] }>('/accounts');
    const [opened, { open, close }] = useDisclosure(false);
    const [editAccount, setEditAccount] = useState<AccountSummary | null>(null);

    // Edit form state
    const [displayName, setDisplayName] = useState('');
    const [refreshToken, setRefreshToken] = useState('');
    const [yuzuruneEnabled, setYuzuruneEnabled] = useState(true);
    const [packetThreshold, setPacketThreshold] = useState<number | ''>('');
    const [yuzuruneNotifyEnabled, setYuzuruneNotifyEnabled] = useState(true);
    const [packetAlertEnabled, setPacketAlertEnabled] = useState(false);
    const [saving, setSaving] = useState(false);

    function openEdit(account: AccountSummary) {
        setEditAccount(account);
        setDisplayName(account.display_name);
        setRefreshToken('');
        setYuzuruneEnabled(account.yuzurune_enabled);
        setYuzuruneNotifyEnabled(account.yuzurune_notify_enabled);
        setPacketThreshold(account.packet_threshold ?? '');
        setPacketAlertEnabled(account.packet_alert_enabled);
        open();
    }

    async function handleSave() {
        if (!editAccount) return;
        setSaving(true);
        try {
            const body: Record<string, unknown> = {
                display_name: displayName,
                yuzurune_enabled: yuzuruneEnabled,
                yuzurune_notify_enabled: yuzuruneNotifyEnabled,
                packet_threshold: packetThreshold === '' ? null : packetThreshold,
                packet_alert_enabled: packetAlertEnabled,
            };
            if (refreshToken) body.refresh_token = refreshToken;
            await api.put(`/accounts/${editAccount.id}`, body);
            notifications.show({ title: '更新完了', message: `${displayName} を更新しました`, color: 'green' });
            close();
            refetch();
        } catch (err) {
            notifications.show({ title: 'エラー', message: err instanceof Error ? err.message : 'エラーが発生しました', color: 'red' });
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete(account: AccountSummary) {
        if (!confirm(`${account.display_name} を削除しますか？`)) return;
        try {
            await api.delete(`/accounts/${account.id}`);
            notifications.show({ title: '削除完了', message: `${account.display_name} を削除しました`, color: 'green' });
            refetch();
        } catch (err) {
            notifications.show({ title: 'エラー', message: err instanceof Error ? err.message : 'エラー', color: 'red' });
        }
    }

    async function handleRefreshToken(account: AccountSummary) {
        try {
            await api.post(`/accounts/${account.id}/refresh`);
            notifications.show({ title: '更新完了', message: `${account.display_name} のトークンを更新しました`, color: 'green' });
            refetch();
        } catch (err) {
            notifications.show({ title: 'エラー', message: err instanceof Error ? err.message : 'トークン更新に失敗', color: 'red' });
        }
    }

    if (error) {
        return <Alert icon={<IconAlertCircle />} title="エラー" color="red">{error}</Alert>;
    }

    return (
        <Stack>
            <Group justify="space-between">
                <Title order={2}>アカウント管理</Title>
                <Button leftSection={<IconPlus size={16} />} onClick={() => navigate('/accounts/add')}>
                    アカウント追加
                </Button>
            </Group>

            <Card withBorder radius="md" shadow="sm">
                {loading ? (
                    <Skeleton height={200} />
                ) : data?.accounts && data.accounts.length > 0 ? (
                    <Table.ScrollContainer minWidth={600}>
                        <Table striped highlightOnHover>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>表示名</Table.Th>
                                    <Table.Th>ゆずるね</Table.Th>
                                    <Table.Th>残量アラート閾値</Table.Th>
                                    <Table.Th>トークン</Table.Th>
                                    <Table.Th>操作</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {data.accounts.map((account) => (
                                    <Table.Tr key={account.id}>
                                        <Table.Td>
                                            <Text fw={500}>{account.display_name}</Text>
                                        </Table.Td>
                                        <Table.Td>
                                            <Group gap="xs">
                                                <Badge
                                                    color={account.yuzurune_enabled ? 'teal' : 'gray'}
                                                    variant="light"
                                                    size="sm"
                                                >
                                                    {account.yuzurune_enabled ? 'ON' : 'OFF'}
                                                </Badge>
                                                {account.yuzurune_enabled && (
                                                    <Badge
                                                        color={account.yuzurune_notify_enabled ? 'blue' : 'gray'}
                                                        variant="light"
                                                        size="xs"
                                                    >
                                                        {account.yuzurune_notify_enabled ? '通知ON' : '通知OFF'}
                                                    </Badge>
                                                )}
                                            </Group>
                                        </Table.Td>
                                        <Table.Td>
                                            {account.packet_threshold !== null ? (
                                                <Group gap="xs">
                                                    <Text size="sm">{account.packet_threshold.toLocaleString()} MB</Text>
                                                    <Badge
                                                        color={account.packet_alert_enabled ? 'orange' : 'gray'}
                                                        variant="light"
                                                        size="xs"
                                                    >
                                                        {account.packet_alert_enabled ? '通知ON' : '通知OFF'}
                                                    </Badge>
                                                </Group>
                                            ) : (
                                                <Text size="sm" c="dimmed">未設定</Text>
                                            )}
                                        </Table.Td>
                                        <Table.Td>
                                            <Badge
                                                color={account.token_valid ? 'green' : 'red'}
                                                variant="dot"
                                                size="sm"
                                            >
                                                {account.token_valid ? '有効' : '無効'}
                                            </Badge>
                                        </Table.Td>
                                        <Table.Td>
                                            <Group gap="xs">
                                                <Tooltip label="トークン検証・手動更新">
                                                    <ActionIcon variant="subtle" color="blue" onClick={() => handleRefreshToken(account)}>
                                                        <IconRefresh size={16} />
                                                    </ActionIcon>
                                                </Tooltip>
                                                <Tooltip label="編集">
                                                    <ActionIcon variant="subtle" onClick={() => openEdit(account)}>
                                                        <IconPencil size={16} />
                                                    </ActionIcon>
                                                </Tooltip>
                                                <Tooltip label="削除">
                                                    <ActionIcon variant="subtle" color="red" onClick={() => handleDelete(account)}>
                                                        <IconTrash size={16} />
                                                    </ActionIcon>
                                                </Tooltip>
                                            </Group>
                                        </Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </Table.ScrollContainer>
                ) : (
                    <Text c="dimmed" size="sm" ta="center" py="xl">
                        アカウントがまだ登録されていません。「アカウント追加」から追加してください。
                    </Text>
                )}
            </Card>

            {/* Edit Modal */}
            <Modal
                opened={opened}
                onClose={close}
                title="アカウント編集"
                size="md"
            >
                <Stack>
                    <TextInput
                        label="表示名"
                        placeholder="例: 自分の回線"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.currentTarget.value)}
                        required
                    />
                    <Textarea
                        label="Refresh Token"
                        placeholder="変更する場合のみ入力"
                        value={refreshToken}
                        onChange={(e) => setRefreshToken(e.currentTarget.value)}
                        minRows={3}
                        description="OIDCで取得したrefresh_token"
                    />
                    <Switch
                        label="ゆずるね。自動宣言を有効化"
                        checked={yuzuruneEnabled}
                        onChange={(e) => setYuzuruneEnabled(e.currentTarget.checked)}
                    />
                    <Switch
                        label="ゆずるね。結果を Discord に通知"
                        checked={yuzuruneNotifyEnabled}
                        onChange={(e) => setYuzuruneNotifyEnabled(e.currentTarget.checked)}
                        description="成功・失敗時に Discord へ通知します（設定ページのユーザーIDがあればメンション付き）"
                    />
                    <NumberInput
                        label="パケット残量通知閾値 (MB)"
                        placeholder="例: 5120 (5GB)"
                        value={packetThreshold}
                        onChange={(v) => setPacketThreshold(v === '' ? '' : Number(v))}
                        min={1}
                        step={100}
                        description="総残量（基本＋追加＋繰越＋ギフト）がこの値 (MB) を下回ると Discord へ通知されます"
                        allowDecimal={false}
                    />
                    <Switch
                        label="パケット残量アラートを有効化"
                        checked={packetAlertEnabled}
                        onChange={(e) => setPacketAlertEnabled(e.currentTarget.checked)}
                        disabled={packetThreshold === ''}
                        description={packetThreshold === '' ? '先に閾値を設定してください' : '10分ごとにチェックし、閾値を下回ると当日1回通知します'}
                    />
                    <Group justify="flex-end" mt="md">
                        <Button variant="default" onClick={close}>
                            キャンセル
                        </Button>
                        <Button onClick={handleSave} loading={saving}>
                            更新
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Stack>
    );
}
