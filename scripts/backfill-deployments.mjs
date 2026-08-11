#!/usr/bin/env node
/**
 * backfill-deployments.mjs
 * ──────────────────────────────────────────────────────────────
 * 릴리즈 태그마다 GitHub Deployment 객체(+ success 상태)를 소급 생성한다.
 * 목적: "무엇이 production 에 나갔는지" 이력을 GitHub 에 일관되게 남기기 위함.
 *
 * ─── 2026-08-11 전면 재작성 ──────────────────────────────────────────────────
 * 예전 버전은 두 가지가 잘못돼 있었다.
 *
 * 1) **중복 검사가 없었다.** `--apply` 만 주면 이미 기록이 있는 태그에도 또 만들었다.
 *    그래서 재실행이 사실상 불가능했고, 유일한 회피책이 `--reset`(전부 지우고 다시)이었다.
 *
 * 2) **`--reset` 이 CI/CD 가 만든 진짜 배포 기록까지 지웠다.** 이게 훨씬 큰 문제다.
 *    파이프라인은 배포 순간에 Deployment 를 만드는데 그 ref 는 **커밋 SHA** 다.
 *    예전 `--reset` 은 environment=production 인 걸 전부 지웠으므로 그것들도 같이 날아갔다.
 *    GitHub API 는 Deployment 의 생성 시각을 지정할 수 없어서 **진짜 배포 시각은 복구되지 않는다.**
 *    2026-08-11 에 실제로 7건(#5847937508 등)을 잃었다.
 *
 * 그래서 지금은 이렇게 동작한다.
 *   - 기본이 **증분**이다. 태그를 SHA 로 풀어서, 그 커밋에 이미 배포 기록이 있으면 건너뛴다.
 *     (기존 기록의 ref 가 태그명이든 SHA 든 상관없이 같은 커밋이면 같은 배포로 본다)
 *   - 이 스크립트가 만든 것에는 표식을 남긴다. 정리는 `--prune-backfilled` 로 **그 표식이 있는 것만**
 *     지운다. CI/CD 가 만든 기록에는 절대 손대지 않는다.
 *   - `--reset` 은 없앴다. 실수로 칠 수 있는 자리에 되돌릴 수 없는 동작을 두지 않는다.
 *
 * 사용법 (레포 루트, gh 로그인 상태):
 *   node scripts/backfill-deployments.mjs                      # 미리보기(무엇을 만들지)
 *   node scripts/backfill-deployments.mjs --apply              # 빠진 것만 생성
 *   node scripts/backfill-deployments.mjs --prune-backfilled   # 정리 대상 미리보기
 *   node scripts/backfill-deployments.mjs --prune-backfilled --apply
 *   node scripts/backfill-deployments.mjs --tag v2.2.0 --apply # 특정 태그만
 *
 * 요구사항: Node 18+, gh CLI(로그인, repo scope). REPO 환경변수로 대상 지정(기본 hanjeun/reserve).
 */
import { execFileSync } from 'node:child_process';
import { resolveBin } from './resolve-bin.mjs';

const REPO = process.env.REPO || 'hanjeun/reserve';
const ENV_NAME = 'production';
const ENV_URL = 'https://reserve.it.kr';

// ★ 이 문자열이 "이 스크립트가 만든 기록"의 유일한 표식이다.
//   --prune-backfilled 가 이걸로만 대상을 고르므로 **값을 바꾸면 옛 기록을 못 찾는다.**
//   바꿔야 한다면 PRUNE_MARKERS 에 옛 값을 남겨둘 것.
const BACKFILL_MARKER = 'backfilled-by-script';
const PRUNE_MARKERS = [BACKFILL_MARKER];

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const PRUNE = args.includes('--prune-backfilled');
const onlyTag = (() => {
    const i = args.indexOf('--tag');
    return i >= 0 ? args[i + 1] : null;
})();

// 되돌릴 수 없는 옛 플래그를 조용히 무시하지 않는다 — 예전 문서를 보고 친 사람이
// "지웠겠거니" 하고 넘어가면 안 된다.
if (args.includes('--reset')) {
    console.error(
        '--reset 은 제거됐습니다.\n' +
        '  이 플래그는 CI/CD 가 배포 순간에 만든 진짜 기록(ref 가 커밋 SHA)까지 지웠고,\n' +
        '  GitHub API 로는 배포 시각을 되돌릴 수 없어 복구가 불가능합니다.\n' +
        '  이제 기본 동작이 증분(빠진 것만 생성)이라 그냥 --apply 만 주면 됩니다.\n' +
        '  이 스크립트가 만든 것만 지우려면 --prune-backfilled 를 쓰세요.'
    );
    process.exit(1);
}

// ★ 도구 탐색은 인자 검증을 통과한 뒤에 한다.
//   위 --reset 가드는 "이 명령은 이제 없다"를 알려주는 게 목적인데, 그보다 먼저
//   gh 를 찾다 실패하면 엉뚱한 메시지("gh 를 찾지 못했습니다")만 보고 진짜 이유를 놓친다.
// PATH 탐색 대신 절대 경로로 실행한다 — 이유는 resolve-bin.mjs 주석 참고(S4036).
const GH_BIN = resolveBin('gh');
const GIT_BIN = resolveBin('git');

const sh = (cmd, a, input) =>
    execFileSync(cmd, a, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'] });

const ghApi = (method, path, bodyObj) =>
    sh(GH_BIN, ['api', '--method', method, path, '--input', '-'], JSON.stringify(bodyObj));

const ghGet = (path) => JSON.parse(sh(GH_BIN, ['api', '--paginate', path]));

/** semver 오름차순. 문자열 정렬은 v1.10.0 < v1.9.0 이 되므로 쓰면 안 된다. */
const bySemver = (a, b) => {
    const pa = a.slice(1).split('.').map(Number);
    const pb = b.slice(1).split('.').map(Number);
    return pa[0] - pb[0] || pa[1] - pb[1] || pa[2] - pb[2];
};

// ── 정리 모드 ────────────────────────────────────────────────────────────────
// 이 스크립트가 만든 것만 고른다. description 에 표식이 없으면 건드리지 않는다.
if (PRUNE) {
    const existing = ghGet(`repos/${REPO}/deployments?environment=${ENV_NAME}&per_page=100`);
    const mine = existing.filter((d) =>
        PRUNE_MARKERS.some((m) => (d.description || '').includes(m))
    );
    const theirs = existing.length - mine.length;

    console.log(`production 배포 ${existing.length}건 중 이 스크립트가 만든 것 ${mine.length}건`);
    console.log(`(나머지 ${theirs}건은 CI/CD 등이 만든 기록이라 건드리지 않습니다)\n`);

    if (mine.length === 0) {
        console.log('지울 대상이 없습니다.');
        process.exit(0);
    }

    for (const d of mine) {
        if (!APPLY) {
            console.log(`(미리보기) 삭제 #${d.id} (${d.ref})`);
            continue;
        }
        try {
            // GitHub 은 active 상태의 배포를 바로 지우지 못한다. inactive 로 내린 뒤 삭제한다.
            ghApi('POST', `repos/${REPO}/deployments/${d.id}/statuses`, { state: 'inactive' });
            sh(GH_BIN, ['api', '--method', 'DELETE', `repos/${REPO}/deployments/${d.id}`]);
            console.log(`🗑  삭제 #${d.id} (${d.ref})`);
        } catch (e) {
            console.error(`✗ 삭제 실패 #${d.id}: ${e.stderr || e.message}`);
        }
    }
    console.log(APPLY ? '\n완료.' : '\n미리보기였어요. 실제 삭제는 --apply 를 붙이세요.');
    process.exit(0);
}

// ── 생성 모드 (기본) ─────────────────────────────────────────────────────────
let tags = sh(GIT_BIN, ['tag', '-l'])
    .split('\n')
    .map((t) => t.trim())
    .filter((t) => /^v\d+\.\d+\.\d+$/.test(t))
    .sort(bySemver);

if (onlyTag) {
    if (!tags.includes(onlyTag)) {
        console.error(`태그 ${onlyTag} 을(를) 찾지 못했습니다. (git fetch --tags 를 먼저 하셨나요?)`);
        process.exit(1);
    }
    tags = [onlyTag];
}

if (tags.length === 0) {
    console.error('v* 태그를 찾지 못했습니다.');
    process.exit(1);
}

// 태그 → 커밋 SHA. annotated 태그는 태그 객체를 가리키므로 ^{commit} 으로 풀어야 한다.
const shaOf = (tag) => sh(GIT_BIN, ['rev-parse', `${tag}^{commit}`]).trim();

// 이미 있는 배포를 "커밋 SHA" 기준으로 모아둔다.
// ref 는 태그명일 수도 SHA 일 수도 있어서(파이프라인은 SHA 로 만든다) 한쪽만 보면 중복이 난다.
const existing = ghGet(`repos/${REPO}/deployments?environment=${ENV_NAME}&per_page=100`);
const deployedShas = new Map();
for (const d of existing) {
    let sha = d.sha || null;
    if (!sha && d.ref) {
        try { sha = sh(GIT_BIN, ['rev-parse', `${d.ref}^{commit}`]).trim(); } catch { /* 사라진 ref */ }
    }
    if (sha) deployedShas.set(sha, d);
}

console.log(`대상 태그 ${tags.length}개 / 기존 production 배포 ${existing.length}건\n`);

let created = 0;
let skipped = 0;

for (const tag of tags) {
    let sha;
    try {
        sha = shaOf(tag);
    } catch (e) {
        console.error(`✗ ${tag}: 커밋을 풀지 못했습니다 — ${e.stderr || e.message}`);
        continue;
    }

    const already = deployedShas.get(sha);
    if (already) {
        console.log(`= ${tag}: 이미 배포 기록 있음 (#${already.id}, ref=${already.ref}) → 건너뜀`);
        skipped += 1;
        continue;
    }

    if (!APPLY) {
        console.log(`+ ${tag}: deployment(environment=${ENV_NAME}) + status=success 를 만들 예정`);
        created += 1;
        continue;
    }

    try {
        // required_contexts=[] 로 상태체크 없이 강제 생성, auto_merge=false.
        // ref 는 태그명으로 둔다 — GitHub UI 에서 어떤 릴리즈인지 바로 보인다.
        const dep = JSON.parse(
            ghApi('POST', `repos/${REPO}/deployments`, {
                ref: tag,
                environment: ENV_NAME,
                auto_merge: false,
                required_contexts: [],
                description: `${BACKFILL_MARKER}: ${tag}`,
                production_environment: true,
            })
        );
        if (!dep.id) {
            console.warn(`⚠️  ${tag}: 생성 응답에 id 없음 → ${JSON.stringify(dep).slice(0, 120)}`);
            continue;
        }
        ghApi('POST', `repos/${REPO}/deployments/${dep.id}/statuses`, {
            state: 'success',
            environment: ENV_NAME,
            environment_url: ENV_URL,
            // 시각은 "지금"으로 찍힌다. API 가 과거 시각 지정을 지원하지 않는다.
            description: `${BACKFILL_MARKER} (생성 시각은 실제 배포 시각이 아닙니다)`,
        });
        // 같은 커밋에 태그가 둘 이상 달린 경우 두 번 만들지 않도록 즉시 반영한다.
        deployedShas.set(sha, dep);
        console.log(`✔ ${tag}: deployment #${dep.id} + success`);
        created += 1;
    } catch (e) {
        console.error(`✗ ${tag}: ${e.stderr || e.message}`);
    }
}

console.log(
    `\n${APPLY ? '완료' : '미리보기'} — 생성 ${created}건, 건너뜀 ${skipped}건.` +
    (APPLY ? '' : '\n실제 생성은 --apply 를 붙이세요.')
);
