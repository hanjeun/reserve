import { plain, RELEASE } from './contracts.mjs';

export const COUNT_KEYS = Object.freeze(['staleReadyPayments', 'openPaymentIssues', 'unfinishedWebhooks', 'pendingFileDeletions', 'failedFileDeletions', 'unresolvedOAuthUnlinks', 'ledgerInvariantViolations', 'depositInvariantViolations']);
export const METRIC_KEYS = Object.freeze(['cpu_pct', 'cpu_exec_pct', 'cpu_iowait_pct', 'cpu_steal_pct', 'mem_used_pct', 'mem_available_mb', 'disk_used_pct', 'load1', 'load15']);
const count = value => Number.isSafeInteger(value) && value >= 0;
const age = value => value === null || count(value) ? value : null;
function container(value) {
    if (value?.state === 'unknown') return { state: 'unknown' };
    if (!plain(value) || typeof value.running !== 'boolean' || typeof value.oomKilled !== 'boolean' || !count(value.restartCount)) throw new Error('SOURCE_CONTRACT_MISMATCH');
    return { state: value.running && !value.oomKilled ? 'observed' : 'attention', running: value.running, oomKilled: value.oomKilled, restartCount: value.restartCount };
}
function operations(value) {
    if (value?.state === 'unknown') return {
        state: 'unknown',
        reason: ['VERIFIER_EXECUTION_FAILED', 'VERIFIER_CONTRACT_MISMATCH', 'VERIFIER_HASH_MISMATCH', 'VERIFIER_UNAVAILABLE'].includes(value.reason) ? value.reason : 'VERIFIER_UNAVAILABLE',
        counts: null,
    };
    if (!plain(value?.counts) || COUNT_KEYS.some(key => !count(value.counts[key]))) throw new Error('SOURCE_CONTRACT_MISMATCH');
    const counts = Object.fromEntries(COUNT_KEYS.map(key => [key, value.counts[key]]));
    return { state: COUNT_KEYS.some(key => key !== 'pendingFileDeletions' && counts[key] > 0) ? 'attention' : 'observed', counts };
}
function metrics(value) {
    if (!plain(value?.values) || METRIC_KEYS.some(key => !Number.isFinite(value.values[key]) || value.values[key] < 0) || !count(value.ageSeconds) || value.ageSeconds > 180) return { state: 'unknown', reason: 'METRICS_MISSING_OR_STALE', values: null };
    return {
        state: 'unknown', reason: 'METRIC_SAMPLE_VALIDITY_UNVERIFIED', ageSeconds: value.ageSeconds,
        freshnessBasis: 'file-mtime', quality: 'sample-timestamps-unverified',
        values: Object.fromEntries(METRIC_KEYS.map(key => [key, value.values[key]])),
    };
}
function pointers(value, expectedRelease) {
    const releases = {};
    for (const name of ['app', 'marketing', 'legacy']) {
        const release = value?.releases?.[name]?.release;
        releases[name] = typeof release === 'string' && RELEASE.test(release) ? { state: 'observed', release } : { state: 'unknown' };
    }
    return {
        state: Object.values(releases).some(record => record.state === 'unknown') ? 'unknown' : Object.values(releases).some(record => record.release !== expectedRelease) ? 'attention' : 'observed',
        releases,
    };
}
export function sanitizeChecks(action, value, expectedRelease) {
    // Projection is intentional: even an adapter regression cannot return arbitrary fields or prose.
    if (action === 'reserve.verify_counts.v1') return { operations: operations(value?.operations) };
    if (!plain(value)) throw new Error('SOURCE_CONTRACT_MISMATCH');
    const health = ['UP', 'DOWN', 'OUT_OF_SERVICE'].includes(value.health?.status)
        ? { state: value.health.status === 'UP' ? 'observed' : 'attention', status: value.health.status }
        : { state: 'unknown', reason: 'HEALTH_UNAVAILABLE' };
    const observed = value.monitoring ?? {};
    const alloy = container(observed.alloy), promtail = container(observed.promtail), loki = container(observed.loki), grafana = container(observed.grafana);
    const collectorConflict = alloy.running === true && promtail.running === true;
    const monitoring = {
        state: collectorConflict || [alloy, loki, grafana].some(record => record.state === 'attention') ? 'attention' : 'unknown',
        reason: collectorConflict ? 'MULTIPLE_COLLECTORS_RUNNING' : 'LOG_INGESTION_NOT_VERIFIED',
        alloy, promtail, loki, grafana, collectorConflict,
        appLogAgeSeconds: age(observed.appLogAgeSeconds), backupLogAgeSeconds: age(observed.backupLogAgeSeconds),
        remoteIngestionVerified: false, offsiteBackupVerified: false, restoreVerified: false,
    };
    return { health, container: container(value.container), metrics: metrics(value.metrics), pointers: pointers(value.pointers, expectedRelease), monitoring };
}
