import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { bundleNotices } from '../frontend/scripts/bundle-notices.mjs';

export async function buildServicePreview() {
    const root = fileURLToPath(new URL('.', import.meta.url)), frontend = resolve(root, '../frontend');
    const require = createRequire(resolve(frontend, 'package.json'));
    const { build } = await import(pathToFileURL(require.resolve('vite')).href);
    const { default: react } = await import(pathToFileURL(require.resolve('@vitejs/plugin-react')).href);
    const output = resolve(root, 'dist/service-preview');
    await mkdir(output, { recursive: true });
    const pretendard = await readFile(resolve(frontend, 'node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2'));
    const cwdBefore = process.cwd(); let result;
    try {
        process.chdir(frontend);
        result = await build({ configFile: false, root: frontend, envDir: false, publicDir: false, base: '/service-preview/',
            resolve: { alias: { './KakaoMap': resolve(root, 'service-preview/PreviewMap.jsx') },
                dedupe: ['react', 'react-dom', 'antd', 'react-router-dom', '@tanstack/react-query', 'axios', 'zustand'] },
            define: { 'import.meta.env.VITE_API_BASE_URL': '""', 'import.meta.env.VITE_SENTRY_DSN': '""' },
            plugins: [react(), bundleNotices()],
            css: { postcss: { plugins: [{ postcssPlugin: 'reserve-preview-local-fonts', Once(css) {
                let added = false;
                css.walkAtRules('font-face', rule => {
                    const family = rule.nodes?.find(node => node.prop === 'font-family')?.value;
                    if (family?.includes('Pretendard')) {
                        if (added) { rule.remove(); return; }
                        added = true;
                        rule.walkDecls('src', declaration => { declaration.value = `url(data:font/woff2;base64,${pretendard.toString('base64')}) format('woff2')`; });
                        rule.walkDecls('unicode-range', declaration => declaration.remove());
                    // 이 문서는 프리텐다드로 고정되어 다른 글꼴을 내려받지 않는다.
                    } else if (family?.includes('SUITE')) rule.remove();
                });
            } }] } },
            build: { outDir: output, emptyOutDir: false, cssCodeSplit: false,
                rollupOptions: { input: resolve(root, 'service-preview/PreviewApp.jsx'), output: { format: 'iife', name: 'ReserveServicePreview',
                    inlineDynamicImports: true, entryFileNames: 'preview.js', assetFileNames: 'assets/[name]-[hash][extname]' } } },
        });
    } finally { process.chdir(cwdBefore); }
    const files = (Array.isArray(result) ? result : [result]).flatMap(bundle => bundle.output);
    const stylesheet = files.find(file => file.fileName.endsWith('.css'));
    if (!stylesheet || !files.some(file => file.fileName === 'preview.js')) throw new Error('Service preview output is incomplete');
    const policy = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
    const isolation = await readFile(resolve(root, 'service-preview/bootstrap.js'));
    await writeFile(resolve(output, 'isolation.js'), isolation);
    const cssPath = resolve(output, stylesheet.fileName);
    await writeFile(cssPath, (await readFile(cssPath, 'utf8')) + '\nhtml{overscroll-behavior-y:contain}html[data-preview-paused] *,html[data-preview-paused] *::before,html[data-preview-paused] *::after{animation-play-state:paused!important}\n');
    const revision = data => createHash('sha256').update(data).digest('hex').slice(0, 12);
    const rendererRevision = revision(await readFile(resolve(output, 'preview.js')));
    await writeFile(resolve(output, 'index.html'), `<!doctype html><html lang="ko" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta http-equiv="Content-Security-Policy" content="${policy}"><title>RESERVE 서비스 미리보기</title><link rel="stylesheet" href="./${stylesheet.fileName}"><script defer src="./isolation.js?v=${revision(isolation)}" data-renderer="./preview.js?v=${rendererRevision}"></script></head><body><div id="root"></div></body></html>`);
    return files;
}
