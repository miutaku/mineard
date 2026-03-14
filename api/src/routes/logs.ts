/**
 * Job log routes (user-scoped)
 */

import { Hono } from 'hono';
import type { HonoEnv } from '../types';

const logs = new Hono<HonoEnv>();

/** Get logs with filtering (scoped to user's accounts) */
logs.get('/', async (c) => {
    const userId = c.get('userId');
    const jobType = c.req.query('job_type');
    const status = c.req.query('status');
    const accountId = c.req.query('account_id');
    const limit = parseInt(c.req.query('limit') ?? '50');
    const offset = parseInt(c.req.query('offset') ?? '0');

    let query = `
    SELECT jl.*, a.display_name as account_name
    FROM job_logs jl
    LEFT JOIN accounts a ON jl.account_id = a.id
    WHERE (a.user_id = ? OR jl.account_id IS NULL)
  `;
    const params: (string | number)[] = [userId];

    if (jobType) {
        query += ' AND jl.job_type = ?';
        params.push(jobType);
    }
    if (status) {
        query += ' AND jl.status = ?';
        params.push(status);
    }
    if (accountId) {
        query += ' AND jl.account_id = ?';
        params.push(parseInt(accountId));
    }

    // Count total
    const countQuery = query.replace('SELECT jl.*, a.display_name as account_name', 'SELECT COUNT(*) as total');
    const countResult = await c.env.DB.prepare(countQuery).bind(...params).first<{ total: number }>();

    // Fetch with pagination
    query += ' ORDER BY jl.executed_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const result = await c.env.DB.prepare(query).bind(...params).all();

    return c.json({
        logs: result.results ?? [],
        total: countResult?.total ?? 0,
        limit,
        offset,
    });
});

/** Clear old logs (older than specified days, default 90) */
logs.delete('/cleanup', async (c) => {
    const days = parseInt(c.req.query('days') ?? '90');
    const result = await c.env.DB
        .prepare(`DELETE FROM job_logs WHERE executed_at < datetime('now', ?)`)
        .bind(`-${days} days`)
        .run();

    return c.json({ success: true, deleted: result.meta.changes });
});

export default logs;
