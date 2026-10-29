import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { bundleNotices } from './scripts/bundle-notices.mjs';
import { siteOrigins } from './scripts/site-origins.mjs';

const messengerCoverRevision = createHash('sha256')
    .update(readFileSync(new URL('./public/og-image.png', import.meta.url)))
    .digest('hex').slice(0, 12);

export default defineConfig(({ mode }) => {
const env = loadEnv(mode, process.cwd(), 'VITE_');
return {
    define: {
        'import.meta.env.VITE_MESSENGER_COVER_REVISION': JSON.stringify(messengerCoverRevision),
    },
    plugins: [
        react(),
        bundleNotices(),
        siteOrigins({ appOrigin: process.env.VITE_APP_ORIGIN || env.VITE_APP_ORIGIN }),
    ],

    build: {
        chunkSizeWarningLimit: 600,
        rollupOptions: {
            output: {
                onlyExplicitManualChunks: true,
                // 앱 공통 라이브러리만 고정 청크로 묶고 화면 전용 코드는 지연 로드한다.

                manualChunks(id) {
                    const module = id.replaceAll('\\', '/');
                    // Replay는 기본 오류 수집 SDK와 분리해 첫 화면 뒤에 로드한다.
                    if (/\/node_modules\/@sentry\/(?!replay\/)/.test(module)
                        || /\/node_modules\/web-vitals\//.test(module)) return 'vendor-sentry';
                    if (module.includes('commonjsHelpers.js') || /\/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(module)) return 'vendor-react';
                    if (/\/node_modules\/(axios|@tanstack\/react-query|@tanstack\/query-core|zustand)\//.test(module)) return 'vendor-state';
                },
            },
        },
    },

    server: {
        host: '127.0.0.1',

        proxy: {
            '/api': {
                target: 'http://localhost:8080',
                changeOrigin: true,
            },
            '/oauth2/authorization': { target: 'http://localhost:8080', changeOrigin: false },
            '/login/oauth2/code': { target: 'http://localhost:8080', changeOrigin: false },
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
        // 테스트 초기화 비용을 줄이기 위해 로컬은 한 워커, Linux CI는 두 워커를 사용한다.

        pool: 'forks',
        maxWorkers: process.env.CI ? 2 : 1,
        fileParallelism: Boolean(process.env.CI),
    },
};
});
