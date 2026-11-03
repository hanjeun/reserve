import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { validateContext, validateSource, codeqlState, validateImage } from '../verify-cd-source.mjs';

const require = createRequire(new URL('../../frontend/package.json', import.meta.url));
const yaml = require('js-yaml');
const read = name => readFileSync(new URL('../../' + name, import.meta.url), 'utf8');
const env = { GITHUB_REPOSITORY: 'hanjeun/reserve', GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/main',
    GITHUB_SHA: 'a'.repeat(40), GITHUB_RUN_ID: '123', IMAGE_REPOSITORY: 'synthetic/reserve' };
const run = { id: 123, path: '.github/workflows/CI.yml', head_repository: { full_name: env.GITHUB_REPOSITORY },
    head_branch: 'main', event: 'push', head_sha: env.GITHUB_SHA };
const jobs = ['test-backend', 'test-frontend', 'build-backend', 'build-frontend']
    .map(name => ({ name, conclusion: 'success' }));
const codeql = { ...run, path: '.github/workflows/codeql.yml', status: 'completed', conclusion: 'success' };
const manifest = { version: 1, sha: env.GITHUB_SHA, runId: env.GITHUB_RUN_ID,
    image: env.IMAGE_REPOSITORY + '@sha256:' + 'b'.repeat(64) };

test('CD accepts only the original same-repository main push and all four successful CI jobs', () => {
    assert.doesNotThrow(() => validateSource(run, jobs, env));
    for (const change of [{ GITHUB_EVENT_NAME: 'pull_request' }, { GITHUB_EVENT_NAME: 'workflow_dispatch' },
        { GITHUB_REPOSITORY: 'foreign/reserve' }, { GITHUB_REF: 'refs/heads/dev' }, { GITHUB_SHA: 'invalid' }])
        assert.throws(() => validateContext({ ...env, ...change }));
    for (const change of [{ id: 124 }, { event: 'pull_request' }, { head_branch: 'dev' },
        { head_repository: { full_name: 'foreign/reserve' } }, { head_sha: 'c'.repeat(40) }, { path: '.github/workflows/other.yml' }])
        assert.throws(() => validateSource({ ...run, ...change }, jobs, env));
    for (const failed of jobs) for (const conclusion of ['failure', 'skipped', 'cancelled', null])
        assert.throws(() => validateSource(run, jobs.map(job => job.name === failed.name ? { ...job, conclusion } : job), env));
});

test('latest same-SHA CodeQL is required and a newer failed attempt cannot reuse an older success', () => {
    assert.equal(codeqlState([codeql], env), 'success');
    assert.equal(codeqlState([{ ...codeql, head_sha: 'c'.repeat(40) }], env), 'pending');
    assert.equal(codeqlState([{ ...codeql, event: 'pull_request' }], env), 'pending');
    assert.equal(codeqlState([{ ...codeql, status: 'in_progress' }], env), 'pending');
    assert.equal(codeqlState([codeql, { ...codeql, id: 124, conclusion: 'failure' }], env), 'failure');
});

test('image identity requires this run, this SHA and an immutable digest in the expected repository', () => {
    assert.equal(validateImage(manifest, env), manifest.image);
    for (const change of [{ runId: '124' }, { sha: 'c'.repeat(40) }, { version: 2 },
        { image: 'synthetic/reserve:latest' }, { image: 'foreign/reserve@sha256:' + 'b'.repeat(64) },
        { image: manifest.image + '\noutput=unexpected' }])
        assert.throws(() => validateImage({ ...manifest, ...change }, env));
});

test('CI calls reusable CD after required checks and only CD can reach the server', () => {
    const ci = yaml.load(read('.github/workflows/CI.yml'));
    const cd = yaml.load(read('.github/workflows/CD.yml'));
    assert.deepEqual(Object.keys(cd.on), ['workflow_call']);
    assert.equal(ci.jobs.cd.uses, './.github/workflows/CD.yml');
    assert.deepEqual(ci.jobs.cd.needs, jobs.map(job => job.name).sort((a, b) => {
        const order = ['build-backend', 'build-frontend', 'test-backend', 'test-frontend']; return order.indexOf(a) - order.indexOf(b);
    }));
    assert.equal(ci.jobs.cd.if, "github.ref == 'refs/heads/main' && github.event_name == 'push'");
    assert.doesNotMatch(read('.github/workflows/CI.yml'), /appleboy\/|EC2_SSH_KEY|RESERVE_SERVER_IP/);
    assert.deepEqual(cd.jobs['stage-release'].needs, ['verify-source']);
    assert.deepEqual(cd.jobs['deploy-backend'].needs, ['verify-source', 'stage-release']);
    assert.equal(cd.concurrency['cancel-in-progress'], false);
    for (const name of ['stage-release', 'deploy-backend']) {
        const steps = cd.jobs[name].steps;
        const current = steps.findIndex(step => step.run === 'node scripts/verify-cd-source.mjs current');
        const server = steps.findIndex(step => /^appleboy\/|detect-active-upstream/.test(step.uses || step.run || ''));
        assert.ok(current >= 0 && server > current);
        assert.equal(steps[0].with.ref, '${{ github.sha }}');
        assert.equal(steps[0].with['persist-credentials'], false);
    }
    const start = cd.jobs['deploy-backend'].steps.find(step => step.name === 'Docker compose up (target)');
    assert.equal(start.env.RESERVE_IMAGE_REFERENCE, '${{ needs.verify-source.outputs.image }}');
    assert.ok(start.with.envs.split(',').includes('RESERVE_IMAGE_REFERENCE'));
    assert.match(start.with.script, /sudo docker pull "\$RESERVE_IMAGE_REFERENCE"/);
});
