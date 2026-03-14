/**
 * Pages Functions catch-all proxy: forwards /api/* requests to the Worker.
 */
import type { Fetcher } from '@cloudflare/workers-types';

interface Env {
    API_WORKER: Fetcher;
}

export const onRequest: PagesFunction<Env> = async (context) => {
    const url = new URL(context.request.url);
    // Create a new request for the internal API worker
    const workerRequest = new Request(`http://mineard-api.internal${url.pathname}${url.search}`, context.request);

    // Add original host for potential cookie or CORS handling on the backend
    workerRequest.headers.set('X-Forwarded-Host', url.hostname);

    return await context.env.API_WORKER.fetch(workerRequest);
};
