import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
const run = promisify(execFile);
const script = fileURLToPath(new URL('../probe-boot4.mjs', import.meta.url));
const source = new URL('../../backend/build.gradle', import.meta.url);
const lock = new URL('../../backend/gradle.lockfile', import.meta.url);
const hash = async path => createHash('sha256').update(await readFile(path)).digest('hex');

test('Boot 4 inventory leaves the production build and lock untouched', async () => {
    const before = await Promise.all([hash(source), hash(lock)]);
    const result = await run(process.execPath, [script]);
    const inventory = JSON.parse(result.stdout);
    assert.equal(inventory.targetBoot, '4.1.2');
    assert.ok(inventory.javaFiles > 0);
    assert.match(inventory.scope, /no runtime or DB access/);
    assert.deepEqual(await Promise.all([hash(source), hash(lock)]), before);
});

test('an unsupported target is rejected before invoking compilation', async () => {
    await assert.rejects(run(process.execPath, [script, '--version', '3.5.16', '--compile']), /approved stable/);
});

test('the public benchmark fixture carries attribution and all judged targets', async () => {
    const fixture = JSON.parse(await readFile(new URL('../fixtures/search-public-places.json', import.meta.url), 'utf8'));
    assert.equal(fixture.license, 'CC0-1.0');
    assert.ok(fixture.documents.length > 20 && fixture.documents.length <= 100);
    const ids = new Set(fixture.documents.map(row => row.id));
    assert.equal(ids.size, fixture.documents.length);
    for (const row of fixture.documents) {
        assert.match(row.source, /^https?:\/\/www\.wikidata\.org\/entity\/Q\d+$/);
        assert.equal(row.visibility, 'public');
        assert.ok(row.name && row.description);
    }
    for (const query of fixture.queries) {
        assert.ok(query.kind === 'none' || query.expected.length > 0);
        assert.ok(query.expected.every(id => ids.has(id)));
    }
});
