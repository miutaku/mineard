import { useState } from 'react';
import {
    Title,
    Card,
    Table,
    Button,
    Group,
    Modal,
    Select,
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
import {
    IconPlus,
    IconTrash,
    IconPlayerPlay,
    IconToggleLeft,
    IconToggleRight,
    IconAlertCircle,
    IconArrowRight,
} from '@tabler/icons-react';
import { useApi } from '../hooks/useApi';
import { api } from '../lib/api-client';

interface PairData {
    id: number;
    source_account_id: number;
    target_account_id: number;
    source_name: string;
    source_cust_id: string;
    target_name: string;
    target_cust_id: string;
    enabled: number;
    created_at: string;
}

interface AccountOption {
    id: number;
    display_name: string;
    cust_id: string;
}

interface AllAccountOption {
    id: number;
    display_name: string;
    cust_id: string;
    owner_email: string;
}

export default function GiftPairs() {
    const { data, loading, error, refetch } = useApi<{ pairs: PairData[] }>('/gift-pairs');
    const { data: accountsData } = useApi<{ accounts: AccountOption[] }>('/accounts');
    const { data: allAccountsData } = useApi<{ accounts: AllAccountOption[] }>('/accounts/all');
    const [opened, { open, close }] = useDisclosure(false);
    const [sourceId, setSourceId] = useState<string | null>(null);
    const [targetId, setTargetId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [executing, setExecuting] = useState(false);

    const sourceOptions = (accountsData?.accounts ?? []).map((a) => ({
        value: a.id.toString(),
        label: `${a.display_name}`,
    }));

    const targetOptions = (allAccountsData?.accounts ?? [])
        .filter((a) => a.id.toString() !== sourceId)
        .map((a) => ({
            value: a.id.toString(),
            label: `${a.display_name} - ${a.owner_email}`,
        }));

    async function handleCreate() {
        if (!sourceId || !targetId) return;
        setSaving(true);
        try {
            await api.post('/gift-pairs', {
                source_account_id: parseInt(sourceId),
                target_account_id: parseInt(targetId),
            });
            notifications.show({ title: '作成完了', message: 'ギフトペアを追加しました', color: 'green' });
            close();
            setSourceId(null);
            setTargetId(null);
            refetch();
        } catch (err) {
            notifications.show({ title: 'エラー', message: err instanceof Error ? err.message : 'エラー', color: 'red' });
        } finally {
            setSaving(false);
        }
    }

    async function handleToggle(pair: PairData) {
        try {
            await api.put(`/gift-pairs/${pair.id}/toggle`);
            refetch();
        } catch (err) {
            notifications.show({ title: 'エラー', message: err instanceof Error ? err.message : 'エラー', color: 'red' });
        }
    }

    async function handleDelete(pair: PairData) {
        if (!confirm(`${pair.source_name} → ${pair.target_name} のペアを削除しますか？`)) return;
        try {
            await api.delete(`/gift-pairs/${pair.id}`);
            notifications.show({ title: '削除完了', message: 'ギフトペアを削除しました', color: 'green' });
            refetch();
        } catch (err) {
            notifications.show({ title: 'エラー', message: err instanceof Error ? err.message : 'エラー', color: 'red' });
        }
    }

    async function handleExecute() {
        if (!confirm('全ての有効なペアでパケット交換を実行しますか？\nこの処理には数分かかる場合があります。')) return;
        setExecuting(true);
        try {
            await api.post('/gift-pairs/execute');
            notifications.show({ title: '実行完了', message: 'パケット交換を実行しました', color: 'green' });
            refetch();
        } catch (err) {
            notifications.show({ title: 'エラー', message: err instanceof Error ? err.message : 'エラー', color: 'red' });
        } finally {
            setExecuting(false);
        }
    }

    if (error) {
        return <Alert icon={<IconAlertCircle />} title="エラー" color="red">{error}</Alert>;
    }

    return (
        <Stack>
            <Group justify="space-between">
                <Title order={2}>ギフトペア設定</Title>
                <Group>
                    <Button
                        leftSection={<IconPlayerPlay size={16} />}
                        variant="light"
                        color="blue"
                        onClick={handleExecute}
                        loading={executing}
                    >
                        手動実行
                    </Button>
                    <Button leftSection={<IconPlus size={16} />} onClick={open}>
                        ペア追加
                    </Button>
                </Group>
            </Group>

            <Text size="sm" c="dimmed">
                毎月1日に、送信元の繰越パケットを送信先に送り、同額を返送してもらうことで有効期限をリセットします。
            </Text>

            <Card withBorder radius="md" shadow="sm">
                {loading ? (
                    <Skeleton height={200} />
                ) : data?.pairs && data.pairs.length > 0 ? (
                    <Table.ScrollContainer minWidth={500}>
                        <Table striped highlightOnHover>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>送信元</Table.Th>
                                    <Table.Th />
                                    <Table.Th>送信先</Table.Th>
                                    <Table.Th>ステータス</Table.Th>
                                    <Table.Th>操作</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {data.pairs.map((pair) => (
                                    <Table.Tr key={pair.id}>
                                        <Table.Td>
                                            <Stack gap={0}>
                                                <Text fw={500} size="sm">{pair.source_name}</Text>
                                            </Stack>
                                        </Table.Td>
                                        <Table.Td>
                                            <IconArrowRight size={16} color="var(--mantine-color-dimmed)" />
                                        </Table.Td>
                                        <Table.Td>
                                            <Stack gap={0}>
                                                <Text fw={500} size="sm">{pair.target_name}</Text>
                                            </Stack>
                                        </Table.Td>
                                        <Table.Td>
                                            <Badge
                                                color={pair.enabled ? 'green' : 'gray'}
                                                variant="light"
                                                size="sm"
                                            >
                                                {pair.enabled ? '有効' : '無効'}
                                            </Badge>
                                        </Table.Td>
                                        <Table.Td>
                                            <Group gap="xs">
                                                <Tooltip label={pair.enabled ? '無効にする' : '有効にする'}>
                                                    <ActionIcon variant="subtle" color={pair.enabled ? 'yellow' : 'green'} onClick={() => handleToggle(pair)}>
                                                        {pair.enabled ? <IconToggleRight size={16} /> : <IconToggleLeft size={16} />}
                                                    </ActionIcon>
                                                </Tooltip>
                                                <Tooltip label="削除">
                                                    <ActionIcon variant="subtle" color="red" onClick={() => handleDelete(pair)}>
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
                        ギフトペアがまだ設定されていません。「ペア追加」から追加してください。
                    </Text>
                )}
            </Card>

            {/* Create Modal */}
            <Modal opened={opened} onClose={close} title="ギフトペア追加" size="md">
                <Stack>
                    <Select
                        label="送信元アカウント"
                        placeholder="選択してください"
                        data={sourceOptions}
                        value={sourceId}
                        onChange={setSourceId}
                        searchable
                    />
                    <Select
                        label="送信先アカウント"
                        placeholder="選択してください"
                        data={targetOptions}
                        value={targetId}
                        onChange={setTargetId}
                        searchable
                    />
                    <Alert variant="light" color="blue" title="交換フロー">
                        <Text size="xs">
                            送信元 → 送信先にギフト発行 → 送信先が受取 → 送信先から同額を返送 → 送信元が受取
                        </Text>
                    </Alert>
                    <Group justify="flex-end" mt="md">
                        <Button variant="default" onClick={close}>
                            キャンセル
                        </Button>
                        <Button onClick={handleCreate} loading={saving} disabled={!sourceId || !targetId}>
                            追加
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Stack>
    );
}
