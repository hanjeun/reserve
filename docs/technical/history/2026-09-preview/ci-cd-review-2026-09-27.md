# CI/CD·브랜치·시크릿·이력 변경 검토 — 2026-09-27

이 문서는 읽기 전용 감사 결과와 제안이다. 워크플로 실행, 브랜치/보호 규칙 변경,
키 생성·등록, 이력 재작성, 커밋·배포를 승인하거나 수행한 기록이 아니다.
관련 런북: [배포](../../deployments.md), [Git 규칙](../../../rules/git-workflow.md),
[통합 후보](../../release-candidate-2026-09-27.md), [제3자 고지](../../../../THIRD_PARTY_NOTICES.md).

## 1. 실제 GitHub와 로컬 후보 구분

실시간 조회한 dev HEAD는 `eb31d61eddb3a0fbd46a20ca31aad5cc4bdec281`,
main HEAD는 `b478ae8d732afa1e35642d790bfc39972556f885`다.
두 원격의 CICD.yml blob은 `e3037d86d883ac4fdbd70a7d940e8e4b5016cfd8`로 같았다.
현재 GitHub 실행 [36238175151](https://github.com/hanjeun/reserve/actions/runs/36238175151)의
단위·브라우저 검사 단계 성공을 확인했다. 새 로컬 통합 후보의 CI 성공을 뜻하지 않는다.

| 구분 | 원격 dev/main | 로컬 통합 후보 |
|---|---|---|
| backend 검사 | `clean build` 내부의 Gradle test | 동일 |
| frontend 검사 | lint·정책·Vitest·Playwright·build/번들 예산 | 동일 + 문서 링크·불변 snapshot·자산 보존 검사 |
| frontend 전환 | build-frontend에서 live 전환 | SHA 디렉터리에 staging만 수행 |
| backend 전환 | 신규 health 후 upstream 변경 | 새 frontend root와 backend upstream 동시 변경 |
| rollback/smoke | 기존 health 실패 복구 | 두 설정 복구·post-deploy smoke·옛 lazy 자산 보존 후보 |

현재 작업 ID는 `build-backend → build-frontend → deploy-backend`다.
테스트 부재가 아니라 CI와 패키징/서버 staging이 같은 작업에 묶인 구조다.
backend가 실패하면 frontend가 needs 조건으로 생략되고, 한 frontend 검사 실패 후 나머지 단계는 실행되지 않는다.

### 검사 종류의 정확한 이름

- Gradle test: 순수 단위 테스트뿐 아니라 Spring MVC/컨텍스트/JPA 통합 검사도 함께 실행한다.
  테스트 설정은 H2·mock을 사용한다. 실제 MySQL 잠금·DDL·PG·S3 실증과 구분한다.
- Vitest: 함수/상태/React 컴포넌트 검사다. 서버와 실제 S3를 연결한 E2E가 아니다.
- Playwright: PC·모바일 Chromium 브라우저 검사다. API route mocking을 사용한 검사도 있으며,
  현재 webServer는 Vite 개발 서버다. 프로덕션 번들·Safari·TEST PG의 보장은 아니다.
- 정책·Grafana·shell·문서·snapshot 검사: 별도 정적/구조/재현성 관문이다.
- CodeQL: 별도 workflow에서 보안 분석한다. SonarCloud는 별도 서비스의 Automatic Analysis이며
  CICD.yml 안에 Sonar 실행 단계가 있다고 설명하지 않는다.

## 2. 이벤트·승인·브랜치 현황

| 이벤트 | 현재 동작 |
|---|---|
| feature → dev PR | backend/frontend 검사, 운영 배포 없음 |
| dev → main PR | 같은 검사, 운영 배포 없음 |
| dev merge 후 push | CICD push 트리거 없음; CodeQL 별도 실행 가능 |
| main merge 후 push | 문서만 바뀐 경우를 제외하고 검사·이미지 게시·서버 전환 |
| workflow_dispatch | CI만 실행; CD는 main + push 조건 때문에 실행하지 않음 |

dev/main 보호 규칙은 required checks `build-backend`, `build-frontend`,
strict(up-to-date)=true, admins 적용, force push=false다.
main만 linear history=true다. 승인 리뷰 최소 수는 0이었다.
production Environment는 main만 허용하지만 required reviewer 규칙은 없었다.

환경 승인과 현재 대화의 실행 승인은 별개다. 작업의 표시 이름/ID를 바꾸면 필수 check 이름도
달라질 수 있으므로 GitHub 보호 규칙을 함께 검토한 별도 승인 없이 작업 이름을 바꾸지 않는다.

## 3. 권장 구조 — 아직 미구현

기능 PR에서는 빠른 직접 검사를, 배포 후보에서는 생산 경계 검사를 강화한다.
현재 필수 check를 먼저 유지한 채 작은 변경으로 옮기는 것이 안전하다.

| 관문 | 권장 검사/역할 |
|---|---|
| backend CI | 명시적 `test` 단계 + 결과 리포트; 완료 후 bootJar 패키징 |
| frontend CI | lint·정책·Vitest·정적 문서/자산 검사·production build |
| 브라우저 CI | 기존 개발 서버 회귀 검사 + 별도의 built-dist smoke |
| MySQL 관문 | 격리 MySQL 8의 DDL·행 잠금·pagination 검사; 금융/스키마 변경과 릴리스에 필수 |
| CI 최종 관문 | 필요 시 always 평가하는 집계 check; 실패/취소/필수 검사 skip을 성공으로 숨기지 않음 |
| CD | 검증된 같은 SHA의 이미지 게시·SCP staging·health·동시 cutover·smoke·rollback·기록 |

- backend/frontend 검사는 병렬화할 수 있지만 CD는 둘의 성공을 기다려야 한다.
- 단위/통합을 별도 job으로 나누려면 먼저 JUnit tag/sourceSet 기준을 만든다.
  현재 한 test task를 이름만 바꿔 두 종류가 분리됐다고 주장하지 않는다.
- 기존 지연 모듈 검사는 개발 소스 URL을 가로챈다. 전체 Playwright를 무작정 preview 서버로
  바꾸지 않고, 별도의 production smoke를 추가해 번들 실행 차이를 확인한다.
- 통합 MySQL은 GitHub runner의 격리 service/container로 검증할 수 있다.
  운영 DB에 테스트 데이터를 쓰거나 새로운 유료 AWS 환경을 만들 필요는 없다.
- 실패 리포트·trace를 저장하고 반복 검사에서 중복 build를 피한다. 개발 중 최소 검사 정책과
  배포 후보의 전체 CI는 모순이 아니다. 현재 로컬 표적 성공으로 전체 CI를 대체하지 않는다.
- 이미지 게시/SCP도 CD에 속한다. 지금은 일부가 build job 안에 있고 production Environment
  보호를 받는 deploy-backend보다 먼저 실행된다. 향후 모든 운영 쓰기를 동일한 CD 승인 경계로
  옮긴 뒤 required reviewer를 검토한다. 1인 프로젝트에서 self-review 금지를 켜면 본인이
  승인할 수 없으므로 실제 승인자를 먼저 정한다.
- PR/CodeQL 동시 작업 취소와 production 배포 취소 금지는 구분한다.
  현재 main push의 cancel-in-progress=false를 유지한다.

### staging 브랜치가 필요한가

지금은 추가하지 않는 것을 권장한다. `staging`은 환경의 이름이고 Git 브랜치가 필수인 것은 아니다.
`feature → dev → main`을 유지하고, 필요할 때 dev의 확정 SHA를 별도 staging Environment에
배포할 수 있다. 독립적인 장기 운영/승격 절차가 없으면 stage 브랜치는 동기화할 계보만 늘린다.

Blue/Green의 비활성 슬롯은 production 전환·rollback 대상이지 독립 staging 환경이 아니다.
같은 운영 DB/S3/PG를 쓰는 슬롯에 테스트를 실행하면 실제 데이터에 영향을 준다.
별도 환경이 필요해지면 격리 DB·S3 prefix/bucket·TEST PG·시크릿을 먼저 분리한다.
현재는 사용자가 원하지 않은 AWS 인프라나 비용을 추가하지 않는다.

feature → dev는 merge commit, dev → main은 현재 linear 규칙에 맞는 squash다.
릴리스 이후 계보 정리는 양쪽 tree 동등성을 확인한 승인된 PR로 처리하며,
main의 미반영 hotfix를 `-s ours`로 덮어 숨기지 않는다.

## 4. 채팅 사진 키는 무엇인가

암호관리자는 비밀번호와 키를 암호화해 보관하는 금고 앱이다. GitHub Secret은 배포 주입용이며,
저장 후 원문을 다시 읽을 수 있는 복구 보관소가 아니다.
사용자는 암호관리자에 복구본 보관 + GitHub Secret 전달 방식을 선택했다.
현재 사용 중인 제품·보관/복구 완료 여부는 아직 확인하지 않았다. 새 유료 가입은 요구하지 않는다.

- `CHAT_IMAGE_ENCRYPTION_KEY`는 사진 AES-GCM 암호화 전용 키다.
  AWS/S3 접속 키·JWT 키·OAuth unlink 키와 다르다.
- 현재 코드에서는 표준 Base64를 해독한 32바이트가 필요하며, 키가 비면 사진 기능만 비활성이다.
  repo 및 production Environment에서 해당 Secret 이름이 없음을 이번 조회로 확인했다.
- 새 키를 안전하게 생성하고 복구본 저장/읽기 검증 후, 실제 workflow가 참조하는 scope에
  등록·주입해야 사진을 켤 수 있다. Secret 등록·환경 변경·재시작은 아직 하지 않았다.
- 키 값은 Git·문서·대화·로그·명령 인자에 넣지 않는다.
- 두 Blue/Green 슬롯은 같은 사진 키를 사용해야 한다. 현재 key-ID/다중키 복호화가 없으므로
  이미 저장한 사진이 있으면 새 값으로 단순 교체하지 않는다.
- 기존 MySQL 백업/S3 구성은 재생성하지 않는다. DB 백업 성공도 사진 키 복구를 대신하지 않는다.

## 5. 과거 커밋 제목 한글화의 실제 작업량

로컬의 최신 원격 추적 main/dev 계보 합집합은 커밋 478개·부모 간선 646개다.
제목에 한글이 있는 것은 1개, 없는 것은 477개이며, 한글이 없다는 것이 모두 번역 대상이라는 뜻은 아니다.
로컬 태그는 38개, archive/feature 등 다른 로컬 ref까지 포함하면 고유 커밋은 504개다.
얕은/일반 clone의 숫자를 모든 GitHub PR 내부 ref의 수라고 해석하지 않는다.

메시지도 commit 객체의 일부다. 바꾸면 해당 commit과 그 뒤의 자손 SHA가 바뀐다.
메시지 전용 DAG 변환은 old→new SHA를 캐시해 각 commit/parent를 한 번씩 처리할 수 있어
대체로 O(V+E+메시지 바이트)다. 400×400번 hash 연산이 필수인 작업이 아니다.
blob/tree는 내용이 같으면 재사용할 수 있다. 시간은 번역 검수·pack I/O·검증·GitHub 정합성 복구가 지배한다.

### 선택별 영향

| 선택 | 영향 |
|---|---|
| 미래 제목만 `fix: 뒤로가기 중복 애니메이션 방지` 형식 | 기존 SHA·태그·배포 이력 유지. 영어 subject 규칙 변경 합의만 필요 |
| 별도 한국어 커밋 해설/대조 문서 | SHA 유지. 번역 문서의 유지 비용이 생김 |
| 모든 공개 과거 제목 재작성 | 후속 SHA·태그/서명·PR 참조·worktree·release/deployment/이미지 태그 대조 필요 |

영어 type와 scope/trailer는 보존할 수 있다. 실제 공동 작성자를 추가하거나 바꾸는 일이 아니며,
`Co-authored-by`·작성자/이메일·author 시각·머지 부모를 그대로 유지해야 한다.
Dependabot 자동 제목도 일괄 번역할지 별도 판단한다. 배지 재인정이나 보존을 보장하지 않는다.

공개 이력을 정말 바꾸려면 다음을 별도 작업으로 수행해야 한다.

1. 실행 중인 릴리스/PR/자동화 동결 범위와 force-push 보호 해제·복원 승인 확정
2. mirror/bundle의 ref 백업 + 원본 dirty/ignored 작업 별도 보존 + GitHub PR/Release/Deployment 메타데이터 기록
3. commit 메시지 old→번역 매핑의 수동 검수, 별도 clone에서 topology를 보존하는 일괄 변환
4. 모든 대응 commit의 tree 동일성·부모 매핑·작성자/시각/trailer·태그 대상·메시지 인코딩 검증
5. SHA 고정 참조/이미지/배포 기록의 old→new 대응표와 실제 복구 절차 검증
6. 승인된 원격 ref만 교체, 기존 clone/worktree 재정렬, 보호 규칙 복원

일반 clone 하나는 dirty 파일·ignored 환경 파일·GitHub 메타데이터까지 보호하지 않는다.
재작성 후 다시 옛 이력을 push하는 것도 막아야 한다. 현재 보호 규칙은 force push를 금지한다.
[GitHub 메시지 변경 안내](https://docs.github.com/en/pull-requests/how-tos/commit-changes/changing-a-commit-message),
[이력 재작성의 부작용](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)을 참고한다.

권장안은 **현재 배포와 과거 재작성을 분리하고 미래 제목부터 한글로 전환하는 것**이다.
영어 제목 규칙·과거 이력·GitHub 설정은 이번 작업에서 바꾸지 않았다.

## 6. 이번 파일 수정과 검증

| 파일 | 변경 이유 |
|---|---|
| `frontend/src/components/layout/Header.jsx` | 실제 경로 커밋까지 뒤로가기 intent 유지·연타 중복 방지·다른 이동 시 타이머 취소·forward 키 재사용 시 잠금 해제 |
| `frontend/src/components/layout/Header.test.jsx` | 비동기 POP·연타·다른 이동·동일 history key 복귀의 회귀 검사 |
| `frontend/e2e/discovery-tab-motion.spec.js` | POP 지연을 늘린 실제 브라우저에서 leave 1회와 forward 복귀 검사 |
| `THIRD_PARTY_NOTICES.md` | 한영 병기·현재 미검증 라이선스 개수 제거·GPL/runtime/MariaDB의 과도한 단정 정정 |
| 이 날짜별 감사 문서 | 실제 원격 CI/보호 규칙·로컬 후보·개선 제안·이력 변경 비용 분리 |
| `docs/technical/current-status.md` | 이번 검토의 링크와 실행하지 않은 작업 경계 추가 |

공통 헤더를 사용하는 PC·모바일의 상세/로그인/일반 페이지가 영향 범위다.
로고 디자인·색·180ms 모션·메시지 화면의 별도 닫힘 관문·CSS는 변경하지 않았다.
프리뷰에서 먼저 확인한 뒤 기존 통합 worktree에 같은 관련 변경만 옮겼다.

### 재현과 최종 결과

- 수정 전 회귀 단위 검사 2개 실패: 180ms 뒤 leave class가 풀림, 다른 화면으로 이동한 뒤 옛 back 실행.
- 수정 전 PC 브라우저 검사: 지연된 POP 조건에서 leave animationstart가 2회였음을 확인.
- 수정 중 forward에서 동일 key의 잠금이 되살아나는 경계도 재현·보완했다.
- 최종 프리뷰 및 통합 후보 각각 Vitest 3파일·41개 통과.
- 최종 통합 후보 PC·모바일 Chromium 6개 통과: 연타/forward·정적 로고·일반 경로 방향.
- 변경 JS/JSX/E2E 파일 ESLint 통과. 문서 링크 누락 0건·git diff --check 통과.
- 실제 기존 실행 JAR에 `BOOT-INF/lib/mysql-connector-j-9.4.0.jar`가 들어 있음을 읽기 전용 확인.
- 전체 CI/프로덕션 빌드/라이선스 감사/MySQL/PG/S3/Linux 배포는 이번 후속에서 재실행하지 않았다.

원본 manifest의 864개 입력 중 관련 수정 5개 외 859개 hash는 그대로였다.
신규 감사 문서 외에 자산·snapshot·기존 사용자 증거를 만들거나 지우지 않았다.
두 checkout의 HEAD는 유지했고 staged=0이다. 키 등록/운영 변경/브랜치 생성/커밋/PR/태그/배포는 수행하지 않았다.

## 7. 사용자 결정과 후속 로컬 변경

앞선 감사의 제안과 별개로 사용자가 **v2.7.0**, 키/복구본 준비 후 사진 활성화,
기존 영어 커밋·PR 제목/한국어 PR 본문·릴리스 노트 유지 방침을 선택했다.
미래 한글 커밋 제안은 채택하지 않았으며 과거 제목도 재작성하지 않는다.

필수 check `build-backend`/`build-frontend`와 CD의 main-push 조건은 유지한다.
백엔드 `clean test`(단위·Spring/H2)와 `bootJar`, Vitest, PC 및 Pixel 7 Chromium을 명시적 단계로 나눈다.
PC 실패 시에도 모바일을 실행하되 앞선 설치/단위 검사 실패는 건너뛴다. 검사 실패는 그대로 job 실패다.
브라우저 output을 PC/mobile로 분리해 두 번째 실행이 첫 번째 trace/캡처를 지우지 않게 하고,
실패 증거는 7일 보존한다. [Actions 조건 공식 문서](https://docs.github.com/en/actions/reference/workflows-and-actions/expressions)를 기준으로 했다.

별도 job 병렬화·production-bundle smoke·MySQL service·CD 승인 경계 재편은 여전히 미구현이다.
이번 명시적 단계 변경을 이 권장 구조 전체의 구현으로 해석하지 않는다.
새 workflow가 GitHub에서 실행되거나 운영에 배포된 증거도 아직 없다.

사진 키는 기존 Secret의 원문을 찾는 작업이 아니라 [새 키의 생성/보관/등록](../../chat-images.md) 작업이다.
운영 키를 이번 도구 호출에서 생성·표시·저장하지 않았다.

### 후속 검증 결과

- preview 및 통합 후보의 정책 검사 13개 통과(새 CI 계약 검사 6개 포함). 필수 check ID·
  테스트 순서·취소/실패 조건·main-push 쓰기 제한·버전 일치를 정적으로 확인했다.
- preview의 홈 Vitest 2파일·37개 통과. jsdom pseudo-element 경고는 있었으며 실패는 없다.
- 통합 후보의 사진 암호화/권한/재시도 표적 5개 통과, v2.7.0 bootJar 패키징 통과.
- PC·모바일의 헤더 연타·홈 자동 넘김 4개 통과. 새 홈 배너/분야 링크 검사 4개도 수정 후 통과.
  캡처 보존을 위한 배너 2개 재실행은 통과했으며 고유 검사 수에 중복 합산하지 않는다.
- 새 테스트의 첫 실행 4개 실패는 mock이 /src/api/axios.js 등 Vite 소스까지 JSON으로 응답한
  검사 코드 문제였다. 실제 /api/로 시작하는 요청만 mock하도록 고쳐 통과했다.
  앱 화면 코드는 이번 후속에서 바꾸지 않았다.
- PC·모바일 실캡처에서 첫 배너의 문구/이미지와 기본 탐색 UI를 시각 확인했다.
  mock 데이터이며 실제 계정·S3·PG·Safari 증거는 아니다.
- ESLint 표적 파일, 문서 링크(preview 350/통합 356개·누락 0), 두 checkout diff check 통과.
  lockfile은 루트 두 version만 변경했으며 의존성/불변 디자인 자산을 변경하지 않았다.
- 원격 dev/main SHA는 위 기준선 그대로이고 repo/production Secret 이름도 아직 없다.
  전체 CI·frontend production build·라이선스 감사·외부 통합·운영 변경은 재실행하지 않았다.

사용자가 키/복구본을 직접 준비한 뒤 이름 등록만 재확인한다(원문 조회 금지).
그다음 새 DB 구조·외부 관문·확정 후보 전체 CI와 승인된 Git/배포 절차를 잇는다.
