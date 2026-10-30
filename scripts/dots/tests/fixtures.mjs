export const now = Date.parse('2026-10-23T00:00:00Z');
export const dependency = (changes = {}) => ({
    ecosystem: 'npm', name: 'example-public-package', version: '1.0.0', usage: ['runtime'],
    sourceId: 'synthetic.lock', sourceHash: 'a'.repeat(64), publicRegistryEvidence: true, ...changes,
});
export const project = (changes = {}) => ({
    project: 'reserve', deploymentScope: 'candidate', inventoryState: 'complete',
    inventoryHash: 'b'.repeat(64), coverage: { scope: 'locked-or-declared-packages', installedRuntimeVerified: false },
    dependencies: [dependency()], ...changes,
});
export const manifest = (projects = [project()]) => ({ schemaVersion: 1, generatedAt: new Date(now).toISOString(), projects });
export const advisory = (id = 'GHSA-aaaa-bbbb-cccc', changes = {}) => ({
    id, modified: '2026-10-22T00:00:00Z', aliases: ['CVE-2026-12345'],
    affected: [{ package: { ecosystem: 'npm', name: 'example-public-package' }, ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '1.0.1' }] }] }],
    references: [{ type: 'ADVISORY', url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc' }],
    database_specific: { severity: 'HIGH' }, ...changes,
});
export const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
