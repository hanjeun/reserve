#!/usr/bin/env node
/**
 * sync-release-notes.mjs
 * ──────────────────────────────────────────────────────────────
 * docs/CHANGELOG.md 의 각 버전 섹션(사용자 눈높이 요약)을
 * 해당 GitHub 릴리즈 설명 "상단"에 얹는다. 기존 자동 생성 PR 목록은 유지한다.
 *
 * - 주입 영역은 <!-- changelog:start --> ~ <!-- changelog:end --> 마커로 감싸므로
 *   여러 번 실행해도 중복되지 않고 최신 요약으로 교체된다(idempotent).
 * - 기본은 미리보기(dry-run). 실제 반영은 --apply 를 붙여야 한다.
 *
 * 사용법 (레포 루트에서, gh 로그인 상태):
 *   node scripts/sync-release-notes.mjs                 # 전체 미리보기
 *   node scripts/sync-release-notes.mjs --apply         # 전체 반영
 *   node scripts/sync-release-notes.mjs v1.13.0 --apply # 특정 버전만 반영
 *
 * 요구사항: Node 18+, gh CLI(로그인됨). REPO 환경변수로 대상 지정 가능(기본 hanjeun/reserve).
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO = process.env.REPO || 'hanjeun/reserve';
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const onlyVersion = args.find((a) => /^v\d/.test(a));
const START = '<!-- changelog:start -->';
const END = '<!-- changelog:end -->';

const md = readFileSync(new URL('../docs/CHANGELOG.md', import.meta.url), 'utf8');

// "## v1.13.0 (2026-07-06) — 제목" 헤더 기준으로 섹션 분리 (라인 기반, 견고)
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

const gh = (a, input) =>
  execFileSync('gh', a, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'] });

const targets = onlyVersion ? sections.filter((s) => s.version === onlyVersion) : sections;
if (targets.length === 0) {
  console.error(`버전 ${onlyVersion} 을(를) CHANGELOG에서 못 찾았습니다.`);
  process.exit(1);
}

for (const { version, body } of targets) {
  let current = '';
  try {
    current = JSON.parse(gh(['release', 'view', version, '-R', REPO, '--json', 'body'])).body || '';
  } catch {
    console.warn(`⚠️  ${version}: 릴리즈가 없어 건너뜁니다.`);
    continue;
  }

  // 이전에 주입한 블록(마커+뒤따르는 --- 구분선)을 제거해 idempotent 하게
  let base = current;
  const between = new RegExp(`${START}[\\s\\S]*?${END}\\s*(?:\\r?\\n---\\r?\\n)?`, 'g');
  base = base.replace(between, '').trimStart();

  // 예전에 손으로 적어둔 짧은 한글 태그라인 제거: "What's Changed" / "Full Changelog" 앞부분을 버린다.
  // (우리 친근한 요약과 중복되므로) — 없으면 그대로 둔다. 재실행해도 안전(idempotent).
  const wcIdx = base.search(/^(#{1,6}\s*What's Changed|\*{0,2}Full Changelog)/mi);
  if (wcIdx > 0) base = base.slice(wcIdx).trimStart();

  const injected = `${START}\n${body}\n${END}`;
  const newBody = base ? `${injected}\n\n---\n\n${base}` : injected;

  if (newBody.trim() === current.trim()) {
    console.log(`= ${version}: 변경 없음`);
    continue;
  }

  if (!APPLY) {
    console.log(`\n──────── ${version} (미리보기) ────────\n${injected}\n`);
    continue;
  }

  const tmp = join(mkdtempSync(join(tmpdir(), 'relnote-')), `${version}.md`);
  writeFileSync(tmp, newBody, 'utf8');
  gh(['release', 'edit', version, '-R', REPO, '--notes-file', tmp]);
  console.log(`✔ ${version}: 릴리즈 설명 갱신 완료`);
}

console.log(APPLY ? '\n완료.' : '\n미리보기였어요. 실제 반영은 --apply 를 붙이세요.');
