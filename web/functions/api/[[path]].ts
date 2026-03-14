/**
 * Pages Functions catch-all proxy: forwards /api/* requests to the Worker.
 */
export const onRequest: PagesFunction = async (context) => {
    const workerUrl = 'https://mineard-api.mtakumi-0925.workers.dev';
    const url = new URL(context.request.url);
    const targetUrl = `${workerUrl}${url.pathname}${url.search}`;

    const headers = new Headers(context.request.headers);
    // Pass through the original host for cookie domain matching
    headers.set('X-Forwarded-Host', url.hostname);

    // Read body as text to avoid streaming issues
    let body: string | null = null;
    if (context.request.method !== 'GET' && context.request.method !== 'HEAD') {
        body = await context.request.text();
    }

    const response = await fetch(targetUrl, {
        method: context.request.method,
        headers,
        body,
    });

    // Clone response and adjust headers
    const newHeaders = new Headers(response.headers);
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
    });
};
