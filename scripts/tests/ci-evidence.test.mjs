import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eligibleRun, evidenceKey, freshProof, main } from '../ci-evidence.mjs';

const entries = '100644 blob aaaa\tfrontend/src/App.jsx\0' +
    '100644 blob bbbb\tfrontend/package-lock.json\0' +
    '100644 blob cccc\tfrontend/src/App.test.jsx\0' +
    '100644 blob dddd\t.github/workflows/CICD.yml\0';
const runtime = { node: 'v22.21.0', image: 'ubuntu24', imageVersion: '1', configRevision: '1' };
test('CLI rejects unsupported modes and path-like components before executing tools or writing files', async () => {
    await assert.rejects(main('unsupported', 'frontend'), /Expected restore or record/);
    for (const component of ['../outside', '/tmp/outside', 'C:\\outside', 'frontend/../outside', '__proto__', 'constructor', '', undefined]) {
        await assert.rejects(main('record', component), /Unknown test component/);
        assert.throws(() => evidenceKey(component, entries, runtime), /Unknown test component/);
    }
});
test('reuse identity ignores commit ancestry and input ordering, not code or tests', () => {
    const key = evidenceKey('frontend', entries, runtime);
    assert.equal(key, evidenceKey('frontend', entries.split('\0').reverse().join('\0'), runtime));
    for (const id of ['aaaa', 'bbbb', 'cccc', 'dddd']) {
        assert.notEqual(key, evidenceKey('frontend', entries.replace(id, 'changed'), runtime));
    }
});
test('toolchain, runner and configuration changes invalidate evidence', () => {
    const key = evidenceKey('frontend', entries, runtime);
    for (const field of Object.keys(runtime)) {
        assert.notEqual(key, evidenceKey('frontend', entries, { ...runtime, [field]: 'changed' }));
    }
    assert.notEqual(key, evidenceKey('backend', entries, runtime));
    assert.throws(() => evidenceKey('arbitrary', entries, runtime));
});
test('documentation changes do not require repeated browser execution', () => {
    assert.equal(evidenceKey('frontend', entries, runtime),
        evidenceKey('frontend', `${entries}100644 blob efef\tfrontend/README.md\0`, runtime));
});
const now = Date.parse('2026-09-28T00:00:00Z');
test('reuse does not renew the original test expiration or accept output injection', () => {
    assert.equal(freshProof({ executedAt: '2026-09-27T00:00:00.000Z' }, now), true);
    for (const executedAt of ['2026-09-20T00:00:00.000Z', '2026-09-29T00:00:00.000Z',
        '2026-09-27T00:00:00.000Z\nreused=true', undefined]) {
        assert.equal(freshProof({ executedAt }, now), false);
    }
});
const run = { conclusion: 'success', status: 'completed', path: '.github/workflows/CICD.yml',
    head_repository: { full_name: 'hanjeun/reserve' }, event: 'pull_request', head_branch: 'feature/ui',
    head_sha: 'a'.repeat(40), updated_at: '2026-09-27T00:00:00Z' };
test('only recent same-repository successful CICD runs are eligible', () => {
    assert.equal(eligibleRun(run, 'hanjeun/reserve', now), true);
    for (const change of [{ conclusion: 'failure' }, { conclusion: 'cancelled' }, { status: 'in_progress' },
        { path: '.github/workflows/codeql.yml' }, { head_repository: { full_name: 'fork/reserve' } },
        { event: 'workflow_dispatch' }, { head_sha: 'arbitrary' }, { updated_at: '2026-09-20T00:00:00Z' },
        { updated_at: '2026-09-29T00:00:00Z' }, { event: 'push', head_branch: 'feature/ui' }]) {
        assert.equal(eligibleRun({ ...run, ...change }, 'hanjeun/reserve', now), false);
    }
    assert.equal(eligibleRun({ ...run, event: 'push', head_branch: 'main' }, 'hanjeun/reserve', now), true);
});
