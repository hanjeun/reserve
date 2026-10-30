import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { digest } from '../contracts.mjs';
import { parseComposer, parseGradle, parseNpm, parsePython, parseArguments } from '../dependencies.mjs';
import { run } from '../scan.mjs';

const hash = 'a'.repeat(64);
test('npm locks omit application names, private paths and URLs while retaining actual version/scope/hash', () => {
    const result = parseNpm({ lockfileVersion: 3, packages: {
        '': { name: 'synthetic-private-application' },
        'node_modules/react': { version: '19.3.1', resolved: 'https://registry.npmjs.org/react/-/react-19.3.1.tgz', integrity: 'sha512-YQ==' },
        'node_modules/vite': { version: '7.3.7', dev: true, resolved: 'https://registry.npmjs.org/vite/-/vite-7.3.7.tgz' },
        'node_modules/private-module': { version: '1.0.0', resolved: 'https://synthetic-secret:synthetic-key@internal.invalid/private.tgz' },
        'node_modules/workspace': { link: true, resolved: '../synthetic-private-path' },
    } }, 'fixture.lock', hash);
    assert.equal(result.state, 'partial');
    assert.equal(result.excluded, 2);
    assert.deepEqual(result.dependencies.map(item => [item.name, item.version, item.usage]), [
        ['react', '19.3.1', ['build', 'runtime']], ['vite', '7.3.7', ['build', 'dev']],
    ]);
    assert.equal(result.dependencies[0].sourceHash, hash);
    assert.equal(result.dependencies[0].artifactHash, digest('sha512-YQ=='));
    const serialized = JSON.stringify(result);
    for (const value of ['synthetic', 'resolved', 'private-module', 'https://']) assert.equal(serialized.includes(value), false);
});
test('npm public registry evidence must match the package, including scoped entries', () => {
    const result = parseNpm({ lockfileVersion: 3, packages: {
        'node_modules/@types/react': { version: '19.3.0', dev: true, resolved: 'https://registry.npmjs.org/@types/react/-/react-19.3.0.tgz' },
        'node_modules/private-alias': { version: '1.0.0', resolved: 'https://registry.npmjs.org/another/-/another-1.0.0.tgz' },
    } }, 'fixture.lock', hash);
    assert.equal(result.dependencies.length, 1);
    assert.equal(result.dependencies[0].name, '@types/react');
    assert.equal(result.excluded, 1);
});
test('Gradle classpaths distinguish runtime/build/test and reject unreviewed groups', () => {
    const result = parseGradle([
        '# Lock state',
        'org.springframework:spring-core:6.2.19=compileClasspath,runtimeClasspath,testRuntimeClasspath',
        'org.mockito:mockito-core:5.24.0=testCompileClasspath,testRuntimeClasspath',
        'synthetic.private:secret-library:1.0.0=runtimeClasspath',
        'empty=annotationProcessor',
    ].join('\n'), 'fixture.lock', hash);
    assert.deepEqual(result.dependencies[0].usage, ['build', 'dev', 'runtime', 'test']);
    assert.deepEqual(result.dependencies[1].usage, ['dev', 'test']);
    assert.equal(result.excluded, 1);
    assert.equal(JSON.stringify(result).includes('synthetic'), false);
});
test('reviewed Boot and WebAuthn public dependencies are included without allowing private subgroup names', () => {
    const lock = fs.readFileSync(new URL('../../../backend/gradle.lockfile', import.meta.url), 'utf8');
    const result = parseGradle(lock, 'reserve.backend.lock', hash);
    assert.equal(result.state, 'complete');
    assert.equal(result.excluded, 0);
    for (const name of ['com.yubico:webauthn-server-core', 'com.github.peteroupc:numbers',
        'com.upokecenter:cbor', 'tools.jackson.core:jackson-databind', 'org.hibernate.models:hibernate-models']) {
        assert.ok(result.dependencies.some(item => item.name === name), name);
    }
    const unknown = parseGradle(lock + '\ncom.yubico.private:synthetic-secret:1.0.0=runtimeClasspath\n', 'fixture.lock', hash);
    assert.equal(unknown.excluded, 1);
    assert.equal(JSON.stringify(unknown).includes('synthetic-secret'), false);
});
test('Python exposes reviewed exact public pins only and never treats declarations as installations', () => {
    const result = parsePython('# comment\nPyQt5==5.15.11\nnumpy>=1.26\n--index-url https://synthetic-secret.invalid\nprivate_package==1.2.3\n', 'fixture.pins', hash);
    assert.equal(result.dependencies.length, 1);
    assert.equal(result.dependencies[0].name, 'pyqt5');
    assert.equal(result.dependencies[0].version, '5.15.11');
    assert.equal(result.excluded, 3);
    assert.equal(JSON.stringify(result).includes('synthetic-secret'), false);
});
test('Composer keeps runtime/dev and strips v only for exact public versions', () => {
    const result = parseComposer({ packages: [
        { name: 'laravel/framework', version: 'v13.8.0', 'notification-url': 'https://packagist.org/downloads/', description: 'synthetic-private-text' },
    ], 'packages-dev': [
        { name: 'phpunit/phpunit', version: '13.0.1', 'notification-url': 'https://packagist.org/downloads/' },
        { name: 'private/package', version: 'dev-main' },
    ] }, 'fixture.lock', hash);
    assert.equal(result.dependencies[0].version, '13.8.0');
    assert.deepEqual(result.dependencies[1].usage, ['build', 'dev', 'test']);
    assert.equal(result.excluded, 1);
    assert.equal(JSON.stringify(result).includes('synthetic-private'), false);
});
test('no URL/path/environment flags or implicit network/state writes are available', async () => {
    for (const args of [['--url', 'https://example.com'], ['--path', '/etc/example'], ['--remember'], ['reserve', 'kiwoom'], ['--scan', '--scan']]) assert.throws(() => parseArguments(args));
    let scans = 0, writes = 0;
    const manifest = { schemaVersion: 1, projects: [] };
    const result = await run(['reserve'], { collect: () => manifest, scan: () => { scans++; }, remember: () => { writes++; } });
    assert.equal(result.networkUsed, false);
    assert.equal(scans, 0);
    assert.equal(writes, 0);
    const rejected = await run(['--url'], { collect: () => { throw new Error('must not collect'); } });
    assert.equal(rejected.status, 'REJECTED');
});
test('an explicit scan invokes querying, and state recording needs its own flag', async () => {
    let scans = 0, writes = 0;
    const result = await run(['--scan'], {
        collect: () => ({ projects: [] }),
        scan: async () => { scans++; return { scannedAt: new Date().toISOString(), status: 'UNKNOWN', projects: [] }; },
        remember: () => { writes++; throw new Error('must not write'); },
    });
    assert.equal(result.networkUsed, true);
    assert.equal(result.warnings.persistence, 'not-recorded');
    assert.equal(scans, 1);
    assert.equal(writes, 0);
});
