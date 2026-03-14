import { useState, useEffect } from 'react';
import {
    Container,
    Paper,
    Title,
    Text,
    TextInput,
    Button,
    Stack,
    Center,
    Code,
    Stepper,
    Image,
    CopyButton,
    ActionIcon,
    Tooltip,
    Group,
} from '@mantine/core';
import { IconShieldCheck, IconCopy, IconCheck } from '@tabler/icons-react';
import { api } from '../lib/api-client';
import QRCode from 'qrcode';

interface SetupProps {
    email: string;
    onSuccess: () => void;
}

export default function Setup({ email, onSuccess }: SetupProps) {
    const [step, setStep] = useState(0);
    const [_uri, setUri] = useState('');
    const [secret, setSecret] = useState('');
    const [qrDataUrl, setQrDataUrl] = useState('');
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        initSetup();
    }, []);

    async function initSetup() {
        try {
            const data = await api.post<{ uri: string; secret: string }>('/auth/setup', { email });
            setUri(data.uri);
            setSecret(data.secret);
            const dataUrl = await QRCode.toDataURL(data.uri, {
                width: 256,
                margin: 2,
                color: { dark: '#c1c2c5', light: '#00000000' },
            });
            setQrDataUrl(dataUrl);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'セットアップに失敗しました');
        }
    }

    async function handleVerify(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            await api.post('/auth/setup/verify', { email, code });
            onSuccess();
        } catch (err) {
            setError(err instanceof Error ? err.message : '検証に失敗しました');
        } finally {
            setLoading(false);
        }
    }

    return (
        <Container size={500} pt={60}>
            <Center mb="xl">
                <Stack align="center" gap="xs">
                    <Title order={1} style={{ letterSpacing: '-1px' }}>
                        ⚡ Mineard
                    </Title>
                    <Text c="dimmed" size="sm">TOTP セットアップ — {email}</Text>
                </Stack>
            </Center>

            <Paper withBorder shadow="lg" p={30} radius="md">
                <Stepper active={step} onStepClick={setStep} size="sm" mb="xl">
                    <Stepper.Step label="QRコード" description="認証アプリに登録">
                        <Stack mt="md" align="center">
                            <Text size="sm" c="dimmed" ta="center">
                                Google AuthenticatorやAuthyなどの認証アプリで以下のQRコードをスキャンしてください
                            </Text>

                            {qrDataUrl && (
                                <Image
                                    src={qrDataUrl}
                                    alt="TOTP QR Code"
                                    w={256}
                                    h={256}
                                    fit="contain"
                                />
                            )}

                            <Text size="xs" c="dimmed">
                                QRコードが読み取れない場合は、以下のキーを手動で入力:
                            </Text>
                            <Group gap="xs">
                                <Code>{secret}</Code>
                                <CopyButton value={secret}>
                                    {({ copied, copy }) => (
                                        <Tooltip label={copied ? 'コピー済み' : 'コピー'}>
                                            <ActionIcon variant="subtle" onClick={copy} size="sm">
                                                {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                                            </ActionIcon>
                                        </Tooltip>
                                    )}
                                </CopyButton>
                            </Group>

                            <Button onClick={() => setStep(1)} fullWidth mt="md">
                                次へ
                            </Button>
                        </Stack>
                    </Stepper.Step>

                    <Stepper.Step label="確認" description="コードを検証">
                        <form onSubmit={handleVerify}>
                            <Stack mt="md">
                                <Center>
                                    <IconShieldCheck size={40} color="var(--mantine-color-teal-6)" />
                                </Center>
                                <Text size="sm" c="dimmed" ta="center">
                                    認証アプリに表示されている6桁のコードを入力して設定を完了してください
                                </Text>

                                <TextInput
                                    placeholder="000000"
                                    value={code}
                                    onChange={(e) => setCode(e.currentTarget.value)}
                                    maxLength={6}
                                    size="lg"
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
                                    loading={loading}
                                    disabled={code.length !== 6}
                                >
                                    設定を完了
                                </Button>
                            </Stack>
                        </form>
                    </Stepper.Step>
                </Stepper>
            </Paper>
        </Container>
    );
}
