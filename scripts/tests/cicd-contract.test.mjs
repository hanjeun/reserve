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

test('target app creation checks physical RAM immediately before compose and never ignores a rejection', () => {
    const validation = frontendTests.steps.find(entry => entry.name === 'Validate operations scripts');
    assert.match(validation.run, /node --test[^\n]*scripts\/tests\/deployment-memory\.test\.mjs/);
    assert.match(validation.run, /bash -n scripts\/check-deployment-memory\.sh/);
    const transfer = deployment.steps.find(entry => entry.name === 'Deploy docker-compose files to EC2');
    assert.ok(transfer.with.source.split(',').includes('scripts/check-deployment-memory.sh'));
    const start = deployment.steps.find(entry => entry.name === 'Docker compose up (target)');
    const script = start.with.script;
    const guard = 'sudo bash /home/ubuntu/scripts/check-deployment-memory.sh "${{ env.CURRENT_UPSTREAM }}" "${{ env.TARGET_UPSTREAM }}"';
    assert.ok(script.indexOf(guard) > script.indexOf('sudo docker pull'));
    const afterGuard = script.slice(script.indexOf(guard) + guard.length).trimStart();
    assert.ok(afterGuard.startsWith('sudo -E docker compose'));
    assert.doesNotMatch(script, /check-deployment-memory\.sh[^\n]*(?:\|\|\s*true|;)/);
    assert.equal(start['continue-on-error'], undefined);
});


test('v11 deployment forwards disabled feature flags and requires a dedicated MFA recovery key', () => {
    const start = deployment.steps.find(entry => entry.name === 'Docker compose up (target)');
    for (const name of ['RESERVE_MFA_ENABLED', 'RESERVE_MFA_RP_ID', 'RESERVE_MFA_ORIGINS', 'RESERVE_MFA_ENCRYPTION_KEY',
        'RESERVE_RESERVATION_AUTO_COMPLETION_ENABLED', 'RESERVE_SETTLEMENT_TEST_ENABLED',
        'RESERVE_RESERVATION_RETENTION_ENABLED', 'RESERVE_RESERVATION_RETENTION_PURGE_ENABLED',
        'RESERVE_RESERVATION_CONSENT_ENABLED', 'RESERVE_RESERVATION_CONSENT_RECIPIENT_RETENTION']) {
        assert.ok(start.with.envs.split(',').includes(name));
        for (const side of ['blue', 'green']) assert.ok(read('docker-compose-' + side + '.yml').includes(name + '='));
    }
    const source = start.with.script;
    const beginning = source.indexOf(': "${RESERVE_MFA_ENCRYPTION_KEY:');
    const ending = source.indexOf('# 빈 Actions', beginning);
    assert.ok(beginning >= 0 && ending > beginning);
    const guard = source.slice(beginning, ending);
    const run = overrides => spawnSync(process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash',
        ['-c', 'set -e\n' + guard], { encoding: 'utf8',
            env: { ...process.env, RESERVE_MFA_ENCRYPTION_KEY: 'fixture-key', RESERVE_MFA_ENABLED: 'false',
                RESERVE_RESERVATION_AUTO_COMPLETION_ENABLED: 'false', RESERVE_SETTLEMENT_TEST_ENABLED: 'false',
                RESERVE_RESERVATION_RETENTION_ENABLED: 'false', RESERVE_RESERVATION_RETENTION_PURGE_ENABLED: 'false',
                RESERVE_RESERVATION_CONSENT_ENABLED: 'false', RESERVE_RESERVATION_CONSENT_RECIPIENT_RETENTION: '', ...overrides } });
    assert.equal(run({}).status, 0);
    assert.notEqual(run({ RESERVE_MFA_ENCRYPTION_KEY: '' }).status, 0);
    for (const name of ['RESERVE_MFA_ENABLED','RESERVE_RESERVATION_AUTO_COMPLETION_ENABLED','RESERVE_SETTLEMENT_TEST_ENABLED',
        'RESERVE_RESERVATION_RETENTION_ENABLED','RESERVE_RESERVATION_RETENTION_PURGE_ENABLED','RESERVE_RESERVATION_CONSENT_ENABLED']) {
        assert.notEqual(run({[name]:'unknown'}).status, 0);
        assert.match(start.env[name], /false/);
    }
    assert.notEqual(run({ RESERVE_RESERVATION_RETENTION_PURGE_ENABLED: 'true' }).status, 0);
    assert.notEqual(run({ RESERVE_RESERVATION_CONSENT_ENABLED: 'true',
        RESERVE_RESERVATION_CONSENT_RECIPIENT_RETENTION: 'fixture-approved-retention' }).status, 0);
    assert.notEqual(run({ RESERVE_RESERVATION_RETENTION_ENABLED: 'true', RESERVE_RESERVATION_CONSENT_ENABLED: 'true' }).status, 0);
    assert.equal(run({ RESERVE_RESERVATION_RETENTION_ENABLED: 'true', RESERVE_RESERVATION_CONSENT_ENABLED: 'true',
        RESERVE_RESERVATION_CONSENT_RECIPIENT_RETENTION: 'fixture-approved-retention' }).status, 0);
    assert.equal(run({ RESERVE_RESERVATION_RETENTION_ENABLED: 'true', RESERVE_RESERVATION_RETENTION_PURGE_ENABLED: 'true' }).status, 0);
    const common = require('js-yaml').load(read('backend/src/main/resources/application-common.yml')).reserve;
    assert.equal(common['reservation-consent'].enabled, '${RESERVE_RESERVATION_CONSENT_ENABLED:false}');
    assert.equal(common['reservation-consent']['recipient-retention'], '${RESERVE_RESERVATION_CONSENT_RECIPIENT_RETENTION:}');
});

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
                    MOCK_BLUE: '200', MOCK_GREEN: '000', MOCK_SCHEMA: 'v280-mfa-completion-settlement-v1', MOCK_FEATURE: 'waiting-signup-hidden-feed-oauth-login-session-admission-mfa-completion-test-settlement-v11',
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

test('service admission deployment forwards opt-in settings and refuses an unusable Redis or epoch', () => {
    const start = deployment.steps.find(entry => entry.name === 'Docker compose up (target)');
    const settings = { ENABLED: 'false', AUTOMATIC_ENABLED: 'false', CAPACITY: '20', SESSION_SECONDS: '900', MAX_SESSION_SECONDS: '7200',
        HEARTBEAT_TIMEOUT_SECONDS: '90', MAX_WAITING: '1000' };
    for (const [suffix, fallback] of Object.entries(settings)) {
        const key = `RESERVE_SERVICE_ADMISSION_${suffix}`;
        assert.equal(start.env[key], `\${{ vars.${key} || '${fallback}' }}`);
        assert.ok(start.with.envs.split(',').includes(key));
    }
    assert.equal(start.env.RESERVE_SERVICE_ADMISSION_EPOCH, '${{ vars.RESERVE_SERVICE_ADMISSION_EPOCH }}');
    assert.ok(start.with.envs.split(',').includes('RESERVE_SERVICE_ADMISSION_EPOCH'));
    const validation = start.with.script.slice(start.with.script.indexOf('case "$RESERVE_SERVICE_ADMISSION_ENABLED"'),
        start.with.script.indexOf('case "$FEED_ENABLED"'));
    assert.ok(validation.includes('Invalid service admission epoch'));
    for (const [enabled, redis, epoch, passes] of [
        ['false', 'false', '', true], ['true', 'true', 'release-entry-generation-01', true],
        ['true', 'false', 'release-entry-generation-01', false], ['maybe', 'true', '', false],
        ['true', 'true', '', false], ['true', 'true', 'short', false],
        ['true', 'true', 'a'.repeat(65), false], ['true', 'true', 'invalid generation value', false],
    ]) {
        const result = spawnSync(process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash',
            ['-c', `set -e\n${validation}`], { encoding: 'utf8', timeout: 5000, env: { ...process.env,
                RESERVE_SERVICE_ADMISSION_ENABLED: enabled, RESERVE_REDIS_ENABLED: redis,
                RESERVE_SERVICE_ADMISSION_AUTOMATIC_ENABLED: 'false',
                RESERVE_SERVICE_ADMISSION_EPOCH: epoch } });
        assert.ifError(result.error);
        assert.equal(result.status === 0, passes, result.stderr + result.stdout);
    }
});

test('automatic service admission deployment is opt-in and cannot bypass the base admission switch', () => {
    const start = deployment.steps.find(entry => entry.name === 'Docker compose up (target)');
    const validation = start.with.script.slice(start.with.script.indexOf('case "$RESERVE_SERVICE_ADMISSION_AUTOMATIC_ENABLED"'),
        start.with.script.indexOf('case "$FEED_ENABLED"'));
    for (const [enabled, automatic, passes] of [
        ['false', 'false', true], ['true', 'true', true], ['false', 'true', false], ['true', 'invalid', false],
    ]) {
        const result = spawnSync(process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash',
            ['-c', `set -e\n${validation}`], { encoding: 'utf8', timeout: 5000, env: { ...process.env,
                RESERVE_SERVICE_ADMISSION_ENABLED: enabled, RESERVE_SERVICE_ADMISSION_AUTOMATIC_ENABLED: automatic } });
        assert.ifError(result.error);
        assert.equal(result.status === 0, passes, result.stderr + result.stdout);
    }
});

test('deployment memory preflight ships with compose and must succeed immediately before target startup', () => {
    const transfer = deployment.steps.find(entry => entry.name === 'Deploy docker-compose files to EC2');
    assert.ok(transfer.with.source.split(',').includes('scripts/check-deployment-memory.sh'));
    const start = deployment.steps.find(entry => entry.name === 'Docker compose up (target)');
    const script = start.with.script;
    const guard = 'sudo bash /home/ubuntu/scripts/check-deployment-memory.sh "${{ env.CURRENT_UPSTREAM }}" "${{ env.TARGET_UPSTREAM }}"';
    assert.ok(script.trimStart().startsWith('set -e'));
    assert.ok(script.indexOf(guard) > script.indexOf('sudo docker pull'));
    const afterGuard = script.slice(script.indexOf(guard) + guard.length).trimStart();
    assert.ok(afterGuard.startsWith('sudo -E docker compose'));
    assert.doesNotMatch(script, /check-deployment-memory\.sh[^\n]*(?:\|\|\s*true|;)/);
    assert.equal(start['continue-on-error'], undefined);
});

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
    ['recovery without feed and store-news retention', { MOCK_FEATURE: 'waiting-signup-hidden-v2' }],
    ['recovery without benefit approval isolation', { MOCK_FEATURE: 'waiting-signup-hidden-feed-v3' }],
    ['recovery without provider-token and security-event support', { MOCK_FEATURE: 'waiting-signup-hidden-feed-v6' }],
    ['recovery without managed login methods', { MOCK_FEATURE: 'waiting-signup-hidden-feed-oauth-v7' }],
    ['recovery without automatic service admission', { MOCK_FEATURE: 'waiting-signup-hidden-feed-oauth-login-session-admission-v9' }],
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
        assert.ok(environment.includes('FEED_ENABLED=${FEED_ENABLED:-false}'));
        assert.ok(environment.includes('FEED_IMAGE_ENCRYPTION_KEY=${FEED_IMAGE_ENCRYPTION_KEY:-}'));
        assert.ok(environment.includes('DB_PASSWORD=${DB_APP_PASSWORD:?DB_APP_PASSWORD is required for deployment}'));
        assert.ok(!environment.some(value => /DB_USERNAME=.*root|DDL_AUTO=.*update|DB_PASSWORD.*\$\{DB_PASSWORD/.test(value)));
    }
    const launch = deployment.steps.find(entry => entry.name === 'Docker compose up (target)');
    assert.ok(launch);
    assert.equal(launch.env.DB_APP_PASSWORD, '${{ secrets.DB_APP_PASSWORD }}');
    assert.equal(launch.env.DB_PASSWORD, undefined);
    assert.ok(!launch.with.envs.split(',').includes('DB_PASSWORD'));
    assert.equal(launch.env.FEED_ENABLED, "${{ vars.FEED_ENABLED || 'false' }}");
    assert.equal(launch.env.FEED_IMAGE_ENCRYPTION_KEY, '${{ secrets.FEED_IMAGE_ENCRYPTION_KEY }}');
    for (const name of ['FEED_ENABLED', 'FEED_IMAGE_ENCRYPTION_KEY']) assert.ok(launch.with.envs.split(',').includes(name));
    assert.ok(launch.with.script.indexOf('case "$FEED_ENABLED"') < launch.with.script.indexOf('sudo docker pull'));
    assert.match(launch.with.script, /FEED_IMAGE_ENCRYPTION_KEY:\?A dedicated feed image key is required/);
    const guard = ': "${DB_APP_PASSWORD:?DB_APP_PASSWORD is required for deployment}"';
    assert.ok(launch.with.script.includes(guard));
    assert.ok(launch.with.script.indexOf(guard) < launch.with.script.indexOf('sudo docker pull'));
});

test('provider security remains opt-in and forwards dedicated keys through the protected deployment boundary', () => {
    const launch = deployment.steps.find(entry => entry.name === 'Docker compose up (target)');
    const flags = ['OAUTH_PROVIDER_TOKEN_ENCRYPTION_ENABLED', 'OAUTH_SECURITY_EVENTS_GOOGLE_ENABLED', 'OAUTH_SECURITY_EVENTS_KAKAO_ENABLED', 'OAUTH_SECURITY_EVENTS_NAVER_ENABLED'];
    const keys = ['OAUTH_UNLINK_ENCRYPTION_KEY', 'OAUTH_PROVIDER_TOKEN_ENCRYPTION_KEY'];
    for (const name of flags) assert.equal(launch.env[name], `\${{ vars.${name} || 'false' }}`);
    for (const name of keys) assert.equal(launch.env[name], `\${{ secrets.${name} }}`);
    for (const name of [...flags, ...keys, 'KAKAO_APP_ID']) assert.ok(launch.with.envs.split(',').includes(name));
    for (const color of ['blue', 'green']) {
        const environment = require('js-yaml').load(read(`docker-compose-${color}.yml`)).services[color].environment;
        for (const name of flags) assert.ok(environment.includes(`${name}=\${${name}:-false}`));
        for (const name of [...keys, 'KAKAO_APP_ID']) assert.ok(environment.includes(`${name}=\${${name}:-}`));
    }
    for (const guard of ['case "$OAUTH_PROVIDER_TOKEN_ENCRYPTION_ENABLED"', 'for OAUTH_EVENTS_FLAG', 'unset OAUTH_UNLINK_ENCRYPTION_KEY']) {
        assert.ok(launch.with.script.indexOf(guard) >= 0);
        assert.ok(launch.with.script.indexOf(guard) < launch.with.script.indexOf('sudo docker pull'));
    }
    assert.match(launch.with.script, /OAUTH_PROVIDER_TOKEN_ENCRYPTION_KEY:\?A dedicated provider-token encryption key is required/);
    assert.match(launch.with.script, /KAKAO_APP_ID:\?Kakao app ID is required/);
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
    assert.equal(tests.run, 'bash scripts/test-backend-isolated.sh');
    const runner = read('scripts/test-backend-isolated.sh');
    assert.match(runner, /gradlew test --rerun --no-daemon --console=plain/);
    for (const gate of ['RESERVE_MYSQL_LOGIN_TEST_ISOLATED', 'RESERVE_ADMISSION_MYSQL_TEST',
        'RESERVE_CAPACITY_MYSQL_TEST', 'RESERVE_MYSQL_OAUTH_TEST_ISOLATED', 'RESERVE_ADMISSION_REDIS_TEST',
        'RESERVE_SERVICE_ADMISSION_HELPER_REDIS_TEST']) {
        assert.match(runner, new RegExp('(?:export )?' + gate + '=1'));
    }
    assert.doesNotMatch(runner, /--exclude-task|(?:^|\s)-x\s+test/);
    assert.match(packaging.run, /\.\/gradlew bootJar --console=plain/);
    assert.equal(step(backend, 'backend_tests'), undefined);
    assert.equal(tests['continue-on-error'], undefined);
    assert.doesNotMatch(tests.run + packaging.run, /-x\s+test|--exclude-task[=\s]+test/);
});

test('snapshot verification installs a scoped Git byte guard without changing the baseline', () => {
    const baseline = frontendTests.steps.find(entry => entry.name === 'Load published baseline for preservation checks');
    assert.equal(baseline.run, 'git fetch --no-tags --depth=1 origin c20ce59c4aec1cfc727fe1cba12960b0e7c78e74');
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
    const mainPush = "github.ref == 'refs/heads/main' && github.event_name == 'push'";
    assert.ok(!frontend.steps.some(entry => /^appleboy\//.test(entry.uses ?? '')));
    assert.match(staging.steps.find(entry => entry.name === "Download this run's frontend").run, /GITHUB_RUN_ID/);
    assert.equal(staging.if, mainPush);
    assert.equal(staging.steps.find(entry => entry.name === 'Stage marketing files').if, "vars.RESERVE_DOMAIN_SPLIT == 'true'");
    for (const job of [backend, staging]) {
        const writes = job.steps.filter(entry => /^docker\/login-action@|^appleboy\/(scp|ssh)-action@/.test(entry.uses ?? '')
            || /docker (build|push)\b/.test(entry.run ?? ''));
        assert.ok(writes.length > 0);
        for (const entry of writes) {
            // GitHub는 단계 조건과 별개로 작업 조건도 요구한다.
            if (job.if !== mainPush) assert.equal(entry.if, mainPush, entry.name);
        }
    }
});

test('frontend artifacts are stamped before upload and retries reject changed bytes for an existing SHA', () => {
    const stamp = frontend.steps.find(entry => entry.name === 'Stamp frontend release');
    const upload = frontend.steps.find(entry => entry.name === 'Upload built frontend');
    assert.equal(stamp.env.FRONTEND_RELEASE, '${{ github.sha }}');
    assert.ok(frontend.steps.indexOf(stamp) < frontend.steps.indexOf(upload));
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'reserve-stage-test-'));
    const sha = 'a'.repeat(40);
    const home = path.join(fixture, 'home');
    const html = path.join(fixture, 'html');
    const bin = path.join(fixture, 'bin');
    const source = path.join(home, `reserve-frontend-${sha}`);
    const release = path.join(html, 'releases', sha);
    fs.mkdirSync(bin, { recursive: true });
    fs.mkdirSync(home, { recursive: true });
    fs.writeFileSync(path.join(bin, 'sudo'), '#!/usr/bin/env bash\nexec "$@"\n', { mode: 0o755 });
    fs.writeFileSync(path.join(home, 'preserve-frontend-assets.sh'), read('scripts/preserve-frontend-assets.sh'));
    const stageScript = staging.steps.find(entry => entry.name === 'Stage frontend release').with.script
        .replaceAll('/usr/share/nginx/html', bashPath(html)).replaceAll('/home/ubuntu', bashPath(home));
    const prepare = (index = '<main>app origin</main>', asset = 'original asset') => {
        fs.mkdirSync(path.join(source, 'assets'), { recursive: true });
        fs.writeFileSync(path.join(source, 'index.html'), index);
        fs.writeFileSync(path.join(source, 'release-id.txt'), `${sha}\n`);
        fs.writeFileSync(path.join(source, 'assets', 'app-abcdefgh.js'), asset);
        fs.writeFileSync(path.join(home, 'default.conf'), 'reviewed nginx candidate\n');
    };
    const runStage = script => spawnSync(process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash',
        ['-c', 'export PATH="$TASK_MOCK_BIN:$PATH"; ' + script], {
            encoding: 'utf8', timeout: 15000,
            env: { ...process.env, TASK_MOCK_BIN: bashPath(bin), FRONTEND_RELEASE: sha, RESERVE_DOMAIN_SPLIT: 'false' },
        });
    try {
        prepare();
        const first = runStage(stageScript);
        assert.ifError(first.error);
        assert.equal(first.status, 0, first.stderr + first.stdout);
        prepare();
        const retry = runStage(stageScript);
        assert.equal(retry.status, 0, retry.stderr + retry.stdout);
        prepare('<main>different domain configuration</main>');
        assert.notEqual(runStage(stageScript).status, 0);
        assert.equal(fs.readFileSync(path.join(release, 'index.html'), 'utf8'), '<main>app origin</main>');
        prepare('<main>app origin</main>', 'changed asset under the same filename');
        assert.notEqual(runStage(stageScript).status, 0);
        assert.equal(fs.readFileSync(path.join(release, 'assets', 'app-abcdefgh.js'), 'utf8'), 'original asset');
        assert.equal(fs.readFileSync(path.join(release, 'release-id.txt'), 'utf8'), `${sha}\n`);

        const marketingSource = path.join(home, `reserve-marketing-${sha}`);
        const marketingRelease = path.join(html, 'marketing', 'releases', sha);
        fs.mkdirSync(marketingSource);
        fs.writeFileSync(path.join(marketingSource, 'index.html'), '<main>marketing</main>');
        fs.writeFileSync(path.join(marketingSource, 'release-id.txt'), `${sha}\n`);
        const domainScript = read('scripts/domain-release.sh')
            .replaceAll('/usr/share/nginx/html', bashPath(html)).replaceAll('/home/ubuntu', bashPath(home));
        const command = `set -- stage ${sha}\n${domainScript}`;
        const marketing = runStage(command);
        assert.equal(marketing.status, 0, marketing.stderr + marketing.stdout);
        assert.equal(runStage(command).status, 0);
        fs.writeFileSync(path.join(marketingSource, 'index.html'), '<main>different marketing</main>');
        assert.notEqual(runStage(command).status, 0);
        assert.equal(fs.readFileSync(path.join(marketingRelease, 'index.html'), 'utf8'), '<main>marketing</main>');
    } finally {
        assert.equal(path.dirname(path.resolve(fixture)), path.resolve(os.tmpdir()));
        assert.ok(path.basename(fixture).startsWith('reserve-stage-test-'));
        fs.rmSync(fixture, { recursive: true, force: true });
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
// nginx map은 빈 값에 정규식을 평가하지 않으므로 색인 허용 값은 빈 리터럴로 명시한다.
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
    assert.match(backend.steps.find(entry => entry.name === 'Build Docker image').run, /--label reserve\.schema-compat=v280-mfa-completion-settlement-v1/);
    const detect = step(deployment, 'detect');
    assert.equal(detect.run, 'bash scripts/detect-active-upstream.sh');
    assert.match(detectionScript, /SCHEMA_COMPAT.*reserve\.schema-compat/);
    assert.match(detectionScript, /"\$SCHEMA_COMPAT" != 'v280-mfa-completion-settlement-v1'/);
});

test('automatic cutover requires recovery support for waiting, signup, private deletion, feed retention, benefit approval, interactions and managed login methods', () => {
    const build = backend.steps.find(entry => entry.name === 'Build Docker image');
    const detect = step(deployment, 'detect');
    const cutover = deployment.steps.find(entry => entry.name === 'Cut over frontend and backend');
    assert.match(build.run, /--label reserve\.feature-compat=waiting-signup-hidden-feed-oauth-login-session-admission-mfa-completion-test-settlement-v11/);
    assert.match(detectionScript, /"\$FEATURE_COMPAT" != 'waiting-signup-hidden-feed-oauth-login-session-admission-mfa-completion-test-settlement-v11'/);
    assert.ok(detectionScript.indexOf('"$FEATURE_COMPAT" !=') < detectionScript.indexOf('DETECTED_UPSTREAM='));
    assert.equal(cutover.env.CURRENT_UPSTREAM, '${{ env.CURRENT_UPSTREAM }}');
    assert.ok(cutover.with.envs.split(',').includes('CURRENT_UPSTREAM'));
    assert.match(cutover.with.script, /"\$LIVE_ROUTING" != "set \\\$service_url \$CURRENT_UPSTREAM;"/);
    assert.match(cutover.with.script, /for COMPATIBLE_UPSTREAM in "\$CURRENT_UPSTREAM" "\$TARGET_UPSTREAM"/);
    const compatibilityGuard = cutover.with.script.indexOf('"$FEATURE_COMPAT" !=');
    assert.ok(compatibilityGuard > 0);
    assert.match(cutover.with.script, /"\$FEATURE_COMPAT" != 'waiting-signup-hidden-feed-oauth-login-session-admission-mfa-completion-test-settlement-v11'/);
    assert.ok(compatibilityGuard < cutover.with.script.indexOf('trap rollback_cutover'));
    assert.ok(compatibilityGuard < cutover.with.script.indexOf('sudo touch "$ROLLBACK_DIR/cutover-started"'));
    assert.ok(deployment.steps.indexOf(detect) < deployment.steps.indexOf(cutover));
    for (const entry of [detect, cutover]) assert.equal(entry['continue-on-error'], undefined);
});

test('backend image compatibility requires private deletion, feed retention and managed login-method classes in the actual jar', () => {
    const dockerfile = read('backend/Dockerfile');
    const guard = dockerfile.indexOf('RUN for REQUIRED_CLASS');
    assert.ok(guard > dockerfile.indexOf('COPY ${JAR_FILE} app.jar'));
    assert.ok(guard < dockerfile.indexOf('ENTRYPOINT'));
    for (const entry of ['entity/ChatMessageHidden', 'repository/ChatMessageHiddenRepository', 'service/ChatMessageVisibilityService']) {
        assert.ok(dockerfile.includes(`BOOT-INF/classes/kr/it/reserve/chat/${entry}.class`));
    }
    for (const entry of ['entity/FeedPost', 'entity/FeedMedia', 'entity/FeedProfile', 'entity/FeedReport', 'entity/FeedReportImage',
        'entity/FeedAuditRecord', 'service/FeedMediaService', 'service/FeedRetentionService', 'service/FeedModerationService',
        'entity/ContentLike', 'entity/FeedComment', 'entity/FeedCommentReport', 'entity/FeedCommentReportImage', 'entity/FeedNotification', 'service/FeedNotificationService', 'FeedInteractionPolicy', 'service/ContentLikeService',
        'service/FeedCommentService', 'service/FeedCommentRetentionService', 'controller/FeedInteractionController', 'controller/AdminFeedCommentController']) {
        assert.ok(dockerfile.includes(`BOOT-INF/classes/kr/it/reserve/feed/${entry}.class`));
    }
    assert.ok(dockerfile.includes('BOOT-INF/classes/kr/it/reserve/feed/news/service/StoreNewsService.class'));
    assert.ok(dockerfile.includes('BOOT-INF/classes/kr/it/reserve/promotion/entity/Promotion\\$BenefitState.class'));
    assert.ok(dockerfile.includes('BOOT-INF/classes/kr/it/reserve/feed/news/dto/StoreNewsDto\\$BenefitReview.class'));
    assert.ok(dockerfile.includes('BOOT-INF/classes/kr/it/reserve/feed/news/controller/AdminStoreNewsController.class'));
    for (const entry of ['OAuthProviderTokenCipher', 'OAuthProviderTokenConverter', 'OAuthSessionIssuer', 'CustomOAuth2User\\$OAuthAuthentication', 'events/OAuthSecurityEventController',
        'events/OAuthSecurityEventKeys', 'events/OAuthSecurityEventMetadataClient', 'events/OAuthSecurityEventVerifier', 'events/OAuthSecurityEventRecord',
        'events/OAuthSecurityEventRepository', 'events/OAuthSecurityEventService', 'events/OAuthSecurityEventTransaction',
        'subject/OAuthSubjectSecurity', 'subject/OAuthSubjectSecurityRepository', 'subject/OAuthSubjectSecurityService',
        'events/NaverUnlinkEventVerifier', 'events/NaverUnlinkEventController']) {
        assert.ok(dockerfile.includes(`BOOT-INF/classes/kr/it/reserve/config/oauth2/${entry}.class`));
    }
    assert.ok(dockerfile.includes('BOOT-INF/classes/kr/it/reserve/config/updates/RedisEntityUpdateRelay.class'));
    assert.ok(dockerfile.includes('BOOT-INF/classes/kr/it/reserve/config/util/SecurityUtil\\$OAuthAuthenticationDetails.class'));
    assert.ok(dockerfile.includes('BOOT-INF/classes/kr/it/reserve/member/service/MemberWithdrawalService.class'));
    for (const entry of ['controller/LoginMethodController', 'service/LoginMethodService', 'entity/LoginMethodChallenge']) {
        assert.ok(dockerfile.includes('BOOT-INF/classes/kr/it/reserve/member/' + entry + '.class'));
    }
    assert.ok(dockerfile.includes('META-INF/orm.xml'));
    for (const entry of ['ReservationCreationGuard', 'ReservationRequest', 'AdmissionService']) {
        assert.ok(dockerfile.includes('BOOT-INF/classes/kr/it/reserve/reservation/admission/' + entry + '.class'));
    }
    for (const entry of ['member/mfa/MfaService', 'member/mfa/MfaPasskeys', 'member/mfa/MfaPolicy',
        'member/mfa/MfaController', 'member/mfa/MfaCredential', 'reservation/service/ReservationAutoCompletion',
        'payment/service/TestSettlementService', 'payment/entity/TestSettlementPayout']) {
        assert.ok(dockerfile.includes('BOOT-INF/classes/kr/it/reserve/' + entry + '.class'));
    }
    assert.ok(dockerfile.includes('BOOT-INF/classes/db/manual/mfa-completion-settlement.sql'));
    for (const entry of ['ServiceAdmissionService', 'ServiceAdmissionAutomaticPolicy', 'ServiceAdmissionLoadSampler']) {
        assert.ok(dockerfile.includes('BOOT-INF/classes/kr/it/reserve/global/admission/' + entry + '.class'));
    }
    assert.ok(dockerfile.includes('BOOT-INF/classes/kr/it/reserve/config/ServiceAdmissionHttpFilter.class'));
    assert.ok(dockerfile.includes('BOOT-INF/classes/redis/service-admission.lua'));
    for (const entry of ['redis/reservation-admission.lua', 'db/manual/jwt-session.sql', 'db/manual/reservation-admission.sql']) {
        assert.ok(dockerfile.includes('BOOT-INF/classes/' + entry));
    }
    assert.ok(dockerfile.includes('BOOT-INF/classes/kr/it/reserve/config/jwt/TokenProvider\\$VerifiedAuthentication.class'));
    assert.match(dockerfile, /jar tf app\.jar \| grep -F -x "\$REQUIRED_CLASS" > \/dev\/null \|\| exit 1/);
});

test('marketing smoke requires both restored layouts and rejects a partial or unrelated page', () => {
    const smoke = deployment.steps.find(entry => entry.name === 'Post-deploy smoke').with.script;
    const checks = smoke.split('\n').filter(line => line.trimStart().startsWith('grep -q ')
        && line.includes('$SMOKE_DIR/marketing.html')).join('\n');
    assert.ok(checks);
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'reserve-marketing-smoke-'));
    try {
        for (const [html, passes] of [
            ['<div id="section-0"></div><div id="mobile-section-0"></div>', true],
            ['<div id="section-0"></div>', false],
            ['<div id="mobile-section-0"></div>', false],
            ['<main id="features">old page</main>', false],
        ]) {
            fs.writeFileSync(path.join(fixture, 'marketing.html'), html);
            const result = spawnSync(process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash',
                ['-c', `set -euo pipefail\n${checks}`], {
                    encoding: 'utf8', timeout: 15000, env: { ...process.env, SMOKE_DIR: bashPath(fixture) },
                });
            assert.ifError(result.error);
            assert.equal(result.status === 0, passes, result.stderr + result.stdout);
        }
    } finally {
        assert.equal(path.dirname(path.resolve(fixture)), path.resolve(os.tmpdir()));
        assert.ok(path.basename(fixture).startsWith('reserve-marketing-smoke-'));
        fs.rmSync(fixture, { recursive: true, force: true });
    }
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
