import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = await realpath(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
if (args.some(arg => !['--compile', '--resolve', '--jackson2-bridge', '--version', '4.1.2', '4.0.9'].includes(arg))) throw new Error('Use --compile and an approved stable --version');
const versionAt = args.indexOf('--version');
const version = versionAt < 0 ? '4.1.2' : args[versionAt + 1];
if (!['4.1.2', '4.0.9'].includes(version)) throw new Error('Unknown target Boot version');
const counts = { bootMovedImports: 0, jackson2Imports: 0, javaFiles: 0 };
async function inspect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) await inspect(path);
        else if (entry.name.endsWith('.java')) {
            counts.javaFiles++;
            const source = await readFile(path, 'utf8');
            counts.bootMovedImports += (source.match(/^import org\.springframework\.boot\.(?:autoconfigure\.(?:web|orm|security|data)|test\.autoconfigure)\.[^;]+;/gm) ?? []).length;
            counts.jackson2Imports += (source.match(/^import com\.fasterxml\.jackson\.(?!annotation)[^;]+;/gm) ?? []).length;
        }
    }
}
await inspect(resolve(root, 'backend/src'));
console.log(JSON.stringify({ targetBoot: version, ...counts, scope: 'read-only source inventory; no runtime or DB access' }));
if (args.includes('--compile') || args.includes('--resolve')) {
    const parent = resolve(root, 'backend/build'); mkdirSync(parent, { recursive: true });
    const fixture = await mkdtemp(resolve(parent, 'boot4-probe-'));
    try {
        await writeFile(resolve(fixture, 'settings.gradle'), "rootProject.name='reserve-boot4-probe'\n");
        await writeFile(resolve(fixture, 'build.gradle'), "apply from: new File(providers.gradleProperty('sourceRepo').get(), 'scripts/probe-boot4.gradle')\n");
        const command = process.platform === 'win32' ? resolve(process.env.ProgramFiles ?? 'C:/Program Files', 'Git/bin/bash.exe') : 'bash';
        const env = Object.fromEntries(['PATH', 'JAVA_HOME', 'GRADLE_USER_HOME', 'HOME', 'USERPROFILE', 'SystemRoot', 'SYSTEMROOT', 'TEMP', 'TMP', 'APPDATA', 'LOCALAPPDATA', 'ProgramFiles'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
        const result = await run(command, ['./gradlew', '--project-dir', fixture, '-PsourceRepo=' + root, '-PtargetBoot=' + version,
            '-PlegacyJackson=' + args.includes('--jackson2-bridge'), 'probeVersions', ...(args.includes('--compile') ? ['compileJava'] : []), '--no-daemon', '--console=plain', '-Dorg.gradle.jvmargs=-Xmx384m'],
            { cwd: resolve(root, 'backend'), env, maxBuffer: 4 * 1024 * 1024, timeout: 600_000 }).catch(error => error);
        console.log(result.stdout ?? ''); console.error(result.stderr ?? '');
        if (result.code || result.killed) process.exitCode = 1;
    } finally {
        const target = await realpath(fixture);
        if (target.startsWith(parent + sep) && target.startsWith(resolve(parent, 'boot4-probe-'))) await rm(target, { recursive: true });
        else { console.error('Refused unsafe fixture cleanup target'); process.exitCode = 1; }
    }
}
