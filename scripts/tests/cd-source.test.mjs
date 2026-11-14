import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import process from 'node:process';
import { validateContext, validateEvent, validateSource, codeqlState, validateImage } from '../verify-cd-source.mjs';

const require = createRequire(new URL('../../frontend/package.json', import.meta.url));
const yaml = require('js-yaml');
const read = name => readFileSync(new URL('../../' + name, import.meta.url), 'utf8');
const otherSha = 'c'.repeat(40);
const env = { GITHUB_REPOSITORY: 'hanjeun/reserve', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main',
    GITHUB_SHA: 'a'.repeat(40), GITHUB_RUN_ID: '456', SOURCE_SHA: 'a'.repeat(40), SOURCE_RUN_ID: '123',
    SOURCE_RUN_ATTEMPT: '2', IMAGE_REPOSITORY: 'synthetic/reserve' };
const run = { id: 123, path: '.github/workflows/CI.yml', head_repository: { full_name: env.GITHUB_REPOSITORY },
    head_branch: 'main', event: 'push', head_sha: env.SOURCE_SHA, run_attempt: 2, status: 'completed', conclusion: 'success' };
const event = { repository: { full_name: env.GITHUB_REPOSITORY },
    inputs: { source_sha: env.SOURCE_SHA, source_run_id: env.SOURCE_RUN_ID, source_run_attempt: env.SOURCE_RUN_ATTEMPT } };
const jobs = ['test-backend', 'test-frontend', 'build-backend', 'build-frontend', 'dispatch-cd']
    .map(name => ({ name, status: 'completed', conclusion: 'success', run_id: run.id, head_sha: run.head_sha }));
const codeql = { ...run, path: '.github/workflows/codeql.yml', status: 'completed', conclusion: 'success' };
const manifest = { version: 2, sha: env.SOURCE_SHA, runId: env.SOURCE_RUN_ID, runAttempt: env.SOURCE_RUN_ATTEMPT,
    image: env.IMAGE_REPOSITORY + '@sha256:' + 'b'.repeat(64) };

test('independent CD accepts only a completed main CI attempt with all required jobs and its dispatch job', () => {
    assert.doesNotThrow(() => validateSource(run, jobs, env));
    for (const change of [{ GITHUB_EVENT_NAME: 'pull_request' }, { GITHUB_EVENT_NAME: 'workflow_run' },
        { GITHUB_EVENT_NAME: 'push' }, { GITHUB_REPOSITORY: 'foreign/reserve' }, { GITHUB_REF: 'refs/heads/dev' },
        { GITHUB_SHA: otherSha }, { SOURCE_SHA: 'invalid' }, { SOURCE_RUN_ID: '456' }, { SOURCE_RUN_ID: '../123' },
        { SOURCE_RUN_ATTEMPT: '0' }, { GITHUB_RUN_ID: '' }])
        assert.throws(() => validateContext({ ...env, ...change }));
    for (const change of [{ id: 124 }, { event: 'pull_request' }, { head_branch: 'dev' },
        { head_repository: { full_name: 'foreign/reserve' } }, { head_sha: 'c'.repeat(40) }, { path: '.github/workflows/other.yml' },
        { run_attempt: 3 }, { status: 'in_progress' }, { conclusion: 'failure' }, { conclusion: 'skipped' }])
        assert.throws(() => validateSource({ ...run, ...change }, jobs, env));
    for (const failed of jobs) for (const conclusion of ['failure', 'skipped', 'cancelled', null])
        assert.throws(() => validateSource(run, jobs.map(job => job.name === failed.name ? { ...job, conclusion } : job), env));
    for (const change of [{ run_id: 456 }, { head_sha: otherSha }, { status: 'in_progress' }])
        assert.throws(() => validateSource(run, [{ ...jobs[0], ...change }, ...jobs.slice(1)], env));
    assert.throws(() => validateSource(run, jobs.slice(1), env));
    assert.throws(() => validateSource(run, [...jobs, jobs[0]], env));
});

test('dispatch payload must match the repository, commit, CI run and attempt used by the verifier', () => {
    assert.doesNotThrow(() => validateEvent(event, env));
    assert.throws(() => validateEvent({ ...event, repository: { full_name: 'foreign/reserve' } }, env));
    assert.throws(() => validateEvent({ ...event, inputs: null }, env));
    for (const change of [{ source_sha: otherSha }, { source_run_id: '456' }, { source_run_attempt: '1' }])
        assert.throws(() => validateEvent({ ...event, inputs: { ...event.inputs, ...change } }, env));
});

test('latest same-SHA CodeQL is required and a newer failed attempt cannot reuse an older success', () => {
    assert.equal(codeqlState([codeql], env), 'success');
    assert.equal(codeqlState([{ ...codeql, head_sha: 'c'.repeat(40) }], env), 'pending');
    assert.equal(codeqlState([{ ...codeql, event: 'pull_request' }], env), 'pending');
    assert.equal(codeqlState([{ ...codeql, status: 'in_progress' }], env), 'pending');
    assert.equal(codeqlState([codeql, { ...codeql, id: 124, conclusion: 'failure' }], env), 'failure');
});

test('image identity requires the source CI run and attempt, source SHA and expected immutable digest', () => {
    assert.equal(validateImage(manifest, env), manifest.image);
    for (const change of [{ runId: env.GITHUB_RUN_ID }, { sha: otherSha }, { version: 1 }, { runAttempt: '1' },
        { image: 'synthetic/reserve:latest' }, { image: 'foreign/reserve@sha256:' + 'b'.repeat(64) },
        { image: manifest.image + '\noutput=unexpected' }])
        assert.throws(() => validateImage({ ...manifest, ...change }, env));
});

test('image CLI exposes only the verified digest and emits nothing for a mismatched run', () => {
    const directory = mkdtempSync(join(tmpdir(), 'reserve-cd-image-'));
    try {
        const target = join(directory, 'backend/build/cd-source');
        mkdirSync(target, { recursive: true });
        const file = join(target, 'release-image.json');
        const output = join(directory, 'image-output');
        const payload = join(directory, 'event.json');
        writeFileSync(payload, JSON.stringify(event));
        const script = fileURLToPath(new URL('../verify-cd-source.mjs', import.meta.url));
        const execute = destination => spawnSync(process.execPath, [script, 'image'], {
            cwd: directory, env: { ...process.env, ...env, GITHUB_OUTPUT: destination, GITHUB_EVENT_PATH: payload }, encoding: 'utf8',
        });
        writeFileSync(file, JSON.stringify(manifest));
        assert.equal(execute(output).status, 0);
        assert.equal(readFileSync(output, 'utf8'), 'digest=sha256:' + 'b'.repeat(64) + '\n');
        assert.ok(!readFileSync(output, 'utf8').includes(env.IMAGE_REPOSITORY));
        writeFileSync(file, JSON.stringify({ ...manifest, runId: '124' }));
        const rejected = join(directory, 'rejected-output');
        assert.equal(execute(rejected).status, 1);
        assert.equal(existsSync(rejected), false);
    } finally {
        assert.equal(resolve(dirname(directory)), resolve(tmpdir()));
        assert.ok(basename(directory).startsWith('reserve-cd-image-'));
        rmSync(directory, { recursive: true, force: true });
    }
});

test('source CLI binds downloads to the originating CI and rejects stale or rerun sources before emitting outputs', () => {
    const directory = mkdtempSync(join(tmpdir(), 'reserve-cd-source-'));
    try {
        const payload = join(directory, 'event.json');
        const fixture = join(directory, 'fixture.json');
        const calls = join(directory, 'calls');
        const mock = join(directory, 'mock-fetch.mjs');
        const script = fileURLToPath(new URL('../verify-cd-source.mjs', import.meta.url));
        writeFileSync(mock, `import { appendFileSync, readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync(process.env.CD_FIXTURE, 'utf8'));
const timeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...args) => timeout(fn, ms === 5_000 ? 0 : ms, ...args);
let reads = 0;
globalThis.fetch = async input => {
    const url = new URL(input);
    if (url.origin !== 'https://api.github.com') throw new Error('Unexpected API origin');
    appendFileSync(process.env.CD_CALLS, url.pathname + url.search + '\\n');
    const path = url.pathname.replace('/repos/hanjeun/reserve/', '');
    let data;
    if (path === 'branches/main') data = { commit: { sha: fixture.branchSha } };
    else if (path === 'actions/runs/123') {
        reads++;
        data = reads > 1 && fixture.rerunAfterCodeql ? { ...fixture.run, run_attempt: 3 } : fixture.run;
        if (reads === 1 && fixture.pending) data = { ...fixture.run, status: 'in_progress', conclusion: null };
    } else if (path === 'actions/runs/123/jobs') data = { jobs: fixture.jobs };
    else if (path === 'actions/workflows/codeql.yml/runs') data = { workflow_runs: fixture.codeql };
    else return new Response('{}', { status: 404 });
    return new Response(JSON.stringify(data));
};`);
        let attempt = 0;
        const execute = (command, changes = {}, trigger = event) => {
            const output = join(directory, 'output-' + attempt++);
            writeFileSync(payload, JSON.stringify(trigger));
            writeFileSync(fixture, JSON.stringify({ branchSha: env.SOURCE_SHA, run, jobs, codeql: [codeql], ...changes }));
            writeFileSync(calls, '');
            const result = spawnSync(process.execPath, ['--import', pathToFileURL(mock).href, script, command], {
                cwd: directory, encoding: 'utf8', timeout: 5000,
                env: { ...process.env, ...env, GITHUB_EVENT_PATH: payload, GITHUB_OUTPUT: output,
                    GITHUB_TOKEN: 'synthetic-read-token', CD_FIXTURE: fixture, CD_CALLS: calls },
            });
            assert.ifError(result.error);
            return { ...result, output, calls: readFileSync(calls, 'utf8') };
        };
        const accepted = execute('source');
        assert.equal(accepted.status, 0, accepted.stderr);
        assert.equal(readFileSync(accepted.output, 'utf8'), 'sha=' + env.SOURCE_SHA + '\nrun-id=123\nrun-attempt=2\n');
        assert.match(accepted.calls, /actions\/runs\/123\/jobs\?filter=latest/);
        assert.ok(!accepted.calls.includes('/actions/runs/456'));
        const pending = execute('source', { pending: true });
        assert.equal(pending.status, 0, pending.stderr);
        assert.equal((pending.calls.match(/actions\/runs\/123\n/g) || []).length, 3);
        for (const changes of [
            { branchSha: otherSha }, { run: { ...run, run_attempt: 3 } },
            { run: { ...run, conclusion: 'failure' } }, { jobs: jobs.slice(1) },
            { codeql: [{ ...codeql, conclusion: 'failure' }] }, { rerunAfterCodeql: true },
        ]) {
            const rejected = execute('source', changes);
            assert.equal(rejected.status, 1, rejected.stderr);
            assert.equal(existsSync(rejected.output), false);
        }
        const foreign = execute('source', {}, { ...event, inputs: { ...event.inputs, source_run_id: '456' } });
        assert.equal(foreign.status, 1);
        assert.equal(foreign.calls, '');
        const current = execute('current');
        assert.equal(current.status, 0, current.stderr);
        assert.equal(existsSync(current.output), false);
        for (const codeql of [[{ ...run, path: '.github/workflows/codeql.yml', status: 'in_progress' }], []]) {
            const rejected = execute('current', { codeql });
            assert.equal(rejected.status, 1, rejected.stderr);
            assert.equal(existsSync(rejected.output), false);
        }
    } finally {
        assert.equal(resolve(dirname(directory)), resolve(tmpdir()));
        assert.ok(basename(directory).startsWith('reserve-cd-source-'));
        rmSync(directory, { recursive: true, force: true });
    }
});

test('post-deploy smoke accepts only the verified immutable image reference', () => {
    const cd = yaml.load(read('.github/workflows/CD.yml'));
    const deployment = cd.jobs['deploy-backend'];
    const smoke = deployment.steps.find(step => step.name === 'Post-deploy smoke');
    const source = smoke.with.script;
    const begin = source.indexOf('RUNNING_IMAGE=');
    const end = source.indexOf('echo "Post-deploy smoke passed through nginx"', begin);
    assert.ok(begin >= 0 && end > begin);
    const execute = image => spawnSync(process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash',
        ['-c', `set -euo pipefail
sudo() { test "$1" = docker && test "$2" = inspect || return 9; printf '%s\\n' "$TASK_RUNNING_IMAGE"; }
${source.slice(begin, end)}`], { encoding: 'utf8', timeout: 5000,
            env: { ...process.env, TARGET_UPSTREAM: 'blue', FRONTEND_RELEASE: env.SOURCE_SHA,
                RESERVE_IMAGE_REFERENCE: manifest.image, TASK_RUNNING_IMAGE: image } });
    for (const [image, accepted] of [
        [manifest.image, true],
        [manifest.image.replace('b'.repeat(64), 'c'.repeat(64)), false],
        [env.IMAGE_REPOSITORY + ':sha-' + env.SOURCE_SHA, false],
        [manifest.image.replace('/reserve@', '/another@'), false],
        ['', false],
    ]) {
        const result = execute(image);
        assert.ifError(result.error);
        assert.equal(result.status === 0, accepted, result.stderr + result.stdout);
    }
    const start = deployment.steps.find(step => step.name === 'Docker compose up (target)');
    assert.equal(smoke.env.RESERVE_IMAGE_REFERENCE, start.env.RESERVE_IMAGE_REFERENCE);
    assert.ok(smoke.with.envs.split(',').includes('RESERVE_IMAGE_REFERENCE'));
});

test('CI and CD have independent runs and only verified main CI can reach deployment jobs', () => {
    const ci = yaml.load(read('.github/workflows/CI.yml'));
    const cd = yaml.load(read('.github/workflows/CD.yml'));
    assert.deepEqual(Object.keys(cd.on), ['workflow_dispatch']);
    assert.deepEqual(Object.keys(cd.on.workflow_dispatch.inputs), ['source_sha', 'source_run_id', 'source_run_attempt']);
    assert.equal(ci.jobs.cd, undefined);
    const dispatch = ci.jobs['dispatch-cd'];
    assert.deepEqual(dispatch.needs, jobs.slice(0, 4).map(job => job.name));
    assert.deepEqual(dispatch.permissions, { actions: 'write' });
    const mayDispatch = new Function('github', 'success', 'return ' + dispatch.if);
    const ciContext = { repository: env.GITHUB_REPOSITORY, event_name: 'push', ref: env.GITHUB_REF };
    assert.equal(mayDispatch(ciContext, () => true), true);
    assert.equal(mayDispatch(ciContext, () => false), false);
    for (const change of [{ event_name: 'pull_request' }, { event_name: 'workflow_dispatch' }, { ref: 'refs/heads/dev' }])
        assert.equal(mayDispatch({ ...ciContext, ...change }, () => true), false);
    assert.match(dispatch.steps[0].run, /gh workflow run CD\.yml --repo "\$GITHUB_REPOSITORY" --ref main/);
    for (const [field, variable] of [['sha', 'SHA'], ['run_id', 'RUN_ID'], ['run_attempt', 'RUN_ATTEMPT']])
        assert.ok(dispatch.steps[0].run.includes('-f source_' + field + '="$GITHUB_' + variable + '"'));
    const allowed = new Function('github', 'inputs', 'return ' + cd.jobs['verify-source'].if);
    const group = new Function('github', 'inputs', 'format', 'return ' + cd.concurrency.group.slice(3, -2));
    const queue = github => group(github, event.inputs, (value, id) => value.replace('{0}', id));
    const github = { repository: env.GITHUB_REPOSITORY, run_id: env.GITHUB_RUN_ID, ref: env.GITHUB_REF, sha: env.GITHUB_SHA };
    assert.equal(allowed(github, event.inputs), true);
    assert.equal(queue(github), 'cd-production');
    for (const change of [{ repository: 'foreign/reserve' }, { ref: 'refs/heads/dev' }, { sha: otherSha }]) {
        const ignored = { ...github, ...change };
        assert.equal(allowed(ignored, event.inputs), false);
        assert.equal(queue(ignored), 'cd-ignored-456');
    }
    assert.doesNotMatch(read('.github/workflows/CI.yml'), /appleboy\/|EC2_SSH_KEY|RESERVE_SERVER_IP/);
    assert.deepEqual(cd.jobs['stage-release'].needs, ['verify-source']);
    assert.deepEqual(cd.jobs['deploy-backend'].needs, ['verify-source', 'stage-release']);
    assert.equal(cd.concurrency['cancel-in-progress'], false);
    assert.equal(cd.jobs['verify-source'].steps[0].with.ref, '${{ github.sha }}');
    assert.equal(cd.jobs['verify-source'].steps[0].with['persist-credentials'], false);
    for (const name of ['stage-release', 'deploy-backend']) {
        const steps = cd.jobs[name].steps;
        const current = steps.findIndex(step => step.run === 'node scripts/verify-cd-source.mjs current');
        const server = steps.findIndex(step => /^appleboy\/|detect-active-upstream/.test(step.uses || step.run || ''));
        assert.ok(current >= 0 && server > current);
        assert.equal(cd.jobs[name].if, undefined);
        assert.equal(steps[0].with.ref, '${{ needs.verify-source.outputs.sha }}');
        assert.equal(steps[0].with['persist-credentials'], false);
        assert.deepEqual(cd.jobs[name].env, { SOURCE_SHA: '${{ needs.verify-source.outputs.sha }}',
            SOURCE_RUN_ID: '${{ needs.verify-source.outputs.run-id }}', SOURCE_RUN_ATTEMPT: '${{ needs.verify-source.outputs.run-attempt }}' });
    }
    assert.doesNotMatch(read('.github/workflows/CD.yml'), /\$GITHUB_RUN_ID|github\.event_name == 'push'/);
    const downloads = Object.values(cd.jobs).flatMap(job => job.steps).filter(step => step.run?.startsWith('gh run download'));
    assert.equal(downloads.length, 3);
    for (const download of downloads) {
        assert.match(download.run, /gh run download "\$SOURCE_RUN_ID"/);
        assert.match(download.run, /--name "(?:frontend|marketing|backend)-release-\$SOURCE_SHA"/);
    }
    assert.equal(cd.env.SOURCE_RUN_ID, '${{ inputs.source_run_id }}');
    assert.equal(cd.env.SOURCE_RUN_ATTEMPT, '${{ inputs.source_run_attempt }}');
    assert.equal(cd.env.SOURCE_SHA, '${{ inputs.source_sha }}');
    const start = cd.jobs['deploy-backend'].steps.find(step => step.name === 'Docker compose up (target)');
    assert.deepEqual(cd.jobs['verify-source'].outputs, { sha: '${{ steps.source.outputs.sha }}',
        'run-id': '${{ steps.source.outputs.run-id }}', 'run-attempt': '${{ steps.source.outputs.run-attempt }}',
        digest: '${{ steps.image.outputs.digest }}' });
    assert.match(read('.github/workflows/CI.yml'), /version: 2, sha: process\.env\.COMMIT_SHA, runId: process\.env\.GITHUB_RUN_ID/);
    assert.match(read('.github/workflows/CI.yml'), /runAttempt: process\.env\.GITHUB_RUN_ATTEMPT/);
    assert.equal(start.env.RESERVE_IMAGE_REFERENCE, "${{ format('{0}/reserve@{1}', secrets.DOCKERHUB_USERNAME, needs.verify-source.outputs.digest) }}");
    assert.ok(start.with.envs.split(',').includes('RESERVE_IMAGE_REFERENCE'));
    assert.match(start.with.script, /sudo docker pull "\$RESERVE_IMAGE_REFERENCE"/);
    const staging = cd.jobs['stage-release'].steps;
    const stagedCheck = staging.findIndex(step => step.name === 'Require current main before server access');
    assert.ok(stagedCheck > staging.findIndex(step => step.name === 'Download marketing release'));
    const deployment = cd.jobs['deploy-backend'].steps;
    for (const [guard, action] of [['Recheck source CI before target startup', 'Docker compose up (target)'],
        ['Recheck source CI before cutover', 'Cut over frontend and backend']]) {
        const index = deployment.findIndex(step => step.name === action);
        assert.equal(deployment[index - 1].name, guard);
        assert.equal(deployment[index - 1].run, 'node scripts/verify-cd-source.mjs current');
    }
});
