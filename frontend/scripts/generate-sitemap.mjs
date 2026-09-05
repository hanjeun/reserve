import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const publicPages = [
    { path: '/', changefreq: 'weekly', priority: '1.0' },
    { path: '/stores', changefreq: 'daily', priority: '0.9' },
    { path: '/terms', changefreq: 'monthly', priority: '0.3' },
    { path: '/privacy', changefreq: 'monthly', priority: '0.3' },
];

const urls = publicPages.map(({ path, changefreq, priority }) => `  <url>
    <loc>https://reserve.it.kr${path}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`).join('\n');

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

const outputPath = fileURLToPath(new URL('../public/sitemap.xml', import.meta.url));
await writeFile(outputPath, sitemap, 'utf8');
