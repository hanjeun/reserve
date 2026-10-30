import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectManifest, parseArguments } from './dependencies.mjs';
import { scanManifest } from './osv.mjs';
import { rememberScan, updateWarnings } from './warnings.mjs';

export async function run(args, { collect = collectManifest, scan = scanManifest, remember = rememberScan, now = Date.now() } = {}) {
    let options;
    try { options = parseArguments(args); }
    catch { return { schemaVersion: 1, status: 'REJECTED', reason: 'INVALID_ARGUMENTS', networkUsed: false }; }
    const manifest = collect(options.project, now);
    if (!options.scan) return { schemaVersion: 1, status: manifest.projects.length > 0 && manifest.projects.every(project => project.inventoryState === 'complete') ? 'INVENTORIED' : 'UNKNOWN', networkUsed: false, manifest };
    const result = await scan(manifest, { now, allowNetwork: true });
    let warnings;
    try { warnings = options.remember ? remember(result, now) : { ...updateWarnings(null, result, now), persistence: 'not-recorded' }; }
    catch {
        // An unreadable ledger is not replaced and cannot make old warnings disappear.
        return { schemaVersion: 1, status: 'UNKNOWN', reason: 'WARNING_STATE_UNAVAILABLE', networkUsed: true, manifest, scan: result, warnings: null };
    }
    const { nextState, ...publicWarnings } = warnings;
    return { schemaVersion: 1, networkUsed: true, manifest, scan: result, warnings: publicWarnings };
}
async function main() {
    let result;
    try { result = await run(process.argv.slice(2)); }
    catch { result = { schemaVersion: 1, status: 'UNKNOWN', reason: 'COLLECTION_OR_SCAN_UNAVAILABLE' }; }
    process.stdout.write(JSON.stringify(result) + '\n');
    process.exitCode = result.status === 'UNKNOWN' || result.status === 'REJECTED' || (result.scan && result.scan.status !== 'COMPLETE') ? 1 : result.warnings?.openWarnings.length ? 2 : 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
