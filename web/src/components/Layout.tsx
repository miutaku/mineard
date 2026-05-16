import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
    AppShell,
    Burger,
    NavLink,
    Title,
    Group,
    ActionIcon,
    useMantineColorScheme,
    Text,
    Popover,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconDashboard,
    IconDeviceMobile,
    IconUser,
    IconUsers,
    IconArrowsExchange,
    IconFileText,
    IconSun,
    IconMoon,
    IconLogout,
    IconInfinity,
    IconSettings,
} from '@tabler/icons-react';
import { api } from '../lib/api-client';

const navItems = [
    { label: 'ダッシュボード', icon: IconDashboard, path: '/' },
    { label: 'mineoアカウント', icon: IconDeviceMobile, path: '/accounts' },
    { label: 'ギフトペア', icon: IconArrowsExchange, path: '/gift-pairs' },
    { label: 'ログ', icon: IconFileText, path: '/logs' },
    { label: '設定', icon: IconSettings, path: '/settings' },
];

const adminNavItems = [
    { label: 'ユーザー管理', icon: IconUsers, path: '/users' },
];

export default function Layout({ isAdmin = false, userEmail = '' }: { isAdmin?: boolean; userEmail?: string }) {
    const location = useLocation();
    const navigate = useNavigate();
    const { colorScheme, toggleColorScheme } = useMantineColorScheme();
    const [opened, { toggle }] = useDisclosure();

    const allNavItems = isAdmin ? [...navItems, ...adminNavItems] : navItems;

    async function handleLogout() {
        await api.post('/auth/logout');
        window.location.href = '/login';
    }

    return (
        <AppShell
            header={{ height: 60 }}
            navbar={{
                width: 260,
                breakpoint: 'sm',
                collapsed: { mobile: !opened },
            }}
            padding="md"
        >
            <AppShell.Header>
                <Group h="100%" px="md" justify="space-between">
                    <Group>
                        <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
                        <Title order={3} style={{ letterSpacing: '-0.5px' }}>
                            <IconInfinity size={24} style={{ verticalAlign: 'middle', marginRight: 4, color: 'var(--mantine-color-green-filled)' }} />
                            Mineard
                        </Title>
                    </Group>
                    <Group gap="xs">
                        <Text size="sm" c="dimmed" visibleFrom="sm">
                            {userEmail}
                        </Text>
                        <Popover position="bottom" withArrow shadow="md">
                            <Popover.Target>
                                <ActionIcon variant="subtle" size="lg" hiddenFrom="sm" aria-label="ユーザー情報">
                                    <IconUser size={18} />
                                </ActionIcon>
                            </Popover.Target>
                            <Popover.Dropdown>
                                <Text size="sm">{userEmail}</Text>
                            </Popover.Dropdown>
                        </Popover>
                        <ActionIcon
                            variant="subtle"
                            onClick={toggleColorScheme}
                            size="lg"
                            aria-label="テーマ切替"
                        >
                            {colorScheme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
                        </ActionIcon>
                        <ActionIcon
                            variant="subtle"
                            color="red"
                            onClick={handleLogout}
                            size="lg"
                            aria-label="ログアウト"
                        >
                            <IconLogout size={18} />
                        </ActionIcon>
                    </Group>
                </Group>
            </AppShell.Header>

            <AppShell.Navbar p="xs">
                <AppShell.Section grow>
                    {allNavItems.map((item) => (
                        <NavLink
                            key={item.path}
                            label={item.label}
                            leftSection={<item.icon size={20} />}
                            active={location.pathname === item.path}
                            onClick={() => {
                                navigate(item.path);
                                toggle();
                            }}
                            style={{ borderRadius: 'var(--mantine-radius-md)', marginBottom: 4 }}
                        />
                    ))}
                </AppShell.Section>
                <AppShell.Section>
                    <Text size="xs" c="dimmed" ta="center" py="xs">
                        Mineard {__APP_VERSION__}
                    </Text>
                </AppShell.Section>
            </AppShell.Navbar>

            <AppShell.Main>
                <Outlet />
            </AppShell.Main>
        </AppShell>
    );
}
