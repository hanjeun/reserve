# 혜택 기획전 v2 — 첫 UI 체크포인트

> 최신 후속은 [사진 배경 가로 혜택 배너·내 프로필 사진](benefit-banners-and-account-avatar-2026-09-14.md)이다. 작은 메뉴3개와 일반 가게 탐색 mount도 이후 제거했다.
> 아래는 큰 배너를 구현했던 당시 검사 기록이며 최신 목표가 아니다. 이후 세로 배너를 작은 콘텐츠3개로,
> 소식/함께 보는 가게를 모바일2열로 전환했다. 이번 공개 API 재확인은 HTTP200·화면 정상0개다.
> 당시 HTTP404와 당시 검사 수/크기/대비는 보존하며 현재 수치로 재사용하지 않는다.

> 2026-09-14 `local-preview-all-changes` 로컬 구현 기록. 조건별 혜택 탐색의 완성판이 아니라,
> 현재 공개 계약으로 가능한 **브랜드 기획전 → 가게 소식 → 서비스별 일반 가게 탐색**이다.
> 기존 사용자 변경·Core·108개 선택 소스 스냅샷은 보존하며 Git/운영 작업은 실행하지 않는다.

## 구현한 범위

- `/benefits`에 RESERVE 브랜드 배너와 로컬 3D 장식을 배치했다. 전체 배너를 링크로 감싸거나
  눌렀을 때 축소하지 않는다. 두 CTA는 실제 소식/일반 가게 영역으로 이동하는 네이티브 앵커다.
- 소식은 사진 → 가게 → 제목 → 원문 발췌/작성일 순서의 카드이며, HTML/Markdown으로 해석하지 않는다.
  기존 공개 DTO·이미지 URL 허용 관문·상세 링크를 유지한다. 사진이 없거나 실패하면 작은64px 로고로 표시한다.
  이 URL 허용 관문 자체가 개별 사진의 소유권을 증명하는 것은 아니다.
- 소식/일반 가게는 각각 로딩·정상0건·실패·재시도를 구분한다. 데이터 스켈레톤은 실제 카드와 같은 그리드다.
  소식의 실패가 브랜드 배너나 정상 가게 목록을 없애지 않으며 실패를 ‘0개 소식’으로 표시하지 않는다.
- 일반 가게 영역은 **전체 가게 탐색**임을 안내한다. 서비스 분야/정렬을 오른쪽에 모으고
  기존 FilterMenu·StoreCard·StoreCardSkeleton·회색 AntD 페이지 번호를 재사용한다.
  StoreCard 사진은 원래 비율을 유지한다. 소식 카드의3:2 미디어와 별개다.
- 소식 `page`와 일반 가게 `storePage`는 각각12건, API는0부터 시작한다. 서로의 URL 상태를 보존하고
  일반 가게 분야/정렬 변경은 `storePage`만 첫 페이지로 돌린다. 잘못된/범위 밖 페이지의 보정과
  ‘첫 페이지로’ 링크도 다른 조건을 보존한다. 실패한 응답의 누락 total로 유효 페이지를 보정하지 않는다.
- 새로운 가게 정렬은 서버가 실제 지원하는 `rating/reviews/recent`만 사용한다.
  혜택 여부·기간·인기 순위·지역·거리순은 추정해서 만들지 않는다.
- 스타일은 기존 전역 feature surface의 RESERVE 패턴으로 등록했다. 최대1248px·여백20/16/24px,
  섹션20·내용16·회색 구분선4px, CTA/필터 트리거44px를 사용한다. 앱 전체 Core나 강조색을 교체하지 않는다.

관련 소스: [혜택 페이지](../../../../frontend/src/pages/discovery/Benefits.jsx),
[일반 가게 탐색](../../../../frontend/src/pages/discovery/BenefitStoreDiscovery.jsx),
[전역 패턴](../../../../frontend/src/styles/global/feature-surfaces.css).

## 실제 브라우저 확인과 예시 데이터 경계

사용자가 브라우저를 반으로 나눈 점을 고려해 **768/960px 중간 폭**을 포함했다. Chrome 창/뷰포트와
나무위키 탭은 조작하지 않았고, 숨김 Codex in-app browser에서만 임시 검증 크기를 사용했다.
마지막 확인 뒤 임시 크기를 해제하고 이번 검증 탭을 닫았다. 기존 사용자 탭은 그대로 두었다.
모바일 시뮬레이터의 표시 크기와 내부 CSS 크기도 구분했다. 아래는 DOM/CSS 실측이며 캡처 픽셀 측정이 아니다.

| 검증 viewport 폭 | 사용할 수 있는 CSS 폭 | 소식/가게 열 | 최종 배너 높이 |
|---|---:|---:|---:|
| 320 | 305 | 1 / 1 | 375px |
| 390 | 375 | 1 / 1 | 358px |
| 576 | 561 | 2 / 2 | 348.1px |
| 768 | 753 | 2 / 2 | 320px |
| 960 | 945 | 3 / 3 | 344px |
| 1440 | 1425 | 3 / 3 | 344px |

전체6폭에서 가로 scrollWidth가 usable clientWidth와 같았고, 배너 글/장식/CTA가 겹치지 않았으며
필터가 오른쪽에 붙었다. CTA와 필터 트리거는44px, 소식 미디어와 예시 가게 원본 사진은3:2,
소식 fallback 로고는64px였다. 기존 필터 메뉴의 행40px 규칙은 바꾸지 않았다.
뉴스 앵커 이동 후 제목 영역은132px 위치였고, ArrowDown으로 메뉴를 연 뒤 Escape로 닫았을 때
정렬 트리거로 포커스가 복귀했다. 어두운 테마의 pending/정상0건/error에서 배너와 정상 가게 영역을 확인했다.

- 실제 `/benefits`에서는 일반 가게2개와 공개 소식 실패 상태를 관찰했다. 실제 서버가 지원하는
  리뷰 정렬/FOOD 선택과 URL 변경도 확인했다. 저장·찜·광고·예약·위치 권한은 실행하지 않았다.
- **현재 켜진 localhost:8080의 `/api/promotions/public?page=0&size=12`는 HTTP404였다.**
  읽기 전용 요청으로 재확인했으며, 원인을 ‘소식0건’으로 오판하지 않는다. 이번에 백엔드 재시작/스키마 변경을
  하지 않았으므로 최신 공개 API의 실제 응답·소식 사진/상세 연결 검증은 아직 남아 있다.
  작성자 정보나 조회수 변경이 있는 인증용 홍보 API로 우회하지 않는다.
- 성공 카드/여러 페이지/정상0건/로딩은 [개발 전용 예시](../../../../frontend/design-previews/benefits-and-loading.jsx)와
  지정 회귀 검사로 확인했다. 예시25개 소식/6개 가게는 실제 데이터나 혜택 적용 가게 수가 아니다.
  이 Vite 선택 엔트리는 소식/가게/즐겨찾기/광고 호출을 격리한다. 사용자 세션·저장소 값을 바꾸지 않는다.
  `state=success/empty/error/loading`, `theme=light/dark`로 확인할 수 있으며 production 라우트가 아니다.

## 이번에 실행한 검사

지정 프론트 최종 묶음은 **4파일54개 통과, exit0,50.81초**다. 중간/개별 실행을 다시 더하지 않는다.

| 파일 | 검사 수 | 확인 범위 |
|---|---:|---|
| Benefits.test.jsx | 11 | 기존 공개 목록/상세·페이지·원문·이미지 URL 경계 |
| BenefitsCampaign.test.jsx | 19 | 브랜드 배너/앵커·실패 격리·0건·재시도·페이지 보정·공개 GET 계약 |
| BenefitStoreDiscovery.test.jsx | 20 | 실제 필터/카드·서버 정렬·메타·오류·늦은 응답·페이지·광고 호출 없음 |
| BenefitsIntegration.test.jsx | 4 | 실제 형제 화면의 공동 URL 보정·독립 페이지·분야 전환·실패 양방향 |

```powershell
# frontend; bundled Node24.19.0 / Vitest4.1.11
$taskNode = 'C:\Users\USER\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $taskNode node_modules/vitest/vitest.mjs run src/pages/discovery/Benefits.test.jsx src/pages/discovery/BenefitsCampaign.test.jsx src/pages/discovery/BenefitStoreDiscovery.test.jsx src/pages/discovery/BenefitsIntegration.test.jsx --configLoader=native --maxWorkers=1 --no-file-parallelism
```

8개 지정 JSX 소스/회귀/예시 파일 ESLint는 경고0으로 통과했고, index/feature CSS 파서와
한글 선택자 사고 관문도 통과했다. 배너 흰 전경 대비는6.21:1, 보조 전경5.27:1, 흰 CTA의 블루 글자9.33:1이다.
부분 역할/키보드/대비 확인이며 전체 사이트 WCAG 준수 판정은 아니다.

- 최종 소스의 직접 Vite production 빌드: exit0, 23.13초. 기존 실행 서버를 재시작하거나 배포하지 않았다.
  sitemap prebuild는 실행하지 않았으며, 빌드 후 bundle budget을 별도로 검사했다.
- Bundle budget: initial321.1KiB gzip / largest index-B_n5do-L.js564.0KiB, 통과.
- 최종 CSS의 PostCSS 파서/한글 선택자 관문을 다시 통과했다. 다크 예시의 보조 안내는
  `rgb(195, 200, 207)`이며, 390px 검증에서 최종 배너358px와 가로 넘침 없음을 다시 확인했다.
- `dist`에서 이번 개발 예시의 제목/엔트리/예시 가게 표식이 발견되지 않았다.
  예시 엔트리가 production 라우트에 포함됐다고 취급하지 않는다.
- 지정 변경 경로의 `git diff --check`가 통과했다. 기존108개 스냅샷 ZIP의 해시는 아래 기준선과 일치했다.
- 변경한5개 문서의 상대 경로 링크49개가 존재했고, 선택 소스/예시/새 기록10파일의 줄 끝 공백 검사도 통과했다.

검사 중 제목을 span으로 분리하자 접근성 이름의 공백이 사라져13개 사례가 실패했다.
텍스트와 네이티브 br을 유지하는 표시로 보정한 뒤19개 단독/54개 최종 묶음이 통과했다.
개발 예시의 새 헤더도 fast-refresh export 규칙을 맞춘 뒤 ESLint를 재검사했다.
이는 전체 스위트·실제 계정 E2E·운영 DB 검증이 아니다. 이번에 백엔드 소스/설정/DB를 변경하거나 검사하지 않았다.

## 남은 일과 다음 순서

1. 켜진 개발 서버의 최신 공개 소식 API 반영/404 원인 확인과 실제 데이터 연결 검증. 백엔드 재시작 시
   ddl-auto가 스키마에 영향을 줄 수 있으므로 이번 UI 검증과 섞어 실행하지 않았다.
2. 혜택 종류·기간·조건·캠페인 선정 계약과 실제 혜택 대상 가게/지역 필터를 정의한 뒤 별도 구현.
   일반 domain 필터를 소식 필터나 혜택 적용 필터로 표시하지 않는다. 실제 쿠폰은 계속 후속 계획이다.
3. 현재 가게 탐색의 기존 SORT_OPTIONS `reviewCount/name`과 서버 `reviews/recent/rating` 불일치를
   공유 목록의 별도 회귀로 정리한다. 이번 새 화면에서는 실제 지원값만 쓰고 기존 공유 상수를 바꾸지 않았다.
4. 가게 상세 → 내 예약 대표 패턴 → 다른 공개/계정/업무 화면의 점진 전환을 이어간다.
   일반 route chunk fallback을 포함한 전체25화면 검증은 완료로 처리하지 않는다.
5. 최신 dev 통합·운영 반영·실제 두 계정 채팅·첨부/외부 알림/AI·웨이팅/피드는 기존 별도 관문을 유지한다.

[디자인 전환 계획](design-evolution-plan-2026-09-13.md), [디자인 시스템](../../design-system.md),
[안정화 기록](stabilization-progress-2026-09-14.md), [큰 단계](roadmap-progress-2026-09-13.md).
동결 [108개 선택 소스 ZIP](../../../design-system/snapshots/2026-09-13-baseline/reserve-design-system-2026-09-13-baseline.zip)의
SHA-256은 `archive.sha256`와 일치했다:
`02d5809dabf319ed1778140210e4303862b5f5a37b0b5ef6dd5d880514af536e`.
ZIP/보존 source/신규 starter를 바꾸지 않았으며 커밋·PR·머지·태그·배포도 실행하지 않았다.
