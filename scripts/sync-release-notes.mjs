#!/usr/bin/env node
/** CHANGELOG 본문만 반영하며 버전·초안 상태와 실제 태그를 보존한다. */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveBin } from './resolve-bin.mjs';

export function changelogSections(markdown) {
  const sections = [];
  let current;
  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^## (v\d+\.\d+\.\d+)\b/);
    if (heading) {
      current = { version: heading[1], lines: [] };
      sections.push(current);
    } else if (current) current.lines.push(line);
  }
  return sections.map(({ version, lines }) => ({ version, body: lines.join('\n').trim() }));
}

export function releasePatch({ version, body }, release) {
  if (!/^v\d+\.\d+\.\d+$/.test(version) || release.tagName !== version
      || typeof release.isDraft !== 'boolean' || typeof release.isPrerelease !== 'boolean') {
    throw new Error('Release identity and publication state must match the selected version');
  }
  if (!body?.trim() || body.includes('\uFFFD')) throw new Error('Release notes must contain valid changelog text');
  return { tag_name: version, name: version, body: body.trim(), draft: release.isDraft, prerelease: release.isPrerelease };
}

function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const onlyVersion = args.find(arg => /^v\d+\.\d+\.\d+$/.test(arg));
  if (args.some(arg => arg !== '--apply' && arg !== onlyVersion) || (apply && !onlyVersion)) {
    throw new Error('Pass one explicit version with --apply; omit --apply to preview');
  }
  const repo = process.env.REPO || 'hanjeun/reserve';
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('REPO must be owner/repository');
  const sections = changelogSections(readFileSync(new URL('../docs/CHANGELOG.md', import.meta.url), 'utf8'));
  const targets = onlyVersion ? sections.filter(section => section.version === onlyVersion) : sections;
  if (!targets.length) throw new Error('No matching CHANGELOG section');
  const ghBin = resolveBin('gh');
  const gh = (parameters, input) => execFileSync(ghBin, parameters, {
    encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'],
  });
  for (const section of targets) {
    let release;
    try {
      release = JSON.parse(gh(['release', 'view', section.version, '--repo', repo, '--json',
        'databaseId,body,name,tagName,isDraft,isPrerelease']));
    } catch (error) {
      if (apply) throw error;
      console.warn(`Skip ${section.version}: release could not be read`);
      continue;
    }
    const patch = releasePatch(section, release);
    if (patch.body === release.body?.trim() && patch.name === release.name) {
      console.log(`Unchanged: ${section.version}`);
      continue;
    }
    if (!apply) {
      console.log(`Preview: ${section.version}\n${patch.body}\n`);
      continue;
    }
    const refPath = `repos/${repo}/git/ref/tags/${section.version}`;
    const before = JSON.parse(gh(['api', refPath])).object;
    const updated = JSON.parse(gh(['api', '--method', 'PATCH', `repos/${repo}/releases/${release.databaseId}`, '--input', '-'],
      Buffer.from(JSON.stringify(patch), 'utf8')));
    const after = JSON.parse(gh(['api', refPath])).object;
    if (updated.tag_name !== patch.tag_name || updated.name !== patch.name || updated.body !== patch.body
        || updated.draft !== patch.draft || updated.prerelease !== patch.prerelease
        || before.sha !== after.sha || before.type !== after.type) throw new Error('Release preservation check failed');
    console.log(`Updated notes: ${section.version}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
