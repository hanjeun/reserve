# v2.7.0 릴리스 검사 — 2026-09-27

운영 기준은 v2.6.3이다. 사용자 승인: 전체 CI·commit·PR·실배포 진행.
운영 DDL은 정확한 대상과 복구 관문을 확인한 뒤 별도 승인하며, 이 문서는 실행 승인이 아니다.
최신 dev `eb31d61e…` 기반 격리 후보에서 검사한다. 원본 프리뷰의 HEAD/index와 다른 사용자 변경은 보존한다.

## 이번 변경

- 채팅방 진입의 opacity 시작값과 easing만 뒤로가기 모션에 맞춘다. 양쪽 260ms,
  `cubic-bezier(0.4, 0, 0.2, 1)`이며 reduced-motion과 닫기/레이아웃은 유지한다.
  `feature-surfaces.css`, `MessengerInteractionPolicy.test.js`, `messenger-identity.spec.js`가 해당 변경이다.
- 전체 브라우저 검사에서 두 오래된 테스트 문제를 확인했다. 관리자 탭이 가로 이동하며 첫 클릭이
  nav 컨테이너에 닿는 경쟁은 키보드 선택+aria-selected 확인으로 고친다.
  고객지원 mock은 새 POST `/support/open`과 안내/config 응답을 실제 계약에 맞춘다.
  결제·채팅 제품 코드는 이 테스트 보완으로 바꾸지 않는다.
- 불변 snapshot에는 과거 `.gitattributes`도 보존돼 있어 상위 규칙만으로 SVG 줄바꿈 변환을 막을 수 없었다.
  현재 `.gitattributes`와 snapshot 검증의 명시적 `-InstallGitGuard`로 해당 폴더에만 Git byte guard를 적용한다.
  flag는 저장소 로컬 `info/attributes`에 규칙을 추가하며 기존 규칙을 덮어쓰지 않는다(워크트리의 공용 Git metadata).
  120개 snapshot 파일의 실제 index blob도 원본 바이트와 대조했다. 원본 108개·manifest·ZIP은 수정하지 않는다.
  동작 없는 신규 파일의 EOF 빈 줄 2곳만 제거했다(`check-doc-links.mjs`, `kakaoMapsLoader.test.js`).
- 키 등록/복구본 보관은 사용자 완료 확인이다. GitHub repository Secret 이름 존재는 읽기 전용으로 확인했다.
  environment 중복 등록은 필요 없다. 값은 읽거나 출력하지 않았으며 실제 복구·S3 왕복을 증명하지 않는다.
  사진 Picker/UI는 이미 구현됐고 runtime config `enabled:true`일 때 표시된다. Secret 등록만으로 실행 JVM은 갱신되지 않는다.

## 실행 결과

| 검사 | 결과/경계 |
|---|---|
| backend `clean test bootJar --console=plain` | 531개, failure/error/skip 0; 패키징 통과. H2/Mockito는 MySQL/PG/S3 실증 아님 |
| frontend `npm ci`, `lint:ci`, `test:policy` | 정상 tabs patch 적용, lint 및 변경 E2E ESLint 통과, 최종 정책 14개 통과 |
| frontend 전체 Vitest | 99파일·858개 통과. jsdom/부정 fixture 경고는 있었으며 실패 없음 |
| PC·모바일 전체 Playwright | 128개 실행: 최초 121 통과·3 정상 skip·4 실패. 테스트 수정 뒤 해당 3시나리오 PC/모바일 6/6, 실제 안내 응답 확인 2/2 통과. 단일 최종 전체 실행은 GitHub CI에서 재확인 |
| 신규 모션 PC·모바일 표적 | 2/2 통과, 실제 animationstart의 easing/duration 확인 |
| `npm run build -- --logLevel error` | sitemap→Vite→bundle 통과, 초기 gzip 326.9KiB / 최대 청크 544.3KiB |
| 문서 링크 / snapshot | 링크 358개 누락 0; snapshot 108/108, ZIP 117 entry/해시 일치 |
| PostCSS / Grafana / diff | CSS 13파일·산문 선택자 0, Grafana validator, 앱·운영 코드 diff check 통과. 불변 과거 source/license의 원래 공백은 수정하지 않고 hash 검증 |
| Linux fixture drill | 실제 서버에서 cutover/ERR rollback·자산 보존/충돌/경로 거부 통과. mktemp 하위만 사용/정리, 운영 nginx·서비스·AWS 미변경 |

## 남은 배포 관문

운영 DDL 적용이나 main 병합·태그·배포 완료는 아직 아니다. 새 OWNER ENUM/owner_unread와 채팅 사진·안내·신고 구조,
MySQL 8 잠금/쿼리, TEST PG, 실제 S3·두 계정·Safari, 실제 nginx cutover 후 smoke가 남는다.
기존 백업·IAM·cron을 다시 만들거나 새 유료 인프라를 추가하지 않는다. FULLTEXT와 CSP enforcement는 활성화하지 않는다.
검사 통과만으로 이 외부 관문을 완료 처리하지 않는다. 실패를 ignore/retry 성공으로 숨기지 않는다.

외부 증거 위치: `C:/Users/USER/Projects/RESERVE-release-manifests/2026-09-27-v270-release-browser-results/`.
기능별 hash manifest를 확정한 경로만 후보에서 staging하며 add-A/add-u/preview 전체 cherry-pick을 사용하지 않는다.

배포/CI → 계정·출석 → 금융·광고 → 메시징·사진 → 탐색 → 공통 UI → 불변 증거 → Git byte guard를
각각 별도 커밋으로 반영했다. 마지막 릴리스 문서 커밋 뒤 dev PR의 최종 헤드 CI를 확인한다.
라우팅 rollback은 DB나 새 OWNER/사진 데이터를 되돌리지 않는다. 이전 백엔드의 새 데이터 읽기 호환성은
격리 MySQL/이전 버전 관문에서 따로 검증하며, 스키마를 삭제하거나 발신자 역할을 임의로 다시 쓰지 않는다.

## 원격 PR 검사와 운영 읽기 전용 재확인

- dev 초안 PR #225, 최초 head `78abba7f…`. CI `36308059940`에서 백엔드 테스트·패키징은 통과했다.
  프론트는 Linux PowerShell의 숨김 `.gitattributes` Get-Item 단계에서 실패했고 이후 프론트 검사는 실행되지 않았다.
  현재 snapshot 검증 스크립트의 파일 조회에 `-Force`를 명시한다. 보존 snapshot/ZIP/hash는 변경하지 않는다.
  정책에 숨김 파일 조회 계약을 추가하며, 수정 head의 원격 CI를 다시 확인한다.
- 같은 운영 MySQL 8.0.45에서 chat_room/chat_message는 InnoDB, 각각 1개/5개 행이다.
  sender_role은 여전히 ADMIN/MEMBER ENUM이고 새 컬럼은 없다. checked_in_at UTC 백필 조건의 대상은 0개다.
  이 재확인은 SELECT/SHOW만 수행했고 데이터·스키마를 바꾸지 않았다.
- v2.6.3 main의 SenderRole에는 OWNER가 없고, 관리자 방 목록은 SUPPORT 필터가 없다.
  새 가게 대화/OWNER 메시지 저장 이후 구버전으로 되돌리면 메시지 해석과 고객지원 범위가 호환되지 않는다.
  단순 nginx rollback 성공은 이 호환성의 증거가 아니며, 실배포 전 별도 해결 관문이다.
