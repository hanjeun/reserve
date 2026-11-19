import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const preserved = {
    '@ant-design/icons-svg@4.6.0': 'licenses/ant-design-icons-svg-4.6.0-LICENSE.txt',
    'victory-vendor@37.3.6': 'licenses/victory-vendor-37.3.6-LICENSE.txt',
    'react-snowfall@2.4.0': 'licenses/react-snowfall-2.4.0-LICENSE.txt',
};

const frontendRoot = fileURLToPath(new URL('../', import.meta.url));

function modulePackage(moduleId) {
    const file = moduleId.replace(/^\0/, '').split('?')[0];
    if (!file.includes('node_modules')) return null;
    let directory = dirname(file);
    while (directory.includes('node_modules')) {
        const manifest = join(directory, 'package.json');
        if (existsSync(manifest)) {
            const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
            if (pkg.name && pkg.version) return { directory, pkg };
        }
        const parent = dirname(directory);
        if (parent === directory) break;
        directory = parent;
    }
    return null;
}

function supplementalNotices(identity, directory) {
    const supplemental = [];
    if (preserved[identity]) supplemental.push(readFileSync(resolve(frontendRoot, preserved[identity]), 'utf8'));
    if (identity === 'is-mobile@5.0.0') {
        const readme = readFileSync(join(directory, 'README.md'), 'utf8');
        supplemental.push(readme.slice(readme.indexOf('## License')));
    }
    if (identity === 'victory-vendor@37.3.6') {
        for (const vendor of readdirSync(join(directory, 'lib-vendor'))) {
            const license = join(directory, 'lib-vendor', vendor, 'LICENSE');
            if (existsSync(license)) supplemental.push(`--- ${vendor}/LICENSE ---\n${readFileSync(license, 'utf8')}`);
        }
    }
    if (identity === '@portone/browser-sdk@0.1.11') {
        supplemental.push('Publisher-provided payment SDK. The npm package does not declare an OSS license.\n'
            + 'Official integration documentation: https://developers.portone.io/sdk/ko/v2-sdk/readme\n'
            + readFileSync(join(directory, 'README.md'), 'utf8'));
    }
    return supplemental;
}

export function collectDependencyNotices(moduleIds) {
    const packages = new Map();
    for (const moduleId of moduleIds) {
        const entry = modulePackage(moduleId);
        if (entry) packages.set(`${entry.pkg.name}@${entry.pkg.version}`, entry);
    }
    const sections = [];
    const missing = [];
    for (const [identity, { directory, pkg }] of [...packages].sort(([a], [b]) => a.localeCompare(b))) {
        const notices = readdirSync(directory).filter(name =>
            /^(licen[cs]e|notice|copying)(?:[._-].*)?$/i.test(name)
            && statSync(join(directory, name)).isFile());
        const supplemental = supplementalNotices(identity, directory);
        if (!notices.length && !supplemental.length) missing.push(identity);
        sections.push(`\n${'='.repeat(72)}\n${identity}\nDeclared license: ${pkg.license ?? 'unspecified'}\n`, ...supplemental);
        for (const name of notices.sort()) {
            sections.push(`--- ${name} ---\n${readFileSync(join(directory, name), 'utf8')}\n`);
        }
    }
    if (missing.length) throw new Error(`Bundled packages lack license text: ${missing.join(', ')}`);
    return { sections, count: packages.size };
}

// 배포 청크에 포함된 의존성만 고지 대상으로 수집한다.
export function bundleNotices() {
    return {
        name: 'reserve-bundle-notices',
        apply: 'build',
        generateBundle(_options, bundle) {
            const dependencyNotices = collectDependencyNotices(Object.values(bundle).flatMap(chunk => chunk.type === 'chunk' ? chunk.moduleIds : []));
            const sections = [readFileSync(resolve('../THIRD_PARTY_NOTICES.md'), 'utf8')];
            sections.push('--- Pretendard font license ---\n'
                + readFileSync(resolve('node_modules/pretendard/dist/LICENSE.txt'), 'utf8'),
                '--- SUITE font license ---\n'
                + readFileSync(resolve('public/fonts/SUITE-LICENSE.txt'), 'utf8'));
            for (const kit of ['state-illustrations/source/camera-browser-states-v1', 'choice-icons/source/policy-menu-icons-v1']) {
                const directory = resolve('src/assets', kit, 'source');
                for (const name of ['LICENSE-ASSETS.txt', 'CC0-1.0-FULL.txt', 'LICENSE-CODE.txt']) {
                    sections.push(`--- RESERVE ${kit} / ${name} ---\n${readFileSync(join(directory, name), 'utf8')}`);
                }
            }
            const communityKit = 'state-illustrations/source/community-benefit-states-v2';
            for (const name of ['assets-cc0.txt', 'code-mit.txt']) {
                sections.push(`--- RESERVE ${communityKit} / ${name} ---\n${readFileSync(resolve('src/assets', communityKit, 'licenses', name), 'utf8')}`);
            }
            this.emitFile({ type: 'asset', fileName: 'THIRD_PARTY_NOTICES.txt', source: [...sections, ...dependencyNotices.sections].join('\n') });
            console.log(`Bundled license notices: ${dependencyNotices.count} packages`);
        },
    };
}
