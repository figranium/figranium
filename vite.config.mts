import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { execFileSync } from 'child_process';

const readGit = (args: string[]) => {
    try {
        return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
        return '';
    }
};

const releaseTag = readGit(['describe', '--tags', '--exact-match', 'HEAD']);
const commit = readGit(['rev-parse', '--short', 'HEAD']);
const requestedChannel = process.env.FIGRANIUM_BUILD_CHANNEL || process.env.VITE_BUILD_CHANNEL;
const buildChannel = requestedChannel === 'edge' || (!requestedChannel && !!commit && !releaseTag) ? 'edge' : 'release';

export default defineConfig({
    plugins: [react()],
    define: {
        __FIGRANIUM_BUILD_CHANNEL__: JSON.stringify(buildChannel),
        __FIGRANIUM_BUILD_COMMIT__: JSON.stringify(commit),
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    server: {
        port: Number(process.env.VITE_DEV_PORT || 5173),
        proxy: {
            '/api': `http://localhost:${process.env.VITE_BACKEND_PORT || 11345}`,
            '/scrape': `http://localhost:${process.env.VITE_BACKEND_PORT || 11345}`,
            '/scraper': `http://localhost:${process.env.VITE_BACKEND_PORT || 11345}`,
            '/agent': `http://localhost:${process.env.VITE_BACKEND_PORT || 11345}`,
            '/headful': `http://localhost:${process.env.VITE_BACKEND_PORT || 11345}`,
            '/screenshots': `http://localhost:${process.env.VITE_BACKEND_PORT || 11345}`,
            '/novnc': `http://localhost:${process.env.VITE_BACKEND_PORT || 11345}`,
            '/websockify': {
                target: `ws://localhost:${process.env.VITE_BACKEND_PORT || 11345}`,
                ws: true,
            },
            '/websockify-low': {
                target: `ws://localhost:${process.env.VITE_BACKEND_PORT || 11345}`,
                ws: true,
            },
        },
    },
    build: {
        outDir: 'dist',
        chunkSizeWarningLimit: 800,
    },
});
