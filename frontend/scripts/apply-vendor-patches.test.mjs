import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { applyVendorPatches } from './apply-vendor-patches.mjs';

const frontendRoot = fileURLToPath(new URL('..', import.meta.url));
const patchFiles = ['@rc-component+tabs+1.13.0.patch', '@rc-component+util+1.13.0.patch'];
const tabSource = cjs => [
    cjs ? '  const overlayClassName = (0, _clsx.clsx)(popupClassName, {' : '  const overlayClassName = clsx(popupClassName, {',
    '    [`${dropdownPrefix}-rtl`]: rtl',
    '  });',
    `  const moreNode = mobile ? null : /*#__PURE__*/React.createElement(${cjs ? '_dropdown.default' : 'Dropdown'}, _extends({`,
    '    prefixCls: dropdownPrefix,', '    overlay: overlay,', '    visible: tabs.length ? open : false,',
].join('\n');
const delaySource = '    }\n  });\n  return [value, setDelayValue];\n';

function fixture(run, { externalTabs = false } = {}) {
    const tempBase = fs.realpathSync(os.tmpdir());
    const root = fs.mkdtempSync(path.join(tempBase, 'reserve-vendor-patches-'));
    const write = (relative, source) => {
        const target = path.join(root, relative);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, source);
        return target;
    };
    try {
        for (const name of patchFiles) write(`patches/${name}`, fs.readFileSync(path.join(frontendRoot, 'patches', name)));
        const tabsRoot = externalTabs ? 'external-tabs' : 'node_modules/@rc-component/tabs';
        write(`${tabsRoot}/package.json`, JSON.stringify({ version: '1.13.0' }));
        write('node_modules/@rc-component/util/package.json', JSON.stringify({ version: '1.13.0' }));
        const files = [
            write(`${tabsRoot}/es/TabNavList/OperationNode.js`, tabSource(false)),
            write(`${tabsRoot}/lib/TabNavList/OperationNode.js`, tabSource(true)),
            write('node_modules/@rc-component/util/es/hooks/useDelayState.js', delaySource),
            write('node_modules/@rc-component/util/lib/hooks/useDelayState.js', delaySource),
        ];
        if (externalTabs) fs.symlinkSync(path.join(root, tabsRoot), path.join(root, 'node_modules/@rc-component/tabs'), process.platform === 'win32' ? 'junction' : 'dir');
        return run({ root, files, write, read: () => files.map(file => fs.readFileSync(file, 'utf8')) });
    } finally {
        if (path.dirname(root) !== tempBase || !path.basename(root).startsWith('reserve-vendor-patches-')) {
            throw new Error('Refusing cleanup outside the test fixture directory');
        }
        fs.rmSync(root, { recursive: true, force: true });
    }
}

test('clean install applies both ES/CJS fixes and repeated installation is idempotent', () => fixture(({ root, write, read }) => {
    const unrelated = write('node_modules/unrelated.js', 'keep this file');
    assert.deepEqual(applyVendorPatches(root), { applied: 4, alreadyApplied: 0 });
    const [tabsEs, tabsCjs, delayEs, delayCjs] = read();
    for (const source of [tabsEs, tabsCjs]) {
        assert.doesNotMatch(source, /moreNode = mobile \? null/);
        assert.match(source, /moreNode = \/\*#__PURE__\*\/React\.createElement/);
    }
    for (const source of [delayEs, delayCjs]) assert.equal(source.match(/React\.useEffect/g)?.length, 1);
    assert.deepEqual(applyVendorPatches(root), { applied: 0, alreadyApplied: 4 });
    assert.equal(fs.readFileSync(unrelated, 'utf8'), 'keep this file');
}));

test('changed package version fails before any file is patched', () => fixture(({ root, write, read }) => {
    const original = read();
    write('node_modules/@rc-component/util/package.json', '{"version":"1.14.0"}');
    assert.throws(() => applyVendorPatches(root), /Unsupported.*version/);
    assert.deepEqual(read(), original);
}));

test('a source mismatch in the final file leaves earlier files untouched', () => fixture(({ root, files, read }) => {
    fs.writeFileSync(files[3], 'changed upstream source');
    const original = read();
    assert.throws(() => applyVendorPatches(root), /source mismatch/);
    assert.deepEqual(read(), original);
}));

test('unreviewed patches cannot be silently skipped', () => fixture(({ root, write, read }) => {
    const original = read();
    write('patches/unreviewed.patch', 'extra patch');
    assert.throws(() => applyVendorPatches(root), /patch set changed/);
    assert.deepEqual(read(), original);
}));

test('a patch cannot redirect its write outside the approved targets', () => fixture(({ root, write, read }) => {
    const original = read();
    write(`patches/${patchFiles[0]}`, 'diff --git a/../../outside.js b/../../outside.js\n@@ -1,1 +1,1 @@\n-before\n+after\n');
    assert.throws(() => applyVendorPatches(root), /Unexpected target/);
    assert.deepEqual(read(), original);
}));

test('symlinked package files outside node_modules are rejected', () => fixture(({ root, read }) => {
    const original = read();
    assert.throws(() => applyVendorPatches(root), /escapes node_modules/);
    assert.deepEqual(read(), original);
}, { externalTabs: true }));

test('ambiguous original and patched contexts are rejected', () => fixture(({ root, files, read }) => {
    applyVendorPatches(root);
    fs.appendFileSync(files[0], '\n' + tabSource(false));
    const original = read();
    assert.throws(() => applyVendorPatches(root), /source mismatch/);
    assert.deepEqual(read(), original);
}));
