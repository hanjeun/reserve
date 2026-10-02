import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { bundleNotices } from './scripts/bundle-notices.mjs';

const messengerCoverRevision = createHash('sha256')
    .update(readFileSync(new URL('./public/og-image.png', import.meta.url)))
    .digest('hex').slice(0, 12);

export default defineConfig({
    define: {
        'import.meta.env.VITE_MESSENGER_COVER_REVISION': JSON.stringify(messengerCoverRevision),
    },
    plugins: [
        react(),
        bundleNotices(),
    ],

    build: {
        chunkSizeWarningLimit: 600,
        rollupOptions: {
            output: {
                // 앱 셸이 실제로 쓰는 안정 라이브러리만 고정 청크로 둔다.
                // antd·recharts·QR·결제·motion을 여기 묶으면 lazy 페이지에서만 쓰는 코드까지
                // 첫 HTML의 modulepreload 대상이 된다. Rollup이 라우트 그래프에 맞춰 나누게 두면
                // 관리자·결제·스캐너 코드는 해당 화면에 들어갈 때만 내려받는다.
                manualChunks: {
                    'vendor-react': ['react', 'react-dom', 'react-dom/client', 'react-router-dom'],
                    'vendor-sentry': ['@sentry/react'],
                    'vendor-state': ['axios', '@tanstack/react-query', 'zustand'],
                },
            },
        },
    },

    server: {
        host: true, // 노트북 외부(아이폰) 접속 허용

        allowedHosts: true,

        proxy: {
            '/api': {
                target: 'http://localhost:8080',
                changeOrigin: true,
            }
        }
    },

    test: {
        include: ['src/**/*.{test,spec}.{js,jsx}'],
        environment: 'jsdom',
        setupFiles: './src/test/setup.js',
        clearMocks: true,
        coverage: {
            provider: 'v8',
            include: ['src/**/*.{js,jsx}'],
            exclude: ['src/**/*.{test,spec}.{js,jsx}', 'src/test/**'],
            reporter: [['lcovonly', { projectRoot: '..' }], 'text-summary'],
        },
        css: true,
        // AntD/jsdom 테스트를 Windows에서 동시에 여러 워커로 띄우면 초기화가 크게 지연된다.
        // 로컬은 단일 fork, Linux CI에서는 격리된 두 fork로만 병렬화한다.
        pool: 'forks',
        maxWorkers: process.env.CI ? 2 : 1,
        fileParallelism: Boolean(process.env.CI),
    },
});
