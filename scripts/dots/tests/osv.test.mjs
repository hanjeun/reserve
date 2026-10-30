import test from 'node:test';
import assert from 'node:assert/strict';
import { scanManifest } from '../osv.mjs';
import { advisory, dependency, json, manifest, now, project } from './fixtures.mjs';

const scan = (input, options) => scanManifest(input, { allowNetwork: true, now, ...options });
test('network requires opt-in even when a library is invoked directly', async () => {
    let calls = 0;
    const result = await scanManifest(manifest(), { fetchImpl: () => { calls++; throw new Error('must not fetch'); } });
    assert.equal(result.reason, 'NETWORK_OPT_IN_REQUIRED');
    assert.equal(calls, 0);
});
test('query payload is public package tuples only and identical candidate queries share one request', async () => {
    const requests = [];
    const input = manifest([project(), project({ project: 'hktech', deploymentScope: 'production' })]);
    const result = await scan(input, { fetchImpl: async (url, options) => {
        requests.push({ url, options });
        assert.equal(options.redirect, 'error');
        assert.equal(options.credentials, 'omit');
        if (url.endsWith('querybatch')) {
            const body = JSON.parse(options.body);
            assert.deepEqual(body, { queries: [{ package: { ecosystem: 'npm', name: 'example-public-package' }, version: '1.0.0' }] });
            assert.equal(options.body.includes('reserve'), false);
            assert.equal(options.body.includes('synthetic.lock'), false);
            assert.equal(options.body.includes('sourceHash'), false);
            return json({ results: [{ vulns: [{ id: 'GHSA-aaaa-bbbb-cccc', modified: '2026-10-22T00:00:00Z' }] }] });
        }
        assert.equal(url, 'https://api.osv.dev/v1/vulns/GHSA-aaaa-bbbb-cccc');
        return json(advisory());
    } });
    assert.equal(requests.length, 2);
    assert.equal(result.status, 'COMPLETE');
    assert.equal(result.projects.length, 2);
    assert.equal(result.projects[0].vulnerabilityCount, 1);
    assert.equal(result.projects[0].deploymentScope, 'candidate');
    assert.equal(result.projects[1].deploymentScope, 'production');
    assert.equal(result.projects[0].production.state, 'unverified');
});
test('an empty successful response means zero only with complete input and completed querying', async () => {
    const complete = await scan(manifest(), { fetchImpl: async () => json({ results: [{}] }) });
    assert.equal(complete.status, 'COMPLETE');
    assert.equal(complete.vulnerabilityCount, 0);
    const partial = await scan(manifest([project({ inventoryState: 'partial' })]), { fetchImpl: async () => json({ results: [{}] }) });
    assert.equal(partial.status, 'PARTIAL');
    assert.equal(partial.vulnerabilityCount, null);
    const failed = await scan(manifest(), { fetchImpl: async () => json({}, 503) });
    assert.equal(failed.status, 'UNKNOWN');
    assert.equal(failed.vulnerabilityCount, null);
    assert.equal(failed.projects[0].packages[0].reason, 'HTTP_OR_BODY_ERROR');
});
test('batch bounds and per-result pagination are preserved', async () => {
    const calls = [];
    const input = manifest([project({ dependencies: [dependency(), dependency({ name: 'second-public-package' })] })]);
    const result = await scan(input, { limits: { batch: 1 }, fetchImpl: async (url, options) => {
        const body = JSON.parse(options.body);
        calls.push(body);
        assert.equal(body.queries.length, 1);
        return json({ results: [body.queries[0].page_token ? {} : { next_page_token: 'opaque-page-token' }] });
    } });
    assert.equal(result.status, 'COMPLETE');
    assert.equal(calls.length, 4);
    assert.equal(calls[1].queries[0].page_token, 'opaque-page-token');
    assert.equal(calls[3].queries[0].page_token, 'opaque-page-token');
    assert.equal(result.vulnerabilityCount, 0);
});
test('a page cap, repeated token or malformed result cannot become a healthy zero', async () => {
    const capped = await scan(manifest(), { limits: { pages: 1 }, fetchImpl: async () => json({ results: [{ next_page_token: 'token' }] }) });
    assert.equal(capped.projects[0].packages[0].reason, 'PAGE_LIMIT');
    assert.equal(capped.vulnerabilityCount, null);
    const repeated = await scan(manifest(), { fetchImpl: async () => json({ results: [{ next_page_token: 'token' }] }) });
    assert.equal(repeated.projects[0].packages[0].reason, 'INVALID_RESPONSE');
    const malformed = await scan(manifest(), { fetchImpl: async () => json({ results: [] }) });
    assert.equal(malformed.status, 'UNKNOWN');
    assert.equal(malformed.vulnerabilityCount, null);
});
test('timeouts, oversized bodies, redirect errors and HTTP rate limits are bounded unknowns', async () => {
    const timeout = await scan(manifest(), { limits: { timeoutMs: 2 }, fetchImpl: () => new Promise(() => {}) });
    assert.equal(timeout.projects[0].packages[0].reason, 'REQUEST_TIMEOUT');
    const oversize = await scan(manifest(), { limits: { responseBytes: 20 }, fetchImpl: async () => json({ results: [{ oversized: 'x'.repeat(100) }] }) });
    assert.equal(oversize.projects[0].packages[0].reason, 'RESPONSE_LIMIT');
    const rateLimit = await scan(manifest(), { fetchImpl: async () => json({}, 429) });
    assert.equal(rateLimit.vulnerabilityCount, null);
    let requests = 0;
    const redirect = await scan(manifest(), { fetchImpl: async (url, options) => {
        requests++;
        assert.equal(options.redirect, 'error');
        return new Response(null, { status: 302, headers: { location: 'https://synthetic-private.invalid/' } });
    } });
    assert.equal(redirect.status, 'UNKNOWN');
    assert.equal(requests, 1);
});
test('invalid advisory IDs do not become URLs, and missing details retain known warnings', async () => {
    let requests = 0;
    const badId = await scan(manifest(), { fetchImpl: async () => { requests++; return json({ results: [{ vulns: [{ id: '../../synthetic-private' }] }] }); } });
    assert.equal(requests, 1);
    assert.equal(badId.status, 'UNKNOWN');
    const missing = await scan(manifest(), { fetchImpl: async url => url.endsWith('querybatch')
        ? json({ results: [{ vulns: [{ id: 'GHSA-aaaa-bbbb-cccc' }] }] }) : json({}, 503) });
    assert.equal(missing.status, 'UNKNOWN');
    assert.equal(missing.vulnerabilityCount, null);
    assert.equal(missing.projects[0].knownVulnerabilityCount, 1);
    assert.equal(missing.projects[0].packages[0].advisories[0].detailState, 'unknown');
});
test('CVE aliases deduplicate advisories; primary references survive and advisory prose is never executed or returned', async () => {
    const ids = ['GHSA-aaaa-bbbb-cccc', 'CVE-2026-12345'];
    const result = await scan(manifest(), { fetchImpl: async url => {
        if (url.endsWith('querybatch')) return json({ results: [{ vulns: ids.map(id => ({ id })) }] });
        const id = decodeURIComponent(url.split('/').at(-1));
        return json(advisory(id, {
            aliases: ids.filter(alias => alias !== id), summary: 'synthetic-private-command', details: '$(synthetic-private-command)',
            references: [
                { type: 'ADVISORY', url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc' },
                { type: 'WEB', url: 'https://synthetic-secret:synthetic-key@example.com/private' },
                { type: 'WEB', url: 'https://127.0.0.1/private' },
            ],
        }));
    } });
    assert.equal(result.vulnerabilityCount, 1);
    assert.equal(result.projects[0].packages[0].advisories[0].severity, 'HIGH');
    assert.equal(result.projects[0].packages[0].advisories[0].severitySource, 'OSV.database_specific');
    assert.equal(result.projects[0].packages[0].advisories[0].applicability, 'NOT_ASSESSED');
    assert.deepEqual(result.projects[0].packages[0].advisories[0].fixedVersions, ['1.0.1']);
    const text = JSON.stringify(result);
    assert.equal(text.includes('https://github.com/advisories/'), true);
    for (const value of ['synthetic-private-command', 'synthetic-secret', '127.0.0.1']) assert.equal(text.includes(value), false);
});
test('unsupported or unproved public packages are excluded from requests and preserve unknown coverage', async () => {
    let calls = 0;
    const result = await scan(manifest([project({ dependencies: [dependency({ publicRegistryEvidence: false })] })]), { fetchImpl: () => { calls++; throw new Error('must not fetch'); } });
    assert.equal(calls, 0);
    assert.equal(result.rejectedPackages, 1);
    assert.equal(result.vulnerabilityCount, null);
});
