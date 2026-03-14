/**
 * Mineo account login & registration routes (user-scoped).
 *
 * Flow:
 * 1. POST /mineo-login/token      — refresh_token input → fetch lines
 * 2. POST /mineo-login/register   — register selected lines as accounts
 */

import { Hono } from 'hono';
import { encrypt } from '../services/encryption';
import type { HonoEnv, Env } from '../types';
import { loginWithRefreshToken } from '../services/mineo-auth';
import { getTelnumList } from '../services/mineo-api';

const mineoLogin = new Hono<HonoEnv>();

// ---------- shared helper ----------

interface LineInfo {
    custId: string;
    lineName: string;
    telNum: string;
    alreadyRegistered: boolean;
}

async function fetchLines(
    idToken: string,
    refreshToken: string,
    db: D1Database,
    userId: number,
    env: Env
): Promise<{ lines: LineInfo[]; idToken: string; refreshToken: string }> {
    const resp = await getTelnumList({ idToken, env });

    if (resp.resultCode !== '00' || !resp.telNumList) {
        throw new Error('回線一覧の取得に失敗しました');
    }

    // Check which lines are already registered by this user
    const custIds = resp.telNumList.map((t) => t.custId);
    const placeholders = custIds.map(() => '?').join(',');
    const existing = await db
        .prepare(`SELECT cust_id FROM accounts WHERE cust_id IN (${placeholders}) AND user_id = ?`)
        .bind(...custIds, userId)
        .all<{ cust_id: string }>();

    const existingSet = new Set((existing.results ?? []).map((r) => r.cust_id));

    const lines: LineInfo[] = resp.telNumList.map((t) => ({
        custId: t.custId,
        lineName: t.lineName,
        telNum: t.telNum,
        alreadyRegistered: existingSet.has(t.custId),
    }));

    return { lines, idToken, refreshToken };
}

// ---------- Refresh Token login ----------

mineoLogin.post('/token', async (c) => {
    const userId = c.get('userId');
    const { refreshToken } = await c.req.json<{ refreshToken: string }>();

    if (!refreshToken) {
        return c.json({ error: 'リフレッシュトークンを入力してください' }, 400);
    }

    const result = await loginWithRefreshToken(refreshToken, c.env);

    if ('error' in result) {
        return c.json({ error: `トークンの検証に失敗しました: ${result.error}` }, 401);
    }

    try {
        const data = await fetchLines(
            result.tokens.id_token,
            result.tokens.refresh_token,
            c.env.DB,
            userId,
            c.env
        );
        return c.json(data);
    } catch (err) {
        return c.json({ error: err instanceof Error ? err.message : 'Failed to fetch lines' }, 500);
    }
});

// ---------- Register selected lines ----------

interface RegisterRequest {
    lines: {
        custId: string;
        lineName: string;
        telNum?: string;
        yuzuruneEnabled: boolean;
    }[];
    refreshToken: string;
    idToken: string;
}

mineoLogin.post('/register', async (c) => {
    const userId = c.get('userId');
    const body = await c.req.json<RegisterRequest>();

    if (!body.lines || body.lines.length === 0) {
        return c.json({ error: '登録する回線を選択してください' }, 400);
    }

    if (!body.refreshToken) {
        return c.json({ error: 'refreshToken is required' }, 400);
    }

    const encryptedRefreshToken = await encrypt(body.refreshToken, c.env.ENCRYPTION_KEY);
    const encryptedIdToken = await encrypt(body.idToken, c.env.ENCRYPTION_KEY);
    const expiresAt = new Date(Date.now() + 86400 * 1000).toISOString();

    const results: { custId: string; id: number }[] = [];

    for (const line of body.lines) {
        // Check if already registered by this user
        const existing = await c.env.DB
            .prepare('SELECT id FROM accounts WHERE cust_id = ? AND user_id = ?')
            .bind(line.custId, userId)
            .first<{ id: number }>();

        if (existing) {
            results.push({ custId: line.custId, id: existing.id });
            continue;
        }

        try {
            const result = await c.env.DB
                .prepare(
                    `INSERT INTO accounts (user_id, display_name, cust_id, refresh_token, id_token, token_expires_at, yuzurune_enabled)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`
                )
                .bind(
                    userId,
                    line.lineName || line.telNum || '未設定',
                    line.custId,
                    encryptedRefreshToken,
                    encryptedIdToken,
                    expiresAt,
                    line.yuzuruneEnabled ? 1 : 0,
                )
                .run();

            results.push({ custId: line.custId, id: result.meta.last_row_id as number });
        } catch (err) {
            console.error('Registration insertion error for custId', line.custId, err);
            throw err;
        }
    }

    return c.json({ success: true, registered: results }, 201);
});

export default mineoLogin;
