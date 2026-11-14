import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('../frontend/package.json', import.meta.url), 'utf8'));
const expected = `release: v${version}`;

if (!/^\d+\.\d+\.\d+$/.test(version) || process.argv[2] !== expected) {
    console.error(`Main release title must match the app version (${expected}).`);
    process.exitCode = 1;
}
