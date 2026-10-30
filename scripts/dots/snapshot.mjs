import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { digest, RELEASE } from './contracts.mjs';

const exec = promisify(execFile);
export const FIXED = Object.freeze({
    config: '/etc/reserve-dots/agent.json', state: '/var/lib/reserve-dots',
    verifier: '/usr/local/bin/reserve-post-deploy-verify',
    verifierConfig: '/etc/reserve-dots/verifier.env',
});
const ENV = Object.freeze({ PATH: '/usr/sbin:/usr/bin:/sbin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', RESERVE_VERIFY_ENV: FIXED.verifierConfig });
async function command(binary, args, timeout = 5000) {
    try {
        const result = await exec(binary, args, { env: ENV, timeout, maxBuffer: 256 * 1024, windowsHide: true });
        return { exitCode: 0, stdout: result.stdout };
    } catch (error) {
        return { exitCode: Number.isInteger(error.code) ? error.code : null, stdout: typeof error.stdout === 'string' ? error.stdout : '' };
    }
}
export function requireProtectedFile(file, maxBytes) {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== 0 || (stat.mode & 0o022) || stat.size > maxBytes) throw new Error('CONFIG_NOT_READY');
    return stat;
}
export function validateVerifierConfig(text) {
    const fields = {};
    for (const line of text.split(/\r?\n/).map(value => value.trim())) {
        if (!line || line.startsWith('#')) continue;
        const match = line.match(/^(DB_NAME|MYSQL_CONTAINER|DB_USER|DB_PASSWORD)=(.*)$/);
        if (!match || Object.hasOwn(fields, match[1])) return false;
        const raw = match[2];
        let value;
        if (/^'[^'\r\n]*'$/.test(raw)) value = raw.slice(1, -1);
        else if (/^[A-Za-z0-9_.,:@%+=/-]+$/.test(raw)) value = raw;
        else return false; // No shell expressions, interpolation or command substitution.
        fields[match[1]] = value;
    }
    return fields.DB_NAME === 'reserve' && fields.MYSQL_CONTAINER === 'mysql' && fields.DB_USER === 'reserve_dots_reader'
        && typeof fields.DB_PASSWORD === 'string' && fields.DB_PASSWORD.length >= 20;
}
export function parseIdentity(routing, image) {
    const match = routing.trim().match(/^set \$service_url (blue|green);$/);
    const release = image.trim().match(/:sha-([a-f0-9]{40})$/)?.[1];
    if (!match || !release) throw new Error('SOURCE_UNAVAILABLE');
    return { upstream: match[1], release };
}
export function parseCounts(stdout, exitCode) {
    if (![0, 2].includes(exitCode)) return { state: 'unknown', reason: 'VERIFIER_EXECUTION_FAILED', counts: null };
    const fields = [
        [/^\[check\] stale READY payments \(> [1-9]\d*d\): (\d+)$/, ['staleReadyPayments']],
        [/^\[check\] open payment reconciliation issues: (\d+)$/, ['openPaymentIssues']],
        [/^\[check\] unfinished PortOne webhooks: (\d+)$/, ['unfinishedWebhooks']],
        [/^\[check\] file deletion outbox: pending=(\d+), failed=(\d+)$/, ['pendingFileDeletions', 'failedFileDeletions']],
        [/^\[check\] OAuth unlink outbox: unresolved=(\d+)$/, ['unresolvedOAuthUnlinks']],
        [/^\[check\] payment invariants: ledger=(\d+), reservation-deposit=(\d+)$/, ['ledgerInvariantViolations', 'depositInvariantViolations']],
    ];
    const counts = {};
    for (const line of stdout.split(/\r?\n/)) for (const [pattern, names] of fields) {
        const match = line.match(pattern);
        if (!match) continue;
        for (let i = 0; i < names.length; i++) {
            const value = Number(match[i + 1]);
            if (Object.hasOwn(counts, names[i]) || !Number.isSafeInteger(value)) return { state: 'unknown', reason: 'VERIFIER_CONTRACT_MISMATCH', counts: null };
            counts[names[i]] = value;
        }
    }
    if (Object.keys(counts).length !== 8) return { state: 'unknown', reason: 'VERIFIER_CONTRACT_MISMATCH', counts: null };
    const warning = Object.entries(counts).some(([key, value]) => key !== 'pendingFileDeletions' && value > 0);
    if (warning !== (exitCode === 2)) return { state: 'unknown', reason: 'VERIFIER_CONTRACT_MISMATCH', counts: null };
    return { state: warning ? 'attention' : 'observed', counts };
}
const METRICS = new Set(['cpu_pct', 'cpu_exec_pct', 'cpu_iowait_pct', 'cpu_steal_pct', 'mem_used_pct', 'mem_available_mb', 'disk_used_pct', 'load1', 'load15']);
export function parseMetrics(text, ageSeconds) {
    const values = {};
    for (const line of text.split(/\r?\n/)) {
        const match = line.match(/^kind=host metric=([a-z0-9_]+) value=(\d+(?:\.\d+)?)$/);
        if (match && METRICS.has(match[1]) && Number.isFinite(Number(match[2]))) values[match[1]] = Number(match[2]);
    }
    if (Object.keys(values).length !== METRICS.size || !Number.isFinite(ageSeconds) || ageSeconds < 0 || ageSeconds > 180) return { state: 'unknown', reason: 'METRICS_MISSING_OR_STALE', values: null };
    // The existing collector can emit fallback zeroes after a command failure and has no sample timestamp.
    return { state: 'unknown', reason: 'METRIC_SAMPLE_VALIDITY_UNVERIFIED', ageSeconds, freshnessBasis: 'file-mtime', quality: 'sample-timestamps-unverified', values };
}
function metrics(now) {
    try {
        const file = '/var/log/metrics/metrics-' + new Date(now).toISOString().slice(0, 10) + '.log';
        const stat = fs.statSync(file);
        const length = Math.min(stat.size, 128 * 1024);
        const fd = fs.openSync(file, 'r');
        try {
            const buffer = Buffer.alloc(length);
            fs.readSync(fd, buffer, 0, length, stat.size - length);
            return parseMetrics(buffer.toString('utf8'), Math.floor((now - stat.mtimeMs) / 1000));
        } finally { fs.closeSync(fd); }
    } catch { return { state: 'unknown', reason: 'METRICS_UNAVAILABLE', values: null }; }
}
function pointers(expectedRelease) {
    const result = {};
    for (const [name, file] of Object.entries({ app: '/usr/share/nginx/html/current', marketing: '/usr/share/nginx/html/marketing/current', legacy: '/usr/share/nginx/html/legacy-domain.current' })) {
        try {
            const value = fs.readlinkSync(file).match(/^releases\/([a-f0-9]{40})$/)?.[1];
            result[name] = value && RELEASE.test(value) ? { state: 'observed', release: value } : { state: 'unknown' };
        } catch { result[name] = { state: 'unknown' }; }
    }
    return { state: Object.values(result).some(value => value.state === 'unknown') ? 'unknown' : Object.values(result).some(value => value.release !== expectedRelease) ? 'attention' : 'observed', releases: result };
}
export function parseContainer(stdout, exitCode) {
    try {
        const data = JSON.parse(stdout);
        if (exitCode === 0 && typeof data.running === 'boolean' && typeof data.oomKilled === 'boolean' && Number.isSafeInteger(data.restartCount) && data.restartCount >= 0) return { state: data.running && !data.oomKilled ? 'observed' : 'attention', running: data.running, oomKilled: data.oomKilled, restartCount: data.restartCount };
    } catch { /* Never return process output. */ }
    return { state: 'unknown' };
}
async function container(name) {
    const result = await command('/usr/bin/docker', ['inspect', '--format', '{"running":{{.State.Running}},"oomKilled":{{.State.OOMKilled}},"restartCount":{{.RestartCount}}}', name]);
    return parseContainer(result.stdout, result.exitCode);
}
function logAge(file, now) {
    try {
        const stat = fs.lstatSync(file);
        if (!stat.isFile() || stat.isSymbolicLink() || now < stat.mtimeMs) return null;
        return Math.floor((now - stat.mtimeMs) / 1000);
    } catch { return null; }
}
export function linuxProviders(config) {
    return {
        async identity() {
            const route = await command('/usr/bin/docker', ['exec', 'nginxserver', 'cat', '/etc/nginx/conf.d/service-env.inc']);
            if (route.exitCode !== 0) throw new Error('SOURCE_UNAVAILABLE');
            const upstream = route.stdout.trim().match(/^set \$service_url (blue|green);$/)?.[1];
            if (!upstream) throw new Error('SOURCE_UNAVAILABLE');
            const image = await command('/usr/bin/docker', ['inspect', '--format', '{{.Config.Image}}', upstream]);
            if (image.exitCode !== 0) throw new Error('SOURCE_UNAVAILABLE');
            return parseIdentity(route.stdout, image.stdout);
        },
        async snapshot(identity, now) {
            const port = identity.upstream === 'blue' ? '8080' : '8081';
            const [health, containerState, alloy, promtail, loki, grafana] = await Promise.all([
                command('/usr/bin/curl', ['--silent', '--show-error', '--connect-timeout', '2', '--max-time', '5', 'http://127.0.0.1:' + port + '/actuator/health']),
                container(identity.upstream), container('alloy'), container('promtail'), container('loki'), container('grafana'),
            ]);
            let healthState = { state: 'unknown', reason: 'HEALTH_UNAVAILABLE' };
            try {
                const data = JSON.parse(health.stdout);
                if (health.exitCode === 0 && ['UP', 'DOWN', 'OUT_OF_SERVICE'].includes(data.status)) healthState = { state: data.status === 'UP' ? 'observed' : 'attention', status: data.status };
            } catch { /* Never return raw process output. */ }
            const collectorConflict = alloy.running === true && promtail.running === true;
            return {
                health: healthState, container: containerState, metrics: metrics(now), pointers: pointers(identity.release),
                monitoring: {
                    state: collectorConflict || alloy.state === 'attention' || loki.state === 'attention' || grafana.state === 'attention' ? 'attention' : 'unknown',
                    reason: collectorConflict ? 'MULTIPLE_COLLECTORS_RUNNING' : 'LOG_INGESTION_NOT_VERIFIED',
                    alloy, promtail, loki, grafana, collectorConflict,
                    appLogAgeSeconds: logAge('/var/log/reserve/app.log', now),
                    backupLogAgeSeconds: logAge('/var/log/reserve/backup.log', now),
                    remoteIngestionVerified: false, offsiteBackupVerified: false, restoreVerified: false,
                },
            };
        },
        async counts() {
            try {
                requireProtectedFile(FIXED.verifier, 128 * 1024);
                const credentials = requireProtectedFile(FIXED.verifierConfig, 4096);
                if (credentials.mode & 0o077) throw new Error('CONFIG_NOT_READY');
                if (!validateVerifierConfig(fs.readFileSync(FIXED.verifierConfig, 'utf8'))) throw new Error('CONFIG_NOT_READY');
                if (digest(fs.readFileSync(FIXED.verifier)) !== config.verifierSha256) throw new Error('VERIFIER_HASH_MISMATCH');
                const result = await command(FIXED.verifier, [], 30_000);
                return parseCounts(result.stdout, result.exitCode);
            } catch (error) {
                return { state: 'unknown', reason: error.message === 'VERIFIER_HASH_MISMATCH' ? error.message : 'VERIFIER_UNAVAILABLE', counts: null };
            }
        },
    };
}
