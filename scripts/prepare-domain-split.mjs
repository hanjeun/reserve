import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Keeps the current app proxy/security policy; emits a candidate, never installs/reloads it. */
function block(source, marker) {
    const start = source.indexOf(marker);
    if (start < 0) throw new Error(`Missing nginx contract: ${marker}`);
    const opening = source.indexOf('{', start);
    let depth = 0, quote = '', comment = false;
    for (let at = opening; at < source.length; at++) {
        const char = source[at];
        if (comment) { if (char === '\n') comment = false; continue; }
        if (quote) { if (char === '\\') at++; else if (char === quote) quote = ''; continue; }
        if (char === '#') { comment = true; continue; }
        if (char === '"' || char === "'") { quote = char; continue; }
        if (char === '{') depth++;
        if (char === '}' && --depth === 0) return source.slice(start, at + 1);
    }
    throw new Error(`Unclosed nginx contract: ${marker}`);
}
const headers = `add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;`;

/** Bootstrap HTTP-01 before the new host has a certificate. Existing hosts stay intact. */
export function domainSplitHttpNginx(source) {
    if (/server_name\s+app\.reserve\.it\.kr(?:\s|;)/.test(source)) throw new Error('The app host is already configured; review the installed configuration instead');
    const acme = block(source, 'location ^~ /.well-known/acme-challenge/ {');
    return `${source.trimEnd()}

# App certificate bootstrap. Replace with the full candidate after certificate issuance.
server {
    listen 80; listen [::]:80;
    server_name app.reserve.it.kr;
    access_log /var/log/nginx/access.log reserve_timing;
    ${acme}
    location / { return 404; }
}
`;
}
export function domainSplitNginx(source) {
    if (/server_name\s+app\.reserve\.it\.kr(?:\s|;)/.test(source)) throw new Error('Use the preserved pre-bootstrap configuration; the app host is already configured');
    const parts = source.split(/(?=^server\s*\{)/m);
    if (parts.filter(part => /server_name reserve\.it\.kr www\.reserve\.it\.kr;/.test(part)).length !== 2) throw new Error('Expected current HTTP and HTTPS application hosts');
    const app = parts.map((part, index) => index === 0 || /server_name reserve\.it\.kr www\.reserve\.it\.kr;/.test(part)
        ? part.replaceAll('https://reserve.it.kr', 'https://app.reserve.it.kr').replaceAll('server_name reserve.it.kr www.reserve.it.kr;', 'server_name app.reserve.it.kr;')
            .replaceAll('/live/reserve.it.kr/', '/live/app.reserve.it.kr/') : part).join('');
    const api = block(source, 'location ^~ /api/ {');
    const oauth = block(source, 'location /oauth2/authorization/ {');
    const callback = block(source, 'location /login/oauth2/ {');
    const csp = source.match(/add_header Content-Security-Policy-Report-Only "[^\n]+;[\r]?/);
    if (!csp) throw new Error('Current app CSP policy is required for legacy draft recovery');
    return `${app}
map $args $reserve_legacy_home_selection { default 0; ~(^|&)region(=|&|$) 1; }
# Domain split candidate. Keep the legacy app release at html/legacy-domain.current during draft recovery.
server {
    listen 80; listen [::]:80;
    server_name reserve.it.kr www.reserve.it.kr;
    location ^~ /.well-known/acme-challenge/ { root /usr/share/nginx/html/acme; try_files $uri =404; }
    location / { return 301 https://reserve.it.kr$request_uri; }
}
server {
    listen 443 ssl; listen [::]:443 ssl;
    server_name reserve.it.kr www.reserve.it.kr;
    ssl_certificate /etc/letsencrypt/live/reserve.it.kr/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/reserve.it.kr/privkey.pem;
    access_log /var/log/nginx/access.log reserve_timing;
    root /usr/share/nginx/html/marketing/current;
    index index.html;
    client_max_body_size 20M;
    ${headers}
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'self'" always;
    add_header Cache-Control "no-cache";
    ${api}
    ${oauth}
    ${callback}
    # In-flight OAuth and account-scoped local draft export stay on the legacy origin.
    location ~ ^/(drafts/transfer|login|signup/social|oauth2/callback)/?$ { try_files /does-not-exist @legacy_spa; }
    location @legacy_spa {
        root /usr/share/nginx/html/legacy-domain.current;
        ${headers}
        ${csp[0]}
        add_header Cache-Control "no-store";
        add_header X-Robots-Tag "noindex, nofollow" always;
        try_files /index.html =404;
    }
    location ^~ /assets/ {
        root /usr/share/nginx/html/legacy-domain.current;
        ${headers}
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files $uri =404;
    }
    location ^~ /images/ { root /usr/share/nginx/html/legacy-domain.current; try_files $uri =404; }
    location ^~ /icons/ { root /usr/share/nginx/html/legacy-domain.current; try_files $uri =404; }
    # The browser preserves a QR fragment across this 302. Query choices keep their exact names.
    location ~ ^/(stores|store|waiting|benefits|feed|my-page|my-stores|my-favorites|my-reservations|business|admin|messages|payment|search|signup|forgot-password|terms|privacy|content-sources|operation-guide|guide)(/|$) {
        if ($request_method !~ ^(GET|HEAD)$) { return 405; }
        return 302 https://app.reserve.it.kr$request_uri;
    }
    location = / {
        if ($reserve_legacy_home_selection = 1) { return 302 https://app.reserve.it.kr/$is_args$args; }
        try_files /index.html =404;
    }
    location / {
        ${headers}
        add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'self'" always;
        add_header Cache-Control "no-cache";
        try_files $uri =404;
    }
}
`;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const root = fileURLToPath(new URL('..', import.meta.url));
    const at = process.argv.indexOf('--output');
    if (at < 0 || !process.argv[at + 1] || process.argv[at + 1].startsWith('--')) throw new Error('Pass --output for a reviewable candidate; no system path is changed automatically');
    const sourceAt = process.argv.indexOf('--source');
    if (sourceAt >= 0 && (!process.argv[sourceAt + 1] || process.argv[sourceAt + 1].startsWith('--'))) throw new Error('Pass a reviewed configuration path after --source');
    const sourcePath = sourceAt >= 0 ? resolve(process.argv[sourceAt + 1]) : resolve(root, 'nginx/default.conf');
    const outputPath = resolve(process.argv[at + 1]);
    const samePath = process.platform === 'win32' ? sourcePath.toLowerCase() === outputPath.toLowerCase() : sourcePath === outputPath;
    if (sourceAt >= 0 && samePath) throw new Error('Keep the reviewed source and candidate at separate paths');
    const source = await readFile(sourcePath, 'utf8');
    const generate = process.argv.includes('--http-only') ? domainSplitHttpNginx : domainSplitNginx;
    await writeFile(outputPath, generate(source));
}
