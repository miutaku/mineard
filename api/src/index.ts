/**
 * Mineard API - Cloudflare Worker entry point
 *
 * HTTP routes via Hono + Scheduled (Cron Trigger) handler.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { HonoEnv } from './types';
import { authMiddleware } from './middleware/auth';
import authRoutes from './routes/auth';
import accountRoutes from './routes/accounts';
import giftPairRoutes from './routes/gift-pairs';
import logRoutes from './routes/logs';
import dashboardRoutes from './routes/dashboard';
import mineoLoginRoutes from './routes/mineo-login';
import profileRoutes from './routes/profile';
import { runYuzurune } from './jobs/yuzurune';
import { runTokenRefresh } from './jobs/token-refresh';
import { runPacketExchange } from './jobs/packet-exchange';
import { runPacketAlert } from './jobs/packet-alert';

const app = new Hono<HonoEnv>();

// CORS
app.use(
    '*',
    cors({
        origin: (origin, c) => {
            return c.env.FRONTEND_URL || '*';
        },
        credentials: true,
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
    })
);

// Auth middleware (skips /api/auth/*)
app.use('/api/*', authMiddleware);

// Routes
app.route('/api/auth', authRoutes);
app.route('/api/accounts', accountRoutes);
app.route('/api/gift-pairs', giftPairRoutes);
app.route('/api/logs', logRoutes);
app.route('/api/dashboard', dashboardRoutes);
app.route('/api/mineo-login', mineoLoginRoutes);
app.route('/api/profile', profileRoutes);

// Health check
app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Export Worker
export default {
    fetch: app.fetch,
    async scheduled(event: ScheduledEvent, env: HonoEnv['Bindings'], ctx: ExecutionContext) {
        console.log(`[Cron] Triggered: ${event.cron} at ${new Date().toISOString()}`);

        switch (event.cron) {
            case '50 * * * *':
                // トークン事前リフレッシュ — 毎時:50（24時間、ゆずるね。宣言の10分前に常に実行）
                ctx.waitUntil(runTokenRefresh(env));
                break;
            case '0 4-14 * * *':
                // ゆずるね。宣言 — 毎時13:00-23:00 JST
                ctx.waitUntil(runYuzurune(env));
                break;
            case '0 0 26 * *':
                // パケットギフト交換 — 毎月26日 09:00 JST
                ctx.waitUntil(runPacketExchange(env));
                break;
            case '*/10 * * * *':
                // パケット残量アラート — 10分ごと
                ctx.waitUntil(runPacketAlert(env));
                break;
            default:
                console.warn(`[Cron] Unknown cron expression: ${event.cron}`);
        }
    },
};
