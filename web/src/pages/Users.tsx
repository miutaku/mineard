import { useState, useEffect } from 'react';
import {
    Container,
    Title,
    Paper,
    Table,
    TextInput,
    Button,
    Group,
    Badge,
    ActionIcon,
    Text,
    Modal,
    Stack,
    LoadingOverlay,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconPlus, IconTrash, IconMail, IconRefresh } from '@tabler/icons-react';
import { api } from '../lib/api-client';

interface UserRow {
    id: number;
    email: string;
    totp_setup_complete: number;
    created_at: string;
}

const TOTP_RESET_ADMIN_EMAIL = 'admin@mineard.miutaku.work';

interface UsersProps {
    userEmail: string;
}

export default function Users({ userEmail }: UsersProps) {
    const [users, setUsers] = useState<UserRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [addOpened, { open: openAdd, close: closeAdd }] = useDisclosure(false);
    const [newEmail, setNewEmail] = useState('');
    const [addLoading, setAddLoading] = useState(false);
    const [addError, setAddError] = useState('');

    useEffect(() => {
        loadUsers();
    }, []);

    async function loadUsers() {
        setLoading(true);
        try {
            const data = await api.get<{ users: UserRow[] }>('/auth/users');
            setUsers(data.users);
        } catch {
            // ignore
        } finally {
            setLoading(false);
        }
    }

    async function handleAddUser(e: React.FormEvent) {
        e.preventDefault();
        setAddLoading(true);
        setAddError('');

        try {
            await api.post('/auth/users', { email: newEmail.trim() });
            setNewEmail('');
            closeAdd();
            await loadUsers();
        } catch (err) {
            setAddError(err instanceof Error ? err.message : '追加に失敗しました');
        } finally {
            setAddLoading(false);
        }
    }

    async function handleResetTotp(userId: number, email: string) {
        if (!confirm(`${email} のTOTPをリセットしてもよろしいですか？\n次回ログイン時に再設定が必要になります。`)) {
            return;
        }
        try {
            await api.post(`/auth/users/${userId}/reset-totp`, {});
            await loadUsers();
        } catch (err) {
            alert(err instanceof Error ? err.message : 'リセットに失敗しました');
        }
    }

    async function handleDelete(userId: number, email: string) {
        if (!confirm(`${email} を削除してもよろしいですか？\nこのユーザーのmineoアカウントもすべて削除されます。`)) {
            return;
        }
        try {
            await api.delete(`/auth/users/${userId}`);
            await loadUsers();
        } catch (err) {
            alert(err instanceof Error ? err.message : '削除に失敗しました');
        }
    }

    return (
        <Container size="md">
            <Group justify="space-between" mb="lg">
                <Title order={2}>ユーザー管理</Title>
                <Button leftSection={<IconPlus size={18} />} onClick={openAdd}>
                    ユーザーを追加
                </Button>
            </Group>

            <Paper withBorder pos="relative">
                <LoadingOverlay visible={loading} />
                <Table striped highlightOnHover>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>メールアドレス</Table.Th>
                            <Table.Th>TOTP</Table.Th>
                            <Table.Th>登録日</Table.Th>
                            <Table.Th w={90}></Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {users.length === 0 && !loading && (
                            <Table.Tr>
                                <Table.Td colSpan={4}>
                                    <Text c="dimmed" ta="center" py="md">ユーザーがいません</Text>
                                </Table.Td>
                            </Table.Tr>
                        )}
                        {users.map((user) => (
                            <Table.Tr key={user.id}>
                                <Table.Td>{user.email}</Table.Td>
                                <Table.Td>
                                    {user.totp_setup_complete ? (
                                        <Badge color="teal" variant="light">設定済み</Badge>
                                    ) : (
                                        <Badge color="yellow" variant="light">未設定</Badge>
                                    )}
                                </Table.Td>
                                <Table.Td>
                                    {new Date(user.created_at).toLocaleDateString('ja-JP')}
                                </Table.Td>
                                <Table.Td>
                                    <Group gap={4} justify="flex-end">
                                        {userEmail === TOTP_RESET_ADMIN_EMAIL && user.totp_setup_complete === 1 && (
                                            <ActionIcon
                                                variant="subtle"
                                                color="orange"
                                                onClick={() => handleResetTotp(user.id, user.email)}
                                                title="TOTPリセット"
                                            >
                                                <IconRefresh size={16} />
                                            </ActionIcon>
                                        )}
                                        <ActionIcon
                                            variant="subtle"
                                            color="red"
                                            onClick={() => handleDelete(user.id, user.email)}
                                            title="削除"
                                        >
                                            <IconTrash size={16} />
                                        </ActionIcon>
                                    </Group>
                                </Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            </Paper>

            <Modal opened={addOpened} onClose={closeAdd} title="ユーザーを追加" centered>
                <form onSubmit={handleAddUser}>
                    <Stack>
                        <Text size="sm" c="dimmed">
                            メールアドレスを登録すると、そのユーザーは初回ログイン時にTOTPをセットアップできます。
                        </Text>
                        <TextInput
                            label="メールアドレス"
                            placeholder="user@example.com"
                            value={newEmail}
                            onChange={(e) => setNewEmail(e.currentTarget.value)}
                            leftSection={<IconMail size={18} />}
                            required
                            error={addError || undefined}
                            autoFocus
                        />
                        <Button type="submit" loading={addLoading} disabled={!newEmail.trim()}>
                            追加
                        </Button>
                    </Stack>
                </form>
            </Modal>
        </Container>
    );
}
