import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const approvedPatches = [
    { packageName: '@rc-component/tabs', version: '1.13.0', files: ['es/TabNavList/OperationNode.js', 'lib/TabNavList/OperationNode.js'] },
    { packageName: '@rc-component/util', version: '1.13.0', files: ['es/hooks/useDelayState.js', 'lib/hooks/useDelayState.js'] },
];
const patchName = entry => `${entry.packageName.replace('/', '+')}+${entry.version}.patch`;
const normalize = text => text.replace(/\r\n/g, '\n');
const occurrences = (text, fragment) => text.split(fragment).length - 1;

function installedFile(modulesRoot, relativePath) {
    const target = fs.realpathSync(path.join(modulesRoot, relativePath));
    const relative = path.relative(modulesRoot, target);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new Error(`Vendor patch target escapes node_modules: ${relativePath}`);
    }
    return target;
}

function parsePatch(source, entry) {
    const expected = new Set(entry.files.map(file => `node_modules/${entry.packageName}/${file}`));
    const blocks = normalize(source).split(/(?=^diff --git )/m).filter(Boolean);
    const changes = blocks.map(block => {
        const lines = block.split('\n');
        const header = /^diff --git a\/(\S+) b\/(\S+)$/.exec(lines[0]);
        if (!header || header[1] !== header[2] || !expected.delete(header[1])) {
            throw new Error(`Unexpected target in ${patchName(entry)}`);
        }
        const hunks = lines.flatMap((line, index) => line.startsWith('@@ ') ? [index] : []);
        if (hunks.length !== 1) throw new Error(`Expected one approved hunk in ${header[1]}`);
        const hunk = /^@@ -\d+,(\d+) \+\d+,(\d+) @@/.exec(lines[hunks[0]]);
        if (!hunk) throw new Error(`Invalid hunk in ${header[1]}`);
        const before = [], after = [];
        for (const line of lines.slice(hunks[0] + 1)) {
            if (line === '') continue;
            if (line[0] === ' ' || line[0] === '-') before.push(line.slice(1));
            if (line[0] === ' ' || line[0] === '+') after.push(line.slice(1));
            if (![' ', '-', '+'].includes(line[0])) throw new Error(`Unsupported patch content in ${header[1]}`);
        }
        if (before.length !== Number(hunk[1]) || after.length !== Number(hunk[2])) {
            throw new Error(`Hunk length mismatch in ${header[1]}`);
        }
        const oldText = before.join('\n'), newText = after.join('\n');
        if (!oldText || oldText === newText) throw new Error(`Empty vendor patch in ${header[1]}`);
        return { relativePath: header[1].slice('node_modules/'.length), before: oldText, after: newText };
    });
    if (expected.size) throw new Error(`Missing targets in ${patchName(entry)}`);
    return changes;
}

// npm ci must run this hook. Versions, patch targets and source context all fail closed.
// Preflight every file before writing, including files which are already patched.
export function applyVendorPatches(frontendRoot) {
    const modulesRoot = fs.realpathSync(path.join(frontendRoot, 'node_modules'));
    const patchesRoot = path.join(frontendRoot, 'patches');
    const expectedNames = new Set(approvedPatches.map(patchName));
    const actualNames = fs.readdirSync(patchesRoot).filter(name => name.endsWith('.patch'));
    if (actualNames.length !== expectedNames.size || actualNames.some(name => !expectedNames.has(name))) {
        throw new Error('Vendor patch set changed; review the approved patch list');
    }
    const plans = [];
    for (const entry of approvedPatches) {
        const packageFile = installedFile(modulesRoot, `${entry.packageName}/package.json`);
        const version = JSON.parse(fs.readFileSync(packageFile, 'utf8')).version;
        if (version !== entry.version) throw new Error(`Unsupported ${entry.packageName} version: ${version}`);
        const changes = parsePatch(fs.readFileSync(path.join(patchesRoot, patchName(entry)), 'utf8'), entry);
        for (const change of changes) {
            const target = installedFile(modulesRoot, change.relativePath);
            const content = normalize(fs.readFileSync(target, 'utf8'));
            const oldCount = occurrences(content, change.before), newCount = occurrences(content, change.after);
            if (oldCount === 0 && newCount === 1) continue;
            if (oldCount !== 1 || newCount !== 0) throw new Error(`Vendor patch source mismatch: ${change.relativePath}`);
            plans.push({ target, content: content.replace(change.before, change.after) });
        }
    }
    for (const plan of plans) fs.writeFileSync(plan.target, plan.content, 'utf8');
    return { applied: plans.length, alreadyApplied: 4 - plans.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const result = applyVendorPatches(fileURLToPath(new URL('..', import.meta.url)));
        console.log(`Vendor patches ready: ${result.applied} applied, ${result.alreadyApplied} already applied`);
    } catch (error) {
        console.error(`Vendor patch installation failed: ${error.message}`);
        process.exitCode = 1;
    }
}
