import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [
        react(),
    ],

    build: {
        // antd 공통 청크(약 1.3MB, gzip 409kB)가 500kB 경고를 넘지만, 거의 모든 페이지가 쓰는
        // 안정적 라이브러리라 공통 청크로 두는 게 맞다(한 번 캐시되면 앱 배포에도 재다운로드 없음).
        // 실제 초과 청크는 vendor-antd 하나뿐이라 경고 한도를 그 수준으로 올려 빌드 로그를 깔끔히 유지.
        chunkSizeWarningLimit: 1400,
        rollupOptions: {
            output: {
                // 초기 번들 최적화 (2026-07): 예전엔 node_modules 전체가 하나의 index-*.js(약 1.45MB)로
                // 뭉쳐서, react만 바뀌지 않아도 라이브러리 하나 업데이트하면 통째로 캐시가 깨졌음.
                // 자주 안 바뀌는 무거운 라이브러리들을 성격별 vendor 청크로 분리해서
                //   (1) 초기 로딩 시 병렬 다운로드가 가능해지고
                //   (2) 앱 코드만 배포하면 vendor 청크는 브라우저 캐시가 유지되도록(재방문 빠름) 한다.
                // recharts는 통계/차트 화면에서만 쓰여 라우트 lazy로 이미 늦게 로드되지만, vendor로도
                // 격리해서 다른 페이지 첫 로딩 번들에 절대 섞이지 않게 한다.
                manualChunks: {
                    'vendor-react': ['react', 'react-dom', 'react-router-dom'],
                    'vendor-antd': ['antd', '@ant-design/icons'],
                    'vendor-charts': ['recharts'],
                    'vendor-motion': ['framer-motion'],
                    'vendor-qr': ['html5-qrcode', 'qrcode.react'],
                    'vendor-sentry': ['@sentry/react'],
                    'vendor-payment': ['@portone/browser-sdk/v2'],
                    'vendor-misc': ['axios', '@tanstack/react-query', 'zustand', 'hangul-js'],
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
    }
});
