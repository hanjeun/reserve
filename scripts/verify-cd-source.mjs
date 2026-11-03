import { appendFileSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const requiredJobs = ['test-backend', 'test-frontend', 'build-backend', 'build-frontend'];
const shaPattern = /^[a-f0-9]{40}$/;

export function validateContext(env) {
    if (env.GITHUB_REPOSITORY !== 'hanjeun/reserve' || env.GITHUB_EVENT_NAME !== 'push'
        || env.GITHUB_REF !== 'refs/heads/main' || !shaPattern.test(env.GITHUB_SHA || '')
        || !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID || '')) throw new Error('CD requires the original main push context');
}

export function validateSource(run, jobs, env) {
    validateContext(env);
    if (String(run.id) !== env.GITHUB_RUN_ID || run.path !== '.github/workflows/CI.yml'
        || run.head_repository?.full_name !== env.GITHUB_REPOSITORY || run.head_branch !== 'main'
        || run.event !== 'push' || run.head_sha !== env.GITHUB_SHA
        || !requiredJobs.every(name => jobs.some(job => job.name === name && job.conclusion === 'success')))
        throw new Error('Source run or required CI jobs do not match');
}

export function codeqlState(runs, env) {
    const latest = runs.filter(run => run.head_sha === env.GITHUB_SHA && run.event === 'push'
        && run.head_branch === 'main' && run.head_repository?.full_name === env.GITHUB_REPOSITORY
        && run.path === '.github/workflows/codeql.yml').sort((a, b) => b.id - a.id)[0];
    if (!latest || latest.status !== 'completed') return 'pending';
    return latest.conclusion === 'success' ? 'success' : 'failure';
}

export function validateImage(manifest, env) {
    validateContext(env);
    if (!/^[a-z0-9][a-z0-9_.-]*\/reserve$/.test(env.IMAGE_REPOSITORY || '')
        || manifest.version !== 1 || manifest.sha !== env.GITHUB_SHA
        || String(manifest.runId) !== env.GITHUB_RUN_ID
        || typeof manifest.image !== 'string' || !manifest.image.startsWith(env.IMAGE_REPOSITORY + '@')
        || !/^[a-z0-9][a-z0-9_.\/-]*\/reserve@sha256:[a-f0-9]{64}$/.test(manifest.image))
        throw new Error('Image manifest does not match the source run');
    return manifest.image;
}

async function api(path) {
    const response = await fetch('https://api.github.com/repos/' + process.env.GITHUB_REPOSITORY + '/' + path, {
        headers: { Authorization: 'Bearer ' + process.env.GITHUB_TOKEN, Accept: 'application/vnd.github+json' },
        redirect: 'error', signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error('CD source API status ' + response.status);
    return response.json();
}

async function currentMain() {
    validateContext(process.env);
    const branch = await api('branches/main');
    if (branch.commit?.sha !== process.env.GITHUB_SHA) throw new Error('A newer main commit exists; refusing a stale deployment');
}

async function main(command) {
    validateContext(process.env);
    if (command === 'image') {
        const file = 'backend/build/cd-source/release-image.json';
        if (statSync(file).size > 4096) throw new Error('Image manifest exceeds its size limit');
        const image = validateImage(JSON.parse(readFileSync(file, 'utf8')), process.env);
        if (!process.env.GITHUB_OUTPUT) throw new Error('GitHub output is required');
        appendFileSync(process.env.GITHUB_OUTPUT, 'image=' + image + '\n');
        console.log('Verified immutable image from this CI run');
        return;
    }
    if (command !== 'source' && command !== 'current') throw new Error('Unknown CD source command');
    await currentMain();
    if (command === 'current') return;
    const run = await api('actions/runs/' + process.env.GITHUB_RUN_ID);
    const jobs = await api('actions/runs/' + process.env.GITHUB_RUN_ID + '/jobs?filter=latest&per_page=100');
    validateSource(run, jobs.jobs, process.env);
    const deadline = Date.now() + 20 * 60_000;
    while (Date.now() < deadline) {
        const result = await api('actions/workflows/codeql.yml/runs?event=push&branch=main&head_sha='
            + process.env.GITHUB_SHA + '&per_page=100');
        const state = codeqlState(result.workflow_runs, process.env);
        if (state === 'success') { await currentMain(); console.log('Verified required CI jobs and same-SHA CodeQL'); return; }
        if (state === 'failure') throw new Error('Same-SHA CodeQL failed');
        await new Promise(done => setTimeout(done, 10_000));
    }
    throw new Error('Same-SHA CodeQL did not complete before the deployment deadline');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    main(process.argv[2]).catch(error => { console.error(error.message); process.exitCode = 1; });
}
