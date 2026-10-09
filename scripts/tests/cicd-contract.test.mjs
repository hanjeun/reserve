import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const read = path => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const require = createRequire(new URL('../../frontend/package.json', import.meta.url));
const workflow = require('js-yaml').load(read('.github/workflows/CICD.yml'));
const backend = workflow.jobs['build-backend'];
const frontend = workflow.jobs['build-frontend'];
const deployment = workflow.jobs['deploy-backend'];
const backendTests = workflow.jobs['test-backend'];
const frontendTests = workflow.jobs['test-frontend'];
const staging = workflow.jobs['stage-release'];
const detectionScript = read('scripts/detect-active-upstream.sh');
const step = (job, id) => job.steps.find(entry => entry.id === id);

const bashPath = value => process.platform === 'win32'
    ? value.replaceAll('\\', '/').replace(/^([a-z]):/i, (_match, drive) => `/${drive.toLowerCase()}`) : value;
const runDetection = overrides => {
    const parent = os.tmpdir();
    const fixture = fs.mkdtempSync(path.join(parent, 'reserve-upstream-test-'));
    const bin = path.join(fixture, 'bin');
    fs.mkdirSync(bin);
    const mocks = {
        'ssh-keyscan': 'printf "reserve.test ssh-ed25519 test-key\\n"',
        'ssh-keygen': 'printf "256 SHA256:fixture fixture (ED25519)\\n"',
        ssh: `printf 'called' > "$TASK_SSH_CALLED"
if [[ "$MOCK_REMOTE_FAILURE" != 0 ]]; then echo 'recovery guard rejected'; exit "$MOCK_REMOTE_FAILURE"; fi
if [[ "$MOCK_AMBIGUOUS" == true ]]; then printf 'DETECTED_UPSTREAM=blue\\nDETECTED_UPSTREAM=green\\n'; exit 0; fi
exec bash -se`,
        curl: `if [[ "$*" == *8080* ]]; then printf '%s' "$MOCK_BLUE"; else printf '%s' "$MOCK_GREEN"; fi`,
        sudo: `case "$*" in
  'docker exec nginxserver cat /etc/nginx/conf.d/service-env.inc') printf 'set $service_url blue;\\n' ;;
  'docker inspect --format '* ) printf 'fixture-image\\n' ;;
  *reserve.schema-compat*) printf '%s\\n' "$MOCK_SCHEMA" ;;
  *reserve.feature-compat*) printf '%s\\n' "$MOCK_FEATURE" ;;
  *) exit 91 ;;
esac`,
    };
    for (const [name, body] of Object.entries(mocks)) fs.writeFileSync(path.join(bin, name), `#!/usr/bin/env bash\n${body}\n`, { mode: 0o755 });
    const output = path.join(fixture, 'github-output');
    const called = path.join(fixture, 'ssh-called');
    fs.writeFileSync(output, '');
    try {
        const result = spawnSync(process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash',
            ['-c', 'export PATH="$TASK_MOCK_BIN:$PATH"; exec bash "$TASK_DETECTION_SCRIPT"'], {
                encoding: 'utf8', timeout: 15000,
                env: { ...process.env, TASK_MOCK_BIN: bashPath(bin),
                    TASK_DETECTION_SCRIPT: bashPath(fileURLToPath(new URL('../detect-active-upstream.sh', import.meta.url))),
                    GITHUB_OUTPUT: bashPath(output), TASK_SSH_CALLED: bashPath(called),
                    RESERVE_SERVER_IP: 'reserve.test', EC2_SSH_KEY: 'fixture-key', RESERVE_SSH_FINGERPRINT: 'SHA256:fixture',
                    MOCK_BLUE: '200', MOCK_GREEN: '000', MOCK_SCHEMA: 'v270-refund-v1', MOCK_FEATURE: 'waiting-signup-hidden-v2',
                    MOCK_REMOTE_FAILURE: '0', MOCK_AMBIGUOUS: 'false', ...overrides },
            });
        assert.ifError(result.error);
        return { ...result, output: fs.readFileSync(output, 'utf8'), sshCalled: fs.existsSync(called) };
    } finally {
        assert.equal(path.dirname(path.resolve(fixture)), path.resolve(parent));
        assert.ok(path.basename(fixture).startsWith('reserve-upstream-test-'));
        fs.rmSync(fixture, { recursive: true, force: true });
    }
};

test('upstream detection publishes a single GitHub output only after the real shell guards succeed', () => {
    const result = runDetection({});
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.equal(result.output, 'current_upstream=blue\n');
    assert.ok(result.sshCalled);
});

test('SSH failure propagates its exit code without leaving a partial EOF output', () => {
    const result = runDetection({ MOCK_REMOTE_FAILURE: '41' });
    assert.equal(result.status, 41);
    assert.equal(result.output, '');
});

for (const [description, overrides] of [
    ['wrong host fingerprint', { RESERVE_SSH_FINGERPRINT: 'SHA256:wrong' }],
    ['unsupported recovery features', { MOCK_FEATURE: 'waiting-signup-v1' }],
    ['unsupported refund schema', { MOCK_SCHEMA: 'old' }],
    ['unhealthy live upstream', { MOCK_BLUE: '503' }],
    ['ambiguous upstream marker', { MOCK_AMBIGUOUS: 'true' }],
]) test(`upstream detection refuses ${description} without publishing deployment output`, () => {
    const result = runDetection(overrides);
    assert.notEqual(result.status, 0);
    assert.equal(result.output, '');
    if (description === 'wrong host fingerprint') assert.equal(result.sshCalled, false);
});

test('production deployment requires the restricted app account and cannot fall back to root or DDL update', () => {
    for (const color of ['blue', 'green']) {
        const compose = require('js-yaml').load(read(`docker-compose-${color}.yml`));
        const environment = compose.services[color].environment;
        assert.ok(environment.includes('DB_USERNAME=reserve_app'));
        assert.ok(environment.includes('SPRING_JPA_HIBERNATE_DDL_AUTO=validate'));
        assert.ok(environment.includes('WAITING_CUSTOMER_RETENTION_NOTICE_PUBLISHED_AT=${WAITING_CUSTOMER_RETENTION_NOTICE_PUBLISHED_AT:-}'));
        assert.ok(environment.includes('DB_PASSWORD=${DB_APP_PASSWORD:?DB_APP_PASSWORD is required for deployment}'));
        assert.ok(!environment.some(value => /DB_USERNAME=.*root|DDL_AUTO=.*update|DB_PASSWORD.*\$\{DB_PASSWORD/.test(value)));
    }
    const launch = deployment.steps.find(entry => entry.name === 'Docker compose up (target)');
    assert.ok(launch);
    assert.equal(launch.env.DB_APP_PASSWORD, '${{ secrets.DB_APP_PASSWORD }}');
    assert.equal(launch.env.DB_PASSWORD, undefined);
    assert.ok(!launch.with.envs.split(',').includes('DB_PASSWORD'));
    const guard = ': "${DB_APP_PASSWORD:?DB_APP_PASSWORD is required for deployment}"';
    assert.ok(launch.with.script.includes(guard));
    assert.ok(launch.with.script.indexOf(guard) < launch.with.script.indexOf('sudo docker pull'));
});

test('CodeQL skips duplicate dev pushes without removing PR, main or scheduled security scans', () => {
    const scan = require('js-yaml').load(read('.github/workflows/codeql.yml'));
    assert.deepEqual(scan.on.push.branches, ['main']);
    assert.deepEqual(scan.on.pull_request.branches, ['main', 'dev']);
    assert.ok(scan.on.schedule.length > 0);
    assert.deepEqual(scan.jobs.analyze.strategy.matrix.include.map(entry => entry.language), ['java-kotlin', 'javascript-typescript']);
    assert.equal(scan.jobs.analyze['continue-on-error'], undefined);
});

test('PR labeling runs only for creation, reopening and title edits', () => {
    const labels = require('js-yaml').load(read('.github/workflows/pr-labels.yml'));
    assert.equal(labels.jobs.label.if, "github.event.pull_request.user.login != 'dependabot[bot]' && (github.event.action != 'edited' || github.event.changes.title != null)");
    assert.deepEqual(labels.on.pull_request.types, ['opened', 'edited', 'reopened']);
});

test('required checks remain present and deployment waits for both builds', () => {
    assert.ok(backend && frontend && deployment && backendTests && frontendTests);
    assert.equal(backendTests.if, undefined);
    assert.equal(frontendTests.if, undefined);
    assert.deepEqual(backend.needs, ['test-backend', 'build-frontend']);
    assert.equal(frontend.needs, 'test-frontend');
    assert.deepEqual(deployment.needs, ['build-backend', 'build-frontend', 'test-backend', 'test-frontend', 'stage-release']);
    assert.deepEqual(staging.needs, ['build-backend', 'build-frontend']);
    assert.equal(staging.if, deployment.if);
    assert.equal(staging.environment, undefined);
    assert.deepEqual(deployment.environment, { name: 'production', url: 'https://reserve.it.kr' });
    assert.ok(!deployment.steps.some(entry => /Create GitHub deployment|Mark deployment/.test(entry.name ?? '')));
    for (const job of [backend, frontend]) {
        assert.equal(job.if, '${{ always() && !cancelled() }}');
        assert.match(job.steps[0].run, /test "\$TEST_RESULT" = success/);
        assert.equal(job.steps[0]['continue-on-error'], undefined);
    }
    assert.match(backend.steps[0].run, /test "\$FRONTEND_RESULT" = success/);
    const shell = backend.steps.find(entry => entry.name === 'Download frontend HTML from this run');
    assert.match(shell.run, /GITHUB_RUN_ID/);
    assert.match(shell.run, /frontend-release-\$GITHUB_SHA/);
    assert.ok(backend.steps.indexOf(shell) < backend.steps.indexOf(step(backend, 'backend_package')));
    assert.match(deployment.if, /github\.ref == 'refs\/heads\/main'/);
    assert.match(deployment.if, /github\.event_name == 'push'/);
    assert.equal(workflow.concurrency['cancel-in-progress'], "${{ github.event_name == 'pull_request' }}");
});

test('backend tests are explicit, required, and run before packaging', () => {
    const tests = step(backendTests, 'backend_tests');
    const packaging = step(backend, 'backend_package');
    assert.ok(tests && packaging);
    assert.match(tests.run, /\.\/gradlew test --console=plain/);
    assert.match(packaging.run, /\.\/gradlew bootJar --console=plain/);
    assert.equal(step(backend, 'backend_tests'), undefined);
    assert.equal(tests['continue-on-error'], undefined);
    assert.doesNotMatch(tests.run + packaging.run, /-x\s+test|--exclude-task[=\s]+test/);
});

test('snapshot verification installs a scoped Git byte guard without changing the baseline', () => {
    const snapshot = frontendTests.steps.find(entry => entry.name === 'Verify immutable design-system snapshot');
    assert.equal(snapshot.run, './scripts/design-system-snapshot.ps1 -Stage Verify -InstallGitGuard');
    assert.match(read('.gitattributes'), /^docs\/design-system\/snapshots\/\*\* -text -eol$/m);
    assert.match(read('scripts/design-system-snapshot.ps1'), /rev-parse --git-path info\/attributes/);
    assert.match(read('scripts/design-system-snapshot.ps1'), /Get-Item -LiteralPath \$saved -Force/);
    assert.match(read('scripts/design-system-snapshot.ps1'), /Get-ChildItem -LiteralPath \$snapshotRoot -Recurse -File -Force/);
});

test('both HTML CSP policies allow verified Kakao scripts without enabling eval or enforcement', () => {
    const nginx = read('nginx/default.conf');
    const policies = [...nginx.matchAll(/add_header Content-Security-Policy-Report-Only "([^"]+)" always;/g)].map(match => match[1]);
    assert.equal(policies.length, 2);
    assert.equal(policies[0], policies[1]);
    const scripts = policies[0].split(';').map(value => value.trim()).find(value => value.startsWith('script-src ')).split(/\s+/);
    assert.deepEqual(scripts, [
        'script-src', "'self'", 'https://cdn.portone.io', 'https://dapi.kakao.com',
        'https://t1.kakaocdn.net', 'https://*.daumcdn.net',
    ]);
    assert.doesNotMatch(nginx, /add_header\s+Content-Security-Policy\s/);
});

test('PC and mobile browser checks use separate projects and failure evidence', () => {
    const pc = step(frontendTests, 'browser_pc');
    const mobile = step(frontendTests, 'browser_mobile');
    assert.ok(pc && mobile);
    assert.equal(pc.run, 'npm run test:e2e -- --project=chromium --output=test-results/pc');
    assert.equal(mobile.run, 'npm run test:e2e -- --project=mobile-chromium --output=test-results/mobile');
    assert.equal(mobile.if, "!cancelled() && steps.evidence.outputs.reused != 'true' && (success() || (failure() && steps.browser_pc.outcome == 'failure'))");
    assert.ok(frontendTests.steps.indexOf(pc) < frontendTests.steps.indexOf(mobile));
    for (const entry of [pc, mobile]) assert.equal(entry['continue-on-error'], undefined);
    assert.ok(frontendTests.steps.some(entry => entry.run === 'npm run test:run'));
    assert.ok(frontend.steps.some(entry => entry.run === 'npm run build'));
});

test('image publication and frontend staging remain main-push-only', () => {
    assert.ok(!frontend.steps.some(entry => /^appleboy\//.test(entry.uses ?? '')));
    assert.match(staging.steps.find(entry => entry.name === "Download this run's frontend").run, /GITHUB_RUN_ID/);
    for (const job of [backend, staging]) {
        const writes = job.steps.filter(entry => /^docker\/login-action@|^appleboy\/(scp|ssh)-action@/.test(entry.uses ?? '')
            || /docker (build|push)\b/.test(entry.run ?? ''));
        assert.ok(writes.length > 0);
        for (const entry of writes) {
            assert.equal(entry.if, "github.ref == 'refs/heads/main' && github.event_name == 'push'", entry.name);
        }
    }
});

test('only verified successful evidence can skip tests; records and required checks fail closed', () => {
    for (const job of [backendTests, frontendTests]) {
        const restore = step(job, 'evidence');
        const record = step(job, 'record');
        assert.match(restore.run, /ci-evidence\.mjs restore/);
        assert.match(restore.env.CI_FORCE_TESTS, /workflow_dispatch/);
        assert.match(record.run, /ci-evidence\.mjs record/);
        assert.equal(record['continue-on-error'], undefined);
        assert.equal(record.if, undefined);
        assert.equal(job.permissions.actions, 'read');
        for (const entry of job.steps.filter(entry => /gradlew .*\btest\b|npm run test:run|npm run test:e2e/.test(entry.run ?? ''))) {
            assert.match(entry.if, /steps\.evidence\.outputs\.reused != 'true'/);
            assert.equal(entry['continue-on-error'], undefined);
        }
    }
    const script = read('scripts/ci-evidence.mjs');
    assert.match(script, /keyAt\(component, run\.head_sha, runtime\) !== key/);
    assert.match(script, /artifact\.digest/);
    assert.match(script, /proof\?\.version !== VERSION/);
    assert.match(script, /execute tests normally/);
});

test('public API readiness precedes cutover and never writes data', () => {
    const ready = deployment.steps.find(entry => entry.name === 'Public API readiness (before cutover)');
    const cutover = deployment.steps.find(entry => entry.name === 'Cut over frontend and backend');
    assert.ok(deployment.steps.indexOf(ready) < deployment.steps.indexOf(cutover));
    assert.match(ready.with.script, /api\/stores\?page=0&size=48&sort=rating/);
    assert.match(ready.with.script, /READY.*-ge 2/);
    assert.match(ready.with.script, /seconds < 2\.5/);
    assert.doesNotMatch(ready.with.script, /--request|--data|Authorization|INSERT|UPDATE|DELETE/);
});

test('latency logs contain coarse routes and durations, never request identifiers or secrets', () => {
    const config = read('nginx/default.conf');
    const format = config.match(/log_format reserve_timing[\s\S]*?;/)?.[0];
    assert.ok(format);
    assert.match(format, /\$request_time/);
    assert.match(format, /\$upstream_header_time/);
    assert.doesNotMatch(format, /\$request_uri|\$args|\$remote_addr|\$http_|\$request_body|\$uri\b|\$request\b/);
});

test('public pages ship an indexable robots meta in the raw HTML', () => {
    // nginx map 은 빈 값에 정규식을 평가하지 않는다. "~^$" 로 색인 대상(빈 X-Robots-Tag)을 잡으면
    // 항상 default(noindex)로 떨어져 공개 페이지 원본 HTML 전체가 noindex 가 된다(2026-09-28 운영 사고).
    const config = read('nginx/default.conf');
    const robotsMeta = config.match(/map \$reserve_robots_tag \$reserve_robots_meta \{[\s\S]*?\}/)?.[0];
    assert.ok(robotsMeta);
    assert.match(robotsMeta, /default\s+"index, follow";/);
    assert.match(robotsMeta, /"noindex, nofollow"\s+"noindex, nofollow";/);
    for (const block of config.match(/^map [\s\S]*?^\}/gm) ?? []) {
        assert.doesNotMatch(block, /^\s*"~\^\$"/m, 'map 에서 빈 값을 정규식 "~^$" 로 비교하지 않는다');
    }
});

test('the live backend must be schema and refund compatible before deployment', () => {
    assert.match(backend.steps.find(entry => entry.name === 'Build Docker image').run, /--label reserve\.schema-compat=v270-refund-v1/);
    const detect = step(deployment, 'detect');
    assert.equal(detect.run, 'bash scripts/detect-active-upstream.sh');
    assert.match(detectionScript, /SCHEMA_COMPAT.*reserve\.schema-compat/);
    assert.match(detectionScript, /"\$SCHEMA_COMPAT" != 'v270-refund-v1'/);
});

test('automatic cutover requires recovery support for waiting settings, signup tickets and private message deletion', () => {
    const build = backend.steps.find(entry => entry.name === 'Build Docker image');
    const detect = step(deployment, 'detect');
    const cutover = deployment.steps.find(entry => entry.name === 'Cut over frontend and backend');
    assert.match(build.run, /--label reserve\.feature-compat=waiting-signup-hidden-v2/);
    assert.match(detectionScript, /"\$FEATURE_COMPAT" != 'waiting-signup-hidden-v2'/);
    assert.ok(detectionScript.indexOf('"$FEATURE_COMPAT" !=') < detectionScript.indexOf('DETECTED_UPSTREAM='));
    assert.equal(cutover.env.CURRENT_UPSTREAM, '${{ env.CURRENT_UPSTREAM }}');
    assert.ok(cutover.with.envs.split(',').includes('CURRENT_UPSTREAM'));
    assert.match(cutover.with.script, /"\$LIVE_ROUTING" != "set \\\$service_url \$CURRENT_UPSTREAM;"/);
    assert.match(cutover.with.script, /for COMPATIBLE_UPSTREAM in "\$CURRENT_UPSTREAM" "\$TARGET_UPSTREAM"/);
    const compatibilityGuard = cutover.with.script.indexOf('"$FEATURE_COMPAT" !=');
    assert.ok(compatibilityGuard > 0);
    assert.match(cutover.with.script, /"\$FEATURE_COMPAT" != 'waiting-signup-hidden-v2'/);
    assert.ok(compatibilityGuard < cutover.with.script.indexOf('trap rollback_cutover'));
    assert.ok(compatibilityGuard < cutover.with.script.indexOf('sudo touch "$ROLLBACK_DIR/cutover-started"'));
    assert.ok(deployment.steps.indexOf(detect) < deployment.steps.indexOf(cutover));
    for (const entry of [detect, cutover]) assert.equal(entry['continue-on-error'], undefined);
});

test('backend image compatibility requires the private deletion classes in the actual packaged jar', () => {
    const dockerfile = read('backend/Dockerfile');
    const guard = dockerfile.indexOf('RUN for REQUIRED_CLASS');
    assert.ok(guard > dockerfile.indexOf('COPY ${JAR_FILE} app.jar'));
    assert.ok(guard < dockerfile.indexOf('ENTRYPOINT'));
    for (const entry of ['entity/ChatMessageHidden', 'repository/ChatMessageHiddenRepository', 'service/ChatMessageVisibilityService']) {
        assert.ok(dockerfile.includes(`BOOT-INF/classes/kr/it/reserve/chat/${entry}.class`));
    }
    assert.match(dockerfile, /jar tf app\.jar \| grep -F -x "\$REQUIRED_CLASS" > \/dev\/null \|\| exit 1/);
});

test('test failures retain reports without uploading frontend secret files', () => {
    const artifacts = job => job.steps.filter(entry => entry.uses?.startsWith('actions/upload-artifact@'));
    const backendReport = artifacts(backendTests).find(entry => entry.with.name === 'backend-test-report');
    const browserReport = artifacts(frontendTests).find(entry => entry.with.name === 'frontend-browser-failures');
    assert.ok(backendReport && browserReport);
    assert.equal(backendReport.if, 'failure()');
    assert.match(backendReport.with.path, /backend\/build\/test-results\/test\//);
    assert.equal(browserReport.if, 'failure()');
    assert.equal(browserReport.with.path, 'frontend/test-results/');
    assert.equal(browserReport.with['retention-days'], 7);
    assert.doesNotMatch(browserReport.with.path, /\.env|frontend\/\*|^frontend\/$/);
});

test('backend, frontend, lockfile, and latest release notes stay version-aligned', () => {
    const frontendPackage = JSON.parse(read('frontend/package.json'));
    const lock = JSON.parse(read('frontend/package-lock.json'));
    const backendVersion = read('backend/build.gradle').match(/^version = '([^']+)'/m)?.[1];
    assert.match(frontendPackage.version, /^\d+\.\d+\.\d+$/);
    assert.equal(backendVersion, frontendPackage.version);
    assert.equal(lock.version, frontendPackage.version);
    assert.equal(lock.packages[''].version, frontendPackage.version);
    assert.equal(read('docs/CHANGELOG.md').match(/^## v(\d+\.\d+\.\d+)/m)?.[1], frontendPackage.version);
});
