import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = path.join(frontendRoot, 'dist');
const assetsRoot = path.join(distRoot, 'assets');
const maxChunkBytes = 600 * 1024;
const maxInitialGzipBytes = 350 * 1024;

const formatKiB = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;

if (!fs.existsSync(path.join(distRoot, 'index.html'))) {
  console.error('Bundle budget check failed: dist/index.html does not exist. Run the production build first.');
  process.exit(1);
}

const javascriptFiles = fs.readdirSync(assetsRoot)
  .filter((file) => file.endsWith('.js'))
  .map((file) => {
    const content = fs.readFileSync(path.join(assetsRoot, file));
    return {
      file,
      bytes: content.length,
      gzipBytes: gzipSync(content).length,
    };
  });

const oversizedChunks = javascriptFiles.filter((asset) => asset.bytes > maxChunkBytes);

const html = fs.readFileSync(path.join(distRoot, 'index.html'), 'utf8');
const initialAssetNames = new Set(
  [...html.matchAll(/(?:src|href)="\/assets\/([^"?]+\.js)(?:\?[^"\s]*)?"/g)]
    .map((match) => match[1]),
);
const initialAssets = javascriptFiles.filter((asset) => initialAssetNames.has(asset.file));
const initialGzipBytes = initialAssets.reduce((total, asset) => total + asset.gzipBytes, 0);

const failures = [];
if (oversizedChunks.length > 0) {
  failures.push(
    `chunks over ${formatKiB(maxChunkBytes)}: ${oversizedChunks
      .map((asset) => `${asset.file} (${formatKiB(asset.bytes)})`)
      .join(', ')}`,
  );
}
if (initialGzipBytes > maxInitialGzipBytes) {
  failures.push(
    `initial JavaScript is ${formatKiB(initialGzipBytes)} gzip (budget: ${formatKiB(maxInitialGzipBytes)})`,
  );
}

if (failures.length > 0) {
  console.error('Bundle budget check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const largestChunk = [...javascriptFiles].sort((left, right) => right.bytes - left.bytes)[0];
console.log(
  `Bundle budget passed: initial ${formatKiB(initialGzipBytes)} gzip; `
  + `largest ${largestChunk.file} ${formatKiB(largestChunk.bytes)}.`,
);
