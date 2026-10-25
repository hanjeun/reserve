import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
const run = promisify(execFile);
const docker = (...args) => run('docker', ['--context', 'default', ...args], { timeout: 120_000, maxBuffer: 512 * 1024 });

test('real nginx applies the same CSP size and shared rate limits through both API aliases',
    { skip: process.env.RESERVE_NGINX_ALIAS_TEST !== '1', timeout: 180_000 }, async () => {
    const endpoint = (await docker('context', 'inspect', 'default', '--format', '{{.Endpoints.docker.Host}}')).stdout.trim();
    assert.match(endpoint, /^(?:unix:\/\/\/|npipe:\/\/\/\/\.\/pipe\/)/);
    const source = await readFile(new URL('../../nginx/default.conf', import.meta.url), 'utf8');
    const legacy = source.match(/location = \/api\/csp-reports \{([\s\S]*?)\n {4}\}/)?.[0];
    const versioned = source.match(/location = \/api\/v1\/csp-reports \{[^\n]+\}/)?.[0];
    assert.ok(legacy && versioned);
    const directory = await mkdtemp(join(tmpdir(), 'reserve-nginx-alias-'));
    const config = join(directory, 'nginx.conf');
    const owner = randomUUID(); const name = 'reserve-nginx-alias-' + owner.slice(0, 8);
    const image = 'nginx:alpine'; let imageWasPresent = true;
    await docker('image', 'inspect', image).catch(() => { imageWasPresent = false; });
    let id;
    try {
        const collector = legacy.replace('include /etc/nginx/conf.d/service-env.inc;', 'set $service_url 127.0.0.1:8081;');
        await writeFile(config, 'events {}\nhttp { access_log off; error_log /dev/stderr crit; limit_req_zone $binary_remote_addr zone=csp_zone:1m rate=2r/s;'
            + 'server { listen 8081; add_header X-Collector-Path $uri always; location / { return 204; } }'
            + 'server { listen 8080; location = /ready { return 204; } ' + versioned + collector
            + 'location ^~ /api/ { return 418; } } }');
        id = (await docker('run', '--detach', '--name', name, '--label', 'kr.it.reserve.test-owner=' + owner,
            '--memory=128m', '--memory-swap=128m', '--pids-limit=64', '--cpus=0.5', '--publish', '127.0.0.1::8080',
            '--mount', 'type=bind,source=' + config + ',target=/etc/nginx/nginx.conf,readonly', image,
            'nginx', '-g', 'daemon off;')).stdout.trim();
        assert.match(id, /^[a-f0-9]{64}$/);
        const port = (await docker('port', id, '8080/tcp')).stdout.trim(); assert.match(port, /^127\.0\.0\.1:\d+$/);
        const base = 'http://' + port;
        for (let attempt = 0; ; attempt++) {
            try { if ((await fetch(base + '/ready')).status === 204) break; } catch {}
            if (attempt > 80) throw new Error('Owned Nginx fixture did not become ready');
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        const paths = ['/api/csp-reports', '/api/v1/csp-reports'];
        for (const path of paths) {
            const small = await fetch(base + path, { method: 'POST', body: 'x'.repeat(31 * 1024) });
            assert.equal(small.status, 204); assert.equal(small.headers.get('x-collector-path'), '/api/csp-reports');
            const large = await fetch(base + path, { method: 'POST', body: 'x'.repeat(33 * 1024) });
            assert.equal(large.status, 413);
        }
        const burst = await Promise.all(Array.from({ length: 24 }, (_, i) => fetch(base + paths[i % 2], { method: 'POST', body: '{}' })));
        for (let i = 0; i < 2; i++) assert.ok(burst.some((response, index) => index % 2 === i && response.status === 429));
        console.log('CSP aliases: both 31KiB accepted, both 33KiB rejected, shared burst rejects both aliases');
    } finally {
        if (id) {
            const label = (await docker('inspect', '--format', '{{ index .Config.Labels "kr.it.reserve.test-owner" }}', id)).stdout.trim();
            assert.equal(label, owner); await docker('rm', '--force', '--volumes', id);
        }
        const target = await realpath(directory); const parent = await realpath(tmpdir());
        assert.ok(target.startsWith(parent + sep) && target.startsWith(resolve(parent, 'reserve-nginx-alias-')));
        await rm(target, { recursive: true });
        if (!imageWasPresent) {
            const users = (await docker('ps', '--all', '--quiet', '--filter', 'ancestor=' + image)).stdout.trim();
            if (!users) await docker('image', 'rm', image);
        }
    }
});
