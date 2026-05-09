import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { LoadingOverlay } from '@mantine/core';
import { api } from './lib/api-client';
import Layout from './components/Layout';
import Login from './pages/Login';
import Setup from './pages/Setup';
import Dashboard from './pages/Dashboard';
import Accounts from './pages/Accounts';
import AddAccount from './pages/AddAccount';
import GiftPairs from './pages/GiftPairs';
import Logs from './pages/Logs';
import Users from './pages/Users';
import Settings from './pages/Settings';

interface AuthStatus {
    authenticated: boolean;
    user: { id: number; email: string; is_admin: boolean } | null;
    has_users: boolean;
}

function App() {
    const [authState, setAuthState] = useState<'loading' | 'setup' | 'login' | 'authenticated'>('loading');
    const [setupEmail, setSetupEmail] = useState('');
    const [isAdmin, setIsAdmin] = useState(false);
    const [userEmail, setUserEmail] = useState('');

    useEffect(() => {
        checkAuth();
    }, []);

    async function checkAuth() {
        try {
            const status = await api.get<AuthStatus>('/auth/status');

            if (status.authenticated) {
                setIsAdmin(status.user?.is_admin ?? false);
                setUserEmail(status.user?.email ?? '');
                setAuthState('authenticated');
            } else {
                setAuthState('login');
            }
        } catch {
            setAuthState('login');
        }
    }

    function handleNeedsSetup(email: string) {
        setSetupEmail(email);
        setAuthState('setup');
    }

    if (authState === 'loading') {
        return <LoadingOverlay visible />;
    }

    return (
        <Routes>
            <Route
                path="/login"
                element={
                    authState === 'authenticated'
                        ? <Navigate to="/" replace />
                        : authState === 'setup'
                            ? <Navigate to="/setup" replace />
                            : <Login
                                onSuccess={() => setAuthState('authenticated')}
                                onNeedsSetup={handleNeedsSetup}
                            />
                }
            />
            <Route
                path="/setup"
                element={
                    authState === 'setup'
                        ? <Setup email={setupEmail} onSuccess={() => setAuthState('authenticated')} />
                        : <Navigate to="/" replace />
                }
            />
            {authState === 'setup' && (
                <Route path="*" element={<Navigate to="/setup" replace />} />
            )}
            {authState !== 'authenticated' && (
                <Route path="*" element={<Navigate to="/login" replace />} />
            )}
            {authState === 'authenticated' && (
                <Route element={<Layout isAdmin={isAdmin} userEmail={userEmail} />}>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/accounts" element={<Accounts />} />
                    <Route path="/accounts/add" element={<AddAccount />} />
                    <Route path="/gift-pairs" element={<GiftPairs />} />
                    <Route path="/logs" element={<Logs />} />
                    <Route path="/settings" element={<Settings />} />
                    {isAdmin && <Route path="/users" element={<Users />} />}
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
            )}
        </Routes>
    );
}

export default App;
