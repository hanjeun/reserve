import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest, plain } from './contracts.mjs';

export const PROJECTS = Object.freeze(['reserve', 'kiwoom', 'hktech']);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ROOTS = Object.freeze({ reserve: ROOT, kiwoom: path.resolve(ROOT, '../Kiwoom_Futures_Bot'), hktech: path.resolve(ROOT, '../hktech-web') });
const MAX_SOURCE_BYTES = 32 * 1024 * 1024;
const VERSION = /^[0-9][A-Za-z0-9.+_~-]{0,127}$/;
const NPM = /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/;
const MAVEN = /^[A-Za-z0-9._-]+:[A-Za-z0-9._-]+$/;
const PACKAGIST = /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/;
const PUBLIC_PYPI = new Set(['pyqt5', 'pyqt5-qt5', 'pyqt5-sip', 'pyqt-fluent-widgets', 'pyqt5-frameless-window', 'pywin32', 'darkdetect', 'numpy', 'pyqtgraph']);
// New Maven groups need a source review before package names may leave the machine.
const PUBLIC_MAVEN_GROUPS = new Set([
    'biz.aQute.bnd', 'ch.qos.logback', 'com.bucket4j', 'com.fasterxml', 'com.fasterxml.jackson',
    'com.fasterxml.jackson.core', 'com.fasterxml.jackson.dataformat', 'com.fasterxml.jackson.datatype', 'com.fasterxml.jackson.module',
    'com.github.peteroupc', 'com.github.stephenc.jcip', 'com.google.errorprone', 'com.google.guava',
    'com.google.j2objc', 'com.h2database', 'com.jayway.jsonpath',
    'com.mysql', 'com.nimbusds', 'com.sun.istack', 'com.tngtech.archunit', 'com.vaadin.external.google',
    'com.upokecenter', 'com.yubico', 'com.zaxxer', 'commons-logging', 'io.jsonwebtoken', 'io.lettuce', 'io.micrometer', 'io.netty', 'io.projectreactor',
    'io.sentry', 'io.smallrye', 'jakarta.activation', 'jakarta.annotation', 'jakarta.inject',
    'jakarta.mail', 'jakarta.persistence', 'jakarta.transaction', 'jakarta.validation', 'jakarta.xml.bind',
    'net.bytebuddy', 'net.minidev', 'org.antlr', 'org.apache.httpcomponents.client5',
    'org.apache.httpcomponents.core5', 'org.apache.logging.log4j', 'org.apache.tomcat.embed',
    'org.apiguardian', 'org.aspectj', 'org.assertj', 'org.awaitility', 'org.eclipse.angus',
    'org.glassfish.jaxb', 'org.hamcrest', 'org.hdrhistogram', 'org.hibernate.common',
    'org.hibernate.models', 'org.hibernate.orm', 'org.hibernate.validator', 'org.jboss.logging', 'org.jspecify',
    'org.junit', 'org.junit.jupiter', 'org.junit.platform', 'org.latencyutils', 'org.mockito',
    'org.objenesis', 'org.opentest4j', 'org.osgi', 'org.ow2.asm', 'org.projectlombok',
    'org.reactivestreams', 'org.skyscreamer', 'org.slf4j', 'org.springframework',
    'org.springframework.boot', 'org.springframework.data', 'org.springframework.security',
    'org.xmlunit', 'org.yaml', 'redis.clients.authentication', 'software.amazon.awssdk',
    'software.amazon.eventstream', 'tools.jackson', 'tools.jackson.core',
]);

function dependency(ecosystem, name, version, usage, sourceId, sourceHash, artifactHash = null) {
    return { ecosystem, name, version, usage: [...new Set(usage)].sort(), sourceId, sourceHash, artifactHash, publicRegistryEvidence: true };
}
function finish(dependencies, excluded) {
    return { dependencies, excluded, state: excluded ? 'partial' : 'complete' };
}
export function parseNpm(lock, sourceId, sourceHash) {
    if (![2, 3].includes(lock?.lockfileVersion) || !plain(lock.packages)) throw new Error('UNSUPPORTED_LOCK');
    const dependencies = [];
    let excluded = 0;
    for (const [key, entry] of Object.entries(lock.packages)) {
        if (!key) continue; // The private application name is not a dependency.
        if (!plain(entry)) { excluded++; continue; }
        const name = entry.name ?? key.split('node_modules/').at(-1);
        let publicRegistry = false;
        try {
            const url = new URL(entry.resolved);
            const publicName = decodeURIComponent(url.pathname.split('/-/')[0].slice(1));
            publicRegistry = url.protocol === 'https:' && url.hostname === 'registry.npmjs.org'
                && !url.username && !url.password && !url.port && publicName === name;
        } catch { /* Local/workspace/private resolutions are never sent to OSV. */ }
        if (!key.includes('node_modules/') || entry.link || entry.private || !NPM.test(name) || !VERSION.test(entry.version) || !publicRegistry) {
            excluded++;
            continue;
        }
        const usage = entry.dev === true ? ['build', 'dev'] : ['runtime', 'build'];
        if (entry.devOptional) usage.push('dev');
        const artifactHash = typeof entry.integrity === 'string' && /^sha(?:256|384|512)-[A-Za-z0-9+/=]+$/.test(entry.integrity) ? digest(entry.integrity) : null;
        dependencies.push(dependency('npm', name, entry.version, usage, sourceId, sourceHash, artifactHash));
    }
    return finish(dependencies, excluded);
}
export function parseGradle(text, sourceId, sourceHash) {
    const dependencies = [];
    let excluded = 0;
    for (const line of text.split(/\r?\n/)) {
        if (!line.trim() || line.startsWith('#') || line.startsWith('empty=')) continue;
        const match = line.match(/^([A-Za-z0-9._-]+):([A-Za-z0-9._-]+):([^=]+)=([A-Za-z0-9_,]+)$/);
        if (!match || !PUBLIC_MAVEN_GROUPS.has(match[1]) || !VERSION.test(match[3])) { excluded++; continue; }
        const configurations = match[4].split(',');
        const usage = [];
        if (configurations.some(value => /^(?:productionRuntimeClasspath|runtimeClasspath)$/.test(value))) usage.push('runtime');
        if (configurations.some(value => /^(?:compileClasspath|annotationProcessor)$/.test(value))) usage.push('build');
        if (configurations.some(value => /test/i.test(value))) usage.push('dev', 'test');
        if (configurations.some(value => /developmentOnly/i.test(value))) usage.push('dev');
        if (!usage.length || !MAVEN.test(match[1] + ':' + match[2])) { excluded++; continue; }
        dependencies.push(dependency('Maven', match[1] + ':' + match[2], match[3], usage, sourceId, sourceHash));
    }
    if (!dependencies.length) throw new Error('UNSUPPORTED_LOCK');
    return finish(dependencies, excluded);
}
export function parsePython(text, sourceId, sourceHash) {
    const dependencies = [];
    let excluded = 0;
    for (const line of text.split(/\r?\n/)) {
        if (!line.trim() || /^\s*#/.test(line)) continue;
        const match = line.trim().match(/^([A-Za-z0-9._-]+)==([0-9][A-Za-z0-9.+_-]*)$/);
        const name = match?.[1].toLowerCase().replace(/[-_.]+/g, '-');
        if (!match || !PUBLIC_PYPI.has(name) || !VERSION.test(match[2])) { excluded++; continue; }
        dependencies.push(dependency('PyPI', name, match[2], ['runtime'], sourceId, sourceHash));
    }
    if (!dependencies.length) throw new Error('UNSUPPORTED_LOCK');
    return finish(dependencies, excluded);
}
export function parseComposer(lock, sourceId, sourceHash) {
    if (!Array.isArray(lock?.packages) || !Array.isArray(lock['packages-dev'])) throw new Error('UNSUPPORTED_LOCK');
    const dependencies = [];
    let excluded = 0;
    for (const [field, usage] of [['packages', ['runtime']], ['packages-dev', ['build', 'dev', 'test']]]) for (const entry of lock[field]) {
        const version = typeof entry?.version === 'string' ? entry.version.replace(/^v(?=\d)/, '') : '';
        if (!PACKAGIST.test(entry?.name) || !VERSION.test(version) || entry['notification-url'] !== 'https://packagist.org/downloads/') { excluded++; continue; }
        dependencies.push(dependency('Packagist', entry.name, version, usage, sourceId, sourceHash));
    }
    return finish(dependencies, excluded);
}
function readSource(root, relative) {
    const file = path.join(root, relative);
    const before = fs.lstatSync(file);
    if (!before.isFile() || before.isSymbolicLink() || before.size > MAX_SOURCE_BYTES) throw new Error('SOURCE_UNAVAILABLE');
    const bytes = fs.readFileSync(file);
    const after = fs.lstatSync(file);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ino !== after.ino) throw new Error('SOURCE_CHANGED');
    return { text: bytes.toString('utf8'), sha256: digest(bytes), bytes: bytes.length };
}
function artifact(root, relative, sourceId) {
    try {
        const file = path.join(root, relative);
        const before = fs.lstatSync(file);
        if (!before.isFile() || before.isSymbolicLink() || before.size > 256 * 1024 * 1024) throw new Error('SOURCE_UNAVAILABLE');
        const bytes = fs.readFileSync(file);
        const after = fs.lstatSync(file);
        if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error('SOURCE_CHANGED');
        return { sourceId, sha256: digest(bytes), bytes: bytes.length, state: 'present', linkage: 'source-and-deployment-unverified' };
    } catch { return { sourceId, state: 'unknown', linkage: 'source-and-deployment-unverified' }; }
}
export function collectProject(project) {
    if (!PROJECTS.includes(project)) throw new Error('INVALID_PROJECT');
    const root = ROOTS[project];
    const sources = [];
    const dependencies = [];
    const issues = [];
    const artifacts = [];
    let excluded = 0;
    const consume = (relative, sourceId, parser, evidence = 'lockfile') => {
        try {
            const source = readSource(root, relative);
            const parsed = parser(source.text, sourceId, source.sha256);
            sources.push({ sourceId, sha256: source.sha256, bytes: source.bytes, evidence });
            dependencies.push(...parsed.dependencies);
            excluded += parsed.excluded;
            if (parsed.excluded) issues.push({ sourceId, reason: 'UNSUPPORTED_OR_NONPUBLIC_PACKAGES', count: parsed.excluded });
        } catch { issues.push({ sourceId, reason: 'SOURCE_UNAVAILABLE_OR_UNSUPPORTED' }); }
    };
    if (project === 'reserve') {
        consume('frontend/package-lock.json', 'reserve.frontend.lock', (text, ...args) => parseNpm(JSON.parse(text), ...args));
        consume('backend/gradle.lockfile', 'reserve.backend.lock', parseGradle);
        try {
            const source = readSource(root, 'backend/build.gradle');
            sources.push({ sourceId: 'reserve.backend.build', sha256: source.sha256, bytes: source.bytes, evidence: 'declaration' });
            const version = source.text.match(/^version\s*=\s*'([0-9]+\.[0-9]+\.[0-9]+)'/m)?.[1];
            if (version) artifacts.push(artifact(root, 'backend/build/libs/reserve-' + version + '.jar', 'reserve.backend.jar'));
        } catch { issues.push({ sourceId: 'reserve.backend.build', reason: 'SOURCE_UNAVAILABLE_OR_UNSUPPORTED' }); }
        artifacts.push(artifact(root, 'frontend/dist/index.html', 'reserve.frontend.entry'));
    } else if (project === 'kiwoom') {
        consume('requirements.txt', 'kiwoom.python.pins', parsePython, 'declared-pins-not-installed-inventory');
    } else {
        consume('package-lock.json', 'hktech.frontend.lock', (text, ...args) => parseNpm(JSON.parse(text), ...args));
        consume('composer.lock', 'hktech.php.lock', (text, ...args) => parseComposer(JSON.parse(text), ...args));
        artifacts.push(artifact(root, 'dist/static/index.html', 'hktech.static.entry'));
    }
    const merged = new Map();
    for (const item of dependencies) {
        const key = [item.ecosystem, item.name, item.version, item.sourceId].join('|');
        const old = merged.get(key);
        merged.set(key, old ? { ...old, usage: [...new Set([...old.usage, ...item.usage])].sort() } : item);
    }
    const sorted = [...merged.values()].sort((a, b) => [a.ecosystem, a.name, a.version, a.sourceId].join('|').localeCompare([b.ecosystem, b.name, b.version, b.sourceId].join('|')));
    const data = {
        project, deploymentScope: 'candidate', inventoryState: issues.length ? (sorted.length ? 'partial' : 'unknown') : 'complete',
        production: { state: 'unverified', reason: 'DEPLOYED_ARTIFACT_INVENTORY_NOT_CONNECTED' },
        coverage: { scope: 'locked-or-declared-packages', installedRuntimeVerified: false, transitivePythonInventoryVerified: false, osAndContainerBaseIncluded: false, excludedPackages: excluded },
        sources, artifacts, issues, dependencies: sorted,
    };
    return { ...data, inventoryHash: digest(data) };
}
export function collectManifest(project = 'all', now = Date.now()) {
    if (project !== 'all' && !PROJECTS.includes(project)) throw new Error('INVALID_PROJECT');
    return { schemaVersion: 1, generatedAt: new Date(now).toISOString(), projects: (project === 'all' ? PROJECTS : [project]).map(collectProject) };
}
export function parseArguments(args) {
    const allowed = new Set(['all', ...PROJECTS, '--scan', '--remember']);
    if (args.some(value => !allowed.has(value)) || new Set(args).size !== args.length) throw new Error('INVALID_ARGUMENTS');
    const projects = args.filter(value => !value.startsWith('--'));
    if (projects.length > 1 || (args.includes('--remember') && !args.includes('--scan'))) throw new Error('INVALID_ARGUMENTS');
    return { project: projects[0] ?? 'all', scan: args.includes('--scan'), remember: args.includes('--remember') };
}
