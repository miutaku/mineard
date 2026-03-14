import {
    Title,
    SimpleGrid,
    Card,
    Text,
    Group,
    Badge,
    Stack,
    Progress,
    RingProgress,
    Table,
    Button,
    Skeleton,
    Alert,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
    IconWifi,
    IconHeart,
    IconArrowsExchange,
    IconPlayerPlay,
    IconAlertCircle,
} from '@tabler/icons-react';
import { useApi } from '../hooks/useApi';
import { api } from '../lib/api-client';
import { useState } from 'react';

interface PacketInfo {
    baseCapacity: number;
    baseRemainingCapacity: number;
    chargeCapacity: number;
    chargeRemainingCapacity: number;
    forwardCapacity: number;
    forwardRemainingCapacity: number;
    giftCapacity: number;
    giftRemainingCapacity: number;
}

interface AccountData {
    id: number;
    display_name: string;
    cust_id: string;
    yuzurune_enabled: boolean;
    token_valid: boolean;
    capacity: PacketInfo | null;
    yuzurune_status: string | null;
}

interface LogEntry {
    id: number;
    job_type: string;
    account_name: string | null;
    status: string;
    message: string | null;
    executed_at: string;
}

interface DashboardResponse {
    accounts: AccountData[];
    recent_logs: LogEntry[];
}

function formatMB(mb: number): string {
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
    return `${mb} MB`;
}

function getUsagePercent(remaining: number, total: number): number {
    if (total === 0) return 0;
    return Math.round(((total - remaining) / total) * 100);
}

function statusColor(status: string): string {
    switch (status) {
        case 'success': return 'green';
        case 'failed': return 'red';
        case 'skipped': return 'yellow';
        default: return 'gray';
    }
}

function statusLabel(status: string): string {
    switch (status) {
        case 'success': return '成功';
        case 'failed': return '失敗';
        case 'skipped': return 'スキップ';
        default: return status;
    }
}

function yuzuruneLabel(status: string | null): { label: string; color: string } {
    switch (status) {
        case 'declared': return { label: '宣言済み', color: 'green' };
        case 'pending': return { label: '未宣言', color: 'orange' };
        default: return { label: '不明', color: 'gray' };
    }
}

export default function Dashboard() {
    const { data, loading, error, refetch } = useApi<DashboardResponse>('/dashboard');
    const [yuzuruneLoading, setYuzuruneLoading] = useState(false);

    async function triggerYuzurune() {
        setYuzuruneLoading(true);
        try {
            await api.post('/dashboard/yuzurune/execute');
            notifications.show({
                title: '実行完了',
                message: 'ゆずるね。宣言を実行しました',
                color: 'green',
            });
            refetch();
        } catch (err) {
            notifications.show({
                title: 'エラー',
                message: err instanceof Error ? err.message : 'エラーが発生しました',
                color: 'red',
            });
        } finally {
            setYuzuruneLoading(false);
        }
    }

    if (error) {
        return (
            <Alert icon={<IconAlertCircle />} title="エラー" color="red">
                {error}
            </Alert>
        );
    }

    return (
        <Stack>
            <Group justify="space-between">
                <Title order={2}>ダッシュボード</Title>
                <Button
                    leftSection={<IconPlayerPlay size={16} />}
                    variant="light"
                    onClick={triggerYuzurune}
                    loading={yuzuruneLoading}
                    size="sm"
                >
                    ゆずるね。手動実行
                </Button>
            </Group>

            {/* Account Cards */}
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
                {loading
                    ? Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} height={220} radius="md" />
                    ))
                    : data?.accounts.map((account) => (
                        <AccountCard key={account.id} account={account} />
                    ))}
            </SimpleGrid>

            {/* Recent Logs */}
            <Card withBorder radius="md" shadow="sm">
                <Title order={4} mb="md">
                    直近の実行ログ
                </Title>
                {loading ? (
                    <Skeleton height={200} />
                ) : data?.recent_logs && data.recent_logs.length > 0 ? (
                    <Table.ScrollContainer minWidth={500}>
                        <Table striped highlightOnHover>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>日時</Table.Th>
                                    <Table.Th>種別</Table.Th>
                                    <Table.Th>アカウント</Table.Th>
                                    <Table.Th>ステータス</Table.Th>
                                    <Table.Th>メッセージ</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {data.recent_logs.map((log) => (
                                    <Table.Tr key={log.id}>
                                        <Table.Td>
                                            <Text size="xs">
                                                {new Date(log.executed_at + 'Z').toLocaleString('ja-JP', {
                                                    timeZone: 'Asia/Tokyo',
                                                })}
                                            </Text>
                                        </Table.Td>
                                        <Table.Td>
                                            <Badge
                                                variant="light"
                                                color={log.job_type === 'yuzurune' ? 'teal' : 'blue'}
                                                size="sm"
                                            >
                                                {log.job_type === 'yuzurune' ? 'ゆずるね' : 'パケット交換'}
                                            </Badge>
                                        </Table.Td>
                                        <Table.Td>
                                            <Text size="sm">{log.account_name ?? '-'}</Text>
                                        </Table.Td>
                                        <Table.Td>
                                            <Badge color={statusColor(log.status)} size="sm" variant="filled">
                                                {statusLabel(log.status)}
                                            </Badge>
                                        </Table.Td>
                                        <Table.Td>
                                            <Text size="xs" lineClamp={1}>
                                                {log.message ?? '-'}
                                            </Text>
                                        </Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </Table.ScrollContainer>
                ) : (
                    <Text c="dimmed" size="sm" ta="center" py="lg">
                        まだ実行ログはありません
                    </Text>
                )}
            </Card>
        </Stack>
    );
}

function AccountCard({ account }: { account: AccountData }) {
    const cap = account.capacity;
    const totalUsed = cap
        ? (cap.baseCapacity - cap.baseRemainingCapacity) +
        (cap.forwardCapacity - cap.forwardRemainingCapacity) +
        (cap.chargeCapacity - cap.chargeRemainingCapacity) +
        (cap.giftCapacity - cap.giftRemainingCapacity)
        : 0;
    const totalCapacity = cap
        ? cap.baseCapacity + cap.forwardCapacity + cap.chargeCapacity + cap.giftCapacity
        : 0;
    const totalRemaining = totalCapacity - totalUsed;
    const yuz = yuzuruneLabel(account.yuzurune_status);

    return (
        <Card withBorder radius="md" shadow="sm" padding="lg">
            <Group justify="space-between" mb="sm">
                <Stack gap={2}>
                    <Text fw={600} size="lg">{account.display_name}</Text>
                </Stack>
                <Badge
                    color={account.token_valid ? 'green' : 'red'}
                    variant="dot"
                    size="sm"
                >
                    {account.token_valid ? '接続中' : '要更新'}
                </Badge>
            </Group>

            {cap ? (
                <Stack gap="sm">
                    {/* Total usage ring */}
                    <Group justify="center" gap="xl">
                        <RingProgress
                            size={90}
                            thickness={8}
                            roundCaps
                            sections={[
                                { value: getUsagePercent(totalRemaining, totalCapacity), color: 'teal' },
                            ]}
                            label={
                                <Text ta="center" size="xs" fw={700}>
                                    {formatMB(totalRemaining)}
                                </Text>
                            }
                        />
                        <Stack gap={4}>
                            <Group gap="xs">
                                <IconWifi size={14} />
                                <Text size="xs">基本: {formatMB(cap.baseRemainingCapacity)}</Text>
                            </Group>
                            <Group gap="xs">
                                <IconArrowsExchange size={14} />
                                <Text size="xs">繰越: {formatMB(cap.forwardRemainingCapacity)}</Text>
                            </Group>
                            <Group gap="xs">
                                <IconHeart size={14} />
                                <Text size="xs">ギフト: {formatMB(cap.giftRemainingCapacity)}</Text>
                            </Group>
                        </Stack>
                    </Group>

                    {/* Base packet progress */}
                    <div>
                        <Group justify="space-between" mb={4}>
                            <Text size="xs" c="dimmed">基本パケット</Text>
                            <Text size="xs" c="dimmed">
                                {formatMB(cap.baseCapacity - cap.baseRemainingCapacity)} / {formatMB(cap.baseCapacity)}
                            </Text>
                        </Group>
                        <Progress
                            value={getUsagePercent(cap.baseRemainingCapacity, cap.baseCapacity)}
                            color="teal"
                            size="sm"
                            radius="xl"
                        />
                    </div>
                </Stack>
            ) : (
                <Text c="dimmed" size="sm" ta="center" py="md">
                    データ取得中...
                </Text>
            )}

            {/* Yuzurune status */}
            <Group justify="space-between" mt="md" pt="sm" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
                <Text size="sm">ゆずるね。</Text>
                <Group gap="xs">
                    {account.yuzurune_enabled && (
                        <Badge color={yuz.color} variant="light" size="sm">
                            {yuz.label}
                        </Badge>
                    )}
                    <Badge
                        color={account.yuzurune_enabled ? 'teal' : 'gray'}
                        variant="outline"
                        size="sm"
                    >
                        {account.yuzurune_enabled ? 'ON' : 'OFF'}
                    </Badge>
                </Group>
            </Group>
        </Card>
    );
}
