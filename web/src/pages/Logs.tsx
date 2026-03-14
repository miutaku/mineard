import { useState } from 'react';
import {
    Title,
    Card,
    Table,
    Group,
    Badge,
    Select,
    Stack,
    Text,
    Alert,
    Skeleton,
    Pagination,
    Button,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle, IconTrash } from '@tabler/icons-react';
import { useApi } from '../hooks/useApi';
import { api } from '../lib/api-client';

interface LogEntry {
    id: number;
    job_type: string;
    account_id: number | null;
    account_name: string | null;
    status: string;
    message: string | null;
    gift_code: string | null;
    packet_amount: number | null;
    executed_at: string;
}

interface LogsResponse {
    logs: LogEntry[];
    total: number;
    limit: number;
    offset: number;
}

const PAGE_SIZE = 25;

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

export default function Logs() {
    const [jobType, setJobType] = useState<string | null>(null);
    const [status, setStatus] = useState<string | null>(null);
    const [page, setPage] = useState(1);

    const queryParams = new URLSearchParams();
    if (jobType) queryParams.set('job_type', jobType);
    if (status) queryParams.set('status', status);
    queryParams.set('limit', PAGE_SIZE.toString());
    queryParams.set('offset', ((page - 1) * PAGE_SIZE).toString());

    const { data, loading, error, refetch } = useApi<LogsResponse>(
        `/logs?${queryParams.toString()}`,
        [jobType, status, page]
    );

    async function handleCleanup() {
        if (!confirm('90日以上前のログを削除しますか？')) return;
        try {
            const result = await api.delete<{ deleted: number }>('/logs/cleanup?days=90');
            notifications.show({
                title: 'クリーンアップ完了',
                message: `${result.deleted}件のログを削除しました`,
                color: 'green',
            });
            refetch();
        } catch (err) {
            notifications.show({
                title: 'エラー',
                message: err instanceof Error ? err.message : 'エラー',
                color: 'red',
            });
        }
    }

    if (error) {
        return <Alert icon={<IconAlertCircle />} title="エラー" color="red">{error}</Alert>;
    }

    const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

    return (
        <Stack>
            <Group justify="space-between">
                <Title order={2}>実行ログ</Title>
                <Button
                    leftSection={<IconTrash size={16} />}
                    variant="subtle"
                    color="red"
                    size="sm"
                    onClick={handleCleanup}
                >
                    古いログを削除
                </Button>
            </Group>

            {/* Filters */}
            <Card withBorder radius="md" shadow="sm" p="sm">
                <Group>
                    <Select
                        placeholder="ジョブ種別"
                        data={[
                            { value: 'yuzurune', label: 'ゆずるね。' },
                            { value: 'packet_exchange', label: 'パケット交換' },
                        ]}
                        value={jobType}
                        onChange={(v) => { setJobType(v); setPage(1); }}
                        clearable
                        size="sm"
                        w={180}
                    />
                    <Select
                        placeholder="ステータス"
                        data={[
                            { value: 'success', label: '成功' },
                            { value: 'failed', label: '失敗' },
                            { value: 'skipped', label: 'スキップ' },
                        ]}
                        value={status}
                        onChange={(v) => { setStatus(v); setPage(1); }}
                        clearable
                        size="sm"
                        w={150}
                    />
                    {data && (
                        <Text size="sm" c="dimmed" ml="auto">
                            全 {data.total} 件
                        </Text>
                    )}
                </Group>
            </Card>

            {/* Log Table */}
            <Card withBorder radius="md" shadow="sm">
                {loading ? (
                    <Skeleton height={300} />
                ) : data?.logs && data.logs.length > 0 ? (
                    <>
                        <Table.ScrollContainer minWidth={700}>
                            <Table striped highlightOnHover>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>日時</Table.Th>
                                        <Table.Th>種別</Table.Th>
                                        <Table.Th>アカウント</Table.Th>
                                        <Table.Th>ステータス</Table.Th>
                                        <Table.Th>メッセージ</Table.Th>
                                        <Table.Th>パケット</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {data.logs.map((log) => (
                                        <Table.Tr key={log.id}>
                                            <Table.Td>
                                                <Text size="xs" style={{ whiteSpace: 'nowrap' }}>
                                                    {new Date(log.executed_at + 'Z').toLocaleString('ja-JP', {
                                                        timeZone: 'Asia/Tokyo',
                                                        month: '2-digit',
                                                        day: '2-digit',
                                                        hour: '2-digit',
                                                        minute: '2-digit',
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
                                                <Text size="xs" lineClamp={2} maw={300}>
                                                    {log.message ?? '-'}
                                                </Text>
                                            </Table.Td>
                                            <Table.Td>
                                                {log.packet_amount ? (
                                                    <Text size="sm" fw={500}>
                                                        {log.packet_amount.toLocaleString()} MB
                                                    </Text>
                                                ) : (
                                                    <Text size="sm" c="dimmed">-</Text>
                                                )}
                                            </Table.Td>
                                        </Table.Tr>
                                    ))}
                                </Table.Tbody>
                            </Table>
                        </Table.ScrollContainer>
                        {totalPages > 1 && (
                            <Group justify="center" mt="md">
                                <Pagination total={totalPages} value={page} onChange={setPage} size="sm" />
                            </Group>
                        )}
                    </>
                ) : (
                    <Text c="dimmed" size="sm" ta="center" py="xl">
                        ログがありません
                    </Text>
                )}
            </Card>
        </Stack>
    );
}
