import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assessPullRequest } from '../pr-review-audit.mjs';

const check = (name, conclusion = 'SUCCESS') => ({ name, status: 'COMPLETED', conclusion });
const pr = (checks) => ({ number: 1, isDraft: false, statusCheckRollup: checks });

test('no checks and only unrelated successful checks remain blocked', () => {
    assert.equal(assessPullRequest(pr([])).checksReady, false);
    assert.deepEqual(assessPullRequest(pr([check('CodeQL')])).missing, ['build-backend', 'build-frontend']);
});

test('both successful builds are necessary, but never constitute merge approval', () => {
    assert.equal(assessPullRequest(pr([check('build-backend'), check('build-frontend')])).checksReady, true);
    assert.equal(assessPullRequest(pr([check('build-backend'), check('build-frontend', 'SKIPPED')])).checksReady, false);
    assert.equal(assessPullRequest(pr([check('build-backend'), check('build-frontend', 'NEUTRAL')])).checksReady, false);
});

test('failed, pending and draft PRs cannot be reported ready', () => {
    const builds = [check('build-backend'), check('build-frontend')];
    assert.equal(assessPullRequest(pr([...builds, check('security', 'FAILURE')])).checksReady, false);
    assert.equal(assessPullRequest(pr([...builds, { name: 'security', status: 'QUEUED' }])).checksReady, false);
    assert.equal(assessPullRequest({ ...pr(builds), isDraft: true }).checksReady, false);
});

test('legacy status contexts and absent labels are supported', () => {
    const report = assessPullRequest(pr([
        { context: 'build-backend', state: 'SUCCESS' },
        { context: 'build-frontend', state: 'SUCCESS' },
    ]));
    assert.equal(report.checksReady, true);
    assert.deepEqual(report.labels, []);
});
