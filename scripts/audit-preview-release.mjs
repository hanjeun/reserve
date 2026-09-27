import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Read-only inventory: never stage, reset, fetch, or change either checkout.
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const base = process.argv[2] || 'origin/dev';
const root = git('rev-parse', '--show-toplevel').trim();
const baseSha = git('rev-parse', base).trim();
const baseline = new Map(git('ls-tree', '-rz', baseSha).split('\0').filter(Boolean).map(row => {
    const [metadata, path] = row.split('\t');
    return [path, metadata.split(' ')[2]];
}));
const groupOf = path => {
    if (/^(Claude outputs\/|docs\/design-system\/snapshots\/|frontend\/design-previews\/)/.test(path)) return 'preserve-evidence';
    if (/(CICD|docker|nginx|backup|restore|post-deploy|grafana|promtail|metrics|monitoring)/i.test(path)) return 'deploy-recovery-monitoring';
    if (/(config\/|member\/|auth|session|password|oauth|Token|Cookie)/i.test(path)) return 'account-session';
    if (/(payment|refund|advertisement|AdBanner|AdPreview|AdMark)/i.test(path)) return 'payment-advertising';
    if (/(chat|messenger|conversation|inquiry|EmailService)/i.test(path)) return 'messaging-inquiry';
    if (/(store|search|tourism|region|benefit|seo|sitemap|discovery)/i.test(path)) return 'discovery-content';
    return 'shared-ui-docs-review';
};
const records = [];
const rows = git('status', '--porcelain=v1', '-z', '--untracked-files=all').split('\0');
for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row) continue;
    const status = row.slice(0, 2);
    const path = row.slice(3);
    const oldPath = /R|C/.test(status) ? rows[++index] : undefined;
    const absolute = resolve(root, path);
    const bytes = existsSync(absolute) ? readFileSync(absolute) : null;
    const blob = bytes && createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    records.push({ path, status, ...(oldPath ? { oldPath } : {}), group: groupOf(path),
        sha256: bytes ? createHash('sha256').update(bytes).digest('hex') : null,
        bytes: bytes?.length ?? 0, baseBlob: baseline.get(path) ?? null,
        identicalBytesToDev: !!blob && blob === baseline.get(path) });
}
const groups = {};
for (const record of records) groups[record.group] = (groups[record.group] ?? 0) + 1;
const manifest = { createdAt: new Date().toISOString(), root, head: git('rev-parse', 'HEAD').trim(),
    branch: git('branch', '--show-current').trim(), base, baseSha, groups, records };
process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
