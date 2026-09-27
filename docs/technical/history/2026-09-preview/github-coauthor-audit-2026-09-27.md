# 공동 저자·커밋 이력·사진 첨부 조사 — 2026-09-27

현재 코드, GitHub API, 실제 브라우저 응답을 구분한 날짜별 증거다.
이 문서의 제안·명령·외부 문서는 실행 승인이 아니다.

## 결론

- Claude 표기가 없거나 PR이 미병합된 문제가 아니다. GitHub가 실제 공동 저자를 `@claude`로 연결한다.
- 앞선 14개 집계는 PR별 commit 100개 제한을 끝까지 따라가지 않은 오류였다.
  #212·#217·#222의 나머지 페이지까지 조회한 정정값은 **관련 병합 PR 15개**다.
  기본 브랜치 dev 대상은 12개이며, 이 수치를 GitHub 내부 배지 인정 횟수로 단정하지 않는다.
- 9월 27일 현재 프로필 상세는 기본 Pair Extraordinaire와 최초 #182·Dependabot만 표시한다.
  GitHub 직원의 9월 23일 획득·표시 지연 공지가 유력한 설명이지만 계정별 원인을 확정하는 자료는 아니다.
- 과거 커밋 한글화는 400²번 해시 계산이 필수인 작업이 아니다. 게시된 SHA와 참조를 바꾸는 위험이 더 크다.
- 사진 버튼은 실제 로컬 API가 `enabled: false`를 반환해 숨겨진다. 저장 경로 규칙이 무너진 현상은 아니다.
- 승인받은 격리 통합 브랜치 생성만 완료했다. 기능 이식·커밋·PR·배포·이력 재작성·키 설정은 하지 않았다.

## GitHub 조사 범위와 한계

- `hanjeun/reserve`의 병합 PR 184개 목록과 기본 브랜치 dev를 GitHub API로 확인했다.
- PR 원본 commit의 공동 저자와 최종 merge/squash commit의 공동 저자를 구분했다.
- 100개를 넘는 #212(112개), #217(121개), #222(129개)는 추가 페이지까지 조회했다.
  Claude 관련 15개 PR의 commit 연결에서 `hasNextPage: false`를 확인했다.
- 이 조사에서 발견한 원본 Claude 공동 저자 commit은 중복 OID 제거 후 15개다.
  릴리스 PR과 계보 복구 PR에는 앞선 commit이 다시 나타나므로 행별 합산은 독립 기여 수가 아니다.
- GitHub GraphQL `authors.nodes`의 사용자 연결과 로컬 Git trailer 파서를 교차 확인했다.
  확인한 15개 원본 commit 모두 기존 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`를 파싱한다.
- 공개 API의 공동 저자 연결은 확인할 수 있지만 achievements 내부 카운터·중복 제거·백필 순서는 공개되지 않았다.
  내부 인정 횟수나 다음 등급의 정확한 잔여 PR 수를 제시하지 않는다.

| 병합 PR | 대상 | PR 전체 commit 수 | 원본 Claude 연결 commit 수 | 최종 merge/squash에 Claude |
|---|---|---:|---:|---|
| [#210](https://github.com/hanjeun/reserve/pull/210) | dev | 1 | 1 | 아니요 |
| [#211](https://github.com/hanjeun/reserve/pull/211) | dev | 1 | 1 | 아니요 |
| [#212](https://github.com/hanjeun/reserve/pull/212) | main | 112 | 2 | 아니요 |
| [#213](https://github.com/hanjeun/reserve/pull/213) | dev | 2 | 1 | 아니요 |
| [#214](https://github.com/hanjeun/reserve/pull/214) | dev | 1 | 1 | 아니요 |
| [#215](https://github.com/hanjeun/reserve/pull/215) | dev | 2 | 2 | 아니요 |
| [#216](https://github.com/hanjeun/reserve/pull/216) | dev | 1 | 1 | 아니요 |
| [#217](https://github.com/hanjeun/reserve/pull/217) | main | 121 | 7 | 예 |
| [#218](https://github.com/hanjeun/reserve/pull/218) | dev | 2 | 2 | 아니요 |
| [#219](https://github.com/hanjeun/reserve/pull/219) | dev | 1 | 1 | 아니요 |
| [#220](https://github.com/hanjeun/reserve/pull/220) | dev | 1 | 1 | 아니요 |
| [#221](https://github.com/hanjeun/reserve/pull/221) | dev | 1 | 1 | 아니요 |
| [#222](https://github.com/hanjeun/reserve/pull/222) | main | 129 | 11 | 예 |
| [#223](https://github.com/hanjeun/reserve/pull/223) | dev | 2 | 2 | 아니요 |
| [#224](https://github.com/hanjeun/reserve/pull/224) | dev | 1 | 1 | 아니요 |

특히 #212의 최종 squash에는 Claude가 없지만 원본에는 2개 있다.
#217/#222는 원본과 최종 squash **둘 다** Claude가 있다.
기존 “#217/#222는 squash에만 있어 원본만 세면 12개”라는 설명을 폐기한다.

## 문구·병합·지연의 구분

| 가설 | 확인 결과 |
|---|---|
| Co-authored 문구가 빠졌다 | 기존 commit trailer가 실제 파싱되고 `@claude`로 연결됨 |
| 대소문자가 달라 무시됐다 | 현재 `Co-Authored-By` 표기도 실제로 인식됨 |
| PR 본문에만 Generated with Claude가 있다 | PR 본문만으로는 공동 저자 증거가 아니지만 해당 원본 commit에는 trailer가 있음 |
| 아직 PR이 병합되지 않았다 | 위 15개는 모두 MERGED |
| main이 기본 브랜치가 아니라 빠졌다 | 실제 기본 브랜치는 dev이고, dev 대상만도 12개가 있음 |
| GitHub 표시/획득 지연 | 직원 공지로 일반적인 장애 확인, 이 계정의 원인이라는 확정은 아님 |

[GitHub 직원 공지](https://github.com/orgs/community/discussions/203416)의
2026-09-23 업데이트는 일부 사용자의 획득과 프로필 표시가 며칠씩 지연되며 해결 시점은 미정이라고 설명한다.
Claude 관련 병합은 9월 25~26일이었다. 이 시간 관계와 정상 사용자 연결 때문에 지연을 가장 유력하게 본다.

프로필 상세를 현재 브라우저에서 읽었으며 최초 획득은 2026-09-12 KST,
[PR #182](https://github.com/hanjeun/reserve/pull/182), `@dependabot`이다.
이번에는 프로필 숨김/표시 토글, 이메일 변경, 지원 문의 제출을 하지 않았다.

## 후속 재조사 — Quickdraw 즉시 획득과 AI 공동 저자

2026-09-27 추가 읽기 전용 조사다. 이전의 지연 추론을 아래 증거와 한계로 보강한다.

### Quickdraw와 Pair는 같은 사건이 아니다

- 실제 Quickdraw 상세는 [issue #200](https://github.com/hanjeun/reserve/issues/200)을 근거로 표시한다.
  API상 2026-09-23 07:06:14Z 생성, 07:06:29Z 종료로 15초였다.
  배지 DOM의 datetime은 07:06:31Z, 즉 **9월 23일 16:06:31 KST**다.
- 현재 Pair 상세는 최초 #182·Dependabot만 표시한다. Quickdraw가 정상이어도 Pair 등급의 정상 처리를 증명하지 않는다.
- Claude 관련 병합은 UTC 9/25~26이지만 **KST로는 전부 9/26**이다.
  최초 #210은 01:42:46, 마지막 #224는 20:28:30 KST다.
  9/27 14:20 KST 조사 시점에서 각각 약 36시간·18시간 경과했다.
  Quickdraw를 받은 9/23부터 Claude 등급을 기다린 것으로 계산하지 않는다.
- 배지별 처리의 내부 큐/알고리즘은 공개되지 않았다. 서로 다른 처리 큐라고 단정하지 않는다.
  다른 배지가 정상인데 특정 배지만 지연되는 관측과 직원 장애 공지는 양립한다.

### Claude·Codex가 실제 배지 이력에 표시된 사례

프로필에 AI 이름을 적은 README가 아니라 **GitHub 자체 achievements 상세**를 브라우저에서 읽었다.

| 실제 프로필 | 관측한 공동 저자 이력 | 증거의 범위 |
|---|---|---|
| [sdonnell-int](https://github.com/sdonnell-int?tab=achievements&achievement=pair-extraordinaire) | 최초 intergral/opentelemetry-cf-demo#1 · @claude | Claude와 공동 작성해 실제 배지를 받은 역사적 사례 |
| [frantic-openai](https://github.com/frantic-openai?tab=achievements&achievement=pair-extraordinaire) | 기본 #48, 동 #100, 은 #116 · 모두 @codex | Codex와 공동 작성해 동·은까지 실제 받은 역사적 사례 |
| [claude](https://github.com/claude?tab=achievements&achievement=pair-extraordinaire) | x4, 여러 단계 이력 | AI 계정 쪽 표시도 존재; 계정의 오래된 이력과 현재 정책을 혼동하지 않음 |

sdonnell-int의 근거 PR #1 원본 commit `4a385f8ae721389ed5bd960ee1401759a31932b4`도
`Co-Authored-By: Claude <noreply@anthropic.com>`를 실제 포함한다. 이름만 같은 사람을 AI 사례로 계산하지 않았다.

frantic-openai의 세 PR은 openai/symphony이며 API상 병합 시각은
#48 2026-03-11 21:47:48Z, #100 07-18 00:08:11Z, #116 07-24 14:56:51Z다.
“Codex 이름만 연결되고 배지를 받은 적은 없다”는 설명은 이 직접 증거와 맞지 않는다.
다만 **과거 인정 사례가 2026-09-27의 모든 신규 신청 인정까지 보장하지는 않는다**.
현재 공식 공동 저자 문서/직원 공지 조사에서는 Claude·Codex를 새로 일괄 제외한다는 근거를 찾지 못했다.

REST API는 claude/codex 모두 User 객체를 반환한다. codex의 achievements URL은 404였지만,
정상 API 연결과 사람 쪽의 Codex 배지 이력이 있으므로 이것만으로 계정 삭제·공동 저자 금지를 단정하지 않는다.
AI 생성 Community 게시글 제한을 공동 저자 trailer의 전역 금지 정책으로 읽지도 않는다.

### 15개/12개와 내부 인정 횟수는 다르다

최신 API 재조회에서도 병합 PR 184개, 기본 dev, HEAD eb31d61e…를 확인했다.
dev 대상 Claude 관련 12개 중 **#213·#218·#223은 changedFiles/additions/deletions가 모두 0**인 계보 복구 PR이다.
파일 차이가 있는 dev 대상은 나머지 9개다.
GitHub가 빈 diff의 계보 복구 PR·중복 포함 릴리스 PR을 어떻게 계산하는지는 공개되지 않았으므로,
이를 전부 인정한다고도, 전부 제외한다고도 단정하지 않는다.
이 발견은 15개를 내부 counter라고 말할 수 없는 추가 이유다.

### 사람 공동 저자에게도 발생한 최근 지연

[Dotoryman의 직접 보고](https://github.com/orgs/community/discussions/207799)는
사람끼리 양방향 공동 작성한 #85/#86을 기본 브랜치에 9/11 병합하고,
commit에서 두 계정이 이미 인식됐지만 배지는 9/18 나타났다고 설명한다.
별도 PR·메시지 변경 없이 약 7일 뒤 나타난 사례이며 모든 계정의 처리 기한은 아니다.
직원 공지와 함께 보면 Quickdraw 즉시 획득은 Pair의 지연을 반박하는 증거가 아니다.

### 남은 조치

- 현재 PR·SHA·사용자 연결 증거를 그대로 보존한다. 배지용 빈 PR, 재병합, 이력 재작성은 하지 않는다.
- 계속 미표시되면 GitHub Support에 계정별 eligibility/counter/backfill 확인을 요청할 수 있다.
  문의 근거는 #210~#224 목록, 기본 dev, 최초 Pair #182, 정상 Quickdraw #200,
  원본 authors의 hanjeun+claude, 0-diff 계보 복구 세 건, 현재 미표시 상태다.
- 문의는 “AI 제외가 확정됐다”거나 “내부 counter가 15다”라고 쓰지 않는다.
  문의 제출·공지 구독·프로필 토글은 이번에 하지 않았다.
- 메달 상대 순서가 중요하면 Claude 동 단계가 실제 표시될 때까지 Codex 공동 저자 PR 병합을 기다린다.
  파일 이식/후보 검증은 배지와 분리해 준비할 수 있다.

## Dependabot → Claude → Codex 순서

별도 도구별 메달이 아니라 **한 계정의 같은 배지 등급 이력**이다.
커뮤니티에서 기본 1·동 10·은 24·금 48 기준을 보고하지만,
이는 내부 계산 규칙 전체를 공개한 공식 보장으로 취급하지 않는다.
[커뮤니티 보고](https://github.com/orgs/community/discussions/176080)

1. 기본 단계의 Dependabot 이력은 이미 실제 프로필에서 확인했다.
2. 순서가 중요하다면 Claude 동메달 이력이 실제 표시될 때까지 새 Codex 공동 저자 PR 병합을 기다린다.
   표시 지연과 백필 때문에 마지막 PR을 맞춘다고 상대방 표기가 보장되는 것은 아니다.
3. 이후 실제 Codex 기여가 있는 변경에 정직하게 공동 저자를 기록한다.
   기능상 필요한 PR만 만들고 빈 커밋·불필요한 PR 분할·기여자 누락으로 수치를 조작하지 않는다.
4. 혼합 작업은 기능별 실제 작성 기여를 기준으로 attribution을 정한다.
   이 대화에서 만든 파일도 Claude 단독 작성으로 바꾸지 않는다.
5. squash를 사용할 때는 승인된 최종 메시지에도 필요한 trailer가 유지되는지 확인한다.

Codex의 임의 주소를 추정하지 않았다.
[OpenAI symphony의 commit 지침](https://github.com/openai/symphony/blob/main/.codex/skills/commit/SKILL.md)은
다음 형식을 사용한다.

```text
Co-authored-by: Codex <codex@openai.com>
```

실제 [OpenAI commit](https://github.com/openai/symphony/commit/e0ccc83720a42a600a53b61c5f8d3e518bebe1db)의
GitHub API에서도 이 공동 저자가 `@codex`로 연결된다.
이것은 주소 연결 증거이지 배지 발급 보장이 아니다.
[GitHub 공동 저자 공식 문서](https://docs.github.com/en/pull-requests/how-tos/commit-changes/creating-a-commit-with-multiple-authors)를 따른다.

## 영어 commit 메시지 한글화

### 현재 수량과 계산

- `git rev-list --count origin/dev`: **478**.
- `git rev-list --count --all`: 로컬 ref 전체 고유 **504**. 두 수치는 서로 다른 범위다.
- 메시지는 commit 객체의 일부다. 메시지를 바꾸면 SHA가 바뀌고 이를 부모로 참조하는 후손도 바뀐다.
- 부모 매핑을 유지하는 단일 순회는 영향받는 commit 객체를 대략 한 번씩 재작성한다.
  478²번 해시 계산이 필수인 구조가 아니다. 내부 해시 호출 총수를 정확히 478이라고 보장하지도 않는다.
- 메시지만 바꾸면 파일 blob/tree는 재사용할 수 있다.
  하나씩 amend/rebase를 반복하는 접근은 후손을 반복 재작성해 불필요한 비용을 늘린다.
- 실질 비용은 해시 계산보다 번역·의미 검토와 공개 이력의 연결 복구다.
  [Git 객체 구조](https://git-scm.com/book/en/v2/Git-Internals-Git-Objects)

### 권장 결정

과거 공개 이력은 유지하고, **앞으로의 제목부터** 영어 type + 한국어 subject를 쓰는 방안을 권한다.
예: `fix: 채팅 사진 권한 검증 강화`.
현재 저장소의 영어 제목 규칙은 이번에 바꾸지 않았다. 이 예시는 제안이다.

혼자 쓰더라도 GitHub PR·commit 링크·태그·CI·Deployment·컨테이너 SHA·main/dev 릴리스 계보는 이미 외부 참조다.
서명은 변경된 객체에 그대로 유효하지 않으며, 보호 브랜치와 원격 refs 교체도 별도 결정이 필요하다.
[GitHub 메시지 변경 공식 문서](https://docs.github.com/en/pull-requests/how-tos/commit-changes/changing-a-commit-message)

전체 clone 하나만으로 모든 것을 복구할 수는 없다.

- Git mirror와 검증된 old→new SHA 매핑은 branch/tag와 Git 객체 복구에 도움을 준다.
- 일반 clone은 원본의 미커밋·untracked·ignored 파일과 환경 파일을 포함하지 않는다.
- GitHub PR 리뷰·댓글·Actions·Deployment·설정, 외부 LFS 저장소와 submodule의 실제 자료는 별도 범위다.
- 현재 대규모 혼합 프리뷰는 별도 manifest와 파일 보존 없이는 clone으로 보호되지 않는다.

정말 재작성할 경우에만 별도 승인 후 mirror의 격리 사본에서 SHA→번역 메시지 목록을 검토하고,
`git-filter-repo`의 message callback으로 한 번 순회한다.
각 commit의 tree 동일성, 부모 매핑, 작성자·시각·trailer, merge 그래프와 모든 refs를 검증한 뒤
원격 교체 여부를 별도로 결정한다. 지금은 clone·재작성·force push를 실행하지 않았다.
[Git 공식 경고](https://git-scm.com/docs/git-filter-branch),
[git-filter-repo 문서](https://github.com/newren/git-filter-repo/blob/main/Documentation/git-filter-repo.txt)

## 사진 버튼의 실제 원인과 S3 규칙

인증된 실제 로컬 브라우저 요청에서 다음을 확인했다.

- URL: `http://localhost:8080/api/chat/images/config`
- HTTP 200
- 시각: 2026-09-27T13:53:37.225784 (서버 응답 timestamp, offset 미표기)
- `data: { maxBytes: 8388608, enabled: false }`

코드의 연결은 `ChatImageCipher.isEnabled()` → 사진 config API →
`useChatImageDraft.enabled` → `ChatImagePicker`의 `if (!enabled) return null`이다.
현재 서버에 사용할 사진 전용 키가 설정되지 않아 사진만 비활성인 상태다.
스크린샷의 사용자 이름은 지원 identity 설정으로 변경될 수 있으므로 오래된 서버라는 근거로 사용하지 않았다.

활성화에는 보호된 서버 환경의 `CHAT_IMAGE_ENCRYPTION_KEY`(표준 Base64로 인코딩한 32바이트)와 재시작이 필요하다.
키를 저장소·메시지·로그·프로세스 인자로 남기지 않는다.
현재 코드는 key ID/다중 키 복호화를 구현하지 않아 키를 단순 교체하면 기존 사진을 잃는다.
키 보관·복구 정책 없이 임시 키로 운영을 켜지 않는다.
이번에는 키 생성/설정/회전이나 서버 재시작을 하지 않았다.

`FileStoragePaths`와 저장·읽기 관문에서 확인한 경로:

| 용도 | 기존/후보 경로 |
|---|---|
| 프로필 | `users/{memberId}/profiles/` |
| 사업자 인증 | `users/{memberId}/businesses/` |
| 가게 이미지 | `users/{memberId}/stores/{storeId}/thumbnails/`, `images/` |
| 광고 이미지 | `users/{memberId}/stores/{storeId}/advertisements/` |
| 새 대화 사진 | `users/{senderId}/chat/{roomId}/{UUID}.bin` |
| 지원 avatar | `system/chat/support/` |

로컬은 같은 규칙 앞에 `local/` prefix를 붙인다.
대화 사진은 AES-GCM 암호문으로 저장하고 공개 CloudFront 사진 URL을 응답하지 않는다.
읽기는 인증/방 접근/경로 검증과 bounded read를 거친다.

코드 경로 규칙이 지켜짐을 확인한 것이며 **실제 S3 버킷 전체 객체를 전수 조사한 결과는 아니다**.
새 AWS 자원·IAM·CloudFront 설정이나 S3 파일 이동은 하지 않았다.
기존 MySQL/S3 백업과 복원 증거는 [현재 상태](../../current-status.md)에 구분돼 있다.

## 승인된 통합 브랜치와 다음 관문

- fetch 후 `origin/dev`: `eb31d61eddb3a0fbd46a20ca31aad5cc4bdec281`.
- 앱에 등록된 관리 작업공간: `C:/Users/USER/.codex/worktrees/reserve-integration/RESERVE`.
- 브랜치: `feature/v2.6-integration`, origin/dev 추적, 위 SHA에서 시작, 생성 직후 clean.
- 원본 HEAD/branch 유지, staged 0. 이번 문서 수정 전 외부 종료 manifest의 790개 경로·상태·hash와 모두 같았다.
- 기존 index.lock은 없어서 제거하지 않았다. 다른 release/v261 checkout도 건드리지 않았다.
- 통합 후보는 아직 비어 있다. 원본 preview 통째 cherry-pick이나 대형 snapshot을 하지 않는다.
  다음은 기능별 명시 이식과 최신 dev 회귀 대조다.
- commit·PR·merge·tag·deploy·과거 이력 변경·GitHub 설정·키 활성화는 이번 승인에 포함하지 않았다.

이번 후속 변경은 이 조사 문서와 [후보 체크리스트](../../release-candidate-2026-09-27.md),
[현재 상태](../../current-status.md)의 사실 정정뿐이다.
코드 테스트를 다시 돌리지 않으며 문서 링크와 diff 공백만 검사한다.
