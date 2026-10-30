import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTIONS, READ_ACTIONS, RELEASE, digest, parseRequest, safeReason, validateConfig } from './contracts.mjs';
import { FIXED, linuxProviders, requireProtectedFile } from './snapshot.mjs';
import { sanitizeChecks } from './output.mjs';

export async function handleRequest(raw, { loadConfig, store, providers, now = () => Date.now() }) {
    const base = { schemaVersion: 1, project: 'reserve', environment: 'production', readOnly: true, transportVerified: false, executed: false, auditRecorded: false };
    let request;
    try { request = parseRequest(raw, now()); }
    catch (error) { return { ...base, outcome: 'REJECTED', reason: safeReason(error, 'INVALID_REQUEST') }; }
    Object.assign(base, { requestId: request.requestId, action: request.action });
    // 이 실행 파일에는 운영 변경 경로가 없어 설정으로도 쓰기를 켤 수 없어요.
    if (!READ_ACTIONS.includes(request.action)) return { ...base, outcome: 'DENIED', reason: 'WRITE_CAPABILITY_NOT_GRANTED' };
    let claimed = false;
    try {
        const config = validateConfig(await loadConfig());
        if (!config.enabled) return { ...base, outcome: 'DENIED', reason: 'GATEWAY_DISABLED' };
        if (digest(config) !== request.configHash) throw new Error('CONFIG_HASH_MISMATCH');
        if (config.expectedRelease !== request.expectedRelease) throw new Error('EXPECTED_RELEASE_MISMATCH');
        const fingerprint = digest(request);
        const claim = await store.claim(request.requestId, fingerprint, { action: request.action, startedAt: new Date(now()).toISOString(), expectedRelease: request.expectedRelease, configHash: request.configHash });
        if (claim === 'duplicate') return { ...base, outcome: 'DUPLICATE', reason: 'REQUEST_ALREADY_RECORDED', auditRecorded: true };
        claimed = true;
        const identity = await providers.identity();
        if (!['blue', 'green'].includes(identity.upstream) || !RELEASE.test(identity.release) || identity.release !== request.expectedRelease) throw new Error('EXPECTED_RELEASE_MISMATCH');
        parseRequest(raw, now());
        base.executed = true;
        const checks = sanitizeChecks(request.action, request.action === ACTIONS[0] ? await providers.snapshot(identity, now()) : { operations: await providers.counts() }, request.expectedRelease);
        const after = await providers.identity();
        if (after.upstream !== identity.upstream || after.release !== identity.release) throw new Error('IDENTITY_CHANGED');
        const states = Object.values(checks).map(check => check.state);
        const outcome = states.includes('attention') ? 'ATTENTION' : states.includes('unknown') ? 'UNKNOWN' : 'OBSERVED';
        const result = { ...base, outcome, executed: true, observedAt: new Date(now()).toISOString(), release: identity.release, checks };
        await store.complete(request.requestId, { outcome, completedAt: result.observedAt });
        return { ...result, auditRecorded: true };
    } catch (error) {
        const reason = safeReason(error, 'SOURCE_UNAVAILABLE');
        if (claimed) {
            try { await store.complete(request.requestId, { outcome: 'UNKNOWN', reason, completedAt: new Date(now()).toISOString() }); base.auditRecorded = true; }
            catch { return { ...base, outcome: 'UNKNOWN', reason: 'LEDGER_UNAVAILABLE' }; }
        }
        return { ...base, outcome: 'UNKNOWN', reason };
    }
}

export class FileLedger {
    constructor() {
        fs.mkdirSync(FIXED.state, { recursive: true, mode: 0o700 });
        const stat = fs.lstatSync(FIXED.state);
        if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== 0 || (stat.mode & 0o077)) throw new Error('LEDGER_UNAVAILABLE');
    }
    async claim(id, fingerprint, metadata) {
        const file = path.join(FIXED.state, id + '.json');
        if (fs.readdirSync(FIXED.state).length >= 10000) throw new Error('LEDGER_FULL');
        try {
            fs.writeFileSync(file, JSON.stringify({ fingerprint, ...metadata, outcome: 'IN_PROGRESS' }) + '\n', { flag: 'wx', mode: 0o600 });
        } catch (error) {
            if (error.code !== 'EEXIST') throw new Error('LEDGER_UNAVAILABLE');
            requireProtectedFile(file, 4096);
            const old = JSON.parse(fs.readFileSync(file, 'utf8'));
            if (old.fingerprint !== fingerprint) throw new Error('REQUEST_ID_REUSE');
            return 'duplicate';
        }
        return 'claimed';
    }
    async complete(id, result) {
        const file = path.join(FIXED.state, id + '.json');
        requireProtectedFile(file, 4096);
        const previous = JSON.parse(fs.readFileSync(file, 'utf8'));
        const temporary = file + '.next';
        fs.writeFileSync(temporary, JSON.stringify({ ...previous, ...result }) + '\n', { flag: 'wx', mode: 0o600 });
        fs.renameSync(temporary, file);
    }
}

async function main() {
    let raw = '';
    for await (const chunk of process.stdin) {
        raw += chunk;
        if (Buffer.byteLength(raw) > 4096) break;
    }
    let result;
    if (process.argv.length !== 2 || process.platform !== 'linux' || process.getuid?.() !== 0) {
        result = { schemaVersion: 1, outcome: 'REJECTED', executed: false, reason: 'UNSUPPORTED_RUNTIME' };
    } else {
        let config;
        try {
            requireProtectedFile(FIXED.config, 4096);
            config = validateConfig(JSON.parse(fs.readFileSync(FIXED.config, 'utf8')));
            const store = config.enabled ? new FileLedger() : null;
            result = await handleRequest(raw, { loadConfig: async () => config, store, providers: linuxProviders(config) });
        } catch { result = { schemaVersion: 1, outcome: 'UNKNOWN', executed: false, reason: 'CONFIG_NOT_READY' }; }
    }
    process.stdout.write(JSON.stringify(result) + '\n');
    process.exitCode = result.outcome === 'OBSERVED' ? 0 : result.outcome === 'ATTENTION' ? 2 : 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
