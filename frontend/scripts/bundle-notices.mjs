import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

// Build evidence comes from the emitted chunks, not the full development dependency tree.
export function bundleNotices() {
    return {
        name: 'reserve-bundle-notices',
        apply: 'build',
        generateBundle(_options, bundle) {
            const packages = new Map();
            for (const chunk of Object.values(bundle)) {
                if (chunk.type !== 'chunk') continue;
                for (const moduleId of chunk.moduleIds) {
                    const file = moduleId.replace(/^\0/, '').split('?')[0];
                    if (!file.includes('node_modules')) continue;
                    let directory = dirname(file);
                    while (directory.includes('node_modules')) {
                        const manifest = join(directory, 'package.json');
                        if (existsSync(manifest)) {
                            const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
                            if (pkg.name && pkg.version) {
                                packages.set(`${pkg.name}@${pkg.version}`, { directory, pkg });
                                break;
                            }
                        }
                        const parent = dirname(directory);
                        if (parent === directory) break;
                        directory = parent;
                    }
                }
            }
            const preserved = {
                '@ant-design/icons-svg@4.6.0': 'licenses/ant-design-icons-svg-4.6.0-LICENSE.txt',
                'victory-vendor@37.3.6': 'licenses/victory-vendor-37.3.6-LICENSE.txt',
            };
            const sections = [readFileSync(resolve('../THIRD_PARTY_NOTICES.md'), 'utf8')];
            sections.push('--- Pretendard font license ---\n'
                + readFileSync(resolve('node_modules/pretendard/dist/LICENSE.txt'), 'utf8'));
            sections.push('--- SUITE font license ---\n'
                + readFileSync(resolve('public/fonts/SUITE-LICENSE.txt'), 'utf8'));
            const missing = [];
            for (const [identity, { directory, pkg }] of [...packages].sort(([a], [b]) => a.localeCompare(b))) {
                const notices = readdirSync(directory).filter(name =>
                    /^(licen[cs]e|notice|copying)(?:[._-].*)?$/i.test(name)
                    && statSync(join(directory, name)).isFile());
                const supplemental = [];
                if (preserved[identity]) supplemental.push(readFileSync(resolve(preserved[identity]), 'utf8'));
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
                if (!notices.length && !supplemental.length) missing.push(identity);
                sections.push(`\n${'='.repeat(72)}\n${identity}\nDeclared license: ${pkg.license ?? 'unspecified'}\n`);
                sections.push(...supplemental);
                for (const name of notices.sort()) {
                    sections.push(`--- ${name} ---\n${readFileSync(join(directory, name), 'utf8')}\n`);
                }
            }
            if (missing.length) this.error(`Bundled packages lack license text: ${missing.join(', ')}`);
            this.emitFile({ type: 'asset', fileName: 'THIRD_PARTY_NOTICES.txt', source: sections.join('\n') });
            console.log(`Bundled license notices: ${packages.size} packages`);
        },
    };
}
