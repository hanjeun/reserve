import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { README_IMAGE_FILENAMES, readmeImageDimensions } from './readme-image-paths.mjs';

const repositoryUrl = new URL('../../', import.meta.url);
const readText = relativePath => readFileSync(new URL(relativePath, repositoryUrl), 'utf8');

test('README screenshots match their manifest, image format and actual viewport', () => {
    const manifest = JSON.parse(readText('docs/images/screenshots.json'));
    assert.deepEqual(manifest.files.map(file => file.path).sort(), Object.values(README_IMAGE_FILENAMES).sort());
    for (const file of manifest.files) {
        const image = readFileSync(new URL(`docs/images/${file.path}`, repositoryUrl));
        assert.equal(image.byteLength, file.bytes, file.path);
        assert.equal(createHash('sha256').update(image).digest('hex'), file.sha256, file.path);
        if (file.mimeType === 'image/png') assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', file.path);
        else { assert.equal(file.mimeType, 'image/jpeg'); assert.equal(image.readUInt16BE(0), 0xffd8, file.path); }
        assert.deepEqual(readmeImageDimensions(image), file.viewport, file.path);
        assert.ok(file.viewport.width >= 1280 && file.viewport.height >= 700, file.path);
    }
});

test('README uses canonical screenshots and the current promotional and architecture images', () => {
    const readme = readText('README.md');
    for (const filename of Object.values(README_IMAGE_FILENAMES)) assert.ok(readme.includes(`docs/images/${filename}`), filename);
    assert.ok(readme.includes('docs/images/RESERVE_Architecture.png'));
    assert.ok(readme.includes('frontend/public/og-image.png'));
    assert.ok(!readme.includes('docs/images/title-light.svg'));
    assert.ok(!readme.includes('docs/images/title-dark.svg'));
    assert.ok(!readme.includes('readme-v2.6/'));
    const architecture = readFileSync(new URL('docs/images/RESERVE_Architecture.png', repositoryUrl));
    assert.equal(createHash('sha256').update(architecture).digest('hex'), 'dad66e1cde305263858a8aac65b899cd5b40bfacce074974edc40198be85d699');
    assert.equal(architecture.readUInt32BE(16), 2048);
    assert.equal(architecture.readUInt32BE(20), 940);
});

test('the capture tool uses the shared filename mapping and no deleted generator', () => {
    const source = readText('frontend/scripts/capture-readme-live.mjs');
    assert.ok(source.includes("from './readme-image-paths.mjs'"));
    assert.ok(source.includes('README_IMAGE_FILENAMES[name]'));
    assert.ok(!source.includes('readme-v2.6'));
    assert.equal(README_IMAGE_FILENAMES.monitoring, 'grafana.jpg');
});
