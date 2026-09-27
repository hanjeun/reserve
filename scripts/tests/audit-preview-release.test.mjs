import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';

const script = fileURLToPath(new URL('../audit-preview-release.mjs', import.meta.url));
for (const args of [['--help'], ['origin/dev;echo'], ['-x'], ['origin/dev', 'extra']]) {
    test(`preview audit rejects unsafe or extra ref arguments: ${JSON.stringify(args)}`, () => {
        assert.throws(() => execFileSync(process.execPath, [script, ...args],
            { encoding: 'utf8', stdio: 'pipe', windowsHide: true }), /safe branch name/);
    });
}
