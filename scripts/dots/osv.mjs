import { isIP } from 'node:net';
import { digest, plain } from './contracts.mjs';

export const OSV_LIMITS = Object.freeze({ batch: 100, timeoutMs: 10_000, responseBytes: 2 * 1024 * 1024, pages: 10, packages: 10_000, advisories: 500, requests: 650 });
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const TOKEN = value => typeof value === 'string' && value.length > 0 && value.length <= 4096;
const VERSION = /^[0-9][A-Za-z0-9.+_~-]{0,127}$/;
const ECOSYSTEMS = new Set(['npm', 'Maven', 'PyPI', 'Packagist']);
const SEVERITIES = ['UNKNOWN', 'LOW', 'MODERATE', 'HIGH', 'CRITICAL'];
export const SEVERITY_SOURCES = Object.freeze(['UNKNOWN', 'OSV.database_specific', 'OSV.affected.ecosystem_specific', 'OSV.affected.database_specific']);
const tupleKey = item => [item.ecosystem, item.name, item.version].join('|');
const itemKey = item => [item.ecosystem, item.name].join('|');
function validPackage(item) {
    if (!plain(item) || item.publicRegistryEvidence !== true || !ECOSYSTEMS.has(item.ecosystem) || !VERSION.test(item.version)
        || !Array.isArray(item.usage) || !item.usage.length || item.usage.some(usage => !['runtime', 'build', 'dev', 'test'].includes(usage))
        || typeof item.sourceHash !== 'string' || !/^[a-f0-9]{64}$/.test(item.sourceHash)) return false;
    if (item.ecosystem === 'npm') return /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(item.name);
    if (item.ecosystem === 'Maven') return /^[A-Za-z0-9._-]+:[A-Za-z0-9._-]+$/.test(item.name);
    if (item.ecosystem === 'PyPI') return /^[a-z0-9._-]+$/.test(item.name);
    return /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/.test(item.name);
}
function safeReference(value) {
    try {
        if (typeof value !== 'string' || value.length > 2048) return null;
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.username || url.password || url.port || isIP(url.hostname)
            || !url.hostname.includes('.') || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(url.hostname)) return null;
        return url.href;
    } catch { return null; }
}
function timestamp(value) {
    return typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}
export function redactAdvisory(value, id, item) {
    if (!plain(value) || value.id !== id || !Array.isArray(value.affected) || !Array.isArray(value.references ?? [])) throw new Error('INVALID_RESPONSE');
    const aliases = [...new Set([id, ...(Array.isArray(value.aliases) ? value.aliases : [])].filter(alias => typeof alias === 'string' && ID.test(alias)))].sort().slice(0, 50);
    const affected = value.affected.filter(entry => entry?.package?.ecosystem === item.ecosystem && entry.package.name === item.name);
    if (!affected.length && !timestamp(value.withdrawn)) throw new Error('INVALID_RESPONSE');
    const fixedVersions = [...new Set(affected.flatMap(entry => Array.isArray(entry.ranges) ? entry.ranges.flatMap(range => Array.isArray(range.events) ? range.events.map(event => event?.fixed) : []) : []).filter(version => typeof version === 'string' && VERSION.test(version)))].sort().slice(0, 100);
    let severity = 'UNKNOWN';
    let severitySource = 'UNKNOWN';
    for (const [entry, source] of [
        [value.database_specific, 'OSV.database_specific'],
        ...affected.map(record => [record.ecosystem_specific, 'OSV.affected.ecosystem_specific']),
        ...affected.map(record => [record.database_specific, 'OSV.affected.database_specific']),
    ]) {
        const candidate = typeof entry?.severity === 'string' ? entry.severity.toUpperCase().replace('MEDIUM', 'MODERATE') : '';
        if (SEVERITIES.indexOf(candidate) > SEVERITIES.indexOf(severity)) { severity = candidate; severitySource = source; }
    }
    const references = [{ type: 'OSV', url: 'https://osv.dev/vulnerability/' + encodeURIComponent(id) }];
    for (const reference of value.references.slice(0, 100)) {
        const url = safeReference(reference?.url);
        const type = ['ADVISORY', 'REPORT', 'FIX', 'PACKAGE', 'WEB', 'EVIDENCE', 'ARTICLE', 'DETECTION', 'DISCUSSION', 'INTRODUCED'].includes(reference?.type) ? reference.type : 'WEB';
        if (url && !references.some(record => record.url === url)) references.push({ type, url });
        if (references.length >= 20) break;
    }
    return { id, aliases, modified: timestamp(value.modified), withdrawn: timestamp(value.withdrawn), severity, severitySource, applicability: 'NOT_ASSESSED', fixedVersions, references, detailState: 'complete' };
}
async function boundedJson(response, maxBytes) {
    if (!response?.ok || !response.body?.getReader) throw new Error('HTTP_OR_BODY_ERROR');
    const declared = response.headers?.get('content-length');
    if (declared !== null && declared !== undefined && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) throw new Error('RESPONSE_LIMIT');
    const reader = response.body.getReader();
    const chunks = [];
    let bytes = 0;
    try {
        while (true) {
            const result = await reader.read();
            if (result.done) break;
            bytes += result.value.byteLength;
            if (bytes > maxBytes) throw new Error('RESPONSE_LIMIT');
            chunks.push(Buffer.from(result.value));
        }
        return JSON.parse(Buffer.concat(chunks, bytes).toString('utf8'));
    } finally { await reader.cancel().catch(() => {}); }
}
function client(fetchImpl, limits) {
    let requests = 0;
    return async (kind, data) => {
        if (++requests > limits.requests) throw new Error('REQUEST_LIMIT');
        const url = kind === 'batch' ? 'https://api.osv.dev/v1/querybatch' : 'https://api.osv.dev/v1/vulns/' + encodeURIComponent(data);
        if (kind !== 'batch' && (kind !== 'advisory' || !ID.test(data))) throw new Error('INVALID_RESPONSE');
        const abort = new AbortController();
        let timer;
        try {
            const deadline = new Promise((resolve, reject) => {
                timer = setTimeout(() => { abort.abort(); reject(new Error('REQUEST_TIMEOUT')); }, limits.timeoutMs);
            });
            const work = (async () => {
                const options = { method: kind === 'batch' ? 'POST' : 'GET', redirect: 'error', signal: abort.signal, credentials: 'omit', headers: { accept: 'application/json' } };
                if (kind === 'batch') { options.headers['content-type'] = 'application/json'; options.body = JSON.stringify({ queries: data }); }
                return boundedJson(await fetchImpl(url, options), limits.responseBytes);
            })();
            return await Promise.race([work, deadline]);
        } finally { clearTimeout(timer); abort.abort(); }
    };
}
function reason(error) {
    return ['REQUEST_LIMIT', 'RESPONSE_LIMIT', 'REQUEST_TIMEOUT', 'INVALID_RESPONSE', 'HTTP_OR_BODY_ERROR', 'ADVISORY_LIMIT', 'PAGE_LIMIT'].includes(error?.message) ? error.message : 'OSV_UNAVAILABLE';
}

// 명시적인 scan 호출만 외부에 연결하며 모듈 import는 조회하지 않아요.
export async function scanManifest(manifest, { allowNetwork = false, fetchImpl = globalThis.fetch, now = Date.now(), limits: overrides = {} } = {}) {
    if (allowNetwork !== true) return { schemaVersion: 1, scannedAt: new Date(now).toISOString(), status: 'UNKNOWN', reason: 'NETWORK_OPT_IN_REQUIRED', projects: [], vulnerabilityCount: null };
    if (!plain(manifest) || !Array.isArray(manifest.projects) || manifest.projects.length > 6
        || manifest.projects.some(project => !['reserve', 'kiwoom', 'hktech'].includes(project.project) || !['candidate', 'production'].includes(project.deploymentScope) || !Array.isArray(project.dependencies))
        || Object.entries(overrides).some(([key, value]) => !Object.hasOwn(OSV_LIMITS, key) || !Number.isInteger(value) || value < 1 || value > OSV_LIMITS[key])) throw new Error('INVALID_SCAN_INPUT');
    const limits = { ...OSV_LIMITS, ...overrides };
    const tuples = new Map();
    let rejected = 0;
    for (const project of manifest.projects ?? []) for (const item of project.dependencies ?? []) {
        if (!validPackage(item)) { rejected++; continue; }
        const key = tupleKey(item);
        if (!tuples.has(key)) tuples.set(key, { ecosystem: item.ecosystem, name: item.name, version: item.version, ids: new Set(), queryComplete: false, detailComplete: true, issue: null });
    }
    if (tuples.size > limits.packages) return { schemaVersion: 1, scannedAt: new Date(now).toISOString(), status: 'UNKNOWN', reason: 'PACKAGE_LIMIT', projects: [], vulnerabilityCount: null };
    const request = client(fetchImpl, limits);
    const list = [...tuples.values()];
    for (let offset = 0; offset < list.length; offset += limits.batch) {
        let pending = list.slice(offset, offset + limits.batch).map(item => ({ item, token: null, seen: new Set() }));
        for (let page = 0; pending.length && page < limits.pages; page++) {
            try {
                // 프로젝트·출처·해시·경로·잠금 파일 원문은 전송하지 않아요.
                const queries = pending.map(({ item, token }) => ({
                    package: { ecosystem: item.ecosystem, name: item.name }, version: item.version,
                    ...(token ? { page_token: token } : {}),
                }));
                const response = await request('batch', queries);
                if (!Array.isArray(response?.results) || response.results.length !== pending.length) throw new Error('INVALID_RESPONSE');
                const next = [];
                for (let i = 0; i < pending.length; i++) {
                    const entry = pending[i];
                    const result = response.results[i];
                    if (!plain(result) || (result.vulns !== undefined && !Array.isArray(result.vulns)) || (result.next_page_token !== undefined && result.next_page_token !== '' && !TOKEN(result.next_page_token))) throw new Error('INVALID_RESPONSE');
                    for (const vulnerability of result.vulns ?? []) {
                        if (typeof vulnerability?.id !== 'string' || !ID.test(vulnerability.id) || entry.item.ids.size >= limits.advisories) throw new Error('INVALID_RESPONSE');
                        entry.item.ids.add(vulnerability.id);
                    }
                    if (result.next_page_token) {
                        if (entry.seen.has(result.next_page_token)) throw new Error('INVALID_RESPONSE');
                        entry.seen.add(result.next_page_token);
                        next.push({ ...entry, token: result.next_page_token });
                    } else { entry.item.queryComplete = true; }
                }
                pending = next;
            } catch (error) {
                for (const entry of pending) { entry.item.queryComplete = false; entry.item.issue = reason(error); }
                pending = [];
            }
        }
        for (const entry of pending) { entry.item.queryComplete = false; entry.item.issue = 'PAGE_LIMIT'; }
    }
    const details = new Map();
    let advisoryCount = 0;
    for (const item of list) {
        item.advisories = [];
        for (const id of item.ids) {
            let detail = details.get(id);
            if (!detail) {
                if (++advisoryCount > limits.advisories) detail = { state: 'unknown', reason: 'ADVISORY_LIMIT' };
                else {
                    try { detail = { state: 'complete', value: await request('advisory', id) }; }
                    catch (error) { detail = { state: 'unknown', reason: reason(error) }; }
                }
                details.set(id, detail);
            }
            try {
                if (detail.state !== 'complete') throw new Error(detail.reason);
                item.advisories.push(redactAdvisory(detail.value, id, item));
            } catch (error) {
                item.detailComplete = false;
                item.issue = reason(error);
                item.advisories.push({ id, aliases: [id], severity: 'UNKNOWN', severitySource: 'UNKNOWN', applicability: 'NOT_ASSESSED', withdrawn: null, modified: null, fixedVersions: [], references: [{ type: 'OSV', url: 'https://osv.dev/vulnerability/' + encodeURIComponent(id) }], detailState: 'unknown' });
            }
        }
    }
    const projects = (manifest.projects ?? []).map(project => {
        const packages = new Map();
        for (const source of project.dependencies ?? []) {
            if (!validPackage(source)) continue;
            const item = tuples.get(tupleKey(source));
            const key = tupleKey(source);
            const previous = packages.get(key);
            packages.set(key, {
                ecosystem: item.ecosystem, name: item.name, version: item.version,
                usage: [...new Set([...(previous?.usage ?? []), ...source.usage])].sort(),
                sourceHashes: [...new Set([...(previous?.sourceHashes ?? []), source.sourceHash])].sort(),
                status: item.queryComplete && item.detailComplete ? 'COMPLETE' : 'UNKNOWN',
                reason: item.issue, advisories: item.advisories, queryComplete: item.queryComplete,
            });
        }
        const all = [...packages.values()];
        const complete = project.inventoryState === 'complete' && all.every(item => item.status === 'COMPLETE') && all.length > 0;
        return {
            project: project.project, deploymentScope: project.deploymentScope, inventoryHash: project.inventoryHash,
            production: { state: 'unverified', reason: 'DEPLOYED_ARTIFACT_INVENTORY_NOT_CONNECTED' },
            inventoryState: project.inventoryState, status: complete ? 'COMPLETE' : all.some(item => item.status === 'COMPLETE') ? 'PARTIAL' : 'UNKNOWN',
            packageCount: all.length, packages: all, coverage: project.coverage,
            vulnerabilityCount: complete ? groupFindings(all).length : null,
            knownVulnerabilityCount: groupFindings(all).length,
        };
    });
    const complete = projects.length > 0 && rejected === 0 && projects.every(project => project.status === 'COMPLETE');
    const result = { schemaVersion: 1, scannedAt: new Date(now).toISOString(), provider: 'OSV', status: complete ? 'COMPLETE' : projects.some(project => project.status !== 'UNKNOWN') ? 'PARTIAL' : 'UNKNOWN', rejectedPackages: rejected, vulnerabilityCount: complete ? projects.reduce((sum, project) => sum + project.vulnerabilityCount, 0) : null, projects };
    return { ...result, resultHash: digest(result) };
}

// GHSA·OSV·CVE 별칭을 합쳐 같은 경고를 한 번만 알려요.
export function groupFindings(packages) {
    const groups = [];
    for (const item of packages) for (const advisory of item.advisories ?? []) {
        if (advisory.withdrawn) continue;
        const aliases = new Set([advisory.id, ...advisory.aliases]);
        const overlaps = groups.filter(group => group.packageKey === itemKey(item) && [...aliases].some(alias => group.aliases.has(alias)));
        const group = { packageKey: itemKey(item), ecosystem: item.ecosystem, name: item.name, aliases, versions: new Set([item.version]), usage: new Set(item.usage), severity: advisory.severity, severitySource: SEVERITY_SOURCES.includes(advisory.severitySource) ? advisory.severitySource : 'UNKNOWN', references: new Map(advisory.references.map(reference => [reference.url, reference])), fixedVersions: new Set(advisory.fixedVersions), detailComplete: advisory.detailState === 'complete' };
        for (const other of overlaps) {
            other.aliases.forEach(alias => group.aliases.add(alias));
            other.versions.forEach(version => group.versions.add(version));
            other.usage.forEach(usage => group.usage.add(usage));
            other.references.forEach((reference, url) => group.references.set(url, reference));
            other.fixedVersions.forEach(version => group.fixedVersions.add(version));
            if (SEVERITIES.indexOf(other.severity) > SEVERITIES.indexOf(group.severity)) { group.severity = other.severity; group.severitySource = other.severitySource; }
            group.detailComplete &&= other.detailComplete;
            groups.splice(groups.indexOf(other), 1);
        }
        groups.push(group);
    }
    return groups.map(group => {
        const aliases = [...group.aliases].sort();
        return { ecosystem: group.ecosystem, name: group.name, advisoryId: aliases.find(alias => /^CVE-\d{4}-\d{4,}$/.test(alias)) ?? aliases[0], aliases, versions: [...group.versions].sort(), usage: [...group.usage].sort(), severity: group.severity, severitySource: group.severitySource, applicability: 'NOT_ASSESSED', references: [...group.references.values()], fixedVersions: [...group.fixedVersions].sort(), detailComplete: group.detailComplete };
    }).sort((a, b) => [a.ecosystem, a.name, a.advisoryId].join('|').localeCompare([b.ecosystem, b.name, b.advisoryId].join('|')));
}
