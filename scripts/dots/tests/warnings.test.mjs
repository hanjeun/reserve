import test from 'node:test';
import assert from 'node:assert/strict';
import { updateWarnings } from '../warnings.mjs';
import { redactAdvisory } from '../osv.mjs';
import { advisory, dependency, now } from './fixtures.mjs';

const findingPackage = (changes = {}) => ({
    ...dependency(), status: 'COMPLETE', queryComplete: true,
    advisories: [redactAdvisory(advisory(), 'GHSA-aaaa-bbbb-cccc', dependency())], ...changes,
});
const project = (changes = {}) => ({
    project: 'reserve', deploymentScope: 'candidate', inventoryState: 'complete', status: 'COMPLETE',
    packages: [findingPackage()], ...changes,
});
const scan = (projects = [project()], at = now) => ({ schemaVersion: 1, scannedAt: new Date(at).toISOString(), status: 'COMPLETE', projects });
test('unchanged findings are quiet and a still-affected version change is notified once', () => {
    const initial = updateWarnings(null, scan(), now);
    assert.deepEqual(initial.events.map(event => event.kind), ['OPENED']);
    assert.equal(initial.openWarnings[0].advisoryId, 'CVE-2026-12345');
    assert.equal(initial.openWarnings[0].severitySource, 'OSV.database_specific');
    assert.equal(initial.events[0].applicability, 'NOT_ASSESSED');
    const again = updateWarnings(initial.nextState, scan(), now + 1000);
    assert.deepEqual(again.events, []);
    const changedScan = scan([project({ packages: [findingPackage({ version: '1.0.2' })] })], now + 2000);
    const changed = updateWarnings(again.nextState, changedScan, now + 2000);
    assert.deepEqual(changed.events.map(event => event.kind), ['AFFECTED_VERSION_CHANGED']);
    assert.equal(changed.openWarnings[0].key, initial.openWarnings[0].key);
    assert.deepEqual(changed.openWarnings[0].versions, ['1.0.2']);
    assert.deepEqual(updateWarnings(changed.nextState, changedScan, now + 3000).events, []);
});
test('new CVE aliases retain the existing warning instead of reopening it', () => {
    const noCve = redactAdvisory(advisory('GHSA-aaaa-bbbb-cccc', { aliases: [] }), 'GHSA-aaaa-bbbb-cccc', dependency());
    const initial = updateWarnings(null, scan([project({ packages: [findingPackage({ advisories: [noCve] })] })]), now);
    const updated = updateWarnings(initial.nextState, scan(), now + 1000);
    assert.equal(updated.openWarnings.length, 1);
    assert.equal(updated.openWarnings[0].key, initial.openWarnings[0].key);
    assert.equal(updated.openWarnings[0].advisoryId, 'CVE-2026-12345');
    assert.deepEqual(updated.events, []);
});
test('candidate fixes cannot close production findings', () => {
    const initial = updateWarnings(null, scan([project(), project({ deploymentScope: 'production' })]), now);
    assert.equal(initial.openWarnings.length, 2);
    const candidateClean = updateWarnings(initial.nextState, scan([project({ packages: [findingPackage({ advisories: [] })] })]), now + 1000);
    assert.equal(candidateClean.openWarnings.length, 1);
    assert.equal(candidateClean.openWarnings[0].deploymentScope, 'production');
    assert.equal(candidateClean.openWarnings[0].verification, 'unknown');
    assert.deepEqual(candidateClean.events.map(event => [event.kind, event.deploymentScope]), [['RESOLVED', 'candidate']]);
});
test('unknown, partial, stale and absent inventories keep prior warnings open', () => {
    const initial = updateWarnings(null, scan(), now);
    for (const input of [
        scan([project({ status: 'UNKNOWN', packages: [] })]),
        scan([project({ status: 'PARTIAL', inventoryState: 'partial', packages: [] })]),
        scan([project({ packages: [] })], now - 25 * 60 * 60 * 1000),
        scan([]),
    ]) {
        const result = updateWarnings(initial.nextState, input, now + 1000);
        assert.equal(result.openWarnings.length, 1);
        assert.equal(result.openWarnings[0].verification, 'unknown');
        assert.equal(result.events.some(event => event.kind === 'RESOLVED'), false);
    }
});
test('collection-state changes are deduplicated and recovery alone does not erase a vulnerability', () => {
    const initial = updateWarnings(null, scan(), now);
    const unknown = scan([project({ status: 'UNKNOWN', packages: [] })]);
    const failed = updateWarnings(initial.nextState, unknown, now + 1000);
    assert.deepEqual(failed.events.map(event => event.kind), ['OBSERVATION_CHANGED']);
    assert.deepEqual(updateWarnings(failed.nextState, unknown, now + 2000).events, []);
    const recovered = updateWarnings(failed.nextState, scan(), now + 3000);
    assert.deepEqual(recovered.events.map(event => event.kind), ['OBSERVATION_CHANGED']);
    assert.equal(recovered.openWarnings.length, 1);
});
test('detail failures retain severity and primary references, and recovery does not re-alert severity', () => {
    const initial = updateWarnings(null, scan(), now);
    const incomplete = { id: 'GHSA-aaaa-bbbb-cccc', aliases: ['GHSA-aaaa-bbbb-cccc'], severity: 'UNKNOWN', withdrawn: null, modified: null, fixedVersions: [], references: [{ type: 'OSV', url: 'https://osv.dev/vulnerability/GHSA-aaaa-bbbb-cccc' }], detailState: 'unknown' };
    const failed = updateWarnings(initial.nextState, scan([project({ status: 'UNKNOWN', packages: [findingPackage({ status: 'UNKNOWN', advisories: [incomplete] })] })]), now + 1000);
    assert.equal(failed.openWarnings[0].severity, 'HIGH');
    assert.equal(failed.openWarnings[0].severitySource, 'OSV.database_specific');
    assert.equal(failed.openWarnings[0].verification, 'unknown');
    assert.equal(failed.openWarnings[0].references.some(reference => reference.url.startsWith('https://github.com/advisories/')), true);
    assert.deepEqual(failed.openWarnings[0].fixedVersions, ['1.0.1']);
    const recovered = updateWarnings(failed.nextState, scan(), now + 2000);
    assert.equal(recovered.events.some(event => event.kind === 'SEVERITY_INCREASED' || event.kind === 'OPENED'), false);
});
test('resolution requires a complete fresh observation and is emitted only once', () => {
    const initial = updateWarnings(null, scan(), now);
    const clean = scan([project({ packages: [findingPackage({ advisories: [] })] })]);
    const result = updateWarnings(initial.nextState, clean, now + 1000);
    assert.equal(result.openWarnings.length, 0);
    assert.deepEqual(result.events.map(event => event.kind), ['RESOLVED']);
    assert.deepEqual(updateWarnings(result.nextState, clean, now + 2000).events, []);
});
test('corrupt state is rejected rather than silently discarded', () => {
    assert.throws(() => updateWarnings({ schemaVersion: 1, records: [{ raw: 'synthetic-private-data' }], observations: {} }, scan(), now), /STATE_UNAVAILABLE/);
    assert.throws(() => updateWarnings({ schemaVersion: 1, records: [], observations: {}, raw: 'synthetic-private-data' }, scan(), now), /STATE_UNAVAILABLE/);
});
