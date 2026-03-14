/**
 * Gift pair management routes (user-scoped)
 */

import { Hono } from 'hono';
import type { HonoEnv, GiftPair } from '../types';
import { runPacketExchange } from '../jobs/packet-exchange';

const giftPairs = new Hono<HonoEnv>();

/** List all gift pairs where the source belongs to the logged-in user */
giftPairs.get('/', async (c) => {
    const userId = c.get('userId');
    const result = await c.env.DB
        .prepare(
            `SELECT gp.*,
              sa.display_name as source_name, sa.cust_id as source_cust_id,
              ta.display_name as target_name, ta.cust_id as target_cust_id
       FROM gift_pairs gp
       JOIN accounts sa ON gp.source_account_id = sa.id
       JOIN accounts ta ON gp.target_account_id = ta.id
       WHERE sa.user_id = ?
       ORDER BY gp.id`
        )
        .bind(userId)
        .all();

    return c.json({ pairs: result.results ?? [] });
});

/** Create gift pair */
giftPairs.post('/', async (c) => {
    const userId = c.get('userId');
    const body = await c.req.json<{ source_account_id: number; target_account_id: number }>();

    if (!body.source_account_id || !body.target_account_id) {
        return c.json({ error: 'source_account_id, target_account_id are required' }, 400);
    }

    if (body.source_account_id === body.target_account_id) {
        return c.json({ error: 'Source and target must be different accounts' }, 400);
    }

    // Verify source account belongs to the user
    const source = await c.env.DB
        .prepare('SELECT id FROM accounts WHERE id = ? AND user_id = ?')
        .bind(body.source_account_id, userId)
        .first();
    // Target can be any account
    const target = await c.env.DB
        .prepare('SELECT id FROM accounts WHERE id = ?')
        .bind(body.target_account_id)
        .first();

    if (!source) {
        return c.json({ error: '送信元アカウントが見つかりません' }, 404);
    }
    if (!target) {
        return c.json({ error: '送信先アカウントが見つかりません' }, 404);
    }

    const result = await c.env.DB
        .prepare('INSERT INTO gift_pairs (source_account_id, target_account_id) VALUES (?, ?)')
        .bind(body.source_account_id, body.target_account_id)
        .run();

    return c.json({ id: result.meta.last_row_id, success: true }, 201);
});

/** Toggle gift pair enabled/disabled */
giftPairs.put('/:id/toggle', async (c) => {
    const userId = c.get('userId');
    const id = parseInt(c.req.param('id'));

    // Verify the pair belongs to the user
    const pair = await c.env.DB
        .prepare(
            `SELECT gp.* FROM gift_pairs gp
             JOIN accounts sa ON gp.source_account_id = sa.id
             WHERE gp.id = ? AND sa.user_id = ?`
        )
        .bind(id, userId)
        .first<GiftPair>();

    if (!pair) return c.json({ error: 'Not found' }, 404);

    await c.env.DB
        .prepare('UPDATE gift_pairs SET enabled = ? WHERE id = ?')
        .bind(pair.enabled ? 0 : 1, id)
        .run();

    return c.json({ success: true, enabled: !pair.enabled });
});

/** Delete gift pair */
giftPairs.delete('/:id', async (c) => {
    const userId = c.get('userId');
    const id = parseInt(c.req.param('id'));

    // Verify ownership
    const pair = await c.env.DB
        .prepare(
            `SELECT gp.id FROM gift_pairs gp
             JOIN accounts sa ON gp.source_account_id = sa.id
             WHERE gp.id = ? AND sa.user_id = ?`
        )
        .bind(id, userId)
        .first();

    if (!pair) return c.json({ error: 'Not found' }, 404);

    await c.env.DB.prepare('DELETE FROM gift_pairs WHERE id = ?').bind(id).run();
    return c.json({ success: true });
});

/** Manually trigger packet exchange for all enabled pairs */
giftPairs.post('/execute', async (c) => {
    try {
        await runPacketExchange(c.env);
        return c.json({ success: true, message: 'Packet exchange executed' });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return c.json({ error: msg }, 500);
    }
});

export default giftPairs;
