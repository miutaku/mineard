/**
 * Pages Functions catch-all proxy: forwards /api/* requests to the Worker.
 */
import type { Fetcher, PagesFunction } from '@cloudflare/workers-types';

interface Env {
    API_WORKER: Fetcher;
}

export const onRequest: PagesFunction<Env> = async (context) => {
    const url = new URL(context.request.url);
    const internalUrl = `http://mineard-api.internal${url.pathname}${url.search}`;

    // Forward the request to the internal API worker
    return await context.env.API_WORKER.fetch(internalUrl, {
        method: context.request.method,
        headers: context.request.headers,
        body: context.request.body,
        // @ts-ignore - Pages internal fetch handles the redirect/body mapping
        redirect: 'manual',
    });
};
