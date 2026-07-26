#!/usr/bin/env node
/**
 * backfill-deployments.mjs
 * ──────────────────────────────────────────────────────────────
 * 과거 릴리즈 태그마다 GitHub Deployment 객체(+ success 상태)를 소급 생성한다.
 * 목적: "무엇이 production 에 나갔는지" 이력을 GitHub에 일관되게 남기기 위함.
 *
 * ⚠️ 주의:
 *  - 소급 생성이므로 Deployment 의 시각은 "지금"으로 찍힌다(과거 배포 시각이 아님). 일관성/기록용.
 *  - environment=production. 오래된 태그부터 처리해 마지막(v1.13.0)이 최신 활성 배포로 남게 한다.
 *  - 기본은 미리보기(dry-run). 실제 생성은 --apply.
 *
 * 사용법 (레포 루트, gh 로그인 상태):
 *   node scripts/backfill-deployments.mjs            # 미리보기
 *   node scripts/backfill-deployments.mjs --apply    # 실제 생성
 *
 * 요구사항: Node 18+, gh CLI(로그인, repo scope). REPO 환경변수로 대상 지정(기본 hanjeun/reserve).
 */
import { execFileSync } from 'node:child_process';

const REPO = process.env.REPO || 'hanjeun/reserve';
const ENV_NAME = 'production';
const ENV_URL = 'https://reserve.it.kr';
const APPLY = process.argv.includes('--apply');
const RESET = process.argv.includes('--reset'); // 기존 production 배포를 모두 삭제 후 재생성

const sh = (cmd, a, input) =>
  execFileSync(cmd, a, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'] });

// semver 오름차순 정렬(v1.0.0 → v1.13.0) → 마지막 생성분이 최신 활성 배포가 됨.
// (생성일 정렬은 일괄 태깅 시 순서가 꼬여 목록이 뒤섞임)
const tags = sh('git', ['tag', '-l'])
  .split('\n')
  .map((t) => t.trim())
  .filter((t) => /^v\d+\.\d+\.\d+$/.test(t))
  .sort((a, b) => {
    const pa = a.slice(1).split('.').map(Number);
    const pb = b.slice(1).split('.').map(Number);
    return pa[0] - pb[0] || pa[1] - pb[1] || pa[2] - pb[2];
  });

if (tags.length === 0) {
  console.error('v* 태그를 찾지 못했습니다.');
  process.exit(1);
}
console.log(`대상 태그 ${tags.length}개: ${tags.join(', ')}\n`);

const ghApi = (method, path, bodyObj) =>
  sh('gh', ['api', '--method', method, path, '--input', '-'], JSON.stringify(bodyObj));

// --reset: 기존 production 배포를 inactive 처리 후 삭제 (semver 순서로 새로 깔기 위함)
if (RESET) {
  const existing = JSON.parse(
    sh('gh', ['api', `repos/${REPO}/deployments?environment=${ENV_NAME}&per_page=100`])
  );
  console.log(`--reset: 기존 production 배포 ${existing.length}개 삭제 예정`);
  if (APPLY) {
    for (const d of existing) {
      try {
        ghApi('POST', `repos/${REPO}/deployments/${d.id}/statuses`, { state: 'inactive' });
        sh('gh', ['api', '--method', 'DELETE', `repos/${REPO}/deployments/${d.id}`]);
        console.log(`🗑  삭제 #${d.id} (${d.ref})`);
      } catch (e) {
        console.error(`✗ 삭제 실패 #${d.id}: ${e.stderr || e.message}`);
      }
    }
  }
  console.log('');
}

for (const tag of tags) {
  if (!APPLY) {
    console.log(`(미리보기) ${tag} → deployment(environment=${ENV_NAME}) + status=success`);
    continue;
  }
  try {
    // 1) Deployment 생성. required_contexts=[] 로 상태체크 없이 강제 생성, auto_merge=false
    const dep = JSON.parse(
      ghApi('POST', `repos/${REPO}/deployments`, {
        ref: tag,
        environment: ENV_NAME,
        auto_merge: false,
        required_contexts: [],
        description: `Backfilled deployment for ${tag}`,
        production_environment: true,
      })
    );
    if (!dep.id) {
      console.warn(`⚠️  ${tag}: deployment 생성 응답에 id 없음 → ${JSON.stringify(dep).slice(0, 120)}`);
      continue;
    }
    // 2) success 상태 부여
    ghApi('POST', `repos/${REPO}/deployments/${dep.id}/statuses`, {
      state: 'success',
      environment: ENV_NAME,
      environment_url: ENV_URL,
      description: 'Backfilled (timestamp is now, for consistency)',
    });
    console.log(`✔ ${tag}: deployment #${dep.id} + success`);
  } catch (e) {
    console.error(`✗ ${tag}: ${e.stderr || e.message}`);
  }
}

console.log(APPLY ? '\n완료.' : '\n미리보기였어요. 실제 생성은 --apply 를 붙이세요.');
