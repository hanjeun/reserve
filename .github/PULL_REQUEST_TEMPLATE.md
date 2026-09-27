<!-- 제목: 커밋과 같은 영어 형식 `type: subject` (소문자 시작, 마침표 없음, 현재형 동사).
     본문: 아래 한국어 형식. 해당 없는 선택 섹션(동작 변화·스키마·되돌리기·직접 확인할 것·제외한 것)은 지운다.
     말투: 릴리즈 노트(CHANGELOG)와 같은 해요체 — "~했어요", "~해요", "~돼요". 쉬운 말을 먼저 쓰고 코드 이름은 필요할 때만 괄호·백틱으로 붙인다. -->

<!-- English type: subject title. Explain the user-visible problem and scope; body may be Korean. -->

## Changes

<!-- Keep one concern per PR. State what is deliberately deferred. -->
-

## 동작 변화
<!-- 선택: 이용자·사장님·관리자가 느끼는 변화 -->

## 스키마·운영 영향
<!-- 선택: 컬럼 추가, 수동 DDL, 설정·비밀값, 배포 순서 -->

## 검증
<!-- 실제로 실행한 명령과 결과만 적는다. 다른 사람의 예전 실행을 체크하지 않는다 -->
| 항목 | 결과 / 근거 |
|---|---|
| 백엔드 (`./gradlew test`) | 미실행 / 해당 없음 |
| 프론트 (`npm run lint:ci`, `npm run test:policy`, `npm run test:run`, `npm run build`) | 미실행 / 해당 없음 |
| PC·모바일 (`npm run test:e2e`) | 미실행 / 해당 없음 |
| 실제 서비스·운영 확인 | 미실행 / 해당 없음 |

## 되돌리기
<!-- 선택: 되돌리는 방법과 경계(목 테스트는 운영 증거가 아니다) -->

- [ ] feat
- [ ] fix
- [ ] refactor
- [ ] chore
- [ ] docs
- [ ] style
- [ ] release

## Verification

<!-- Record exact commands, results, and untested paths. Do not check a box for someone else's older run. -->

| Check | Result / evidence |
|---|---|
| Backend (`./gradlew test`) | Not run / not applicable |
| Frontend (`npm run lint:ci`, `npm run test:policy`, `npm run test:run`, `npm run build`) | Not run / not applicable |
| PC / mobile (`npm run test:e2e`) | Not run / not applicable |
| Real services / operational checks | Not run / not applicable |

## Risk and rollout

<!-- For payments: ownership, duplicate callbacks, unknown PG results, and durable recovery.
For lists: server-side search/count, 101+ rows, stable order, failed-request UI.
For UI: existing design tokens, keyboard access, normal AND reduced motion.
For schema/deploy changes: compatibility, manual DDL, rollback boundary. Mocked tests are not production proof. -->

## 제외한 것
<!-- 선택: 이 PR 에서 일부러 뺀 것 -->

- [ ] Changes and tests match this PR head; required build checks are present and successful
- [ ] Applicable risks above were verified; limitations are explicitly recorded
- [ ] Comments describe current contracts; docs and release claims match implemented behavior
- [ ] No secrets, credentials, or local config committed
- [ ] Merge method matches the target: merge commit into dev, squash into main

## 체크리스트
- [ ] 변경과 테스트가 이 PR 헤드와 일치하고, 필수 빌드 체크가 있고 성공했다
- [ ] 해당하는 위험을 확인했고, 한계는 명시했다
- [ ] 주석은 현재 계약을 설명하고, 문서·릴리즈 설명이 실제 동작과 맞다
- [ ] 비밀값·자격 증명·로컬 설정을 커밋하지 않았다
- [ ] 머지 방법이 대상과 맞다: dev 는 머지 커밋, main 은 squash

## 관련 이슈
<!-- Closes #123 -->
