// Reuse successful tests, never a dependency-cache hit. No production builds/secrets are cached here.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveBin } from './resolve-bin.mjs';

const VERSION = 1;
const MAX_AGE_MS = 7 * 86_400_000;
const scopes = {
    backend: ['backend', 'scripts/ci-evidence.mjs', 'scripts/resolve-bin.mjs',
        '.github/workflows/CICD.yml', '.gitattributes', 'docker-compose-blue.yml', 'docker-compose-green.yml'],
    frontend: ['frontend', 'backend/src/main', 'scripts', '.github', '.gitattributes', 'nginx', 'monitoring', 'docs/design-system/snapshots'],
};
function componentConfig(requested) {
    // CLI input selects a literal configuration; it never becomes a filesystem path.
    switch (requested) {
        case 'backend': return { component: 'backend', directory: resolve('.ci-evidence/backend') };
        case 'frontend': return { component: 'frontend', directory: resolve('.ci-evidence/frontend') };
        default: throw new Error('Unknown test component');
    }
}
const git = args => {
    const executable = resolveBin('git');
    if (!isAbsolute(executable)) throw new Error('GIT_BIN must be an absolute installation path');
    return execFileSync(executable, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
};
export function evidenceInputPaths(component) {
    componentConfig(component);
    return [...scopes[component]];
}
export function evidenceKey(component, entries, runtime) {
    componentConfig(component);
    // Markdown is checked afresh by the documentation step; executable/lock/test blobs remain inputs.
    const tree = entries.split('\0').filter(Boolean).filter(entry => !entry.split('\t')[1]?.endsWith('.md')).sort();
    return createHash('sha256').update(JSON.stringify({ version: VERSION, component, tree, runtime })).digest('hex');
}
export function eligibleRun(run, repository, now = Date.now()) {
    const age = now - Date.parse(run.updated_at);
    return run.conclusion === 'success' && run.status === 'completed'
        && run.path === '.github/workflows/CICD.yml' && run.head_repository?.full_name === repository
        && (run.event === 'pull_request' || (run.event === 'push' && run.head_branch === 'main'))
        && /^[a-f0-9]{40}$/.test(run.head_sha) && age >= 0 && age < MAX_AGE_MS;
}
export function freshProof(proof, now = Date.now()) {
    const age = now - Date.parse(proof?.executedAt);
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(proof?.executedAt || '')
        && age >= 0 && age < MAX_AGE_MS;
}
function runtimeIdentity(component) {
    let java;
    if (component === 'backend') {
        // setup-java supplies the trusted JDK installation; never search the caller's PATH.
        const javaHome = process.env.JAVA_HOME;
        if (!javaHome || !isAbsolute(javaHome)) throw new Error('JAVA_HOME must be an absolute JDK installation path');
        java = execFileSync(join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java'), ['--version'], {
            encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
        }).toString();
    }
    return { node: process.version, platform: process.platform, arch: process.arch,
        image: process.env.ImageOS, imageVersion: process.env.ImageVersion,
        configRevision: process.env.CI_TEST_CONFIG_REVISION || '1',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, locale: process.env.LANG,
        ...(java ? { java } : {}) };
}
function keyAt(component, ref, runtime) {
    return evidenceKey(component, git(['ls-tree', '-r', '-z', ref, '--', ...evidenceInputPaths(component)]), runtime);
}
const output = values => {
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT,
        Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join(''));
};
const summary = value => {
    console.log(value);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${value}\n`);
};
async function api(path) {
    const response = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/${path}`, {
        headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' },
        redirect: 'manual', signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Evidence API status ${response.status}`);
    return response.json();
}
async function readProof(artifact) {
    if (!/^sha256:[a-f0-9]{64}$/.test(artifact.digest || '') || artifact.size_in_bytes > 16384) return null;
    const redirect = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/actions/artifacts/${artifact.id}/zip`, {
        headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }, redirect: 'manual', signal: AbortSignal.timeout(10_000),
    });
    if (redirect.status !== 302) return null;
    const location = new URL(redirect.headers.get('location'));
    if (location.protocol !== 'https:') return null;
    // The signed download receives NO GitHub token. Check the API's archive digest before opening it.
    const response = await fetch(location, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return null;
    const archive = Buffer.from(await response.arrayBuffer());
    if (archive.length > 16384 || `sha256:${createHash('sha256').update(archive).digest('hex')}` !== artifact.digest) return null;
    const directory = mkdtempSync(join(tmpdir(), 'reserve-ci-proof-'));
    try {
        const file = join(directory, 'proof.zip');
        writeFileSync(file, archive);
        // Evidence restoration runs only on the workflow's Ubuntu runners.
        return JSON.parse(execFileSync('/usr/bin/unzip', ['-p', file, 'evidence.json'], {
            encoding: 'utf8', maxBuffer: 4096, stdio: ['ignore', 'pipe', 'pipe'],
        }));
    } finally { rmSync(directory, { recursive: true, force: true }); }
}
async function restore(component, key, runtime) {
    if (!process.env.GITHUB_TOKEN || process.env.CI_FORCE_TESTS === 'true') return null;
    const result = await api(`actions/artifacts?per_page=100&name=ci-evidence-${component}-${key}`);
    for (const artifact of result.artifacts.slice(0, 5)) {
        if (artifact.expired || artifact.name !== `ci-evidence-${component}-${key}` || !artifact.workflow_run?.id) continue;
        const run = await api(`actions/runs/${artifact.workflow_run.id}`);
        if (!eligibleRun(run, process.env.GITHUB_REPOSITORY)) continue;
        const jobs = await api(`actions/runs/${run.id}/jobs?filter=latest&per_page=100`);
        if (!jobs.jobs.some(job => job.name === `test-${component}` && job.conclusion === 'success')) continue;
        git(['fetch', '--no-tags', '--depth=1', 'origin', run.head_sha]);
        // Do not trust a key claimed by an artifact: recompute from that run's actual Git tree.
        if (keyAt(component, run.head_sha, runtime) !== key) continue;
        const proof = await readProof(artifact);
        if (proof?.version !== VERSION || proof.component !== component || proof.key !== key
            || !/^\d+$/.test(String(proof.originRunId)) || !freshProof(proof)) continue;
        return { runId: run.id, originRunId: proof.originRunId, executedAt: proof.executedAt };
    }
    return null;
}
export async function main(mode, requestedComponent) {
    if (mode !== 'restore' && mode !== 'record') throw new Error('Expected restore or record');
    const { component, directory } = componentConfig(requestedComponent);
    const runtime = runtimeIdentity(component);
    const key = keyAt(component, 'HEAD', runtime);
    if (mode === 'restore') {
        output({ key, reused: false });
        let proof = null;
        try { proof = await restore(component, key, runtime); }
        catch { summary(`${component}: no trustworthy reusable evidence; execute tests normally.`); }
        if (proof) {
            output({ reused: true, origin_run: proof.originRunId, executed_at: proof.executedAt });
            summary(`${component}: reused identical-input successful tests from run ${proof.runId} (original ${proof.originRunId}).`);
        } else summary(`${component}: tests required (new inputs, expired evidence, or forced run).`);
    } else if (mode === 'record') {
        const originRunId = process.env.EVIDENCE_ORIGIN || process.env.GITHUB_RUN_ID;
        if (!/^\d+$/.test(originRunId || '')) throw new Error('Missing evidence run ID');
        const executedAt = process.env.EVIDENCE_EXECUTED_AT || new Date().toISOString();
        if (!freshProof({ executedAt })) throw new Error('Expired or invalid original test timestamp');
        mkdirSync(directory, { recursive: true });
        writeFileSync(join(directory, 'evidence.json'), JSON.stringify({ version: VERSION, component, key, originRunId, executedAt }));
        output({ key });
    }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    await main(process.argv[2], process.argv[3]);
}
