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
const step = (job, id) => job.steps.find(entry => entry.id === id);

test('required checks remain present and deployment waits for both builds', () => {
    assert.ok(backend && frontend && deployment);
    assert.equal(backend.if, undefined);
    assert.equal(frontend.if, undefined);
    assert.equal(frontend.needs, 'build-backend');
    assert.equal(deployment.needs, 'build-frontend');
    assert.match(deployment.if, /github\.ref == 'refs\/heads\/main'/);
    assert.match(deployment.if, /github\.event_name == 'push'/);
    assert.equal(workflow.concurrency['cancel-in-progress'], "${{ github.event_name == 'pull_request' }}");
});

test('backend tests are explicit, required, and run before packaging', () => {
    const tests = step(backend, 'backend_tests');
    const packaging = step(backend, 'backend_package');
    assert.ok(tests && packaging);
    assert.match(tests.run, /\.\/gradlew clean test --console=plain/);
    assert.match(packaging.run, /\.\/gradlew bootJar --console=plain/);
    assert.ok(backend.steps.indexOf(tests) < backend.steps.indexOf(packaging));
    assert.equal(tests['continue-on-error'], undefined);
    assert.doesNotMatch(tests.run + packaging.run, /-x\s+test|--exclude-task[=\s]+test/);
});

test('snapshot verification installs a scoped Git byte guard without changing the baseline', () => {
    const snapshot = frontend.steps.find(entry => entry.name === 'Verify immutable design-system snapshot');
    assert.equal(snapshot.run, './scripts/design-system-snapshot.ps1 -Stage Verify -InstallGitGuard');
    assert.match(read('.gitattributes'), /^docs\/design-system\/snapshots\/\*\* -text -eol$/m);
    assert.match(read('scripts/design-system-snapshot.ps1'), /rev-parse --git-path info\/attributes/);
});

test('PC and mobile browser checks use separate projects and failure evidence', () => {
    const pc = step(frontend, 'browser_pc');
    const mobile = step(frontend, 'browser_mobile');
    assert.ok(pc && mobile);
    assert.equal(pc.run, 'npm run test:e2e -- --project=chromium --output=test-results/pc');
    assert.equal(mobile.run, 'npm run test:e2e -- --project=mobile-chromium --output=test-results/mobile');
    assert.equal(mobile.if, "!cancelled() && (success() || (failure() && steps.browser_pc.outcome == 'failure'))");
    assert.ok(frontend.steps.indexOf(pc) < frontend.steps.indexOf(mobile));
    for (const entry of [pc, mobile]) assert.equal(entry['continue-on-error'], undefined);
    assert.ok(frontend.steps.some(entry => entry.run === 'npm run test:run'));
    assert.ok(frontend.steps.some(entry => entry.run === 'npm run build'));
});

test('image publication and frontend staging remain main-push-only', () => {
    for (const job of [backend, frontend]) {
        const writes = job.steps.filter(entry => /^docker\/login-action@|^appleboy\/(scp|ssh)-action@/.test(entry.uses ?? '')
            || /docker (build|push)\b/.test(entry.run ?? ''));
        assert.ok(writes.length > 0);
        for (const entry of writes) {
            assert.equal(entry.if, "github.ref == 'refs/heads/main' && github.event_name == 'push'", entry.name);
        }
    }
});

test('test failures retain reports without uploading frontend secret files', () => {
    const artifacts = job => job.steps.filter(entry => entry.uses?.startsWith('actions/upload-artifact@'));
    const backendReport = artifacts(backend).find(entry => entry.with.name === 'backend-test-report');
    const browserReport = artifacts(frontend).find(entry => entry.with.name === 'frontend-browser-failures');
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
