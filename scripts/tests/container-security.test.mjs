import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(new URL('../../frontend/package.json', import.meta.url));
const yaml = require('js-yaml');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
const posix = value => value.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`);
const sha = 'a'.repeat(40);

test('every image is scanned before registry credentials and the same image is pushed only on main', () => {
  const workflow = yaml.load(read('.github/workflows/CICD.yml'));
  const validation = workflow.jobs['test-frontend'].steps;
  const install = validation.findIndex(s => s.name === 'Install dependencies');
  assert.ok(install >= 0 && install < validation.findIndex(s => s.name === 'Validate operations scripts'));
  const steps = workflow.jobs['build-backend'].steps;
  const build = steps.findIndex(s => s.name === 'Build Docker image');
  const scan = steps.findIndex(s => s.name === 'Scan backend image vulnerabilities');
  const login = steps.findIndex(s => s.name === 'Login to DockerHub');
  const push = steps.findIndex(s => s.name === 'Push Docker image');
  assert.ok(build >= 0 && build < scan && scan < login && login < push);
  for (const index of [build, scan]) {
    assert.equal(steps[index].if, undefined);
    assert.equal(steps[index]['continue-on-error'], undefined);
    assert.doesNotMatch(JSON.stringify(steps[index]), /secrets\./);
  }
  assert.match(steps[build].run, /docker build --pull --no-cache/);
  assert.match(steps[scan].run, /scan-container-security\.sh "reserve-security:\$COMMIT_SHA"/);
  assert.match(steps[push].run, /docker tag "reserve-security:\$COMMIT_SHA"/);
  assert.match(steps[push].run, /docker tag "reserve-security:\$COMMIT_SHA" "\$DOCKERHUB_USERNAME\/reserve:latest"/);
  for (const index of [login, push]) assert.equal(steps[index].if, "github.ref == 'refs/heads/main' && github.event_name == 'push'");
});

test('both app containers remove kernel capabilities and cannot gain privileges', () => {
  for (const color of ['blue', 'green']) {
    const service = yaml.load(read(`docker-compose-${color}.yml`)).services[color];
    assert.deepEqual(service.cap_drop, ['ALL']);
    assert.deepEqual(service.security_opt, ['no-new-privileges:true']);
    assert.equal(service.privileged, undefined);
    assert.equal(service.network_mode, undefined);
  }
  assert.match(read('backend/Dockerfile'), /apk upgrade --no-cache/);
  assert.match(read('backend/Dockerfile'), /USER appuser/);
});

test('runtime privilege failures stop deployment before health checks or cutover', t => {
  const workflow = yaml.load(read('.github/workflows/CICD.yml'));
  const steps = workflow.jobs['deploy-backend'].steps;
  const health = steps.find(s => s.name === 'Health check (new server)');
  assert.equal(health['continue-on-error'], undefined);
  assert.ok(steps.indexOf(health) < steps.findIndex(s => s.name === 'Cut over frontend and backend'));
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'reserve-hardening-test-'));
  t.after(() => {
    assert.equal(path.dirname(temp), os.tmpdir());
    assert.ok(path.basename(temp).startsWith('reserve-hardening-test-'));
    fs.rmSync(temp, { recursive: true, force: true });
  });
  const bin = path.join(temp, 'bin');
  fs.mkdirSync(bin);
  const trace = path.join(temp, 'trace');
  fs.writeFileSync(path.join(bin, 'sudo'), [
    '#!/usr/bin/env bash', 'set -eu', '[[ "${MOCK_INSPECT_ERROR:-0}" == 0 ]] || exit 4',
    'case "$*" in',
    '  *HostConfig.CapDrop*) printf "%s\\n" "$MOCK_CAPS" ;;',
    '  *HostConfig.SecurityOpt*) printf "%s\\n" "$MOCK_OPTIONS" ;;',
    '  *) exit 91 ;;', 'esac', '',
  ].join('\n'), { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'curl'), '#!/usr/bin/env bash\necho health >> "$TRACE"\nprintf 200\n', { mode: 0o755 });
  const script = health.with.script.replaceAll('${{ env.TARGET_UPSTREAM }}', 'blue')
    .replaceAll('${{ env.STOPPED_PORT }}', '8080');
  const run = overrides => {
    fs.writeFileSync(trace, '');
    const result = spawnSync(bash, ['-c', 'export PATH="$MOCK_BIN:$PATH";\n' + script], {
      encoding: 'utf8', timeout: 5000,
      env: { ...process.env, MOCK_BIN: posix(bin), TRACE: posix(trace),
        MOCK_CAPS: 'ALL', MOCK_OPTIONS: 'no-new-privileges:true', MOCK_INSPECT_ERROR: '0', ...overrides },
    });
    assert.ifError(result.error);
    return { ...result, trace: fs.readFileSync(trace, 'utf8') };
  };
  for (const overrides of [{ MOCK_CAPS: '' }, { MOCK_CAPS: 'CHOWN' },
    { MOCK_OPTIONS: '' }, { MOCK_OPTIONS: 'no-new-privileges:false' }, { MOCK_INSPECT_ERROR: '1' }]) {
    const result = run(overrides);
    assert.notEqual(result.status, 0, result.stderr);
    assert.equal(result.trace, '');
  }
  for (const options of ['no-new-privileges', 'no-new-privileges:true']) {
    const result = run({ MOCK_OPTIONS: options });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.trace, 'health\n');
  }
});

test('scanner rejects malformed image names and propagates inspect, download, checksum and scan failures', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'reserve-container-test-'));
  t.after(() => {
    assert.equal(path.dirname(temp), os.tmpdir());
    assert.ok(path.basename(temp).startsWith('reserve-container-test-'));
    fs.rmSync(temp, { recursive: true, force: true });
  });
  const bin = path.join(temp, 'bin');
  fs.mkdirSync(bin);
  const trace = path.join(temp, 'trace');
  const write = (name, body) => fs.writeFileSync(path.join(bin, name), '#!/usr/bin/env bash\nset -eu\n' + body, { mode: 0o755 });
  write('uname', 'if [[ "$1" == -s ]]; then echo Linux; else echo x86_64; fi\n');
  write('docker', 'echo inspect >> "$TRACE"\n[[ "${FAIL_AT:-}" != inspect ]] || exit 4\nprintf "sha256:%064d\\n" 0\n');
  write('curl', 'echo download >> "$TRACE"\n[[ "${FAIL_AT:-}" != download ]] || exit 5\nwhile [[ $# -gt 0 ]]; do if [[ "$1" == -o ]]; then touch "$2"; break; fi; shift; done\n');
  write('sha256sum', 'echo checksum >> "$TRACE"\ncat >/dev/null\n[[ "${FAIL_AT:-}" != checksum ]] || exit 6\n');
  write('tar', `echo extract >> "$TRACE"
while [[ $# -gt 0 ]]; do if [[ "$1" == -C ]]; then target="$2"; break; fi; shift; done
cat > "$target/trivy" <<'SCANNER'
#!/usr/bin/env bash
set -eu
echo scan >> "$TRACE"
printf '%s\\n' "$@" >> "$TRACE"
[[ "\${FAIL_AT:-}" != scan ]] || exit 7
SCANNER
chmod +x "$target/trivy"
`);
  const run = (image, failure = '') => {
    fs.writeFileSync(trace, '');
    const result = spawnSync(bash, ['-c', 'export PATH="$MOCK_BIN:$PATH"; exec bash "$SCANNER_SCRIPT" "$IMAGE_NAME"'], {
      cwd: root, encoding: 'utf8', timeout: 20000,
      env: { ...process.env, MOCK_BIN: posix(bin), SCANNER_SCRIPT: posix(path.join(root, 'scripts/scan-container-security.sh')),
        IMAGE_NAME: image, TRACE: posix(trace), FAIL_AT: failure },
    });
    assert.equal(result.error, undefined, result.error?.message);
    return { ...result, trace: fs.readFileSync(trace, 'utf8') };
  };
  for (const name of ['remote/image:latest', 'reserve-security:short', `reserve-security:${sha};whoami`]) {
    const result = run(name);
    assert.notEqual(result.status, 0);
    assert.equal(result.trace, '');
  }
  for (const [failure, next] of [['inspect', 'download'], ['download', 'checksum'], ['checksum', 'extract'], ['scan', null]]) {
    const result = run(`reserve-security:${sha}`, failure);
    assert.notEqual(result.status, 0, result.stderr);
    if (next) assert.equal(result.trace.includes(next), false);
  }
  const success = run(`reserve-security:${sha}`);
  assert.equal(success.status, 0, success.stderr);
  for (const flag of ['--image-src\ndocker', '--scanners\nvuln', '--pkg-types\nos,library',
    '--severity\nHIGH,CRITICAL', '--exit-code\n1', '--exit-on-eol\n1', '--disable-telemetry', '--offline-scan']) {
    assert.ok(success.trace.includes(flag), flag);
  }
  assert.doesNotMatch(success.trace, /--ignore-unfixed|--skip-db-update|--server/);
  assert.match(success.trace, /sha256:0{64}/);
});
