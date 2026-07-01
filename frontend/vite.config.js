import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [
        react(),
    ],

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
