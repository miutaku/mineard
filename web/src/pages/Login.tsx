import { useState } from 'react';
import {
    Container,
    Paper,
    Title,
    Text,
    TextInput,
    Button,
    Stack,
    Center,
    Badge,
} from '@mantine/core';
import { IconLock, IconShieldCheck, IconMail } from '@tabler/icons-react';
import { api } from '../lib/api-client';

interface LoginProps {
    onSuccess: () => void;
    onNeedsSetup: (email: string) => void;
}

export default function Login({ onSuccess, onNeedsSetup }: LoginProps) {
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [step, setStep] = useState<'email' | 'code'>('email');

    async function handleEmailSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const check = await api.post<{ needs_setup: boolean }>('/auth/check', {
                email: email.trim(),
            });

            if (check.needs_setup) {
                onNeedsSetup(email.trim());
                return;
            }

            // TOTP is set up, show code input
            setStep('code');
        } catch (err) {
            setError(err instanceof Error ? err.message : '認証に失敗しました');
        } finally {
            setLoading(false);
        }
    }

    async function handleCodeSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            await api.post('/auth/login', { email: email.trim(), code });
            onSuccess();
        } catch (err) {
            setError(err instanceof Error ? err.message : '認証に失敗しました');
        } finally {
            setLoading(false);
        }
    }

    return (
        <Container size={420} pt={100}>
            <Center mb="xl">
                <Stack align="center" gap="xs">
                    <Title order={1} style={{ letterSpacing: '-1px' }}>
                        ⚡ Mineard
                    </Title>
                    <Badge variant="light" color="teal" size="lg">
                        mineo パケット自動化
                    </Badge>
                </Stack>
            </Center>

            <Paper withBorder shadow="lg" p={30} radius="md">
                <Center mb="md">
                    <IconShieldCheck size={40} color="var(--mantine-color-teal-6)" />
                </Center>
                <Title order={3} ta="center" mb="md">
                    ログイン
                </Title>

                {step === 'email' ? (
                    <form onSubmit={handleEmailSubmit}>
                        <Stack>
                            <Text c="dimmed" size="sm" ta="center">
                                メールアドレスを入力してください
                            </Text>
                            <TextInput
                                label="メールアドレス"
                                placeholder="you@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.currentTarget.value)}
                                leftSection={<IconMail size={18} />}
                                required
                                autoFocus
                                error={error || undefined}
                            />
                            <Button
                                type="submit"
                                fullWidth
                                size="md"
                                loading={loading}
                                disabled={!email.trim()}
                            >
                                次へ
                            </Button>
                        </Stack>
                    </form>
                ) : (
                    <form onSubmit={handleCodeSubmit}>
                        <Stack>
                            <Text c="dimmed" size="sm" ta="center">
                                {email} の認証コードを入力してください
                            </Text>
                            <TextInput
                                label="認証コード"
                                placeholder="000000"
                                value={code}
                                onChange={(e) => setCode(e.currentTarget.value)}
                                maxLength={6}
                                size="lg"
                                leftSection={<IconLock size={18} />}
                                styles={{
                                    input: {
                                        textAlign: 'center',
                                        letterSpacing: '0.5em',
                                        fontSize: '1.5rem',
                                        fontWeight: 600,
                                    },
                                }}
                                error={error || undefined}
                                autoFocus
                            />
                            <Button
                                type="submit"
                                fullWidth
                                size="md"
                                loading={loading}
                                disabled={code.length !== 6}
                            >
                                ログイン
                            </Button>
                            <Button
                                variant="subtle"
                                size="sm"
                                onClick={() => { setStep('email'); setCode(''); setError(''); }}
                            >
                                メールアドレスを変更
                            </Button>
                        </Stack>
                    </form>
                )}
            </Paper>
        </Container>
    );
}
