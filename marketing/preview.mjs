import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const require = createRequire(resolve(root, '../frontend/package.json'));
const { preview } = await import(pathToFileURL(require.resolve('vite')).href);
const dist = resolve(root, 'dist');
const port = Number(process.env.RESERVE_MARKETING_PREVIEW_PORT || 4174);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid local marketing preview port');

await preview({ configFile: false, root, envDir: false, base: '/',
    build: { outDir: dist },
    plugins: [{ name: 'reserve-local-marketing-links', configurePreviewServer({ middlewares }) {
        middlewares.use(async (request, response, next) => {
            const path = request.url?.split('?')[0];
            if (!['GET', 'HEAD'].includes(request.method) || (path !== '/' && path !== '/index.html')) return next();
            try {
                const html = await readFile(resolve(dist, 'index.html'), 'utf8');
                response.setHeader('Content-Type', 'text/html; charset=utf-8');
                response.end(html.replaceAll('href="https://app.reserve.it.kr/', 'href="http://localhost:5173/'));
            } catch (error) { next(error); }
        });
    } }],
    preview: { host: '127.0.0.1', port, strictPort: true, open: false, cors: false,
        allowedHosts: ['127.0.0.1', 'localhost'] },
});
process.stdout.write(`Marketing preview listening on http://127.0.0.1:${port}/\n`);
