import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { assertIdentity, DEFAULTS, IDENTITY_PATH, LIMITS, parseOrigin, SCENARIOS, validateAttestation, validateCookies, validatePlan } from './reservation-admission-contract.mjs';

const DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const exec = promisify(execFile);
const hash = value => createHash('sha256').update(value).digest('hex');
const ALLOWED_METRICS = Object.freeze([
    'http_req_duration', 'http_req_failed', 'http_reqs', 'iterations', 'dropped_iterations',
    'join_latency_ms', 'status_latency_ms', 'booking_latency_ms', 'idempotency_pair_ms', 'queue_wait_ms',
    'unexpected_responses', 'requests_completed', 'iterations_completed', 'queue_admitted', 'queue_wait_censored',
    'booking_confirmed_pairs', 'booking_rejected_pairs', 'idempotency_unverified_pairs', 'idempotency_mismatches', 'reservations_unique_observed',
    'state_waiting', 'state_admitted', 'state_claimed', 'state_consumed', 'state_expired', 'state_closed', 'state_not_open', 'state_full', 'state_cancelled',
]);
export function parseArguments(args) {
    const options = { ...DEFAULTS, approved: false, fixture: null, cookies: null };
    const seen = new Set();
    for (let i = 0; i < args.length; i++) {
        const key = args[i];
        if (seen.has(key)) throw new Error('INVALID_ARGUMENTS');
        seen.add(key);
        if (key === '--run-synthetic-load') { options.approved = true; continue; }
        if (!['--origin', '--scenario', '--rate', '--duration-seconds', '--vus', '--fixture', '--cookies'].includes(key) || i + 1 >= args.length) throw new Error('INVALID_ARGUMENTS');
        const value = args[++i];
        if (key === '--origin') options.origin = parseOrigin(value);
        else if (key === '--scenario') { if (!SCENARIOS.includes(value)) throw new Error('INVALID_ARGUMENTS'); options.scenario = value; }
        else if (key === '--fixture' || key === '--cookies') options[key.slice(2)] = value;
        else {
            if (!/^[1-9]\d{0,2}$/.test(value)) throw new Error('INVALID_ARGUMENTS');
            options[key === '--duration-seconds' ? 'durationSeconds' : key.slice(2)] = Number(value);
        }
    }
    if (!options.approved) throw new Error('EXPLICIT_SYNTHETIC_APPROVAL_REQUIRED');
    if (!options.fixture || !options.cookies) throw new Error('PRIVATE_FIXTURE_AND_COOKIES_REQUIRED');
    parseOrigin(options.origin);
    return options;
}
export function privateFile(file, maximumBytes) {
    if (!['win32', 'linux'].includes(process.platform) || typeof file !== 'string' || !path.isAbsolute(file)
        || /^[/\\]{2}/.test(file) || /[?#\0]/.test(file)) throw new Error('PRIVATE_LOCAL_FILE_REQUIRED');
    const resolved = path.resolve(file);
    const actual = fs.realpathSync(resolved);
    if ((process.platform === 'win32' ? actual.toLowerCase() !== resolved.toLowerCase() : actual !== resolved)) throw new Error('PRIVATE_LOCAL_FILE_REQUIRED');
    const before = fs.lstatSync(actual);
    if (!before.isFile() || before.isSymbolicLink() || before.size < 2 || before.size > maximumBytes) throw new Error('PRIVATE_LOCAL_FILE_REQUIRED');
    if (process.platform === 'win32') {
        try {
            const result = execFileSync('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe', [
                '-NoProfile', '-NonInteractive', '-File', path.join(DIRECTORY, 'check-private-file.ps1'), '-LiteralPath', actual,
            ], { encoding: 'utf8', windowsHide: true, timeout: 5000, maxBuffer: 1024, stdio: ['ignore', 'pipe', 'pipe'] });
            if (result.trim() !== 'PRIVATE') throw new Error('not private');
        } catch { throw new Error('PRIVATE_LOCAL_FILE_REQUIRED'); }
    } else if (before.uid !== process.getuid() || (before.mode & 0o077)) throw new Error('PRIVATE_LOCAL_FILE_REQUIRED');
    const bytes = fs.readFileSync(actual);
    const after = fs.lstatSync(actual);
    if (before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error('PRIVATE_LOCAL_FILE_REQUIRED');
    let value;
    try { value = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('INVALID_PRIVATE_JSON'); }
    return { value, sha256: hash(bytes), file: actual };
}
export async function readIdentity(origin) {
    parseOrigin(origin);
    return new Promise((resolve, reject) => {
        let timer;
        const finish = (error, value) => { clearTimeout(timer); if (error) reject(error); else resolve(value); };
        const request = http.get(origin + IDENTITY_PATH, { headers: { accept: 'application/json' }, timeout: 3000 }, response => {
            if (response.statusCode !== 200) { response.destroy(); finish(new Error('FIXTURE_IDENTITY_UNAVAILABLE')); return; }
            let length = 0;
            const chunks = [];
            response.on('data', chunk => {
                length += chunk.length;
                if (length > LIMITS.responseBytes) { request.destroy(); finish(new Error('FIXTURE_IDENTITY_UNAVAILABLE')); return; }
                chunks.push(chunk);
            });
            response.on('end', () => {
                try { finish(null, JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
                catch { finish(new Error('FIXTURE_IDENTITY_UNAVAILABLE')); }
            });
            response.on('error', () => finish(new Error('FIXTURE_IDENTITY_UNAVAILABLE')));
        });
        timer = setTimeout(() => { request.destroy(); finish(new Error('FIXTURE_IDENTITY_UNAVAILABLE')); }, 5000);
        request.on('timeout', () => { request.destroy(); finish(new Error('FIXTURE_IDENTITY_UNAVAILABLE')); });
        request.on('error', () => finish(new Error('FIXTURE_IDENTITY_UNAVAILABLE')));
    });
}
export function sanitizeSummary(value) {
    if (value?.schemaVersion !== 1 || !SCENARIOS.includes(value.scenario) || !['MEASURED', 'INCOMPLETE'].includes(value.measurementStatus)
        || !value.metrics || typeof value.metrics !== 'object' || Array.isArray(value.metrics)) throw new Error('K6_SUMMARY_UNAVAILABLE');
    const metrics = {};
    for (const key of ALLOWED_METRICS) if (value.metrics[key]) {
        const source = value.metrics[key];
        metrics[key] = {};
        for (const field of ['count', 'rate', 'avg', 'min', 'med', 'max', 'p(95)', 'p(99)', 'passes', 'fails']) {
            if (Number.isFinite(source[field]) && source[field] >= 0) metrics[key][field] = source[field];
        }
    }
    return {
        schemaVersion: 1, scenario: value.scenario, measurementStatus: value.measurementStatus,
        targetClassification: 'PROVISIONAL_EXPERIMENT_TARGET_NOT_SERVICE_SLO',
        productionCapacityProven: false, databaseInvariantsProven: false, redisAtomicityProven: false,
        metrics, thresholdsPassed: value.thresholdsPassed === true,
    };
}
export async function launchK6({ plan, attestation, cookies }) {
    const env = {
        PATH: process.env.PATH ?? '', TEMP: os.tmpdir(), TMP: os.tmpdir(),
        K6_NO_USAGE_REPORT: 'true',
        RESERVE_LOAD_APPROVED: 'synthetic-only', RESERVE_LOAD_RUNNER_VERIFIED: '1',
        RESERVE_LOAD_PLAN: JSON.stringify(plan),
        RESERVE_LOAD_ATTESTATION: attestation.file, RESERVE_LOAD_COOKIE_FILE: cookies.file,
        RESERVE_LOAD_ATTESTATION_SHA256: attestation.sha256, RESERVE_LOAD_COOKIE_SHA256: cookies.sha256,
    };
    if (process.platform === 'win32') { env.SystemRoot = 'C:/Windows'; env.WINDIR = 'C:/Windows'; }
    let stdout, exitCode = 0;
    try {
        const result = await exec('k6', [
            'run', '--no-usage-report', '--no-color', '--quiet', '--address', '127.0.0.1:0',
            '--config', path.join(DIRECTORY, 'k6.local.config.json'),
            path.join(DIRECTORY, 'reservation-admission.k6.js'),
        ], { env, windowsHide: true, timeout: (plan.durationSeconds + 150) * 1000, maxBuffer: 1024 * 1024 });
        stdout = result.stdout;
    } catch (error) {
        if (!Number.isInteger(error.code) || typeof error.stdout !== 'string') throw new Error('K6_UNAVAILABLE_OR_ABORTED');
        exitCode = error.code;
        stdout = error.stdout;
    }
    const summaries = stdout.split(/\r?\n/).filter(line => line.startsWith('RESERVE_LOAD_SUMMARY '));
    if (summaries.length !== 1 || summaries[0].length > 65536) throw new Error('K6_SUMMARY_UNAVAILABLE');
    let summary;
    try { summary = sanitizeSummary(JSON.parse(summaries[0].slice('RESERVE_LOAD_SUMMARY '.length))); }
    catch { throw new Error('K6_SUMMARY_UNAVAILABLE'); }
    return { exitCode, summary };
}
export async function run(args, { readPrivate = privateFile, identity = readIdentity, launch = launchK6, now = () => Date.now() } = {}) {
    let executionAttempted = false;
    try {
        const options = parseArguments(args);
        const attestation = readPrivate(options.fixture, LIMITS.responseBytes);
        const expected = validateAttestation(attestation.value, options.origin, now());
        const plan = validatePlan({ origin: options.origin, scenario: options.scenario, rate: options.rate, durationSeconds: options.durationSeconds, vus: options.vus }, expected, now());
        const cookies = readPrivate(options.cookies, 1024 * 1024);
        validateCookies(cookies.value, expected, plan.vus, now());
        assertIdentity(expected, await identity(plan.origin), now());
        executionAttempted = true;
        const result = await launch({ plan, attestation, cookies });
        return { schemaVersion: 1, status: result.exitCode === 0 && result.summary.measurementStatus === 'MEASURED' && result.summary.thresholdsPassed === true ? 'MEASURED' : 'INCOMPLETE', executed: true, executionAttempted, exitCode: result.exitCode, summary: sanitizeSummary(result.summary) };
    } catch (error) {
        const reasons = new Set(['INVALID_ARGUMENTS', 'EXPLICIT_SYNTHETIC_APPROVAL_REQUIRED', 'PRIVATE_FIXTURE_AND_COOKIES_REQUIRED', 'LOOPBACK_ORIGIN_REQUIRED',
            'PRIVATE_LOCAL_FILE_REQUIRED', 'INVALID_PRIVATE_JSON', 'INVALID_FIXTURE_CONTRACT', 'FIXTURE_EXPIRED_OR_INVALID', 'FIXTURE_IDENTITY_MISMATCH', 'FIXTURE_IDENTITY_UNAVAILABLE',
            'SYNTHETIC_COOKIES_REQUIRED', 'INVALID_LOAD_PLAN', 'FIXTURE_TTL_TOO_SHORT', 'K6_UNAVAILABLE_OR_ABORTED', 'K6_SUMMARY_UNAVAILABLE']);
        return { schemaVersion: 1, status: 'DENIED_OR_UNAVAILABLE', executed: executionAttempted ? null : false, executionAttempted, reason: reasons.has(error?.message) ? error.message : 'FIXTURE_OR_LOAD_UNAVAILABLE' };
    }
}
async function main() {
    const result = await run(process.argv.slice(2));
    process.stdout.write(JSON.stringify(result) + '\n');
    process.exitCode = result.status === 'MEASURED' ? 0 : 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
