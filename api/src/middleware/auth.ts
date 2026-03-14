/**
 * Authentication middleware.
 * Checks for valid JWT session cookie on all routes except /api/auth/*.
 * Extracts userId from JWT and sets it on the Hono context.
 */

import { createMiddleware } from 'hono/factory';
import type { HonoEnv } from '../types';
import { verifySessionToken } from '../services/totp';

export const authMiddleware = createMiddleware<HonoEnv>(async (c, next) => {
    // Skip auth for auth endpoints
    if (c.req.path.startsWith('/api/auth')) {
        return next();
    }

    const cookie = c.req.header('Cookie') ?? '';
    const match = cookie.match(/mineard_session=([^;]+)/);
    const token = match?.[1];

    if (!token) {
        return c.json({ error: 'Unauthorized' }, 401);
    }

    const userId = await verifySessionToken(token, c.env.AUTH_SECRET);
    if (!userId) {
        return c.json({ error: 'Session expired' }, 401);
    }

    c.set('userId', userId);
    return next();
});
