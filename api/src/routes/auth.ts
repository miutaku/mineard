/**
 * Auth routes: user login, TOTP setup for invited users, admin user management.
 *
 * Flow:
 * 1. Admin creates a user via POST /auth/users (email only)
 * 2. User visits login page, enters email → if TOTP not set up, redirected to setup
 * 3. Setup: user gets QR code, scans with Authenticator, verifies with code
 * 4. Login: email + TOTP code → JWT session cookie
 */

import { Hono } from 'hono';
import type { HonoEnv, User } from '../types';
import {
    generateSecret,
    getTotpUri,
    verifyTotp,
    createSessionToken,
    verifySessionToken,
} from '../services/totp';

const auth = new Hono<HonoEnv>();

/** Check auth status: is the user logged in? Are there any users? */
auth.get('/status', async (c) => {
    // Check if session is valid
    const cookie = c.req.header('Cookie') ?? '';
    const match = cookie.match(/mineard_session=([^;]+)/);
    const token = match?.[1];

    let loggedInUser: User | null = null;

    if (token) {
        const userId = await verifySessionToken(token, c.env.AUTH_SECRET);
        if (userId) {
            loggedInUser = await c.env.DB
                .prepare('SELECT * FROM users WHERE id = ?')
                .bind(userId)
                .first<User>();
        }
    }

    // Check if any users exist
    const userCount = await c.env.DB
        .prepare('SELECT COUNT(*) as count FROM users')
        .first<{ count: number }>();

    return c.json({
        authenticated: !!loggedInUser,
        user: loggedInUser ? { id: loggedInUser.id, email: loggedInUser.email, is_admin: !!loggedInUser.is_admin } : null,
        has_users: (userCount?.count ?? 0) > 0,
    });
});

/** Check if email exists and whether TOTP is set up */
auth.post('/check', async (c) => {
    const { email } = await c.req.json<{ email: string }>();

    if (!email) {
        return c.json({ error: 'メールアドレスを入力してください' }, 400);
    }

    const user = await c.env.DB
        .prepare('SELECT id, totp_setup_complete FROM users WHERE email = ?')
        .bind(email.toLowerCase().trim())
        .first<{ id: number; totp_setup_complete: number }>();

    if (!user) {
        return c.json({ error: '登録されていないメールアドレスです' }, 404);
    }

    return c.json({
        needs_setup: !user.totp_setup_complete,
    });
});

/** TOTP setup: returns QR code URI for first-time users */
auth.post('/setup', async (c) => {
    const { email } = await c.req.json<{ email: string }>();

    const user = await c.env.DB
        .prepare('SELECT * FROM users WHERE email = ?')
        .bind(email.toLowerCase().trim())
        .first<User>();

    if (!user) {
        return c.json({ error: 'ユーザーが見つかりません' }, 404);
    }

    if (user.totp_setup_complete) {
        return c.json({ error: 'TOTP は既にセットアップ済みです' }, 400);
    }

    // Generate new secret if not exists
    let secret = user.totp_secret;
    if (!secret) {
        secret = generateSecret();
        await c.env.DB
            .prepare('UPDATE users SET totp_secret = ? WHERE id = ?')
            .bind(secret, user.id)
            .run();
    }

    const uri = getTotpUri(secret, user.email);
    return c.json({ uri, secret });
});

/** Verify TOTP setup and complete registration */
auth.post('/setup/verify', async (c) => {
    const { email, code } = await c.req.json<{ email: string; code: string }>();

    const user = await c.env.DB
        .prepare('SELECT * FROM users WHERE email = ?')
        .bind(email.toLowerCase().trim())
        .first<User>();

    if (!user || !user.totp_secret) {
        return c.json({ error: 'セットアップが開始されていません' }, 400);
    }

    if (!verifyTotp(user.totp_secret, code)) {
        return c.json({ error: '認証コードが正しくありません' }, 401);
    }

    // Mark setup as complete
    await c.env.DB
        .prepare('UPDATE users SET totp_setup_complete = 1 WHERE id = ?')
        .bind(user.id)
        .run();

    const token = await createSessionToken(user.id, c.env.AUTH_SECRET);

    return c.json({ success: true }, 200, {
        'Set-Cookie': `mineard_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`,
    });
});

/** Login with email + TOTP code */
auth.post('/login', async (c) => {
    const { email, code } = await c.req.json<{ email: string; code: string }>();

    if (!email || !code) {
        return c.json({ error: 'メールアドレスと認証コードを入力してください' }, 400);
    }

    const user = await c.env.DB
        .prepare('SELECT * FROM users WHERE email = ?')
        .bind(email.toLowerCase().trim())
        .first<User>();

    if (!user) {
        return c.json({ error: '認証に失敗しました' }, 401);
    }

    if (!user.totp_setup_complete || !user.totp_secret) {
        return c.json({ error: 'TOTPのセットアップが完了していません', needs_setup: true }, 403);
    }

    if (!verifyTotp(user.totp_secret, code)) {
        return c.json({ error: '認証に失敗しました' }, 401);
    }

    const token = await createSessionToken(user.id, c.env.AUTH_SECRET);

    return c.json({ success: true }, 200, {
        'Set-Cookie': `mineard_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`,
    });
});

/** Logout */
auth.post('/logout', async (c) => {
    return c.json({ success: true }, 200, {
        'Set-Cookie': 'mineard_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0',
    });
});

// ---------- Admin: user management ----------

/** Helper: verify session and check admin */
async function requireAdmin(c: { req: { header: (name: string) => string | undefined }; env: { AUTH_SECRET: string; DB: D1Database }; json: (data: unknown, status: number) => Response }): Promise<{ userId: number } | Response> {
    const cookie = c.req.header('Cookie') ?? '';
    const match = cookie.match(/mineard_session=([^;]+)/);
    const token = match?.[1];
    if (!token) return c.json({ error: 'Unauthorized' }, 401);

    const userId = await verifySessionToken(token, c.env.AUTH_SECRET);
    if (!userId) return c.json({ error: 'Unauthorized' }, 401);

    const user = await c.env.DB
        .prepare('SELECT is_admin FROM users WHERE id = ?')
        .bind(userId)
        .first<{ is_admin: number }>();

    if (!user?.is_admin) {
        return c.json({ error: '管理者権限が必要です' }, 403);
    }

    return { userId };
}

/** List all users (admin only) */
auth.get('/users', async (c) => {
    const result = await requireAdmin(c);
    if (result instanceof Response) return result;

    const users = await c.env.DB
        .prepare('SELECT id, email, totp_setup_complete, is_admin, created_at FROM users ORDER BY id')
        .all<{ id: number; email: string; totp_setup_complete: number; is_admin: number; created_at: string }>();

    return c.json({ users: users.results ?? [] });
});

/** Create a new user (admin only) */
auth.post('/users', async (c) => {
    const result = await requireAdmin(c);
    if (result instanceof Response) return result;

    const { email } = await c.req.json<{ email: string }>();

    if (!email) {
        return c.json({ error: 'メールアドレスは必須です' }, 400);
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existing = await c.env.DB
        .prepare('SELECT id FROM users WHERE email = ?')
        .bind(normalizedEmail)
        .first();

    if (existing) {
        return c.json({ error: 'このメールアドレスは既に登録されています' }, 409);
    }

    const insertResult = await c.env.DB
        .prepare('INSERT INTO users (email) VALUES (?)')
        .bind(normalizedEmail)
        .run();

    return c.json({ id: insertResult.meta.last_row_id, email: normalizedEmail }, 201);
});

/** Reset TOTP for a user (restricted to specific admin emails via TOTP_RESET_ADMIN_EMAIL env var) */
auth.post('/users/:id/reset-totp', async (c) => {
    const result = await requireAdmin(c);
    if (result instanceof Response) return result;

    const allowedEmails = (c.env.TOTP_RESET_ADMIN_EMAIL ?? '')
        .split(',')
        .map((e) => e.toLowerCase().trim())
        .filter(Boolean);

    const self = await c.env.DB
        .prepare('SELECT email FROM users WHERE id = ?')
        .bind(result.userId)
        .first<{ email: string }>();

    if (!self || !allowedEmails.includes(self.email.toLowerCase())) {
        return c.json({ error: 'この操作は許可されていません' }, 403);
    }

    const targetId = parseInt(c.req.param('id'));

    const target = await c.env.DB
        .prepare('SELECT id FROM users WHERE id = ?')
        .bind(targetId)
        .first<{ id: number }>();

    if (!target) {
        return c.json({ error: 'ユーザーが見つかりません' }, 404);
    }

    await c.env.DB
        .prepare('UPDATE users SET totp_secret = NULL, totp_setup_complete = 0 WHERE id = ?')
        .bind(targetId)
        .run();

    return c.json({ success: true });
});

/** Delete a user (admin only) */
auth.delete('/users/:id', async (c) => {
    const result = await requireAdmin(c);
    if (result instanceof Response) return result;

    const targetId = parseInt(c.req.param('id'));

    if (targetId === result.userId) {
        return c.json({ error: '自分自身は削除できません' }, 400);
    }

    await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(targetId).run();
    return c.json({ success: true });
});

export default auth;
