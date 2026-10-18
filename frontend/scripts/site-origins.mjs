/** HTML, robots and client SEO receive the same build-time application origin. */
export function siteOrigins({ appOrigin = 'https://reserve.it.kr' } = {}) {
    const url = new URL(appOrigin);
    if (url.protocol !== 'https:' || url.pathname !== '/' || url.username || url.password || url.search || url.hash) throw new Error('Application build origin must be an HTTPS origin');
    const origin = url.origin;
    return {
        name: 'reserve-site-origins',
        transformIndexHtml: html => html.replaceAll('https://reserve.it.kr', origin),
        generateBundle(_, bundle) {
            for (const asset of Object.values(bundle)) {
                if (asset.type === 'asset' && asset.fileName === 'robots.txt') asset.source = String(asset.source).replaceAll('https://reserve.it.kr', origin);
            }
        },
        // Vite copies public/ after generateBundle; transform the final robots without editing source.
        async writeBundle(options) {
            const { readFile, writeFile } = await import('node:fs/promises');
            const { resolve } = await import('node:path');
            const path = resolve(options.dir || 'dist', 'robots.txt');
            const text = await readFile(path, 'utf8');
            await writeFile(path, text.replaceAll('https://reserve.it.kr', origin));
        },
    };
}
