import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const read = path => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const require = createRequire(new URL('../../frontend/package.json', import.meta.url));
const workflow = require('js-yaml').load(read('.github/workflows/CICD.yml'));
const backend = workflow.jobs['build-backend'];
const frontend = workflow.jobs['build-frontend'];
const deployment = workflow.jobs['deploy-backend'];
const backendTests = workflow.jobs['test-backend'];
const frontendTests = workflow.jobs['test-frontend'];
const staging = workflow.jobs['stage-release'];
const step = (job, id) => job.steps.find(entry => entry.id === id);

test('required checks remain present and deployment waits for both builds', () => {
    assert.ok(backend && frontend && deployment && backendTests && frontendTests);
    assert.equal(backendTests.if, undefined);
    assert.equal(frontendTests.if, undefined);
    assert.equal(backend.needs, 'test-backend');
    assert.deepEqual(frontend.needs, ['build-backend', 'test-frontend']);
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
    assert.match(frontend.steps[0].run, /test "\$BACKEND_RESULT" = success/);
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

test('rollback compatibility is tested and packaged before main-only image publication', () => {
    const bridge = step(backend, 'rollback_bridge');
    assert.ok(bridge);
    assert.equal(bridge.run, 'bash scripts/test-v270-rollback.sh');
    assert.equal(bridge['continue-on-error'], undefined);
    assert.ok(backend.steps.indexOf(bridge) > backend.steps.indexOf(step(backend, 'backend_package')));
    const script = read('scripts/test-v270-rollback.sh');
    assert.match(script, /git archive "\$BASE"/);
    assert.match(script, /ChatRollbackCompatibilityTest/);
    assert.doesNotMatch(script, /rm -rf|git reset|git clean|-x test/);
    const image = backend.steps.find(entry => entry.name === 'Build rollback compatibility image');
    const publish = backend.steps.find(entry => entry.name === 'Push rollback compatibility image');
    assert.ok(image && publish);
    assert.match(image.run, /\$BRIDGE_DIR\/backend/);
    assert.match(publish.run, /rollback-v263-v270-\$COMMIT_SHA/);
    assert.doesNotMatch(image.run + publish.run, /:latest|continue-on-error/);
    assert.ok(backend.steps.indexOf(image) < backend.steps.indexOf(publish));
});

test('snapshot verification installs a scoped Git byte guard without changing the baseline', () => {
    const snapshot = frontendTests.steps.find(entry => entry.name === 'Verify immutable design-system snapshot');
    assert.equal(snapshot.run, './scripts/design-system-snapshot.ps1 -Stage Verify -InstallGitGuard');
    assert.match(read('.gitattributes'), /^docs\/design-system\/snapshots\/\*\* -text -eol$/m);
    assert.match(read('scripts/design-system-snapshot.ps1'), /rev-parse --git-path info\/attributes/);
    assert.match(read('scripts/design-system-snapshot.ps1'), /Get-Item -LiteralPath \$saved -Force/);
    assert.match(read('scripts/design-system-snapshot.ps1'), /Get-ChildItem -LiteralPath \$snapshotRoot -Recurse -File -Force/);
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
        for (const entry of job.steps.filter(entry => /gradlew test|npm run test:run|npm run test:e2e/.test(entry.run ?? ''))) {
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

test('the actual fallback backend must be schema and refund compatible', () => {
    for (const name of ['Build Docker image', 'Build rollback compatibility image']) {
        assert.match(backend.steps.find(entry => entry.name === name).run, /--label reserve\.schema-compat=v270-refund-v1/);
    }
    const detect = step(deployment, 'detect');
    assert.match(detect.with.script, /SCHEMA_COMPAT.*reserve\.schema-compat/);
    assert.match(detect.with.script, /"\$SCHEMA_COMPAT" != 'v270-refund-v1'/);
    assert.match(deployment.steps.find(entry => entry.name === 'Stop old server (best effort)').with.script,
        /Keeping the compatible rollback backend available/);
    assert.match(read('scripts/prepare-v270-rollback.mjs'), /refundPayment\(refundDto, false\)/);
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
