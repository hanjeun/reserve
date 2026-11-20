import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { bundleNotices } from '../frontend/scripts/bundle-notices.mjs';
import { previewAssetBase } from './service-preview/navigation.js';

const root = fileURLToPath(new URL('.', import.meta.url)), frontend = resolve(root, '../frontend');
const previewOutput = resolve(root, 'dist/service-preview');
const revision = data => createHash('sha256').update(data).digest('hex').slice(0, 12);

async function buildPreviewDocument({ build, react, fontSource, isolationUrl, business }) {
    const base = previewAssetBase(business ? 'business' : 'explore');
    const output = resolve(root, 'dist', '.' + base);
    let fontStyles;
    const cwdBefore = process.cwd(); let result;
    try {
        process.chdir(frontend);
        result = await build({ configFile: false, root: frontend, envDir: false, publicDir: false, base,
            resolve: { alias: { './KakaoMap': resolve(root, 'service-preview/PreviewMap.jsx') },
                dedupe: ['react', 'react-dom', 'antd', 'react-router-dom', '@tanstack/react-query', 'axios', 'zustand'] },
            define: { 'import.meta.env.VITE_API_BASE_URL': '""', 'import.meta.env.VITE_SENTRY_DSN': '""',
                __RESERVE_BUSINESS_PREVIEW__: JSON.stringify(business) },
            plugins: [react(), bundleNotices()],
            css: { postcss: { plugins: [{ postcssPlugin: 'reserve-preview-local-fonts', Once(css) {
                css.walkAtRules('font-face', rule => {
                    const family = rule.nodes?.find(node => node.prop === 'font-family')?.value;
                    if (family?.includes('Pretendard')) {
                        if (!fontStyles) {
                            const font = rule.clone();
                            font.walkDecls('src', declaration => { declaration.value = fontSource; });
                            font.walkDecls('unicode-range', declaration => declaration.remove());
                            fontStyles = font.toString();
                        }
                        // 큰 글꼴은 첫 화면이 그려진 뒤에 받는다.
                        rule.remove();
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
    if (!stylesheet || !fontStyles || !files.some(file => file.fileName === 'preview.js')) throw new Error('Service preview output is incomplete');
    const policy = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
    const cssPath = resolve(output, stylesheet.fileName);
    await writeFile(cssPath, (await readFile(cssPath, 'utf8')) + '\nhtml{overscroll-behavior-y:contain}html[data-preview-paused] *,html[data-preview-paused] *::before,html[data-preview-paused] *::after{animation-play-state:paused!important}\n');
    const rendererRevision = revision(await readFile(resolve(output, 'preview.js')));
    const fontFile = `assets/pretendard-${revision(fontStyles)}.css`;
    await writeFile(resolve(previewOutput, fontFile), fontStyles);
    await writeFile(resolve(output, 'index.html'), `<!doctype html><html lang="ko" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta http-equiv="Content-Security-Policy" content="${policy}"><title>RESERVE 서비스 미리보기</title><link rel="stylesheet" href="./${stylesheet.fileName}"><script defer src="${isolationUrl}" data-renderer="./preview.js?v=${rendererRevision}" data-preview-font="${previewAssetBase('explore')}${fontFile}"></script></head><body><div id="root"></div></body></html>`);
    return files;
}

export async function buildServicePreview() {
    const require = createRequire(resolve(frontend, 'package.json'));
    const { build } = await import(pathToFileURL(require.resolve('vite')).href);
    const { default: react } = await import(pathToFileURL(require.resolve('@vitejs/plugin-react')).href);
    const pretendard = await readFile(resolve(frontend, 'node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2'));
    const fontSource = `url(data:font/woff2;base64,${pretendard.toString('base64')}) format('woff2')`;
    const isolation = await readFile(resolve(root, 'service-preview/bootstrap.js'));
    const isolationUrl = `${previewAssetBase('explore')}isolation.js?v=${revision(isolation)}`;
    await mkdir(previewOutput, { recursive: true });
    await writeFile(resolve(previewOutput, 'isolation.js'), isolation);
    const common = { build, react, fontSource, isolationUrl };
    const customerFiles = await buildPreviewDocument({ ...common, business: false });
    const businessFiles = await buildPreviewDocument({ ...common, business: true });
    return [...customerFiles, ...businessFiles];
}
