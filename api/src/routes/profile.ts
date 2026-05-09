/**
 * Profile routes: Discord mention ID の取得・更新
 */

import { Hono } from 'hono';
import type { HonoEnv, User } from '../types';

const profile = new Hono<HonoEnv>();

/** 自分のプロフィール取得 */
profile.get('/', async (c) => {
    const userId = c.get('userId');
    const user = await c.env.DB
        .prepare('SELECT id, email, discord_mention_id FROM users WHERE id = ?')
        .bind(userId)
        .first<Pick<User, 'id' | 'email' | 'discord_mention_id'>>();

    if (!user) return c.json({ error: 'Not found' }, 404);

    return c.json({ discord_mention_id: user.discord_mention_id ?? null });
});

/** Discord mention ID を更新 */
profile.put('/', async (c) => {
    const userId = c.get('userId');
    const { discord_mention_id } = await c.req.json<{ discord_mention_id: string | null }>();

    // Discord User ID は数字のみ、または null を許容
    if (discord_mention_id !== null && !/^\d+$/.test(discord_mention_id)) {
        return c.json({ error: 'Discord User ID は数字のみで入力してください' }, 400);
    }

    await c.env.DB
        .prepare('UPDATE users SET discord_mention_id = ? WHERE id = ?')
        .bind(discord_mention_id ?? null, userId)
        .run();

    return c.json({ success: true });
});

export default profile;
