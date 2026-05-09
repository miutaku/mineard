/**
 * Account management routes (user-scoped)
 */

import { Hono } from 'hono';
import type { HonoEnv, Account, CreateAccountRequest, UpdateAccountRequest } from '../types';
import { encrypt } from '../services/encryption';
import { ensureValidToken } from '../services/token-manager';
import { getCapacity, getDevolveDeclareState } from '../services/mineo-api';

const accounts = new Hono<HonoEnv>();

/** List all accounts across all users (public info only, for gift pair targets) */
accounts.get('/all', async (c) => {
    const result = await c.env.DB
        .prepare(
            `SELECT a.id, a.display_name, a.cust_id, u.email as owner_email
             FROM accounts a
             JOIN users u ON a.user_id = u.id
             ORDER BY u.email, a.display_name`
        )
        .all<{ id: number; display_name: string; cust_id: string; owner_email: string }>();

    return c.json({ accounts: result.results ?? [] });
});

/** List all accounts for the logged-in user (tokens redacted) */
accounts.get('/', async (c) => {
    const userId = c.get('userId');
    const result = await c.env.DB
        .prepare('SELECT * FROM accounts WHERE user_id = ? ORDER BY id')
        .bind(userId)
        .all<Account>();

    const safe = (result.results ?? []).map((a) => ({
        id: a.id,
        display_name: a.display_name,
        cust_id: a.cust_id,
        yuzurune_enabled: !!a.yuzurune_enabled,
        packet_threshold: a.packet_threshold ?? null,
        packet_alert_enabled: !!a.packet_alert_enabled,
        token_valid: a.token_expires_at !== null,
        token_expires_at: a.token_expires_at,
        created_at: a.created_at,
    }));

    return c.json({ accounts: safe });
});

/** Get single account with capacity info */
accounts.get('/:id', async (c) => {
    const userId = c.get('userId');
    const id = parseInt(c.req.param('id'));
    const account = await c.env.DB
        .prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?')
        .bind(id, userId)
        .first<Account>();

    if (!account) return c.json({ error: 'Not found' }, 404);

    let capacity = null;
    let yuzuruneStatus = null;

    try {
        const idToken = await ensureValidToken(c.env.DB, account, c.env.ENCRYPTION_KEY, c.env);
        const capResult = await getCapacity({ idToken, env: c.env }, account.cust_id);
        if (capResult.resultCode === '00') capacity = capResult.packetInfo;

        const yuzResult = await getDevolveDeclareState({ idToken, env: c.env }, account.cust_id);
        if (yuzResult.resultCode === '00') {
            yuzuruneStatus = yuzResult.devolveDeclareStat === '1' ? 'declared' : 'pending';
        }
    } catch {
        // Token might be invalid; return what we have
    }

    return c.json({
        id: account.id,
        display_name: account.display_name,
        cust_id: account.cust_id,
        yuzurune_enabled: !!account.yuzurune_enabled,
        packet_threshold: account.packet_threshold ?? null,
        packet_alert_enabled: !!account.packet_alert_enabled,
        token_valid: account.token_expires_at ? new Date(account.token_expires_at) > new Date() : false,
        token_expires_at: account.token_expires_at,
        created_at: account.created_at,
        capacity,
        yuzurune_status: yuzuruneStatus,
    });
});

/** Create new account */
accounts.post('/', async (c) => {
    const userId = c.get('userId');
    const body = await c.req.json<CreateAccountRequest>();

    if (!body.display_name || !body.cust_id || !body.refresh_token) {
        return c.json({ error: 'display_name, cust_id, refresh_token are required' }, 400);
    }

    const encryptedRefreshToken = await encrypt(body.refresh_token, c.env.ENCRYPTION_KEY);

    const result = await c.env.DB
        .prepare(
            `INSERT INTO accounts (user_id, display_name, cust_id, refresh_token, yuzurune_enabled, packet_alert_enabled)
       VALUES (?, ?, ?, ?, ?, 0)`
        )
        .bind(
            userId,
            body.display_name,
            body.cust_id,
            encryptedRefreshToken,
            body.yuzurune_enabled !== false ? 1 : 0
        )
        .run();

    return c.json({ id: result.meta.last_row_id, success: true }, 201);
});

/** Update account */
accounts.put('/:id', async (c) => {
    const userId = c.get('userId');
    const id = parseInt(c.req.param('id'));
    const body = await c.req.json<UpdateAccountRequest>();

    const account = await c.env.DB
        .prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?')
        .bind(id, userId)
        .first<Account>();

    if (!account) return c.json({ error: 'Not found' }, 404);

    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (body.display_name !== undefined) {
        updates.push('display_name = ?');
        values.push(body.display_name);
    }

    if (body.refresh_token !== undefined) {
        updates.push('refresh_token = ?');
        values.push(await encrypt(body.refresh_token, c.env.ENCRYPTION_KEY));
        // Clear id_token since refresh_token changed
        updates.push('id_token = NULL');
        updates.push('token_expires_at = NULL');
    }

    if (body.yuzurune_enabled !== undefined) {
        updates.push('yuzurune_enabled = ?');
        values.push(body.yuzurune_enabled ? 1 : 0);
    }

    if (body.packet_threshold !== undefined) {
        updates.push('packet_threshold = ?');
        values.push(body.packet_threshold ?? null);
    }

    if (body.packet_alert_enabled !== undefined) {
        updates.push('packet_alert_enabled = ?');
        values.push(body.packet_alert_enabled ? 1 : 0);
    }

    if (updates.length === 0) {
        return c.json({ error: 'No fields to update' }, 400);
    }

    values.push(id);
    await c.env.DB
        .prepare(`UPDATE accounts SET ${updates.join(', ')} WHERE id = ?`)
        .bind(...values)
        .run();

    return c.json({ success: true });
});

/** Delete account */
accounts.delete('/:id', async (c) => {
    const userId = c.get('userId');
    const id = parseInt(c.req.param('id'));
    await c.env.DB
        .prepare('DELETE FROM accounts WHERE id = ? AND user_id = ?')
        .bind(id, userId)
        .run();
    return c.json({ success: true });
});

/** Manually refresh token for an account */
accounts.post('/:id/refresh', async (c) => {
    const userId = c.get('userId');
    const id = parseInt(c.req.param('id'));
    const account = await c.env.DB
        .prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?')
        .bind(id, userId)
        .first<Account>();

    if (!account) return c.json({ error: 'Not found' }, 404);

    try {
        await ensureValidToken(c.env.DB, account, c.env.ENCRYPTION_KEY, c.env);
        return c.json({ success: true, message: 'Token refreshed' });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return c.json({ error: msg }, 500);
    }
});

export default accounts;
