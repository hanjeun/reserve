import { appendFileSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const requiredJobs = ['test-backend', 'test-frontend', 'build-backend', 'build-frontend', 'dispatch-cd'];
const shaPattern = /^[a-f0-9]{40}$/;
const runPattern = /^[1-9][0-9]*$/;

export function validateContext(env) {
    if (env.GITHUB_REPOSITORY !== 'hanjeun/reserve' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch'
        || env.GITHUB_REF !== 'refs/heads/main' || !shaPattern.test(env.SOURCE_SHA || '')
        || env.GITHUB_SHA !== env.SOURCE_SHA
        || !runPattern.test(env.GITHUB_RUN_ID || '') || !runPattern.test(env.SOURCE_RUN_ID || '')
        || !runPattern.test(env.SOURCE_RUN_ATTEMPT || '') || env.GITHUB_RUN_ID === env.SOURCE_RUN_ID)
        throw new Error('CD must run on the same main commit as the source CI');
}

function matchesSourceIdentity(run, env) {
    return String(run?.id) === env.SOURCE_RUN_ID && String(run?.run_attempt) === env.SOURCE_RUN_ATTEMPT
        && run.head_repository?.full_name === env.GITHUB_REPOSITORY && run.head_branch === 'main'
        && run.event === 'push' && run.head_sha === env.SOURCE_SHA && run.path === '.github/workflows/CI.yml';
}

export function validateEvent(event, env) {
    validateContext(env);
    if (event?.repository?.full_name !== env.GITHUB_REPOSITORY || event.inputs?.source_sha !== env.SOURCE_SHA
        || event.inputs.source_run_id !== env.SOURCE_RUN_ID || event.inputs.source_run_attempt !== env.SOURCE_RUN_ATTEMPT)
        throw new Error('CD dispatch inputs do not match');
}

export function validateSource(run, jobs, env) {
    validateContext(env);
    if (!matchesSourceIdentity(run, env) || run.status !== 'completed' || run.conclusion !== 'success' || !Array.isArray(jobs)
        || !requiredJobs.every(name => {
            const matching = jobs.filter(job => job.name === name);
            return matching.length === 1 && matching[0].status === 'completed' && matching[0].conclusion === 'success'
                && String(matching[0].run_id) === env.SOURCE_RUN_ID && matching[0].head_sha === env.SOURCE_SHA;
        }))
        throw new Error('Source run or required CI jobs do not match');
}

export function codeqlState(runs, env) {
    const latest = runs.filter(run => run.head_sha === env.SOURCE_SHA && run.event === 'push'
        && run.head_branch === 'main' && run.head_repository?.full_name === env.GITHUB_REPOSITORY
        && run.path === '.github/workflows/codeql.yml').sort((a, b) => b.id - a.id)[0];
    if (!latest || latest.status !== 'completed') return 'pending';
    return latest.conclusion === 'success' ? 'success' : 'failure';
}

export function validateImage(manifest, env) {
    validateContext(env);
    if (!/^[a-z0-9][a-z0-9_.-]*\/reserve$/.test(env.IMAGE_REPOSITORY || '')
        || manifest.version !== 2 || manifest.sha !== env.SOURCE_SHA
        || String(manifest.runId) !== env.SOURCE_RUN_ID || String(manifest.runAttempt) !== env.SOURCE_RUN_ATTEMPT
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
    if (branch.commit?.sha !== process.env.SOURCE_SHA) throw new Error('A newer main commit exists; refusing a stale deployment');
}

async function sourceStatus(deadline = 0) {
    const path = 'actions/runs/' + process.env.SOURCE_RUN_ID;
    let run = await api(path);
    // CD가 시작될 때 호출한 CI 잡은 아직 완료 상태로 기록되지 않았을 수 있다.
    while (matchesSourceIdentity(run, process.env) && run.status !== 'completed' && Date.now() < deadline) {
        await new Promise(done => setTimeout(done, 5_000));
        run = await api(path);
    }
    if (!matchesSourceIdentity(run, process.env) || run.status !== 'completed' || run.conclusion !== 'success')
        throw new Error('Source main CI attempt did not complete successfully');
    const jobs = await api(path + '/jobs?filter=latest&per_page=100');
    validateSource(run, jobs.jobs, process.env);
}

async function sameShaCodeql() {
    const result = await api('actions/workflows/codeql.yml/runs?event=push&branch=main&head_sha='
        + process.env.SOURCE_SHA + '&per_page=100');
    return codeqlState(result.workflow_runs, process.env);
}

function readEvent() {
    try {
        if (statSync(process.env.GITHUB_EVENT_PATH).size > 1024 * 1024) throw new Error();
        return JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    } catch { throw new Error('Invalid workflow_dispatch event payload'); }
}

async function main(command) {
    validateContext(process.env);
    validateEvent(readEvent(), process.env);
    if (command === 'image') {
        const file = 'backend/build/cd-source/release-image.json';
        if (statSync(file).size > 4096) throw new Error('Image manifest exceeds its size limit');
        const image = validateImage(JSON.parse(readFileSync(file, 'utf8')), process.env);
        if (!process.env.GITHUB_OUTPUT) throw new Error('GitHub output is required');
        // 저장소명은 비밀값으로 등록될 수 있어 잡 출력에는 검증한 digest만 전달한다.
        appendFileSync(process.env.GITHUB_OUTPUT, 'digest=' + image.split('@')[1] + '\n');
        console.log('Verified immutable image from the source CI attempt');
        return;
    }
    if (command !== 'source' && command !== 'current') throw new Error('Unknown CD source command');
    await currentMain();
    if (command === 'current') {
        await sourceStatus();
        if (await sameShaCodeql() !== 'success') throw new Error('Latest same-SHA CodeQL is not successful');
        await currentMain();
        return;
    }
    const deadline = Date.now() + 20 * 60_000;
    await sourceStatus(deadline);
    while (Date.now() < deadline) {
        const state = await sameShaCodeql();
        if (state === 'success') {
            await currentMain();
            // CodeQL을 기다리는 동안 원본 CI가 재실행됐으면 산출물을 승격하지 않는다.
            await sourceStatus();
            if (!process.env.GITHUB_OUTPUT) throw new Error('GitHub output is required');
            appendFileSync(process.env.GITHUB_OUTPUT, 'sha=' + process.env.SOURCE_SHA + '\nrun-id='
                + process.env.SOURCE_RUN_ID + '\nrun-attempt=' + process.env.SOURCE_RUN_ATTEMPT + '\n');
            console.log('Verified completed source CI attempt and same-SHA CodeQL');
            return;
        }
        if (state === 'failure') throw new Error('Same-SHA CodeQL failed');
        await new Promise(done => setTimeout(done, 10_000));
    }
    throw new Error('Same-SHA CodeQL did not complete before the deployment deadline');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    main(process.argv[2]).catch(error => { console.error(error.message); process.exitCode = 1; });
}
