/**
 * AddAccount page: mineo token login → line selection → registration.
 *
 * Step 1: User inputs refresh_token (obtained via mitmproxy).
 * Step 2: Display available lines. User selects which to register.
 * Step 3: Confirm registration.
 */

import { useState } from 'react';
import {
    Container,
    Paper,
    Title,
    Text,
    Button,
    Stack,
    Group,
    Stepper,
    Checkbox,
    Table,
    Alert,
    Badge,
    Textarea,
    ThemeIcon,
    Center,
    List,
    Code,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
    IconLogin,
    IconList,
    IconCheck,
    IconAlertCircle,
    IconArrowLeft,
    IconInfoCircle,
} from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api-client';

interface LineInfo {
    custId: string;
    lineName: string;
    telNum: string;
    alreadyRegistered: boolean;
}

interface LoginResult {
    lines: LineInfo[];
    idToken: string;
    refreshToken: string;
}

export default function AddAccount() {
    const navigate = useNavigate();
    const [step, setStep] = useState(0);

    // Login state
    const [manualToken, setManualToken] = useState('');
    const [loginLoading, setLoginLoading] = useState(false);
    const [loginError, setLoginError] = useState('');

    // Lines state
    const [loginResult, setLoginResult] = useState<LoginResult | null>(null);
    const [selectedLines, setSelectedLines] = useState<Set<string>>(new Set());
    const [yuzuruneLines, setYuzuruneLines] = useState<Set<string>>(new Set());

    // Register state
    const [registering, setRegistering] = useState(false);

    // ---------- Login handler ----------

    async function handleTokenLogin(e: React.FormEvent) {
        e.preventDefault();
        setLoginLoading(true);
        setLoginError('');

        try {
            const result = await api.post<LoginResult>('/mineo-login/token', { refreshToken: manualToken });
            setLoginResult(result);
            const unregistered = result.lines
                .filter((l) => !l.alreadyRegistered)
                .map((l) => l.custId);
            setSelectedLines(new Set(unregistered));
            setYuzuruneLines(new Set(unregistered));
            setStep(1);
        } catch (err: unknown) {
            const apiErr = err as { message?: string };
            setLoginError(apiErr.message || 'トークンの検証に失敗しました');
        } finally {
            setLoginLoading(false);
        }
    }

    // ---------- Registration handler ----------

    async function handleRegister() {
        if (!loginResult || selectedLines.size === 0) return;
        setRegistering(true);

        try {
            const lines = loginResult.lines
                .filter((l) => selectedLines.has(l.custId))
                .map((l) => ({
                    custId: l.custId,
                    lineName: l.lineName,
                    telNum: l.telNum,
                    yuzuruneEnabled: yuzuruneLines.has(l.custId),
                }));

            await api.post('/mineo-login/register', {
                lines,
                refreshToken: loginResult.refreshToken,
                idToken: loginResult.idToken,
            });

            notifications.show({
                title: '登録完了',
                message: `${lines.length}件のアカウントを登録しました`,
                color: 'teal',
            });

            setStep(2);
        } catch (err: unknown) {
            const apiErr = err as { message?: string };
            notifications.show({
                title: 'エラー',
                message: apiErr.message || '登録に失敗しました',
                color: 'red',
            });
        } finally {
            setRegistering(false);
        }
    }

    // ---------- Toggle helpers ----------

    function toggleLine(custId: string) {
        setSelectedLines((prev) => {
            const next = new Set(prev);
            if (next.has(custId)) next.delete(custId);
            else next.add(custId);
            return next;
        });
    }

    function toggleYuzurune(custId: string) {
        setYuzuruneLines((prev) => {
            const next = new Set(prev);
            if (next.has(custId)) next.delete(custId);
            else next.add(custId);
            return next;
        });
    }

    return (
        <Container size={600}>
            <Group mb="lg">
                <Button
                    variant="subtle"
                    leftSection={<IconArrowLeft size={16} />}
                    onClick={() => navigate('/accounts')}
                >
                    アカウント一覧へ
                </Button>
            </Group>

            <Title order={2} mb="md">アカウント追加</Title>
            <Text c="dimmed" mb="xl" size="sm">
                mineoアカウントのリフレッシュトークンを入力して、管理する回線を選択してください。
            </Text>

            <Stepper active={step} size="sm" mb="xl">
                <Stepper.Step label="トークン入力" icon={<IconLogin size={16} />} />
                <Stepper.Step label="回線選択" icon={<IconList size={16} />} />
                <Stepper.Step label="完了" icon={<IconCheck size={16} />} />
            </Stepper>

            {/* Step 0: Token input */}
            {step === 0 && (
                <Paper withBorder shadow="sm" p="xl" radius="md">
                    <form onSubmit={handleTokenLogin}>
                        <Stack>
                            <Alert
                                icon={<IconInfoCircle size={16} />}
                                color="blue"
                                variant="light"
                                title="リフレッシュトークンの取得手順"
                            >
                                <Text size="sm" fw={500} mt="xs" mb={4}>準備</Text>
                                <List size="sm" spacing={4}>
                                    <List.Item>PC に <a href="https://httptoolkit.com/" target="_blank" rel="noreferrer">HTTP Toolkit</a> をインストール</List.Item>
                                    <List.Item>HTTP Toolkit を起動し、Intercept 画面を開く</List.Item>
                                    <List.Item>
                                        iOS または Android 端末にて、公式ガイド (<a href="https://httptoolkit.com/docs/guides/ios/" target="_blank" rel="noreferrer">iOS</a> / Android) に従い CA証明書をインストールし、<b>完全な信頼</b> を設定する
                                    </List.Item>
                                </List>
                                <Text size="sm" fw={500} mt="sm" mb={4}>トークン取得</Text>
                                <List size="sm" spacing={4}>
                                    <List.Item>mineoアプリを開き、ログアウトする（すでにログアウト済みの場合はそのまま次へ）</List.Item>
                                    <List.Item>eoID とパスワードで再度ログインする</List.Item>
                                    <List.Item>PC の HTTP Toolkit に戻り、<Code>https://login.eonet.jp/oidc/v1/token</Code> へのPOSTリクエストを探す</List.Item>
                                    <List.Item>Response Body の JSON から <Code>refresh_token</Code> の値をコピーする</List.Item>
                                </List>
                                <Text size="xs" c="dimmed" mt="xs">
                                    ※ トークンは一度使うと無効になります。取得後すぐに下のフォームに貼り付けてください。
                                </Text>
                            </Alert>

                            {loginError && (
                                <Alert
                                    icon={<IconAlertCircle size={16} />}
                                    color="red"
                                    variant="light"
                                >
                                    {loginError}
                                </Alert>
                            )}

                            <Textarea
                                label="リフレッシュトークン"
                                placeholder="VEweVyQQCzmTwPmBXd..."
                                value={manualToken}
                                onChange={(e) => setManualToken(e.currentTarget.value)}
                                minRows={3}
                                required
                            />
                            <Button
                                type="submit"
                                loading={loginLoading}
                                disabled={!manualToken.trim()}
                                fullWidth
                            >
                                トークンを検証して回線を取得
                            </Button>
                        </Stack>
                    </form>
                </Paper>
            )}

            {/* Step 1: Line selection */}
            {step === 1 && loginResult && (
                <Paper withBorder shadow="sm" p="xl" radius="md">
                    <Text fw={500} mb="md">
                        {loginResult.lines.length}件の回線が見つかりました。登録する回線を選択してください。
                    </Text>

                    <Table highlightOnHover mb="lg">
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>選択</Table.Th>
                                <Table.Th>回線名</Table.Th>
                                <Table.Th>電話番号</Table.Th>
                                <Table.Th>ゆずるね</Table.Th>
                                <Table.Th>状態</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {loginResult.lines.map((line) => (
                                <Table.Tr key={line.custId}>
                                    <Table.Td>
                                        <Checkbox
                                            checked={selectedLines.has(line.custId)}
                                            onChange={() => toggleLine(line.custId)}
                                            disabled={line.alreadyRegistered}
                                        />
                                    </Table.Td>
                                    <Table.Td>{line.lineName}</Table.Td>
                                    <Table.Td>
                                        <Text size="sm" c="dimmed">
                                            {line.telNum.replace(
                                                /^(\d{3})(\d{4})(\d{4})$/,
                                                '$1-$2-$3'
                                            )}
                                        </Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Checkbox
                                            checked={yuzuruneLines.has(line.custId)}
                                            onChange={() => toggleYuzurune(line.custId)}
                                            disabled={line.alreadyRegistered || !selectedLines.has(line.custId)}
                                            label="自動宣言"
                                            size="xs"
                                        />
                                    </Table.Td>
                                    <Table.Td>
                                        {line.alreadyRegistered ? (
                                            <Badge color="gray" variant="light" size="sm">
                                                登録済み
                                            </Badge>
                                        ) : (
                                            <Badge color="teal" variant="light" size="sm">
                                                未登録
                                            </Badge>
                                        )}
                                    </Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>

                    <Group justify="space-between">
                        <Button variant="subtle" onClick={() => setStep(0)}>
                            戻る
                        </Button>
                        <Button
                            onClick={handleRegister}
                            loading={registering}
                            disabled={selectedLines.size === 0}
                        >
                            {selectedLines.size}件の回線を登録
                        </Button>
                    </Group>
                </Paper>
            )}

            {/* Step 2: Done */}
            {step === 2 && (
                <Paper withBorder shadow="sm" p="xl" radius="md">
                    <Center>
                        <Stack align="center" gap="md">
                            <ThemeIcon size={60} radius="xl" color="teal" variant="light">
                                <IconCheck size={30} />
                            </ThemeIcon>
                            <Title order={3}>登録が完了しました！</Title>
                            <Text c="dimmed" ta="center">
                                アカウント一覧ページで登録したアカウントを確認できます。
                            </Text>
                            <Button onClick={() => navigate('/accounts')}>
                                アカウント一覧へ
                            </Button>
                        </Stack>
                    </Center>
                </Paper>
            )}
        </Container>
    );
}
