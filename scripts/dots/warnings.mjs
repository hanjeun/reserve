import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { digest, plain, SHA } from './contracts.mjs';
import { groupFindings, SEVERITY_SOURCES } from './osv.mjs';
import { PROJECTS } from './dependencies.mjs';

const SEVERITIES = ['UNKNOWN', 'LOW', 'MODERATE', 'HIGH', 'CRITICAL'];
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_STATE_BYTES = 8 * 1024 * 1024;
const DIRECTORY = path.join(os.homedir(), '.codex', 'state', 'dots-cve');
const STATE = path.join(DIRECTORY, 'state.json');
const LOCK = path.join(DIRECTORY, 'writer.lock');
const packageKey = item => [item.ecosystem, item.name].join('|');
const namespace = item => [item.project, item.deploymentScope].join('|');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function validTime(value) { return typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value)); }
function assertState(value) {
    if (!plain(value) || value.schemaVersion !== 1 || !Array.isArray(value.records) || value.records.length > 10000 || !plain(value.observations)
        || Object.keys(value).some(key => !['schemaVersion', 'updatedAt', 'records', 'observations'].includes(key))) throw new Error('STATE_UNAVAILABLE');
    for (const record of value.records) {
        if (!plain(record) || !SHA.test(record.key) || !PROJECTS.includes(record.project) || !['candidate', 'production'].includes(record.deploymentScope)
            || !['npm', 'Maven', 'PyPI', 'Packagist'].includes(record.ecosystem)
            || typeof record.name !== 'string' || !/^[A-Za-z0-9@_.:/-]{1,256}$/.test(record.name)
            || typeof record.advisoryId !== 'string' || !ID.test(record.advisoryId)
            || !Array.isArray(record.aliases) || record.aliases.length > 100 || record.aliases.some(alias => typeof alias !== 'string' || !ID.test(alias))
            || !Array.isArray(record.versions) || record.versions.length > 100 || record.versions.some(version => typeof version !== 'string' || !/^[0-9][A-Za-z0-9.+_~-]{0,127}$/.test(version))
            || !SEVERITIES.includes(record.severity) || !['OPEN', 'RESOLVED'].includes(record.status)
            || (record.severitySource !== undefined && !SEVERITY_SOURCES.includes(record.severitySource))
            || (record.applicability !== undefined && record.applicability !== 'NOT_ASSESSED')
            || !['verified', 'unknown'].includes(record.verification) || !validTime(record.firstSeen) || !validTime(record.lastSeen)
            || !Array.isArray(record.usage) || record.usage.some(usage => !['runtime', 'build', 'dev', 'test'].includes(usage))
            || !Array.isArray(record.references) || record.references.length > 40
            || record.references.some(reference => !plain(reference) || !['OSV', 'ADVISORY', 'REPORT', 'FIX', 'PACKAGE', 'WEB', 'EVIDENCE', 'ARTICLE', 'DETECTION', 'DISCUSSION', 'INTRODUCED'].includes(reference.type) || typeof reference.url !== 'string' || !/^https:\/\/[A-Za-z0-9.-]+\//.test(reference.url) || reference.url.length > 2048 || Object.keys(reference).some(key => !['type', 'url'].includes(key)))
            || !Array.isArray(record.fixedVersions) || record.fixedVersions.length > 100 || record.fixedVersions.some(version => typeof version !== 'string' || !/^[0-9][A-Za-z0-9.+_~-]{0,127}$/.test(version))
            || (record.resolvedAt !== undefined && !validTime(record.resolvedAt))
            || Object.keys(record).some(key => !['key', 'project', 'deploymentScope', 'ecosystem', 'name', 'advisoryId', 'aliases', 'versions', 'usage', 'severity', 'severitySource', 'applicability', 'references', 'fixedVersions', 'status', 'verification', 'firstSeen', 'lastSeen', 'resolvedAt'].includes(key))) throw new Error('STATE_UNAVAILABLE');
    }
    if (new Set(value.records.map(record => record.key)).size !== value.records.length) throw new Error('STATE_UNAVAILABLE');
    for (const [key, observation] of Object.entries(value.observations)) {
        const [project, scope, extra] = key.split('|');
        if (!PROJECTS.includes(project) || !['candidate', 'production'].includes(scope) || extra !== undefined || !plain(observation)
            || !['COMPLETE', 'PARTIAL', 'UNKNOWN', 'STALE'].includes(observation.status) || !validTime(observation.observedAt)
            || Object.keys(observation).some(field => !['status', 'observedAt'].includes(field))) throw new Error('STATE_UNAVAILABLE');
    }
    return value;
}
export function updateWarnings(previous, scan, now = Date.now()) {
    const old = previous === null ? { schemaVersion: 1, records: [], observations: {} } : assertState(previous);
    const records = old.records.map(record => ({ ...record, severitySource: record.severitySource ?? 'UNKNOWN', applicability: 'NOT_ASSESSED' }));
    const observations = { ...old.observations };
    const events = [];
    const when = new Date(now).toISOString();
    const scannedAt = Date.parse(scan?.scannedAt);
    const fresh = Number.isFinite(scannedAt) && scannedAt <= now + 30_000 && now - scannedAt <= MAX_AGE_MS;
    const projects = Array.isArray(scan?.projects) ? scan.projects.filter(project => PROJECTS.includes(project.project) && ['candidate', 'production'].includes(project.deploymentScope)) : [];
    const seen = new Set();
    const removed = new Set();
    const emit = (kind, record) => events.push({ kind, key: record.key, project: record.project, deploymentScope: record.deploymentScope, ecosystem: record.ecosystem, name: record.name, advisoryId: record.advisoryId, versions: record.versions, severity: record.severity, severitySource: record.severitySource, applicability: 'NOT_ASSESSED' });
    for (const project of projects) {
        const key = namespace(project);
        const status = !fresh ? 'STALE' : ['COMPLETE', 'PARTIAL', 'UNKNOWN'].includes(project.status) ? project.status : 'UNKNOWN';
        if (observations[key]?.status !== status && (observations[key] || status !== 'COMPLETE')) events.push({ kind: 'OBSERVATION_CHANGED', project: project.project, deploymentScope: project.deploymentScope, status });
        observations[key] = { status, observedAt: when };
        if (!fresh) continue;
        for (const finding of groupFindings(project.packages ?? [])) {
            const matches = records.filter(record => namespace(record) === key && packageKey(record) === packageKey(finding) && finding.aliases.some(alias => record.aliases.includes(alias)));
            const existing = matches[0];
            const verified = finding.detailComplete && (project.packages ?? []).filter(item => packageKey(item) === packageKey(finding) && finding.versions.includes(item.version)).every(item => item.status === 'COMPLETE');
            const severity = !verified && existing && SEVERITIES.indexOf(existing.severity) > SEVERITIES.indexOf(finding.severity) ? existing.severity : finding.severity;
            const severitySource = severity !== finding.severity ? existing.severitySource : finding.severitySource;
            const references = new Map([...matches.flatMap(item => item.references), ...finding.references].map(reference => [reference.url, reference]));
            const record = {
                key: existing?.key ?? digest([project.project, project.deploymentScope, finding.ecosystem, finding.name, finding.advisoryId]),
                project: project.project, deploymentScope: project.deploymentScope,
                ecosystem: finding.ecosystem, name: finding.name, advisoryId: finding.advisoryId,
                aliases: [...new Set([...finding.aliases, ...matches.flatMap(item => item.aliases)])].sort().slice(0, 100),
                versions: finding.versions, usage: finding.usage, severity, severitySource, applicability: 'NOT_ASSESSED',
                references: [...references.values()].slice(0, 40), fixedVersions: !verified && existing ? [...new Set([...existing.fixedVersions, ...finding.fixedVersions])].sort().slice(0, 100) : finding.fixedVersions,
                status: 'OPEN', verification: verified ? 'verified' : 'unknown', firstSeen: existing?.firstSeen ?? when, lastSeen: when,
            };
            if (!existing) { records.push(record); emit('OPENED', record); }
            else {
                records[records.indexOf(existing)] = record;
                if (existing.status === 'RESOLVED') emit('REOPENED', record);
                else if (!same(existing.versions, record.versions)) emit('AFFECTED_VERSION_CHANGED', record);
                else if (SEVERITIES.indexOf(record.severity) > SEVERITIES.indexOf(existing.severity)) emit('SEVERITY_INCREASED', record);
            }
            seen.add(record.key);
            matches.slice(1).forEach(item => removed.add(item.key));
        }
    }
    for (const record of records) {
        if (record.status !== 'OPEN' || seen.has(record.key) || removed.has(record.key)) continue;
        const project = projects.find(item => namespace(item) === namespace(record));
        if (fresh && project?.status === 'COMPLETE' && project.inventoryState === 'complete') {
            record.status = 'RESOLVED';
            record.verification = 'verified';
            record.resolvedAt = when;
            emit('RESOLVED', record);
        } else { record.verification = 'unknown'; }
    }
    // 일부 프로젝트만 선택해도 누락한 프로젝트는 수집 불확실 상태로 남겨요.
    // 프로젝트 누락·PC 오프라인·빈 조회만으로 기존 경고를 닫지 않아요.
    const nextState = { schemaVersion: 1, updatedAt: when, records: records.filter(record => !removed.has(record.key)), observations };
    assertState(nextState);
    return { schemaVersion: 1, events, openWarnings: nextState.records.filter(record => record.status === 'OPEN'), nextState };
}
function checkFile(file) {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_STATE_BYTES
        || (process.platform !== 'win32' && (stat.uid !== process.getuid() || (stat.mode & 0o077)))) throw new Error('STATE_UNAVAILABLE');
}
function ensureDirectory() {
    let current = os.homedir();
    for (const part of ['.codex', 'state', 'dots-cve']) {
        current = path.join(current, part);
        fs.mkdirSync(current, { recursive: true, mode: 0o700 });
        const stat = fs.lstatSync(current);
        if (!stat.isDirectory() || stat.isSymbolicLink() || (process.platform !== 'win32' && (stat.uid !== process.getuid() || (stat.mode & 0o022)))) throw new Error('STATE_UNAVAILABLE');
    }
    const stat = fs.lstatSync(DIRECTORY);
    if (process.platform !== 'win32' && (stat.mode & 0o077)) throw new Error('STATE_UNAVAILABLE');
}
// --remember를 명시해야 기록하며 일정·서비스 설정을 만들지 않아요.
export function rememberScan(scan, now = Date.now()) {
    ensureDirectory();
    let lock;
    try { lock = fs.openSync(LOCK, 'wx', 0o600); }
    catch { throw new Error('STATE_BUSY_OR_UNAVAILABLE'); }
    let temporary;
    try {
        let previous = null;
        try { checkFile(STATE); previous = JSON.parse(fs.readFileSync(STATE, 'utf8')); }
        catch (error) { if (error.code !== 'ENOENT') throw new Error('STATE_UNAVAILABLE'); }
        const result = updateWarnings(previous, scan, now);
        const json = JSON.stringify(result.nextState);
        if (Buffer.byteLength(json) > MAX_STATE_BYTES) throw new Error('STATE_LIMIT');
        temporary = path.join(DIRECTORY, 'state-' + randomUUID() + '.next');
        fs.writeFileSync(temporary, json + '\n', { flag: 'wx', mode: 0o600 });
        fs.renameSync(temporary, STATE);
        temporary = null;
        return { ...result, persistence: 'recorded' };
    } finally {
        if (temporary) fs.rmSync(temporary, { force: true });
        fs.closeSync(lock);
        fs.unlinkSync(LOCK);
    }
}
