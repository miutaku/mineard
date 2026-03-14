/**
 * API client: centralised fetch wrapper for the Worker API.
 */

const API_BASE = '/api';

class ApiError extends Error {
    constructor(
        public status: number,
        message: string,
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

async function request<T>(
    path: string,
    options: RequestInit = {},
): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
        ...options,
    });

    if (res.status === 401) {
        // Redirect to login if not on login/setup/auth pages
        if (
            !window.location.pathname.startsWith('/login') &&
            !window.location.pathname.startsWith('/setup') &&
            !path.startsWith('/auth/')
        ) {
            window.location.href = '/login';
        }
        const body = await res.json().catch(() => ({ error: 'Unauthorized' }));
        throw new ApiError(401, (body as Record<string, string>).error ?? 'Unauthorized');
    }

    if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new ApiError(res.status, (body as Record<string, string>).error ?? res.statusText);
    }

    return res.json() as Promise<T>;
}

export const api = {
    get: <T>(path: string) => request<T>(path),
    post: <T>(path: string, body?: unknown) =>
        request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
    put: <T>(path: string, body?: unknown) =>
        request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
    delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export { ApiError };
