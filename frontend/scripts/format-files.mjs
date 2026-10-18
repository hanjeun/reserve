import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import process from 'node:process';
import { getFileInfo } from 'prettier';

const frontendRoot = await realpath(fileURLToPath(new URL('../', import.meta.url)));
const [mode, ...requestedFiles] = process.argv.slice(2);
const extensions = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.css', '.json', '.jsonc', '.md', '.yml', '.yaml']);
const protectedFolders = new Set(['node_modules', 'dist', 'coverage', 'test-results', 'playwright-report',
    'public', 'patches', 'licenses', 'preview', 'previews', 'snapshots', 'artifacts', 'outputs']);

try {
    if (!['--write', '--check'].includes(mode) || !requestedFiles.length) {
        throw new Error('Specify individual files: npm run format -- src/path/file.jsx');
    }
    const files = [];
    for (const requested of requestedFiles) {
        if (requested.startsWith('-') || /[*?\[\]{}]/.test(requested)) {
            throw new Error(`Only explicit file paths are allowed: ${requested}`);
        }
        const absolute = await realpath(path.resolve(frontendRoot, requested));
        const relative = path.relative(frontendRoot, absolute);
        const segments = relative.split(path.sep);
        if (!relative || path.isAbsolute(relative) || segments[0] === '..' || protectedFolders.has(segments[0].toLowerCase())
            || relative.toLowerCase() === 'package-lock.json' || !(await stat(absolute)).isFile()
            || !extensions.has(path.extname(absolute).toLowerCase())) {
            throw new Error(`Choose a source file inside frontend: ${requested}`);
        }
        const info = await getFileInfo(absolute, { ignorePath: path.join(frontendRoot, '.prettierignore') });
        if (info.ignored || !info.inferredParser) {
            throw new Error(`This file is excluded from formatting: ${requested}`);
        }
        files.push(absolute);
    }
    const prettierCli = fileURLToPath(new URL('../node_modules/prettier/bin/prettier.cjs', import.meta.url));
    const child = spawn(process.execPath, [prettierCli, mode, ...new Set(files)], {
        cwd: frontendRoot, stdio: 'inherit', shell: false,
    });
    child.on('error', error => { console.error(error.message); process.exitCode = 1; });
    child.on('exit', code => { process.exitCode = code ?? 1; });
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
