#!/usr/bin/env node
/**
 * CHANGELOG 요약 영역을 교체하고 자동 PR 목록을 유지한다.
 * 기본은 미리보기이며 --apply를 명시해야 릴리스에 반영한다.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolveBin } from './resolve-bin.mjs';

const REPO = process.env.REPO || 'hanjeun/reserve';
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const onlyVersion = args.find((a) => /^v\d/.test(a));
const START = '<!-- changelog:start -->';
const END = '<!-- changelog:end -->';

const md = readFileSync(new URL('../docs/CHANGELOG.md', import.meta.url), 'utf8');

const sections = [];
let cur = null;
for (const line of md.split(/\r?\n/)) {
  const h = line.match(/^## (v\d+\.\d+\.\d+)\b/);
  if (h) {
    if (cur) sections.push(cur);
    cur = { version: h[1], lines: [] };
  } else if (cur) {
    cur.lines.push(line);
  }
}
if (cur) sections.push(cur);
for (const s of sections) {
  s.body = s.lines.join('\n').trim();
  delete s.lines;
}
if (sections.length === 0) {
  console.error('CHANGELOG에서 버전 섹션을 찾지 못했습니다.');
  process.exit(1);
}

const GH_BIN = resolveBin('gh');
const gh = (a, input) =>
  execFileSync(GH_BIN, a, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'] });

// 바로 아래 버전을 자동 PR 목록의 비교 기준으로 사용한다.
const previousOf = new Map(sections.map((s, i) => [s.version, sections[i + 1]?.version]));

const GENERATED = /^(#{1,6}\s*What's Changed|\*{0,2}Full Changelog)/im;
const generatedNotes = (version) => {
  const args = ['api', `repos/${REPO}/releases/generate-notes`, '-f', `tag_name=${version}`];
  const previous = previousOf.get(version);
  if (previous) args.push('-f', `previous_tag_name=${previous}`);
  return JSON.parse(gh(args)).body.trim();
};

const targets = onlyVersion ? sections.filter((s) => s.version === onlyVersion) : sections;
if (targets.length === 0) {
  console.error(`버전 ${onlyVersion} 을(를) CHANGELOG에서 못 찾았습니다.`);
  process.exit(1);
}

for (const { version, body } of targets) {
  let current = '';
  let title = '';
  try {
    const release = JSON.parse(gh(['release', 'view', version, '-R', REPO, '--json', 'body,name']));
    current = release.body || '';
    title = release.name || '';
  } catch {
    console.warn(`⚠️  ${version}: 릴리즈가 없어 건너뜁니다.`);
    continue;
  }

  // 재실행 때 중복되지 않도록 이전 주입 영역과 구분선을 제거한다.
  let base = current;
  const between = new RegExp(String.raw`${START}[\s\S]*?${END}\s*(?:\r?\n---\r?\n)?`, 'g');
  base = base.replace(between, '').trimStart();

// CHANGELOG 요약과 중복되지 않도록 자동 PR 목록 앞의 자유 형식 본문은 제거한다.
  const wcIdx = base.search(GENERATED);
  if (wcIdx > 0) base = base.slice(wcIdx).trimStart();
  // 자동 PR 목록이 없으면 비교 기준으로 다시 생성한다.
  if (!GENERATED.test(base)) base = generatedNotes(version);

  const injected = `${START}\n${body}\n${END}`;
  const newBody = base ? `${injected}\n\n---\n\n${base}` : injected;

  if (newBody.trim() === current.trim() && title === version) {
    console.log(`= ${version}: 변경 없음`);
    continue;
  }

  if (!APPLY) {
    const titleNote = title === version ? '' : ` — 제목 "${title}" → "${version}"`;
    console.log(`\n──────── ${version} (미리보기)${titleNote} ────────\n${newBody}\n`);
    continue;
  }

  gh(['release', 'edit', version, '-R', REPO, '--title', version, '--notes-file', '-'], newBody);
  console.log(`✔ ${version}: 릴리즈 설명 갱신 완료`);
}

console.log(APPLY ? '\n완료.' : '\n미리보기였어요. 실제 반영은 --apply 를 붙이세요.');
