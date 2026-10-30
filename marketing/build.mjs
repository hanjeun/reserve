import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('.', import.meta.url));
const output = resolve(root, 'dist');
const frontendRequire = createRequire(resolve(root, '../frontend/package.json'));
const viteRequire = createRequire(frontendRequire.resolve('vite/package.json'));
const { build } = viteRequire('esbuild');
const postcss = frontendRequire('postcss');
const jsdomRequire = createRequire(frontendRequire.resolve('jsdom/package.json'));
const { parseFragment, serialize } = await import(pathToFileURL(jsdomRequire.resolve('parse5')).href);
const app = new URL(process.env.APP_PUBLIC_URL || 'https://app.reserve.it.kr');
const marketing = new URL(process.env.APP_MARKETING_URL || 'https://reserve.it.kr');
for (const url of [app, marketing]) if (url.protocol !== 'https:' || url.pathname !== '/' || url.username || url.password || url.search || url.hash) throw new Error('Build origins must be HTTPS origins');
for (const dir of ['icons', 'fonts', 'images']) await mkdir(resolve(output, dir), { recursive: true });
const bundler = { bundle: true, nodePaths: [resolve(root, '../frontend/node_modules')], jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}', '__RESERVE_APP_ORIGIN__': JSON.stringify(app.origin) }, logLevel: 'warning' };
const rendered = await build({ ...bundler, entryPoints: [resolve(root, 'src/render.jsx')], platform: 'node', format: 'cjs', write: false });
const pageModule = { exports: {} };
new Function('require', 'module', 'exports', rendered.outputFiles[0].text)(frontendRequire, pageModule, pageModule.exports);
const page = pageModule.exports.renderPage();
const styles = new Map();
const photos = new Map([
    ['https://images.unsplash.com/photo-1518611012118-696072aa579a?w=400&q=80', '/images/pilates.jpg'],
    ['https://images.unsplash.com/photo-1580618672591-eb180b1a973f?w=400&q=80', '/images/hair.jpg'],
]);
function staticMarkup(source, mobile = false) {
    const fragment = parseFragment(source);
    function visit(node) {
        if (node.tagName === 'style' || node.tagName === 'script') throw new Error('Marketing markup must use external styles and scripts');
        if (node.attrs) {
            const attr = name => node.attrs.find(a => a.name === name);
            const addClass = name => { const a = attr('class'); if (a) a.value += ` ${name}`; else node.attrs.push({ name: 'class', value: name }); };
            const style = attr('style');
            if (style) {
                const name = `m-${createHash('sha256').update(style.value).digest('hex').slice(0, 12)}`;
                styles.set(name, style.value); addClass(name);
                node.attrs = node.attrs.filter(a => a !== style);
            }
            const path = attr('data-app-path');
            if (path) {
                const url = new URL(path.value, app.origin);
                if (url.origin !== app.origin || !path.value.startsWith('/') || path.value.startsWith('//')) throw new Error('Invalid app navigation');
                node.tagName = node.nodeName = 'a';
                node.attrs = node.attrs.filter(a => a.name !== 'type' && a !== path);
                node.attrs.push({ name: 'href', value: url.href });
            }
            for (const a of node.attrs) {
                if (/^on/i.test(a.name)) throw new Error('Inline event handlers are not allowed');
                if (photos.has(a.value)) a.value = photos.get(a.value);
                if (a.name === 'src' && !a.value.startsWith('/')) throw new Error('Marketing media must be bundled locally');
                if (mobile && (a.name === 'id' || a.name === 'data-scroll-target' || a.name === 'name')) a.value = `mobile-${a.value}`;
            }
        }
        node.childNodes?.forEach(visit);
    }
    visit(fragment);
    return serialize(fragment);
}
const fragments = { HEADER: staticMarkup(page.header), DESKTOP: staticMarkup(page.desktop), MOBILE: staticMarkup(page.mobile, true), FOOTER: staticMarkup(page.footer) };
function sharedRules(container, selectors = /\.reserve-(?:card|btn)/) {
    const result = postcss.root();
    for (const node of container.nodes || []) {
        if (node.type === 'rule' && selectors.test(node.selector)) result.append(node.clone());
        else if (node.type === 'atrule' && node.nodes) {
            const children = sharedRules(node, selectors);
            if (children.nodes.length) result.append(node.clone({ nodes: children.nodes }));
        }
    }
    return result;
}
const componentCss = sharedRules(postcss.parse(await readFile(resolve(root, '../frontend/src/styles/global/components-and-forms.css'), 'utf8'))).toString();
const textLinkCss = await readFile(resolve(root, '../frontend/src/styles/global/text-links.css'), 'utf8');
const footerCss = sharedRules(postcss.parse(await readFile(resolve(root, '../frontend/src/styles/global/navigation-and-media.css'), 'utf8')),
    /\.footer-copyright|\.reserve-app-footer/).toString();
const socialCss = sharedRules(postcss.parse(await readFile(resolve(root, '../frontend/src/styles/global/interactions.css'), 'utf8')),
    /\.reserve-social(?=:|--velog)/).toString();
const storeCardCss = sharedRules(postcss.parse(await readFile(resolve(root, '../frontend/src/styles/global/feature-surfaces.css'), 'utf8')),
    /\.reserve-store-(?:card|identity-text)/).toString();
const iconTokens = await readFile(resolve(root, '../frontend/src/styles/tokens/icon-controls.css'), 'utf8');
const iconCss = sharedRules(postcss.parse(await readFile(resolve(root, '../frontend/src/styles/global/icons.css'), 'utf8')),
    /\.anticon\.reserve-ui-icon|\.reserve-favorite-button/).toString();
await writeFile(resolve(output, 'site.css'), [await readFile(resolve(root, 'site.css'), 'utf8'), page.css, componentCss, textLinkCss, footerCss, socialCss, storeCardCss, iconTokens, iconCss,
    ...[...styles].map(([name, value]) => `:root .${name}{${value}}`)].join('\n'));
await build({ ...bundler, entryPoints: [resolve(root, 'site.js')], platform: 'browser', target: ['es2022'], format: 'iife', minify: true, outfile: resolve(output, 'site.js') });
await copyFile(resolve(root, '../frontend/src/styles/theme.css'), resolve(output, 'theme.css'));
await copyFile(resolve(root, '../frontend/node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2'), resolve(output, 'fonts/PretendardVariable.woff2'));
await copyFile(resolve(root, '../frontend/node_modules/pretendard/dist/LICENSE.txt'), resolve(output, 'fonts/Pretendard-LICENSE.txt'));
await copyFile(resolve(root, '../frontend/public/fonts/SUITE-Variable.woff2'), resolve(output, 'fonts/SUITE-Variable.woff2'));
await copyFile(resolve(root, '../frontend/public/fonts/SUITE-LICENSE.txt'), resolve(output, 'fonts/SUITE-LICENSE.txt'));
for (const file of ['og-image.png', 'icons/favicon.svg', 'icons/R_logo.png']) await copyFile(resolve(root, '../frontend/public', file), resolve(output, file));
for (const file of ['pilates.jpg', 'hair.jpg']) await copyFile(resolve(root, 'images', file), resolve(output, 'images', file));
await copyFile(resolve(root, '../frontend/node_modules/hangul-js/LICENSE'), resolve(output, 'Hangul-js-LICENSE.txt'));
let html = (await readFile(resolve(root, 'index.html'), 'utf8')).replaceAll('https://app.reserve.it.kr', app.origin).replaceAll('https://reserve.it.kr', marketing.origin);
for (const file of ['theme.css', 'site.css', 'site.js']) {
    const revision = createHash('sha256').update(await readFile(resolve(output, file))).digest('hex').slice(0, 12);
    html = html.replace(`"/${file}"`, `"/${file}?v=${revision}"`);
}
for (const [name, markup] of Object.entries(fragments)) html = html.replace(`<!--MARKETING_${name}-->`, markup);
if (html.includes('<!--MARKETING_')) throw new Error('Marketing template is incomplete');
await writeFile(resolve(output, 'index.html'), html);
await writeFile(resolve(output, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /drafts/\nDisallow: /login\nDisallow: /oauth2/\nSitemap: ${marketing.origin}/sitemap.xml\n`);
await writeFile(resolve(output, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${marketing.origin}/</loc></url></urlset>\n`);
await writeFile(resolve(output, 'release-id.txt'), `${process.env.RELEASE_ID || 'local-candidate'}\n`);
