import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(new URL('../../frontend/package.json', import.meta.url));
const yaml = require('js-yaml');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const posix = value => value.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_, drive) => '/' + drive.toLowerCase());

test('root configuration moves preserve named volumes, runtime mounts and explicit Redis projects', () => {
    const profiles = ['blue', 'green', 'mysql', 'redis', 'local-redis', 'monitoring', 'monitoring-email', 'observability', 'alloy'];
    for (const profile of profiles) {
        assert.equal(fs.existsSync(path.join(root, 'docker-compose-' + profile + '.yml')), false);
        assert.ok(yaml.load(read('infra/compose/docker-compose-' + profile + '.yml')).services);
    }
    assert.deepEqual(Object.keys(yaml.load(read('infra/compose/docker-compose-mysql.yml')).volumes), ['mysql-data']);
    assert.deepEqual(Object.keys(yaml.load(read('infra/compose/docker-compose-monitoring.yml')).volumes),
        ['grafana-data', 'loki-data', 'promtail-positions']);
    assert.equal(yaml.load(read('infra/compose/docker-compose-redis.yml')).name, 'reserve-redis');
    assert.equal(yaml.load(read('infra/compose/docker-compose-local-redis.yml')).name, 'reserve-local-redis');
    const cd = yaml.load(read('.github/workflows/CD.yml'));
    const transfer = cd.jobs['deploy-backend'].steps.find(step => step.name === 'Deploy docker-compose files to EC2');
    assert.equal(transfer.with.strip_components, 2);
    assert.equal(transfer.with.target, '/home/ubuntu/');
    assert.equal(transfer.with.source, 'infra/compose/docker-compose-blue.yml,infra/compose/docker-compose-green.yml');
    assert.match(cd.jobs['deploy-backend'].steps.find(step => step.name === 'Docker compose up (target)').with.script,
        /docker compose -f \/home\/ubuntu\/docker-compose-/);
});

test('Compose wrapper keeps project directory, environment and Alloy path when called outside the repository', t => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'reserve-compose-'));
    t.after(() => {
        assert.equal(path.dirname(fixture), os.tmpdir());
        assert.ok(path.basename(fixture).startsWith('reserve-compose-'));
        fs.rmSync(fixture, { recursive: true, force: true });
    });
    const bin = path.join(fixture, 'bin'); fs.mkdirSync(bin);
    const trace = path.join(fixture, 'trace');
    fs.writeFileSync(path.join(bin, 'docker'), '#!/usr/bin/env bash\nprintf "%s\\0" "$@" "$COMPOSE_PROJECT_NAME" "$RESERVE_ALLOY_CONFIG_PATH" > "$TRACE"\n',
        { mode: 0o755 });
    const result = spawnSync(process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash',
        ['-c', 'export PATH="$MOCK_BIN:$PATH"; bash "$WRAPPER" mysql config'], {
            cwd: fixture, encoding: 'utf8', timeout: 5000,
            env: { ...process.env, MOCK_BIN: posix(bin), TRACE: posix(trace), WRAPPER: posix(path.join(root, 'scripts/compose.sh')),
                COMPOSE_PROJECT_NAME: 'preserved-project', RESERVE_ALLOY_CONFIG_PATH: '' },
        });
    assert.equal(result.status, 0, result.stderr);
    const args = fs.readFileSync(trace, 'utf8').split('\0').filter(Boolean);
    const expectedRoot = posix(path.resolve(root));
    assert.equal(args[0], 'compose');
    assert.equal(args[args.indexOf('--project-directory') + 1], expectedRoot);
    assert.equal(args[args.indexOf('-f') + 1], expectedRoot + '/infra/compose/docker-compose-mysql.yml');
    assert.deepEqual(args.slice(-2), ['preserved-project', expectedRoot + '/infra/logging/alloy-config.alloy']);
    assert.equal(args.includes('-p'), false);
});

test('monitoring overlays cannot be launched as independent projects', () => {
    for (const overlay of ['monitoring-email', 'observability', 'alloy']) {
        const result = spawnSync(process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash',
            [posix(path.join(root, 'scripts/compose.sh')), overlay, 'up', '-d'], { encoding: 'utf8', timeout: 5000 });
        assert.equal(result.status, 2);
        assert.match(result.stderr, /require the monitoring profile/);
    }
});
