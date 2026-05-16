import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json';

export default defineConfig({
    define: {
        __APP_VERSION__: JSON.stringify(process.env.VITE_APP_VERSION ?? `v${pkg.version}`),
    },
    plugins: [react()],
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://localhost:8787',
                changeOrigin: true,
            },
        },
    },
});
