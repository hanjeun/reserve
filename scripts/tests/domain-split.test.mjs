import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rmdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { domainSplitHttpNginx, domainSplitNginx } from '../prepare-domain-split.mjs';

const run = promisify(execFile);
const script = fileURLToPath(new URL('../prepare-domain-split.mjs', import.meta.url));
const installed = await readFile(new URL('../../nginx/default.conf', import.meta.url), 'utf8');

test('HTTP bootstrap preserves the installed hosts and exposes only the app challenge', () => {
    const source = `${installed.trimEnd()}\n# installed configuration reviewed for this transition\n`;
    const candidate = domainSplitHttpNginx(source);
    assert.ok(candidate.startsWith(source.trimEnd()));
    const app = candidate.slice(source.trimEnd().length);
    assert.match(app, /server_name app\.reserve\.it\.kr;/);
    assert.match(app, /location \^~ \/\.well-known\/acme-challenge\//);
    assert.match(app, /root \/usr\/share\/nginx\/html\/acme;/);
    assert.match(app, /location \/ \{ return 404; \}/);
    assert.doesNotMatch(app, /listen 443|ssl_certificate|proxy_pass/);
});

test('the full candidate retains legacy callbacks and rejects an already bootstrapped input', () => {
    const candidate = domainSplitNginx(installed);
    assert.match(candidate, /ssl_certificate \/etc\/letsencrypt\/live\/app\.reserve\.it\.kr\/fullchain\.pem;/);
    assert.match(candidate, /ssl_certificate \/etc\/letsencrypt\/live\/reserve\.it\.kr\/fullchain\.pem;/);
    assert.equal(candidate.match(/location \/oauth2\/authorization\//g)?.length, 2);
    assert.equal(candidate.match(/location \/login\/oauth2\//g)?.length, 2);
    assert.match(candidate, /location ~ \^\/\(signup\/social\|oauth2\/callback\)\/\?\$ \{ try_files/);
    assert.match(candidate, /location ~ \^\/login\/\?\$ \{[^}]+\}[\s\S]*?return 302 https:\/\/app\.reserve\.it\.kr\/login;/);
    assert.match(candidate, /location ~ \^\/drafts\/transfer\/\?\$ \{[^}]+\}[\s\S]*?return 302 https:\/\/app\.reserve\.it\.kr\/my-stores;/);
    assert.match(candidate, /root \/usr\/share\/nginx\/html\/legacy-domain\.current;/);
    const bootstrap = domainSplitHttpNginx(installed);
    assert.throws(() => domainSplitHttpNginx(bootstrap), /already configured/);
    assert.throws(() => domainSplitNginx(bootstrap), /pre-bootstrap/);
});

test('CLI uses a reviewed source without replacing it, including on invalid arguments', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'reserve-domain-config-'));
    const source = join(directory, 'before-app.conf');
    const output = join(directory, 'app-http.conf');
    const contents = `${installed.trimEnd()}\n# actual installed configuration copy\n`;
    try {
        await writeFile(source, contents);
        await run(process.execPath, [script, '--source', source, '--http-only', '--output', output]);
        assert.ok((await readFile(output, 'utf8')).startsWith(contents.trimEnd()));
        await assert.rejects(run(process.execPath, [script, '--source', source, '--output', source]), /separate paths/);
        await assert.rejects(run(process.execPath, [script, '--source', '--http-only', '--output', output]), /reviewed configuration path/);
        await assert.rejects(run(process.execPath, [script, '--output', '--http-only']), /Pass --output/);
        assert.equal(await readFile(source, 'utf8'), contents);
    } finally {
        for (const path of [source, output]) await unlink(path).catch(error => { if (error.code !== 'ENOENT') throw error; });
        await rmdir(directory);
    }
});

test('only the marketing service preview accepts same-origin framing', () => {
    const candidate = domainSplitNginx(installed);
    const marketing = candidate.split(/(?=^server\s*\{)/m).find(part =>
        /listen 443 ssl/.test(part) && part.includes('root /usr/share/nginx/html/marketing/current;'));
    const preview = marketing.match(/location \^~ \/service-preview\/ \{([^{}]+)\}/)?.[1];
    assert.ok(preview);
    assert.equal(candidate.match(/X-Frame-Options "SAMEORIGIN"/g)?.length, 1);
    assert.match(preview, /X-Frame-Options "SAMEORIGIN" always;/);
    assert.match(preview, /Content-Security-Policy "default-src 'none';[^"\n]*connect-src 'none';[^"\n]*form-action 'none'; frame-ancestors 'self'" always;/);
    assert.match(preview, /Strict-Transport-Security "max-age=31536000; includeSubDomains" always;/);
    assert.match(preview, /X-Content-Type-Options "nosniff" always;/);
    assert.match(preview, /try_files \$uri \$uri\/ =404;/);
    assert.doesNotMatch(preview, /proxy_pass|X-Frame-Options "DENY"/);
    assert.match(marketing, /X-Frame-Options "DENY" always;/);
    assert.match(marketing, /frame-ancestors 'none'/);
});

test('CSP aliases share the exact collector before generic API routing on both hosts', () => {
    for (const input of [installed, installed.replace(/ {4}# 내부 재매핑[^\n]*\n {4}location = \/api\/v1\/csp-reports \{[^\n]*\n/, '')]) {
        const candidate = domainSplitNginx(input);
        const https = candidate.split(/(?=^server\s*\{)/m).filter(part => /listen 443 ssl/.test(part)
            && /server_name (?:app\.reserve\.it\.kr|reserve\.it\.kr www\.reserve\.it\.kr);/.test(part));
        assert.equal(https.length, 2);
        for (const host of https) {
            assert.match(host, /location = \/api\/v1\/csp-reports \{ rewrite \^ \/api\/csp-reports last; \}/);
            const legacy = host.slice(host.indexOf('location = /api/csp-reports {'), host.indexOf('}', host.indexOf('location = /api/csp-reports {')));
            assert.match(legacy, /client_max_body_size 32k;/);
            assert.match(legacy, /limit_req zone=csp_zone burst=10 nodelay;/);
            assert.ok(host.indexOf('location = /api/csp-reports {') < host.indexOf('location ^~ /api/ {'));
        }
    }
});
