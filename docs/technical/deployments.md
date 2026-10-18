# 배포 운영

릴리즈 노트 동기화, GitHub Deployments 기록, CI 구조, 배포 후 점검과 롤백 절차예요.

모든 명령은 **레포 루트에서 `gh` 로그인 상태**로 실행해요. 대상 저장소는 `REPO` 환경변수로 바꿀 수 있어요(기본 `hanjeun/reserve`).
버전별 변경 내용은 [업데이트 소식](../CHANGELOG.md)을 봐요.

2026-10-10 읽기 전용 재확인의 운영 버전은 **v2.11.0**, main `cfa3702fdb66c19f8f31e3edf95945a1d0b49294`예요. [v2.11.0 첫 실패·재시도·운영 근거](#v2110-첫-자동-배포-실패와-재시도-성공)를 현재 확인 기록으로 사용해요. 아래 출시 준비와 v2.10.0 항목의 당시 SHA·검사·운영 상태는 날짜가 있는 과거 기록이며 현재 상태로 단정하지 않아요.

## 기본 규칙

- 커밋, PR, merge, tag, 배포, GitHub 설정 변경, 운영 쓰기는 **각각 현재 대화에서 별도 승인**을 받아요.
- `sync-release-notes.mjs --apply`는 릴리스 승인 뒤에 실행해요.
- 배포 직전에는 서버 SSH fingerprint를 별도 경로로 확인해요.
- 의존성 PR과 제품 통합은 분리해요.

### 2026-10-09 v2.9.0 출시 입력과 검증

이 절의 준비 조회와 검사는 v2.9.0 당시의 기록이에요. 실제 전환은 아래 ‘2026-10-09 실제 첫 호환 전환’을 따르며, 현재 미배포 전체 v7 후보는 문서 끝의 ‘첫 v7 및 도메인 전환 순서’와 10/16 보안 추가 범위로 준비해요. 과거의 미설정·구 이미지 상태를 현재의 새 작업으로 다시 적용하지 않아요.

`local-preview-all-changes`에는 다른 작업의 수정·미추적 코드와 에셋이 함께 있어요. 2026-10-09 사용자가 승인한 대상은 고객 웨이팅·접수 중지/예약 사용 설정·질문형 등록/수정·실제 상세 미리보기·QR/UI 피드백·가입 인증 보완·같은 탭의 지역 유지·브라우저 최근 검색·직접 날짜 입력·공개 이용안내 3개·Dots 신규 4종이에요. 목적별로 선별한 의존성 [#321](https://github.com/hanjeun/reserve/pull/321)과 기능 [#322](https://github.com/hanjeun/reserve/pull/322)을 dev에 merge commit으로 통합하고, 릴리스 [#325](https://github.com/hanjeun/reserve/pull/325)를 main에 squash merge했어요. **v2.9.0 최종 main SHA는 `b32c08943c5215ebaf589b1311efefc01f6c4024`**예요. 원래 혼합 프리뷰·미추적 디자인 프리뷰 17개·고유 근거는 보존했어요. js-yaml·Sentry React의 새 메이저와 쿠폰·MFA·한정판 판매 대기열·추가 모듈 분리는 제외해요.

사용자는 기존 일반 화면이 잘 동작한다고 알려줬어요. 새 메시지 진입·링크 색 수정과 실제 휴대폰 QR·미지원 브라우저 확인까지 완료했다는 근거는 아직 없어요. 긴 업종 값의 잔상 종료 처리를 보완하고, 접수·예약·웨이팅 방식 설명에 같은 모션을 연결했어요. 2026-10-09 피드백으로 빠른 선택은 한 번의 진행 중인 모션에 최신 글자를 반영하며, 운영 방식을 등록 후 바꿀 수 있다는 안내는 복원했어요. 별도 등록 요약을 PC·모바일 상세 미리보기의 정보 영역 안으로 옮겨 전체 항목의 수정 버튼과 미입력·미사용 상태를 표시해요. 수정은 기존 질문으로 이동하고 ←로 미리보기에 복귀하며, 이 동작은 등록 API를 실행하지 않아요. 휴대폰 미리보기는 기종별 장식 없이 기존 프레임 크기를 유지해요. PC·모바일 미리보기에서 웨이팅 접수 영역을 제거했고 8종의 보완 에셋을 적용했어요. 코드 수정과 사용자에게 전달된 스크린샷만으로 미확인 화면을 검증 완료로 바꾸지 않아요.

PC 미리보기는 좁은 화면에서 전체 폭에 맞춰 시작하고 **확대**를 누르면 원래 폭에서 좌우로 볼 수 있어요. 처음의 과도한 공백·설명 간격을 조정하고 **등록할 내용** 제목을 제거했어요. 기존 가게는 수정할 항목 선택 → 질문 → 실제 상세 미리보기로 이동하며 **수정 완료**만 기존 수정 API를 호출해요. 질문의 ←는 들어온 선택 화면이나 미리보기로 복귀해요. 소유자·관리자 권한, 기존 수정값·사진 순서·저장 검증은 유지해요. 지역은 유효한 URL을 우선해 같은 탭의 이동·새로고침까지 복원하고 다른 탭에 실시간 전파하지 않아요. 최근 검색은 실제 실행한 검색만 이 브라우저에 최대 10개 저장하며 로그인·로그아웃·세션 전환 때 비워요.

같은 날 전체 페이지의 코드에서 웨이팅·관리 도구줄과 선택 탭의 골격, 화면 전체 상태 그림, FAQ 삭제 등 아이콘 반응을 보완했어요. 일반 선택 글자의 이동 방향은 위·아래 항목 순서를 따르고, 분야만 선택한 가게 목록은 탐색 헤더를 유지해요. 초기 로딩은 로컬의 개발용 API 지연을 3초에서 0으로 바꾸고, 홈의 간접 import를 줄이며 현재 공개 페이지 코드와 인증 확인을 함께 시작해요. 페이지 API는 여전히 인증 확인 뒤에 실행해요. 실행 중인 Vite가 새 환경값을 읽은 뒤 로컬 설정이 적용돼요. 공통 코드와 문서의 수정은 운영 반영이나 전체 화면 확인 완료를 뜻하지 않아요.

10/9 운영의 익명 GET만 사용하는 Chromium 측정에서 첫 표본의 DCL/FCP/LCP는 3,231.6/3,444/4,052ms·CLS 0이었고 68개 자원·약 1.30MB 전송과 101~203ms의 긴 JS 작업을 관측했어요. 새 컨텍스트의 다음 표본은 DCL 542.1ms·서버 응답 대기 9.7ms, 같은 컨텍스트 재로딩은 DCL 255.3ms·응답 대기 8.1ms였어요. 실제 인증/운영 쓰기는 차단했고 별도 파일을 만들지 않았어요. 표본 간 차이가 커 항상 느린 운영 API라고 확정하지 않으며 초기 다운로드·JS 실행과 연결/캐시 상태를 구분해요. 이 값은 구 운영 앱의 관측이며 후보 배포의 개선 폭이나 실휴대폰 성능 근거로 재사용하지 않아요.

v2.9.0 실제 운영의 **16:29 KST** 익명 Chromium 1280×720·네트워크/CPU 제한 없음·진입 뒤 8초 관측의 3개 표본은 DCL **3,545.5/362/211.9ms**, FCP **3,792/452/276ms**, LCP **6,196/2,848/2,588ms**, CLS 모두 0이에요. 문서의 서버 응답 대기는 **15.3/9.4/31ms**, 자원은 83~84개·1,328,149바이트이며 첫 표본의 JS 긴 작업은 최대 283ms예요. 쓰기 요청과 WebSocket은 차단했고 이 Playwright routing은 HTTP cache를 비활성화해요. 다음 fresh context·같은 context reload의 차이를 정상 사용자 캐시 효과나 개선율로 표시하지 않아요. 구 표본의 viewport/관측 창도 같다는 근거가 없어요. 초기 다운로드·JS 실행·늦은 LCP가 남은 병목이며 이 값만으로 로그인한 화면·개별 API 지연·실휴대폰 성능을 확정하지 않아요.

내 예약의 웨이팅도 기존 예약 도구줄을 재사용해 보기 아이콘 옆 건수·오른쪽 상태/최신 예약순·아래 왼쪽 검색/오른쪽 새로고침으로 맞췄어요. 가게명·대기번호 검색과 상태·최신/오래된 정렬은 서버의 본인·기존 표시 기간 안에서 페이지와 전체 건수에 함께 적용해요. 예약 필터와 분리한 URL 값과 첫 로딩 골격을 보완하고, 검색 중 입력·같은 계정의 기존 목록을 유지해요. 계정·세션이 바뀌면 이전 목록을 표시하지 않아요.

공개 `/waiting` 탐색도 보기 아이콘 옆 가게 수·오른쪽 위치/접수 상태/정렬을 같은 도구줄로 맞췄어요. 위치와 접수 중/중지, 추천/별점/리뷰/최신 등록 정렬은 서버 조회에 먼저 적용해 페이지와 전체 건수가 같은 조건을 따르게 해요. 숨김·삭제 가게와 웨이팅 사용 안 함은 제외하며, 검색은 가게명·업종의 리터럴 검색을 유지해요. 같은 탭의 지역 복원·첫 로딩 골격·검색 포커스를 함께 연결했어요. 지역/상태/정렬·페이지·리터럴 검색과 잘못된 필터의 DB 조회 전 거부를 다룬 실제 서비스/저장소 검사 3개가 통과했어요.

10/9 추가 선택으로 푸터를 **이용안내**로 바꾸고 `/guide/user`·`/guide/business`·`/guide/common`을 로그인 없이 읽는 별도 페이지로 연결했어요. 기존 `/operation-guide`는 query/hash를 유지하며 공통 안내로 복귀해요. 홈 안내 링크·로딩 골격·클라이언트 SEO·Nginx 공개 메타정보·사이트맵을 함께 맞춰요. 가게 수정의 업종·접수 방식·예약 방식·웨이팅은 기존 3D 에셋을 재사용하고, 운영 설정·소개/사진·접수 중지·웨이팅 사용 안 함은 수령한 신규 4종의 512/768px 정지 WebP 8개를 적용했어요. 제작 코드·manifest·해시·CC0/MIT 원문을 보존하고 PNG·Blender 원본이 든 ZIP은 보호 보관 경로에 유지해요.

10/9 격리 후보의 최종 로컬 검사에서는 프론트 단위검사의 기존 성공 117파일을 유지하고 실패 24파일과 신규 웨이팅 1파일의 289개 검사를 다시 확인해 통과했어요. 백엔드 일반 실행은 1,011개 중 1,006개 통과·MySQL 전용 5개 제외였으며, 해당 5개는 별도 격리 MySQL에서 모두 통과했어요. 공개 웨이팅 필터의 실제 서비스/저장소 검사 3개도 통과했어요. PC·모바일 브라우저 첫 실행은 226개 중 163개 통과·59개 실패·기존 기기별 4개 제외였어요. 14개 검사 파일의 옛 문구·입력 이름·등록 순서·에셋 경로·로딩 골격/포커스 기대값을 현재 구현에 맞추고, 원본 실패 자료를 유지하며 실패한 PC 29개와 모바일 30개만 재실행해 모두 통과했어요. 최종 결과는 **222개 통과·기기별 4개 제외**이며, 실행 앱 코드·제외 조건·시간 제한·검증 관문을 바꾸지 않았어요.

전체 `src` 린트와 보완한 브라우저 검사 파일 린트, 정책·운영 스크립트·배포 교체/복구·동결 스냅샷·후보 문서 링크·프론트 빌드/용량·backend bootJar는 통과했어요. 로컬 Node는 지원 범위의 24.19.0이고 원격 CI는 `.nvmrc`의 22를 사용해요. 실제 휴대폰 QR·미지원 브라우저 확인과 요청하지 않은 Sonar는 실행하지 않았어요. 아래의 개발 의존성 HIGH 4건과 동결 스냅샷의 별도 경고는 남은 항목으로 유지해요.

[#322의 원격 CI](https://github.com/hanjeun/reserve/actions/runs/37890947245)는 정확한 head `28287e4baaf9e342a0fd140769c406b2473db3ba`에서 프론트 **142파일·1,303개**, PC **109개**, 모바일 **113개**를 통과했어요. 브라우저의 기존 기기별 4개 제외 조건은 유지했으며 backend·두 빌드·CodeQL도 통과했어요. [#325의 릴리스 CI](https://github.com/hanjeun/reserve/actions/runs/37892035308)는 같은 검사 입력의 이 성공 근거를 재사용하고 린트·정책/운영 계약·문서/스냅샷 검사·두 빌드·CodeQL을 실행해 통과했어요. 재사용으로 제외한 검사 단계를 새 실행으로 표시하지 않아요.

main push의 [CICD 37892549557](https://github.com/hanjeun/reserve/actions/runs/37892549557)는 두 빌드와 프론트 staging에 성공했지만, 구 운영 이미지의 새 기능 호환 표식이 없어 live 판별 관문에서 실패했어요. 이 실행의 새 컨테이너 기동·cutover·smoke는 실행되지 않았으며 실패 이력을 유지해요. 같은 SHA의 [CodeQL](https://github.com/hanjeun/reserve/actions/runs/37892549510)은 통과했어요. 이후 승인된 첫 수동 호환 전환의 실제 결과는 아래에 별도로 기록하며, 이 자동 실행 전체가 성공했다고 표시하지 않아요.

1. 사용자 화면 확인 → 출시 범위·최종 입력 확정 → 새 백업·복원 및 호환 복구 이미지 준비 → 필요한 최종 검사 → 작업별 승인에 따른 운영 적용 순서로 진행해요. 의존성·활성 문서는 최종 입력 선별에 맞춰 정리해요. 보고서·인덱스·인수인계 복사본을 추가하지 않아요. 기존 미추적 코드·Claude outputs·원본 ZIP·QR 캡처·라이선스·운영 근거는 보존해요.
2. 포함 기능의 운영 스키마·보호된 백업·고지·복구 입력을 준비해요. 고객 웨이팅과 접수 설정은 [DDL 11·12절](manual-ddl.md), 가입 인증은 13절이 필요해요. 2026-10-09 02:14~02:18 KST 읽기 전용 조회의 운영 `reserve`/MySQL 8.0.45는 35테이블이며 이 컬럼과 이메일 unique가 없었어요. 적용 직전에 실제 스키마를 다시 읽고, 새 DDL 승인을 받기 전 실행하지 않으며 앱 계정과 `validate`를 유지해요. 후보용 읽기 전용 verifier의 새 계약 검사도 최종 격리 DB에서 확인한 뒤 사용해요.
3. 최종 코드·잠금 파일·워크플로·스키마 입력이 정해진 뒤 필요한 검사를 한 번 실행해요. 수정 중 테스트·린트·빌드·자동 브라우저·성능·Sonar는 실행하지 않아요. 같은 입력의 성공한 증거는 반복하지 않으며, 실패 수정으로 입력이 바뀌면 해당 실패·변경 경계만 다시 확인해요. 필수 CI의 unit/통합·빌드·보안 관문과 결제·권한·DB·복구 검증은 유지해요. 새 가입 인증에는 MySQL 동시 최초 발송·실패 누적·한 번 소비·가입 실패 롤백, 웨이팅에는 동의·고지 관문·개인 조회·접수 중지·기존 접수 유지 경계를 포함해요.
4. 이 요청의 QR Playwright 42개 예시 캡처는 완료됐으며 다시 촬영하지 않아요. 일반 화면·휴대폰 터치 확인은 사용자가 맡아요. 기존 캡처는 실제 QR 검증·카메라 추적 성능·운영 부하의 근거가 아니에요. 새 스트레스·다중 인스턴스·전체 실기기 행렬·운영 롤백 훈련을 필수 목록에 추가하지 않아요.
5. 커밋·PR·머지·태그·배포는 각 작업의 새 명시적 승인으로 진행해요. 신규 운영 DDL과 고지 게시·운영 변수 쓰기도 별도 승인 범위예요. 이전 배포나 DDL 승인을 확대하지 않아요.

고객 웨이팅의 실제 게시 시각은 **`2026-10-09T06:54:37Z` / 2026-10-09 15:54:37 KST**예요. 같은 최종 SHA의 공개 [개인정보 처리방침](https://reserve.it.kr/privacy)에서 고객 수집·가게 제공·다음 KST 날짜의 이름 제거·7일 후 파기·제공 동의를 실제 렌더링하고 정책 API를 확인한 뒤 보호 서버 설정의 `WAITING_CUSTOMER_RETENTION_NOTICE_PUBLISHED_AT`에 기록했어요. GitHub repo Actions 변수도 같은 값으로 저장하고 API 재조회했어요. 10/4의 직원 접수·채팅 고지는 재사용하지 않았으며 방침의 최종 수정 날짜와 실제 게시 시각을 구분해요. 새 앱은 고지 변수가 준비되기 전 고객 접수를 거부하고, 공개 정책 API·실제 컨테이너 설정을 대조한 뒤에만 대상 가게 접수를 열어요. 기존 세 가게의 고객 접수는 OFF를 유지해요. 기존 채팅 파기 시작 **2026-11-03 18:44:15 KST**도 유지하며 유예 종료 후 첫 worker의 파기 수·보류·파일 삭제 결과는 그 시점에 확인해요.

첫 활성 작업을 후보 0건에서도 확인할 수 있도록 scheduler에 완료 시각·후보·실패 집계 로그를 추가하고 최종 운영 이미지에 포함했어요. 정책·실행 주기는 바꾸지 않았으며 현재 유예 중이라 첫 활성 작업·실제 파기 결과는 아직 없어요. 후보 집계와 실제 파기·파일 삭제 결과의 구분은 [모니터링 런북](monitoring.md#채팅-유예-종료-후-첫-작업-확인-운영-코드-적용-첫-파기-미확인)을 따라요.

가입 인증 응답은 `ApiResponse.data`의 원래 만료 시각과 가입 증명을 사용해요. 같은 SHA의 프론트·백엔드를 함께 전환하고, 기존 열린 가입 화면은 새 화면에서 다시 발송·인증해야 해요. 고객 접수도 새 고지 확인·동의 본문이 없는 구 화면 요청을 허용하지 않아요. API v1 별칭은 같은 권한·본문 계약을 유지해요.

자동 배포는 이전 앱과 새 앱이 모두 기존 `reserve.schema-compat=v270-refund-v1`과 새 `reserve.feature-compat=waiting-signup-v1`을 갖춰야 해요. 새 표식은 고객 명단·접수 중지·예약 차단·가입 증명을 유지할 수 있는 코드에만 붙여요. live 판별 때 먼저 거부하고, cutover 직전 현재 연결 대상과 두 이미지 표식을 다시 확인해요. DB와 설정은 롤백 때 되돌리지 않아요. 라벨은 준비된 이미지의 계약 표식이며, 실제 동작 검증을 대신하지 않아요.
2026-10-09 02:14~02:18 KST 재조회에서도 blue SHA `51a3825efd33812c9482ce381ab54cae033e90b8`에는 기존 스키마 표식만 있고 새 기능 표식은 비어 있었어요. 서버의 로컬 이미지 14개에서도 새 표식을 찾지 못했으며 원격 레지스트리 전체를 조회한 것은 아니에요. 운영 라벨을 변경하지 않았어요.

전환 전 blue 이미지에는 새 기능 복구 표식이 없어 **첫 전환은 일반 자동 배포로 진행할 수 없었어요**. 승인된 첫 전환은 공개 트래픽을 닫고 구 앱을 멈춘 뒤 새 스키마와 호환 프론트·백엔드를 준비하는 절차로 진행했어요. 이후 자동 배포에서도 연결 대상과 두 이미지의 SHA·스키마 validate·필수 설정·활성 고객 QR 처리·예약 차단·가입 인증 계약을 확인해요. 구 이미지에 표식을 임의로 붙이거나 관문을 무시해서 통과시키지 않아요. 기능 사용 뒤 복구도 DB·실제 고지 시각·새 설정을 유지하는 호환 수정 이미지가 우선이며, 없으면 신규 쓰기를 닫고 복구해요. 자세한 보호된 사전/사후 스냅샷과 전체 복원의 승인 경계는 [백업 런북](backup.md)을 따라요.

10/9 **11:29~11:30 KST**의 준비 조회 당시 live blue는 위 SHA이며 서버 로컬 이미지 14개에 새 기능 표식이 없었어요. 새 정기 백업의 독립 CloudShell 다운로드와 서버 원본 해시 일치를 확보했고, [백업 런북](backup.md)에 대상·보관 경로와 35테이블·61행의 실제 격리 복원 결과를 기록했어요. 이 준비 조회와 아래의 실제 운영 전환을 구분해요. 사용자는 첫 전환의 쓰기 제한 시간에 제약을 두지 않았고, Git 작업과 운영 DDL·고지/설정 쓰기·배포 범위를 각각 명시적으로 승인했어요.

#### 2026-10-09 실제 첫 호환 전환

- 공개 503과 구 앱 중지를 확인한 뒤 새 직전 백업을 만들고 독립 다운로드·격리 복원·최종 원격 JAR 검증을 완료했어요. 운영 `reserve_ddl`의 11→12→13은 **15:41:38~39 KST**, 최종 JAR의 제한된 `reserve_app`·34모델 `validate`는 **15:44:53 KST**, 읽기 전용 SQL verifier는 **15:45:01 KST**에 통과했어요. 기존 35테이블·61행과 원래 컬럼 값·메타데이터 의미를 유지했고 예약금/원장 위반은 0/0이에요.
- 새 green은 최종 image digest **`sha256:7c13f58c62a9de5b0c7673b6347f859edde8c702254b87d6b5cce5f2a3f9b3c2`**에 고정했어요. 실제 JAR은 **87,331,569바이트·SHA-256 `7d569faca35745721ab2b0be6ae16238d0456d1f76dddab5ec5e266115d454d1`**이며 비루트 `appuser`·제한된 DB 계정·`validate`를 유지해요. 프론트 root는 `/usr/share/nginx/html/releases/b32c08943c5215ebaf589b1311efefc01f6c4024`이고 JAR의 store-shell HTML과 같은 입력임을 확인했어요.
- 첫 공개 전환은 **15:49:35 KST**예요. 정식 `/privacy`를 렌더링해 새 고객 고지를 **15:54:37 KST**에 확인하고, 보호 서버 설정과 GitHub Actions 변수에 같은 UTC 값을 저장했어요. 이 값을 반영하는 재기동 중 공개 503을 유지한 뒤 **16:01:11 KST**에 재개했어요. **16:01:52 KST**의 새 익명 GET/HEAD에서 health UP·정적 root·실제 고지 시각·정책 API가 일치했어요. `intakeReady=true`·7일 파기이고 기존 세 가게는 `OFF`·일시 중지 false·예약 true를 유지해요.
- 채팅/직원 접수 고지·유예·기존 키와 Compose에 실제 전달되는 비밀값을 보존했어요. 검증 helper에서 Compose 보간 전용 키까지 컨테이너 Env와 같다고 가정한 오류는 실제 선언된 입력과 전달값을 대조해 해소했으며, 앱 설정·권한·검증 관문을 완화하지 않았어요. 실결제·환불·운영 가입/접수·IAM 확대는 실행하지 않았어요. CSP는 Report-Only 그대로예요.
- 새 활성 설정 기준의 최종 제한 계정 SQL verifier는 **16:11:32 KST**에 통과했고 원장 위반·예약금 위반·확인 필요 항목은 모두 0이에요. 적용 후 덤프의 독립 S3 다운로드와 같은 digest 이미지·프론트·설정을 담은 보호 복구 보관은 [백업 런북](backup.md#2026-10-09-적용-후-설정과-호환-복구-보관)을 따라요.

#### 첫 호환 기본 릴리스의 준비와 전환

1. 최종 선별 커밋의 검사 결과와 그 입력으로 만든 `bootJar`·프론트 dist를 한 묶음으로 고정해요. 현재 프리뷰 HEAD나 예전 `build/` 결과를 새 후보로 사용하지 않아요. Docker 복구 이미지에는 실제 QR·접수 중지·예약 차단·가입 증명 코드가 있어야 하고, 같은 묶음의 프론트와 이미지 digest/SHA를 함께 보관해요. `reserve.schema-compat=v270-refund-v1`·`reserve.feature-compat=waiting-signup-v1`은 그 계약을 통과한 새 이미지에만 붙여요.
2. 최종 입력 뒤 로컬 격리 MySQL 8.0.45에 최신 백업을 복원하고 11→12→13의 실제 필요 SQL을 적용해요. 원래 컬럼 값·행 수, 추가 제약·인덱스와 제한된 앱 계정의 `validate`를 대조해요. 가입 동시성 검사는 백업 복원 DB와 다른 빈 합성 DB에서 실행해요. 10/9에는 복원·DDL·기존 값/메타데이터 보존·가입 인증 MySQL 5개·잘못된 기본값/CHECK/인덱스의 verifier 거부와 실제 v2.9.0 JAR의 제한된 계정 `validate` 34모델을 확인했어요. 같은 JAR로 만든 로컬 비루트 호환 복구 이미지와 보호 export 해시는 [백업 런북](backup.md)에 있어요. 운영 적용 직전 새 백업·실제 운영 대상/JAR 검증은 이 로컬 근거와 별도로 확인해요.
3. 운영 전환 승인 묶음에는 실제 대상·보호된 새 사전 백업·실행 SQL·프론트/백엔드/복구 이미지·현재 환경값·기존 Nginx root/upstream의 보호 보관 위치를 넣어요. 허용 시간 제약이 없으므로 첫 전환은 **공개 트래픽을 닫고 구 백엔드를 멈춘 뒤** 적용하는 방식으로 준비해요. HTTP 쓰기 메서드만 차단해서 OAuth 콜백 등의 부작용을 빠뜨리지 않아요. SSH와 loopback 검증 경로는 남기고, 각 운영 변경은 승인된 범위에서만 실행해요.
4. 새 백업과 스키마를 확인한 후 반대편 Blue/Green에 호환 기본 앱을 현재 보호된 환경값으로 띄워요. 고지 미설정 상태에서 고객 접수를 거부하는 관문을 유지하고, loopback health·스키마와 같은 SHA의 정적 root를 확인해요. 준비가 실패하면 공개 트래픽을 열지 않고 호환 수정 후보로 복구해요. DDL을 제거하거나 구 이미지만 재가동해 접수 차단·가입 인증을 우회하지 않아요.
5. 준비된 프론트 root와 upstream을 한 번의 승인된 전환으로 활성화해요. 고객 접수는 닫은 채 실제 공개 안내/처리방침을 확인하고, 별도 승인으로 **실제 게시 시각**을 고객 변수에 넣어요. 공개 정책 API·컨테이너 설정·가게별 접수 설정을 대조한 뒤 접수를 열어요. 적용 후 설정과 활성 자료의 보호 스냅샷을 남기고 호환 기본 이미지와 해당 프론트를 복구 대상으로 보존해요. 그 뒤의 후보부터 기존 자동 배포의 양쪽 호환 관문을 사용해요.

현재 CICD의 Docker push·`stage-release`는 **main push에서만** 실행돼요. `workflow_dispatch`가 호환 기본 이미지를 운영에 설치한다고 가정하지 않아요. main 머지·이미지 push·서버 staging·수동 첫 전환은 각각 실제 실행 범위를 확인하고 승인해요. 기존 자동 관문에 우회 플래그를 추가하거나 구 이미지의 라벨을 바꾸지 않아요.

## 릴리즈 순서

1. `dev` → `main` release PR을 **Squash and merge**로 머지해요.
2. [dev를 main에 맞추는 PR](../rules/git-workflow.md#릴리즈-후-dev-맞추기)을 올려요.
   ```bash
   git merge -s ours origin/main -m "chore: sync dev with vX.Y.Z release"
   ```
3. `gh release create`로 릴리즈를 먼저 만들어요. 릴리즈가 없는 버전은 동기화 스크립트가 건너뛰어요.
4. [릴리즈 노트를 동기화](#1-릴리즈-노트-동기화-changelog--github-릴리즈)해요.
5. `main` push로 CI/CD가 배포하면 [배포 직후 서버 작업](#4-배포-직후-서버-작업)을 진행해요.

브랜치별 머지 방식은 [Git 워크플로우](../rules/git-workflow.md)를 따라요.

## CI 잡 구조

`.github/workflows/CICD.yml`은 `main` push, `main`·`dev` 대상 PR, 수동 실행에서 돌아요. 배포 잡은 `main` push에서만 실행돼요.

| 잡 | 선행 | 하는 일 |
|---|---|---|
| `test-backend` | — | 백엔드 unit·Spring/H2 통합 테스트 |
| `test-frontend` | — | 문서 링크·Grafana·스냅샷·운영 스크립트 검사, ESLint, 품질 정책, Vitest, PC·모바일 Playwright |
| `build-frontend` | `test-frontend` | Vite 빌드 후 이 실행의 dist 아티팩트 업로드 |
| `build-backend` | `test-backend`, `build-frontend` | 같은 실행의 HTML을 포함한 bootJar, main에서 Docker 이미지 push |
| `stage-release` | `build-backend`, `build-frontend` | 아티팩트를 서버 `releases/<SHA>`에 staging. live는 바꾸지 않아요 |
| `deploy-backend` | 위 전부 | 새 서버 기동, 준비 확인, 원자 전환, smoke, 실패 복구 |

- 브랜치 보호의 필수 체크는 `build-backend`·`build-frontend`예요.
- `production` Environment는 `deploy-backend` 하나에만 둬요.
- `deploy-backend`는 공개 가게 목록 GET 준비 확인(2회 연속 2.5초 미만)이 실패하면 구 운영 경로를 유지해요.
- Actions는 전체 커밋 SHA로 고정해요.
- CI에서만 Vitest/Playwright 워커를 2개 써요(로컬은 1개). Playwright trace는 첫 재시도에만 수집해요.

- 2026-10-04부터 Sonar 자동 실행과 커버리지 80% 목표를 맞추기 위한 반복 테스트·빌드·PR을 중지해요.
  일반 CI는 커버리지 계측 없이 기존 테스트를 실행하고 필수 빌드·보안 검사는 유지해요.
  `.github/workflows/sonar.yml`은 요청한 수동 `workflow_dispatch` 정적 분석에만 사용해요.
  분석 입력을 컴파일하지만 테스트 실행이나 커버리지 수집을 추가하지 않아요.

### 테스트 증거 재사용

`scripts/ci-evidence.mjs`는 7일 이내 성공한 같은 저장소 CICD 실행의 테스트 증거를 재사용해요.

- 소스·테스트·잠금 파일·공유 스크립트·워크플로의 Git blob과 Node/JDK·러너 이미지·설정 리비전이 모두 같을 때만 재사용해요.
- 조건이 맞지 않거나 오류가 나면 정상 테스트 실행으로 돌아가요.
- 재사용 대상은 백엔드 unit/Spring-H2와 프론트 unit/PC·모바일 Chromium 검사예요. build와 운영 smoke는 매번 실행해요.
- 수동 `workflow_dispatch` 또는 저장소 변수 `CI_FORCE_TESTS=true`는 재사용을 꺼요. 테스트 환경 설정이 바뀌면 `CI_TEST_CONFIG_REVISION`을 올려요.

### API v1과 프론트 동시 릴리스

v2.8.6부터 같은 SHA의 백엔드와 프론트를 함께 배포해 API v1을 사용해요.
백엔드는 기존 `/api/*`와 `/api/v1/*`를 같은 컨트롤러·권한·본문 계약으로 제공하고,
CI 프론트 빌드는 `VITE_API_VERSION=v1`을 사용해 공통 axios 요청 관문에서 경로를 전환해요.
새 백엔드 준비 확인 후 그 릴리스의 프론트를 활성화하는 기존 원자적 배포 순서를 유지해요.
API v1 전환은 아래 v2.8.6 운영 이력부터 적용돼요.

기존 `/api/*`는 열린 구 화면·PG 웹훅·CSP 수집과 호환되도록 유지해요.
OAuth·헬스 체크 경로는 그대로이며, 지원하지 않는 숫자 API 버전은 JSON 404를 반환해요.

### nginx 지연 로그

- route 종류·HTTP 상태·전체/연결/헤더/상류 응답 시간만 기록해요. IP·동적 ID·쿼리·쿠키·토큰·본문은 넣지 않아요.
- `request_time`과 `upstream_*_time`으로 브라우저/CDN 대기와 앱/DB 대기를 구분해요.

## 1. 릴리즈 노트 동기화 (CHANGELOG → GitHub 릴리즈)

`docs/CHANGELOG.md`의 버전별 사용자 요약을 각 GitHub 릴리즈 설명 상단에 `<!-- changelog:start/end -->` 마커로 감싸 얹어요. 다시 돌려도 중복되지 않아요.

```bash
# 전체 미리보기 (아무것도 바꾸지 않음)
node scripts/sync-release-notes.mjs

# 전체 반영
node scripts/sync-release-notes.mjs --apply

# 특정 버전만
node scripts/sync-release-notes.mjs v1.13.0 --apply
```

## 2. GitHub Deployments (배포 이력 기록)

`deploy-backend` 잡은 `environment: production`을 쓰고, GitHub가 Deployment와 상태를 자동으로 기록해요. `production`의 배포 브랜치 정책은 `main`만 허용해요.

### 2-1. 기록 확인

```bash
# 코드: main 전용 stage/활성화와 자동 Environment 기록
rg -n "stage-release:|deploy-backend:|environment:|production|deployments:" .github/workflows/CICD.yml

# 원격: 최신 production 배포와 상태
gh api --method GET repos/hanjeun/reserve/deployments -f environment=production \
  --jq '.[0] | {id,sha,created_at}'
gh api repos/hanjeun/reserve/deployments/<id>/statuses \
  --jq '.[0] | {state,created_at,environment_url}'
```

### 2-2. v2.8.5 배포 확인 (2026-10-03)

릴리스 PR #299를 squash로 머지한 main `c999f6369a098b755cdb8cc9fcd9a32d3c41c766`의
[CI/CD 실행](https://github.com/hanjeun/reserve/actions/runs/37128806865)이 성공했어요.
23:16 KST green 앱·nginx upstream·공개 `release-id.txt`가 같은 SHA를 가리키는 것을 확인했어요.
Actuator health `UP`, 읽기 전용 배포 verifier, 새 heartbeat와 사진 집계의 원본·Loki 수집을
확인했어요. DB 보정이나 스키마 변경은 이번 배포에서 실행하지 않았어요.

릴리스 직후 dev와 main의 파일이 같은지 확인하고 `merge -s ours`로 squash 계보를 연결했어요.
후속 정리는 dev 대상 PR로 검증하며, 운영 배포와 관측 결과는 [모니터링 런북](monitoring.md)을 따라요.

### 2-3. v2.8.6 배포 확인 (2026-10-04)

제품 통합 PR #304와 릴리스 PR #305를 거친 main `3199e48fb9aa6f8c5204c946ec2382487f4c22a0`의
[CI/CD 실행](https://github.com/hanjeun/reserve/actions/runs/37144813467)이 성공했어요.
blue 앱·nginx upstream·공개 `release-id.txt`가 같은 SHA를 가리키고, health는 `UP`예요.
앱 계정은 `reserve_app`, 스키마 모드는 `validate`를 유지해요.

기존 `/api/stores`와 `/api/v1/stores`의 공개 목록·정렬 결과가 같았어요.
없는 가게 5·1000000과 지원하지 않는 `/api/v2/stores`는 404,
미인증 회원 조회는 기존·v1 모두 401로 끝났어요. 브라우저에서도 두 가게 주소는
가게 없음 안내·목록 이동, 없는 화면 주소는 404 안내·홈 이동을 표시했어요.

앱 계정의 원문 LIKE·MATCH+LIKE와 공개 API의 검색 표본은 모두 2행이었어요.
ngram 크기 2·다섯 컬럼 FULLTEXT를 확인했고, 새 앱의 FULLTEXT 폴백 경고는 없었어요.
인덱스 적용 이력·복구 사본은 [`manual-ddl.md`](manual-ddl.md)를 따라요.

릴리스와 main CI는 입력이 같은 성공한 단위·PC·모바일 검사 증거를 재사용했어요.
필수 빌드와 CodeQL은 통과했고 자동 Sonar는 실행하지 않았어요.
릴리스 이름은 `v2.8.6`이며 설명은 CHANGELOG와 동기화했어요.
main과 dev의 파일이 같은 것을 확인한 뒤 `merge -s ours`로 squash 계보를 연결했어요.

### 2-4. v2.8.7 배포 확인 (2026-10-04)

제품 PR #307·#308·#309와 릴리스 PR #310을 거친 main
`c1c08d8b9e197f198e5383746e5a1a389d1b81bb`의
[CI/CD 실행](https://github.com/hanjeun/reserve/actions/runs/37192806934)이 성공했어요.
green 앱·nginx upstream·공개 `release-id.txt`가 같은 SHA를 사용하며 health는 `UP`예요.
제한된 `reserve_app`과 `validate`를 유지하고, 새 모델 34개의 배포 전 대조도 통과했어요.

채팅 파일명·신고 보존 분류·감사 기록·웨이팅 DDL은 보호된 덤프 후 먼저 적용했고,
기존 컬럼 해시는 전후 같아요. 상세는 [수동 DDL 9·10절](manual-ddl.md)을 따라요.
18:44:15 KST 공개 개인정보처리방침과 배포된 고지 내용을 확인한 뒤 실제 게시 확인 시각을 등록했어요.
같은 이미지의 환경 중 보존 설정 다섯 항목만 반영하고, 나머지 환경과 이미지가 같은지 확인했어요.
공개 정책 API는 90일 보관·30일 유예·2026-11-03 18:44:15 KST 적용 시작을 반환했어요.
`enabled=true`, `active=false`로 유예 중이며 채팅·신고 파기는 아직 실행되지 않아요.

릴리스·main CI는 같은 입력의 성공한 단위·브라우저 검사 증거를 재사용했어요.
필수 빌드와 CodeQL은 통과했고 Sonar는 실행하지 않았어요.
릴리스 제목은 `v2.8.7`이며 한국어 설명은 CHANGELOG와 동기화했어요.
main과 dev의 배포 파일이 같은 것을 확인하고 `merge -s ours`로 squash 계보를 연결해요.

### 2-5. v2.8.8 배포 확인 (2026-10-07)

제품 PR #312·#313과 릴리스 PR #319를 거친 main
`51a3825efd33812c9482ce381ab54cae033e90b8`의
[CI/CD 실행](https://github.com/hanjeun/reserve/actions/runs/37611763704)이 성공했어요.
20:23 KST blue 앱·nginx upstream·공개 `release-id.txt`가 같은 SHA를 사용하며 health는 `UP`예요.
GitHub production Deployment `6908551032`도 성공 상태예요.
앱 DB 계정 `reserve_app`과 스키마 모드 `validate`를 유지하고, 이번 배포에 DDL·DB 보정은 없어요.
읽기 전용 배포 verifier의 미결 결제·웹훅·파일 삭제·OAuth 해제 작업과 예약금 불변식 검사는 통과했어요.

릴리스 PR은 같은 입력의 성공한 단위·브라우저 검사 증거를 재사용했어요.
main CI는 백엔드 증거를 재사용하고 프론트 단위 133개 파일·1,172개 테스트와 PC·모바일 검사를 실행했어요.
필수 빌드와 CodeQL은 통과했고 Sonar는 실행하지 않았어요.
릴리스 제목은 `v2.8.8`이며 한국어 설명은 CHANGELOG와 동기화했어요.
main과 dev의 파일이 같은 것을 확인한 뒤 `merge -s ours`로 squash 계보를 연결했어요.

공개 개인정보처리방침은 200 응답이며, 보존 정책의 실제 고지 시각은 10월 4일 18:44:15 KST로 유지해요.
정책 API는 90일 보관·30일 유예·11월 3일 18:44:15 KST 적용 시작과 `enabled=true`, `active=false`를 반환해요.
기존 자료의 유예를 앞당기거나 초기화하지 않았어요. 유예 종료 후 첫 파기 결과는 아직 확인할 수 없어요.

CSP는 Report-Only를 유지하고 Google 프로필 사진 호스트 `lh3.googleusercontent.com`을 허용했어요.
새 앱 로그의 Loki 수집과 지도 렌더를 확인했어요. 배포 전 보고는 22건(이미지 16·카카오 스크립트 6)이었고,
옛 로그에는 차단 대상 주소가 없어 이미지 보고 전부의 원인을 소급 확정할 수 없어요.
새 브라우저 재현은 카카오 지도 SDK의 `t1.kakaocdn.net` 스크립트와 `eval` 사용을 확인했어요.
이 호스트 허용·SDK의 eval 처리 방안을 정하기 전에는 CSP를 강제 모드로 바꾸지 않아요.

## 3. 저장소 보호 & PR/브랜치 정리

### 3-1. 브랜치 보호 (main / dev)

- `main`·`dev` 모두 `build-backend`·`build-frontend`를 필수 체크(strict)로 요구하고, 관리자에게도 적용해요.
- `main`은 PR 필수, 선형 히스토리 강제, 강제 push·삭제 차단이에요.
- `contexts`에는 PR에서 실제로 도는 잡만 넣어요.

```bash
gh api repos/hanjeun/reserve/branches/main/protection
gh api repos/hanjeun/reserve/branches/dev/protection
```

설정 예시(gh CLI, PowerShell here-string):

```powershell
@'
{
  "required_status_checks": { "strict": true, "contexts": ["build-backend", "build-frontend"] },
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false
}
'@ | gh api --method PUT repos/hanjeun/reserve/branches/main/protection --input -
```

### 3-2. 머지된 head 브랜치 자동 삭제

```bash
gh api --method PATCH repos/$REPO -f delete_branch_on_merge=true
```

이미 머지됐지만 남아 있는 브랜치 정리:

```bash
git fetch --prune
git branch --merged main | grep -vE '^\*|main|dev|local-preview-all-changes' | xargs -r -n1 git branch -d
git push origin --delete <branch>   # 원격 브랜치 삭제(필요한 것만)
```

### 3-3. Dependabot

2026-10-09 재조회에서 [#314](https://github.com/hanjeun/reserve/pull/314)·[#315](https://github.com/hanjeun/reserve/pull/315)·[#318](https://github.com/hanjeun/reserve/pull/318)는 CLOSED이고, [#316](https://github.com/hanjeun/reserve/pull/316)·[#317](https://github.com/hanjeun/reserve/pull/317)은 OPEN이에요. 필요한 패치·마이너와 지원 범위의 Gradle, 원문 고지는 별도 [#321](https://github.com/hanjeun/reserve/pull/321)로 통합해 필수 CI·CodeQL을 통과한 뒤 dev에 merge commit으로 머지했어요. 의존성 PR 자체의 머지로 표시하지 않으며, 미룬 메이저에 ignore 코멘트를 보내거나 PR을 닫지 않았어요. 아래 #318 head와 실패는 준비 당시의 기록이에요.

- #318 head `1791b4a1341952e6b35bd70ae433030f78894102`: AWS SDK `2.55.11`, Sentry Java `8.59.0`, Gradle `9.8.0` 후보예요. AWS JAR 30종에는 LICENSE·NOTICE가 있고 기존 수집 관문으로 동봉해요. 원문이 없는 Sentry JAR 5종은 해당 태그 LICENSE와 JAR·문서 해시를 보충 목록에 연결했어요. 기존 8.58.0 고지는 남겨요.
- 같은 #318 head의 기존 백엔드 CI는 `io.sentry:sentry-reactor:8.59.0` 원문 고지 누락으로 실패했어요. #321에서 보충 목록·원문과 잠금 입력을 함께 반영해 최종 JAR 동봉 관문을 통과했으며, 기존 #318 실행을 다시 돌리지 않았어요.
- [Spring Boot 3.5.16의 명시적 Gradle 지원](https://docs.spring.io/spring-boot/3.5/system-requirements.html)은 7.6.4 이상 7.x와 8.4 이상 8.x예요. 사용자가 Boot 3.5를 유지한 지원 버전을 선택했으므로 wrapper는 9.6.1에서 **8.14.6**으로 준비했어요. [공식 8.14.6 릴리스](https://docs.gradle.org/8.14.6/release-notes.html)는 HIGH 취약점 3건의 수정판이며 #318의 9.8.0은 채택하지 않아요. 배포 ZIP SHA-256 `7988ed071b2a07900e2ec715fca15c6ab72bce6db433af301fa7fa7e9407bd24`를 properties에 고정하고, wrapper JAR은 공식 생성용 원문의 SHA-256 `ad16bca46cb71bb5887c546860d93992aeee35c1fdaf4a242b0a612375d937e0`와 대조했어요. 기존 launcher를 보존했으며 실제 Java 21·Gradle 8.14.6으로 백엔드 검사와 `bootJar`가 통과했어요.
- Sentry 8.59.0의 직접 logs/metrics 호출 동작 변경은 [원문 릴리스 노트](https://github.com/getsentry/sentry-java/releases/tag/8.59.0)를 따라요. 현재 소스에서는 직접 `Sentry.logger()`·metrics 호출을 찾지 못했고 `send-default-pii=false`를 유지해요. 패키지 버전 변경만으로 개인정보 설정까지 검증됐다고 말하지 않아요.
- #315는 PortOne browser 0.1.13·TanStack Query 5.104.1·coverage-v8/Vitest 5.0.3·globals 17.13.0 후보예요. PortOne 결제 응답·웹훅/환불 경계와 Query의 세션·무효화, Vitest peer 정합성을 최종 입력으로 확인해요. AntD 자체가 이 그룹에서 오른다고 쓰지 않으며, rc-tabs 잠금 버전이 바뀐 경우에만 기존 패치 적용 여부를 다시 확인해요.
- v2.9.0 확정 입력은 ESLint 10.12.0, 위 #315 버전과 Vitest 관련 peer/mocker/spy 5.0.3, AWS SDK 2.55.11·Sentry Java 8.59.0을 잠금파일과 함께 반영했어요. AntD 6.6.5·rc-tabs 1.13.0을 유지하며 `npm ci`의 postinstall 패치 적용과 전체 src 린트가 통과했어요. 프론트 dist에는 실제 번들 패키지 102개·PortOne 0.1.13의 MIT/Apache 원문과 Sentry React 원문이 포함돼요. `reserve-2.9.0.jar`에는 라이브러리 136개와 원문 고지, Sentry Java 8.59.0의 보충 원문이 실제 동봉됐고 JAR의 공개 가게 HTML이 같은 dist/index.html과 일치해요.
- 준비 당시 로컬 후보 JAR은 87,331,568바이트·SHA-256 `c557f774f35177e3aae247d11b37cf23a0144d7524a2e28253be30a5c51b741b`였어요. 최종 main의 원격 이미지에서 추출한 실제 JAR은 **87,331,569바이트·SHA-256 `7d569faca35745721ab2b0be6ae16238d0456d1f76dddab5ec5e266115d454d1`**이며 embedded 공개 HTML은 같은 main SHA의 staged 프론트와 바이트가 같아요. 이미지 digest는 **`sha256:7c13f58c62a9de5b0c7673b6347f859edde8c702254b87d6b5cce5f2a3f9b3c2`**예요. 산출물 해시와 Git SHA를 구분하며 로컬 Vite 용량 관문은 초기 JS 348.6 KiB gzip/최대 청크 435.1 KiB로 통과했어요.
- `source-map-js`는 1.2.2로 패치했어요. 후보 런타임 의존성 감사는 취약점 0건이며 전체 감사에는 `patch-package` → `find-yarn-workspace-root` → `micromatch` → `braces`의 개발 도구 경로에서 HIGH 4건이 남아요. [공급자 취약점 고지](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)의 패치 버전은 아직 없으며 자동 제안인 patch-package 6.0.7 다운그레이드를 적용하지 않았어요. 이 개발 패키지들은 실제 번들 고지/모듈 목록에 없어요. 런타임 0건과 전체 감사 통과를 혼동하지 않으며 필수 보안 CI는 유지해요.
- 별도 GitHub 경고 #97의 `source-map-js` 1.2.1은 `docs/design-system/snapshots/2026-09-13-baseline/source/frontend/package-lock.json`에 남아 있어요. 현재 앱 lock은 1.2.2이고 이 동결 복사본은 설치 입력이 아니며 해시 검증 대상이에요. 원본 바이트·라이선스를 보존하고 경고를 숨기거나 임의로 dismiss하지 않았어요.
- #316 js-yaml 5·#317 Sentry React 11은 이번 준비에서 제외해요. js-yaml **4.3.2**·Sentry React **10.69.0**과 기존 PII/Replay 설정을 유지했으며 아래 메이저 이동 항목은 후속 검토예요. PR을 닫거나 ignore 코멘트를 보내지 않았어요.
- #316의 현재 제안은 js-yaml **5.4.3**이며 이번 출시에는 포함하지 않았어요. 앞서 읽은 5.4.2의 [공식 이동 지침](https://github.com/nodeca/js-yaml/blob/5.4.2/docs/migrate_v4_to_v5.md)은 후속 메이저 검토 근거예요. 현재 직접 사용처는 `scripts/tests/cicd-contract.test.mjs`의 CommonJS `load()`이고, 빈 입력·기본 스키마·merge/사용자 태그·ESM default export 차이를 확인해야 해요. 별도 메이저 호환 검사는 실행하지 않았으므로 호환 완료로 표시하지 않아요.
- #317은 Sentry React 11.4.0의 [공식 이동 지침](https://github.com/getsentry/sentry-javascript/blob/11.4.0/MIGRATION.md)을 따라요. 현재 `frontend/src/main.jsx`의 `sendDefaultPii: false`만 그대로 두면 v11의 더 넓어진 기본 수집을 제한하지 못해요. 선택 시 `dataCollection`을 명시해 기존 개인정보 제한과 Replay 텍스트 마스킹·미디어 차단을 유지하고, 오류 보고·라우팅·전송 내용을 확인해야 해요. 현재 10.69.0 설정은 바꾸지 않았고, 이 보완 없이 #317을 출시 후보에 넣지 않아요.
- 보충 원문을 준비해도 최종 후보 JAR/dist의 동봉 검사를 생략하지 않아요.

메이저 업그레이드 PR은 닫지 않고 코멘트로 무시를 지시해요.

```bash
gh pr comment 79 -R $REPO --body "@dependabot ignore this major version"
gh pr comment 76 -R $REPO --body "@dependabot ignore this major version"
```

마이너/패치 PR은 승인 뒤 직접 머지해요. dev 대상은 merge commit, main 릴리스는 squash를 사용해요.

```bash
gh pr list -R $REPO --label dependencies       # 목록 확인
gh pr merge <번호> -R $REPO --merge
```

## 4. 배포 직후 서버 작업

### 4-0. DB 구조와 운영 큐 읽기 전용 점검

앱이 새 버전으로 기동한 뒤 `verify-post-deploy-readonly.sh`를 서버에서 실행해요. 환경 파일에는 `DB_PASSWORD`가 있어야 해요.

```bash
scp scripts/verify-post-deploy-readonly.sh scripts/verify-mysql-row-lock.sh ubuntu@<server>:/tmp/
ssh ubuntu@<server>
sudo install -m 0755 /tmp/verify-post-deploy-readonly.sh /usr/local/bin/reserve-post-deploy-verify
sudo install -m 0755 /tmp/verify-mysql-row-lock.sh /usr/local/bin/reserve-mysql-row-lock
sudo RESERVE_VERIFY_ENV=/etc/reserve-backup.env RESERVE_VERIFY_PREVIEW_SCHEMA=1 \
  /usr/local/bin/reserve-post-deploy-verify
```

v2.8.4부터 `RESERVE_VERIFY_PREVIEW_SCHEMA=1`로 광고·채팅의 추가 구조도 검사해요.

DDL 11·12·13절을 포함한 새 후보는 **승인된 DDL 적용 뒤** 최신 verifier를 설치하고 다음 옵션을 함께 사용해요. 현재 구 운영 앱에는 이 옵션을 요구하지 않아요. 새 옵션의 실제 SQL/판별식은 격리 MySQL 입력에서 정상 정의를 통과시키고 잘못된 기본값·강제하지 않는 CHECK·잘못된 인덱스 순서를 각각 거부했어요. 각 합성 변경의 원상 복구와 전후 모든 행/값·메타데이터 일치를 확인했으며 서버 설치·운영 실행은 하지 않았어요.

```bash
sudo RESERVE_VERIFY_ENV=/etc/reserve-backup.env RESERVE_VERIFY_PREVIEW_SCHEMA=1 \
  RESERVE_VERIFY_WAITING_SIGNUP_SCHEMA=1 /usr/local/bin/reserve-post-deploy-verify
```

새 옵션은 `store`·`waiting_entry`·`email_verification`·`member`의 엔진, 추가 컬럼의 정확한 타입·NULL·기본값, 고객 웨이팅 CHECK의 실제 정의·강제 여부, 회원 대기 조회 인덱스, 이메일 unique의 전체 컬럼·순서·prefix 여부와 중복 집계를 대조해요. 이것은 신규 기능의 권한·동시성 검사나 최종 JAR의 `validate`를 대신하지 않아요.

읽는 항목:

- `payment_webhook_inbox`, `payment_reconciliation_issue`, `file_deletion_task`,
  `oauth_unlink_task`, `marketing_consent_history` 테이블과 필수 인덱스
- `reservation.checked_in_at`, `member.auth_version` 컬럼
- 관련 테이블의 InnoDB 엔진 여부
- 7일 넘은 `READY`, 열린 대사 건, 미완료 웹훅, 실패한 S3/OAuth outbox, 결제 장부·예약금 플래그 불변식 위반 건수

| 종료 코드 | 뜻 |
|---|---|
| `0` | 구조와 큐 정상 |
| `1` | 구조 오류 |
| `2` | 구조는 정상이지만 수동 확인할 큐 존재 |

`2`가 나오면 오래된 `READY`를 PortOne 콘솔과 대조하고, 관리자 패널의 **재확인**은 별도 승인 뒤 실행해요.

MySQL 행 잠금 점검은 선택한 결제 행을 약 5초간 `FOR UPDATE`로 잠가요. 트래픽이 없는 TEST 결제 ID로 승인된 점검 창에서 실행하고, 두 번째 세션이 lock wait timeout으로 막히면 통과예요.

```bash
sudo RESERVE_VERIFY_ENV=/etc/reserve-backup.env \
  /usr/local/bin/reserve-mysql-row-lock <idle-test-payment-id>
```

### 4-1. CSP 위반 관측

`nginx/default.conf`의 CSP는 **Report-Only**로 나가요. 위반 보고는 `POST /api/csp-reports`로 들어오고, 서버는 지시문 종류·차단 URI의 scheme·코드 출처 범주·차단 대상 범주만 `CSP violation observed` 로그로 남겨요. URL 경로·쿼리·파일명·원본 호스트는 기록하지 않아요. v2.8.8부터 차단 대상 범주(`blockedCategory`)를 추가했고, 실제 사용 중인 Google 프로필 사진 호스트 `lh3.googleusercontent.com`만 이미지 허용 목록에 보완해요. 이전 이미지 보고 10건은 차단 대상 범주가 없어 전부 Google 사진 때문이라고 확정할 수 없어요.

Report-Only를 유지하고, 카카오 지도를 이유로 앱 전체에 `unsafe-eval`을 추가하지 않아요. [카카오 공식 가이드](https://apis.map.kakao.com/web/guide/)와 현재 `kakaoMapsLoader.js`의 진입 스크립트는 `dapi.kakao.com/v2/maps/sdk.js`예요. 2026-10-09 사용자가 운영 콘솔에서 확인한 지도 본체와 services의 후속 스크립트는 `t1.kakaocdn.net`이에요. 로컬 Nginx의 두 HTML 정책에 이 HTTPS 호스트만 추가했고, SDK의 `eval` 보고와는 구분해요. 이미지를 위한 `*.kakaocdn.net` 허용이 스크립트까지 허용하지는 않아요. DevTools Network에서 JS 자산이 아니라 첫 **Document** 요청의 Response Headers를 확인해요.

[MDN의 `script-src` 설명](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src#unsafe_eval_expressions)에 따라 출처 허용이나 nonce/hash를 넣는 것만으로 문자열 코드 실행 문제가 해결되지는 않아요. 이번 선택은 지도 기능과 Report-Only를 유지하고 `eval` 보고를 계속 분류하는 것이에요. 강제 모드가 필요해지면 eval 없는 공급자 경로, 앱에 접근할 수 없는 별도 출처의 지도 격리, 지도 제공 방식 변경을 비교해요. 같은 출처 iframe에 `allow-scripts allow-same-origin`을 주는 방식은 앱과의 격리 근거로 삼지 않아요. 현재는 지도 UI·SDK·키·운영 정책을 바꾸지 않았어요.

1. 배포 후 https://reserve.it.kr 에서 개발자도구 콘솔을 열고 **PC와 실제 모바일에서 주요 화면을 한 바퀴 돌며**
   `[Report Only]` 경고를 모아요.
   → 홈 / 가게 목록 · 검색 / 가게 상세(**카카오맵이 뜨는 화면**) / 예약 · **결제** / 로그인(소셜 3사) /
     마이페이지 이미지 업로드 · 미리보기 / 관리자 패널
2. Loki에 `reserve` 스트림이 들어오는지 확인한 뒤 아래 쿼리로 위반을 봐요.

   ```logql
   {job="reserve"} |= `CSP violation observed`
   ```

3. 수동 시나리오를 모두 통과하고 **최소 7일** 동안 설명되지 않는 위반이 없으면 강제 모드를 별도 PR·승인으로 검토해요. 현재 지도 SDK의 eval 경로가 남으면 전환하지 않으며, eval 없는 지원 경로나 검증된 격리를 먼저 확보해요.
4. 경고가 있으면 필요한 출처만 해당 지시문에 추가해요. script-src에는 `unsafe-inline`을 넣지 않아요.

### 4-2. 가게 검색 FULLTEXT 후보 방식

10/2 격리 MySQL 8.0.45의 순수 MATCH 실험은 다중 단어와 `%` 결과 차이 때문에 당시 활성화를 보류했어요.
새 구현은 기본 `fulltext-enabled=true`지만 MySQL·ngram 크기 2·정확한 다섯 컬럼의 ngram 인덱스를
처음 한 번 확인한 뒤에만 MATCH 후보를 사용해요. 후보에 원문 LIKE와 같은 공개 필터·정렬을 적용하고,
독립 repeatable-read 조회에서 count가 같을 때만 반환해요. 누락·미설치·실행 오류는 LIKE로 돌아가요.
동등성용 LIKE count 비용을 유지하므로 속도 향상을 약속하지 않아요.

2026-10-04 02:30:57 KST 전후 승인된 `reserve_ddl` 계정으로 운영 `ft_store_search` ngram 인덱스를 설치했어요.
ngram 크기 2·InnoDB·정확한 다섯 컬럼의 FULLTEXT와 기존 가게 3행 유지, MATCH 실행 성공을 확인했어요
(해당 조회 0행). 원래 구조·행의 보호된 백업과 적용 이력은 [`manual-ddl.md`](manual-ddl.md)에 있어요.
v2.8.6 blue 앱으로 후보 검색 기능을 배포했어요. 앱 계정의 원문 LIKE·MATCH+LIKE와
공개 API 검색 표본은 모두 2행이었고, 새 앱의 FULLTEXT 폴백 경고는 없었어요.
미설치 판정은 캐시하므로 실행 중 설치했다면 새 앱 기동 때 다시 탐지해요.
실행 SQL과 접속 절차는 [`manual-ddl.md`](manual-ddl.md)를 따라요. 백업 계정으로 관리자 SQL에 접속하지 않아요.

### 4-3. nginx 로그 수집

운영 nginx는 호스트의 `/var/log/nginx`에 로그를 남기고 Alloy가 Loki로 전송해요.
2026-10-02 수집을 Alloy로 전환했으므로 옛 Promtail을 다시 시작하지 않아요.
설정·positions 보존과 롤백은 [`monitoring.md`](monitoring.md)의 "Alloy 운영 전환"을 따라요.

확인: Grafana에서 `{job="nginx"}`를 조회하고 같은 시각의 원본 access 로그와 대조해요.

### 4-4. 알림 규칙

Contact point의 **Test**로 수신을 확인한 뒤 [모니터링](monitoring.md)의 "알림 규칙"대로 규칙을 만들어요.

## 5. 프론트엔드 원자적 배포와 롤백

프론트는 새 백엔드가 준비된 뒤에 live로 바뀌어요. 아래 일반 자동 배포는 live와 target 모두 v7 호환 기준선을 갖춘 뒤에 사용해요. 현재 v2 운영에서의 첫 전환은 [첫 v7 및 도메인 전환 순서](#첫-v7-및-도메인-전환-순서)를 따르며 기존 호환성 관문을 유지해요.

1. `stage-release`가 dist 아티팩트를 `/usr/share/nginx/html/releases/<commit-sha>`에 staging하고 SHA별 nginx 템플릿을 보관해요. `current` symlink, nginx 설정, backend upstream은 바꾸지 않아요.
   - `scripts/preserve-frontend-assets.sh`가 live와 보존된 릴리스 하나의 해시 자산을 새 staging에 복사해요.
   - `reserve-assets.sha256`은 각 릴리스의 원래 파일만 기록해요.
   - 파일명이 같은데 SHA-256이 다르면 배포를 중단해요.
2. `deploy-backend`가 nginx의 `service-env.inc`로 live upstream을 읽고 health와 스키마·기능 복구 표식을 확인한 뒤, 반대편 Blue/Green 컨테이너를 SHA 이미지로 기동해요. 새 컨테이너의 loopback health가 통과해야 다음 단계로 가요. 전환 직전에도 live 경로와 두 이미지의 호환 표식을 확인해요.
3. 전환 직전 `default.conf`, `service-env.inc`, `current` 포인터를
   `/home/ubuntu/release-rollback-<새 commit-sha>-<run-id>-<run-attempt>/`에 저장해요.
4. nginx 후보에 새 프론트의 **SHA 절대 경로**와 새 backend upstream을 함께 넣고, `nginx -t`가 통과하면 `current` 포인터를 갱신한 뒤 nginx를 **한 번만 reload**해요.
5. nginx를 거치는 HTML·정적 asset·공개 API smoke가 성공하면 구 backend를 정지·제거하고 오래된 릴리스와 해당 실행의 임시 rollback 디렉터리를 정리해요. 이 정리가 보호된 v7 복구 묶음을 만들어 주지는 않아요.
6. health, 후보 검사, reload, smoke 중 하나라도 실패하거나 실행이 취소되면 저장한 두 nginx 파일과 프론트 포인터를 복원하고 새 backend를 제거해요.

- 자동 정리는 현재 프론트와 최신 두 릴리스 디렉터리만 보존해요.
- 배포 워크플로는 호스트 전체 `docker image/system prune`을 실행하지 않아요.

### 수동 롤백

실패 중 자동 복구가 사용하는 실행별 rollback 디렉터리와 성공 후 수동 복구 입력을 구분해요. 현재 CI는 성공 시 `/home/ubuntu/release-rollback-<SHA>-<run-id>-<run-attempt>/`를 삭제하므로 성공 후에도 이 경로가 남아 있다고 가정하지 않아요.

성공 후 수동 복구에는 검증된 보호 **current-v7 복구 묶음 하나**가 필요해요. 실제 v7 JAR·백엔드 이미지와 그 digest, 같은 SHA의 앱/홍보/기존 초안 복구 프론트, 현재 환경과 암호문에 대응하는 키, Nginx 설정·upstream·세 포인터, DB 스키마와 검증한 백업을 연결해 보관해요. CI가 이 묶음을 자동 생성하지 않으며 현재 준비가 완료됐다는 뜻도 아니에요. 현재 복구 입력의 완전성·해시·접근 권한을 먼저 확인하고, 묶음 밖에 같은 이미지의 개별 export나 중복 묶음을 추가하지 않아요. 기존 보관 정책은 확대하지 않아요. [백업 런북](backup.md)의 보호·복원 관문을 유지해요.

1. 대상 main SHA·현재 upstream과 보호 current-v7 묶음의 실제 파일·해시·복구 가능 범위를 읽기 전용으로 확인하고 별도 운영 승인을 받아요. 임시 rollback 폴더나 SHA 라벨만으로 복구 입력을 대신하지 않아요.
2. 실제 JAR·이미지가 `reserve.schema-compat=v270-refund-v1`과 `reserve.feature-compat=waiting-signup-hidden-feed-oauth-v7`을 지원하고, 피드·댓글 사진·신고 보존·OAuth 토큰/주체 상태를 유지하는지 확인해요. 같은 SHA의 프론트·해당 compose·현재 보호된 환경값과 대응 키로 복구 앱을 준비하고 제한된 앱 계정의 `validate`와 loopback health를 확인해요. 두 JVM을 함께 띄울 용량이 확인되지 않았다면 승인된 유지보수에서 기존 JVM을 종료한 뒤 복구 JVM을 기동해요. 구 v2·이전 v6 이미지의 라벨만 바꾸지 않아요.
3. 최신 DB·가게 설정·고객 고지 시각과 새 피드/OAuth 상태를 유지해요. 과거 `.env`나 전체 DB 덤프를 함께 되돌리지 않아요. 호환 v7 앱이 없으면 트래픽·신규 쓰기를 닫고 수정 이미지를 준비하며 `ddl-auto=update`로 우회하지 않아요. 전체 DB 복원은 별도 승인·직전 백업·최신 자료 보존 계획을 요구해요.
4. 묶음의 `default.conf`와 `service-env.inc`가 준비한 복구 백엔드와 실제 프론트 SHA 절대 경로를 가리키는지 대조해요. 앱 `current`·홍보 `marketing/current`·기존 초안 `legacy-domain.current` 포인터도 같은 복구 입력으로 맞춰요. 포인터만 바꾸거나 종료된 upstream으로 Nginx만 되돌리지 않아요.
5. `nginx -t` 뒤 한 번 reload하고 nginx를 거치는 HTML·자산·API와 최신 설정의 유지 상태를 확인해요. 성공이 확인되기 전에는 기존 live와 필요한 복구 자료를 정리하지 않아요.

로컬 회귀 검사는 `bash scripts/test-frontend-release-swap.sh`와 `bash scripts/test-frontend-assets.sh`예요.

### TLS 갱신과 원본 가게 HTML

2026-10-02부터 Certbot의 HTTP-01은 nginx의 `/.well-known/acme-challenge/` webroot로 처리해요.
기존 nginx 정지·시작 pre/post 훅은 원본 보관함으로 옮겼고, 갱신 후 reload 훅은 유지해요.
세 도메인 challenge 읽기, 두 인증서의 staging 갱신과 deploy 훅, 별도로 복원한 인증서·키의
일치·체인은 통과했어요. 실제 새 운영 인증서 발급과 staging 시험은 구분해요.
원본과 복원 자료는 `/var/backups/reserve-scripts/20261002-before-tls-webroot/`(root 전용)에 있어요.

가게 상세 원본 HTML은 같은 실행의 frontend-release 아티팩트를 백엔드 JAR에 동봉해 만들어요.
패키징은 프론트 빌드 성공 후 진행하며 HTML 없이 만든 JAR는 거부해요. 공개 가게 조회 정책,
HTML 이스케이프, 공개 썸네일 경로 검사를 거친 이름·설명·사진을 넣고 기존 SPA 자산은 보존해요.
삭제·정지 가게는 404·noindex로 응답해요. 이 변경의 운영 적용은 해당 릴리스 배포에 포함돼요.

## v2.10.0 개인 메시지 삭제 운영 적용

개인 메시지 삭제와 관련 화면 보완은 별도 승인된 v2.10.0으로 운영에 적용했어요. 현재 dev에 요청 변경만 옮겨 최종 SHA를 검사했으며 이미 배포한 혼합 프리뷰 전체를 다시 스테이징하지 않았어요.

v2.10.0 이미지의 계약은 `reserve.feature-compat=waiting-signup-hidden-v2`예요. Docker 빌드가 실제 JAR의 개인 삭제 entity·repository·service를 요구하고, live 판별과 cutover 직전에는 기존·대상 이미지 양쪽의 계약을 확인해요. v2.9.0의 `waiting-signup-v1` 이미지는 개인 삭제 복구 대상으로 인정하지 않아요. 따라서 최초 전환은 자동 관문을 우회하거나 구 이미지 라벨을 바꾸지 않고, 승인된 새 백업·14절 DDL·전체 새 JAR `validate`·현재 환경값·새 호환 이미지·같은 프론트의 준비 후 진행해야 해요. 다음 자동 배포부터 새 계약을 사용해요.

복구할 때도 개인 표시 설정과 기존 고객 웨이팅·예약 차단·가입 증명·실제 고지 시각을 유지해요. 실패 시 이 상태를 이해하는 호환 수정 이미지로 복구하고, 준비된 이미지가 없으면 신규 쓰기를 제한한 채 복구해요. 자세한 경로는 [백업 런북](backup.md)과 [DDL 14절](manual-ddl.md#14-메시지-나에게만-삭제-v2100-운영-적용)을 사용해요. 영상통화는 후속 설계이며 이 후보의 코드·스키마·운영 범위에 포함하지 않아요.

### 실제 첫 호환 전환과 검사 근거

최종 main은 `6fdaafa36dc0a1340a75adea2243c9ef5c1829e4`이고 기능 PR [#327](https://github.com/hanjeun/reserve/pull/327)·릴리스 PR [#328](https://github.com/hanjeun/reserve/pull/328)을 거쳤어요. 최종 기능 입력의 [CI 37907566249](https://github.com/hanjeun/reserve/actions/runs/37907566249)는 프론트 unit 1,314개·PC 109개(기기 조건 4개 스킵)·모바일 113개와 필수 빌드/정책 검사를 통과했고 CodeQL도 통과했어요. 후속 동일 입력은 기존 증거 해시 관문으로 재사용했으며 필수 빌드·보안 관문을 유지했어요.

[main CI 37909670737](https://github.com/hanjeun/reserve/actions/runs/37909670737)의 테스트 증거·양쪽 빌드·stage는 성공했고, 자동 배포는 기존 v2.9.0의 개인 삭제 미지원 복구 이미지 때문에 live 판별에서 거부됐어요. 자동 실행 전체를 성공으로 바꾸거나 관문을 완화하지 않았어요. 별도 승인된 첫 전환에서 공개 트래픽과 구 앱을 닫고, 새 백업의 독립 S3 읽기·격리 복원·DDL 14절·전체 새 JAR의 제한된 계정 validate·새 호환 복구 묶음을 확인한 뒤 진행했어요.

공개 전환 확인은 **2026-10-09 18:40:44 KST**예요. 새 **blue / loopback 8080 / 비루트 appuser / reserve_app / validate**와 같은 SHA 프론트 root `/usr/share/nginx/html/releases/6fdaafa36dc0a1340a75adea2243c9ef5c1829e4`를 함께 전환했어요. 기존 앱 환경값·키·고지 시각은 유지하고 profile/server env만 blue로 맞췄어요. Nginx는 새 blue를 Docker 내부 주소로 연결하며, 중지된 구 green의 DNS 재해석에 의존하지 않도록 보관된 내부 주소를 사용해요. 구 green으로 복구하지 않아요.

Nginx를 거치는 실제 release-id·HTML·자산·가게 API와 익명 개인 삭제 401 거부를 확인했어요. 고객 고지는 `2026-10-09T06:54:37Z`·intakeReady true·7일 파기를 유지하고 채팅은 90일·30일 유예·`2026-11-03T09:44:15Z`부터 활성화돼요. 기존 61행·가게 설정·원문/신고 증거를 보존했어요. 전환 후 읽기 전용 verifier에서 예약금/원장 위반과 결제·파일 삭제·OAuth 확인 필요 항목이 모두 0이고 새 앱 시작 ERROR/FATAL은 0이었어요.

서버 기본 읽기 verifier도 최종 main의 소스로 배치했으며 이전 설치본은 사전 보호 경로의 `runtime/previous-post-deploy-verify.sh`에 보존했어요. 새 역할/권한을 부여하지 않았고 실제 결제·환불·고객 메시지 삭제·IAM 확대를 실행하지 않았어요. 사전/사후 백업과 새 호환 복구 image/front 및 사후 별도 격리 복원은 [백업 런북](backup.md)을 따라요. 실제 휴대폰 QR·미지원 브라우저·일반 터치 확인은 사용자 확인으로 남기며 CSP는 Report-Only, Kakao eval 판단과 유예 종료 후 첫 채팅 파기는 아직 완료로 처리하지 않아요.

### 2026-10-09 CSP·초기 로딩·개발 도구 후속

사용자가 QR 체크목록의 기능은 정상이라고 확인했어요. 로그아웃 현장 QR, 로그인·동의 후 접수, 빠른 두 번 클릭, 호출·입장 QR·체크인, 접수 중지, 카메라 권한 거부 후 복구, 이동 후 카메라 종료, 미지원·내장 브라우저 항목에 대한 **사용자 확인**이에요. 휴대폰 모델·OS·브라우저 세부 정보는 받지 않았으며 독립 실기기 검사로 표시하지 않아요.

운영 `/`와 `/store/5`의 HTML은 200과 CSP Report-Only 헤더를 응답했어요. JS 자산의 헤더에서 이 문서 정책을 찾지 않아요. 확인된 Kakao 후속 스크립트 호스트만 두 로컬 HTML 정책에 추가했고, 지도 본체·services의 해당 HTTPS 스크립트는 200을 응답했어요. 현재 지도 본체에 eval 호출이 있고 사용자가 같은 실행 경고를 확인했으므로 전역 `unsafe-eval`을 허용하거나 강제 모드로 전환하지 않아요. 키·쿼리를 수집하거나 기록하지 않았어요.

운영 홈은 Codex 내장 Chromium의 PC 1280×720, CPU·네트워크 제한 없음에서 한 번씩 읽었어요. 캐시를 끈 방문의 FCP/LCP는 392/960ms, 캐시 사용 방문은 344/912ms였어요. LCP 대상은 첫 이용안내 데스크톱 배너예요. 휴대폰 결과나 반복 측정의 대표값으로 재사용하지 않아요. 측정 후 캐시 설정을 복구했어요.

운영 홈의 첫 로딩에서 전체 페이지 골격과 메신저 UI·문의 모달까지 요청되는 것을 확인했어요. 홈 골격의 클래스·구조·수량을 그대로 분리하고, import loader도 별도 함수로 두어 Vite가 삼항식의 두 modulepreload 목록을 합치지 않게 했어요. 최종 로컬 프로덕션 빌드의 홈에서 전체 골격·메신저 청크·문의 모달 요청이 모두 빠지고 제목과 홈이 정상으로 나타났어요. 운영의 50개 JS 요청/601,825 encoded bytes와 로컬 후보의 32개/399,316 bytes는 서로 다른 배포 입력·호스트의 관측이며 운영 개선률로 표시하지 않아요. HTML 기준 JS 예산은 348.8KiB gzip으로 350KiB 관문을 유지해요. Sentry 오류 보고·샘플링·개인정보 제한은 바꾸지 않았어요.

`patch-package`와 그 개발 의존성 경로 35개를 제거하고 Node 내장 API의 postinstall 적용기로 바꿨어요. 기존 rc-tabs·rc-util 1.13.0의 원본 패치와 ES/CJS 동작을 유지하며 버전·대상·문맥 불일치나 node_modules 밖 경로는 설치 실패로 처리해요. 다른 잠금 패키지 버전은 바꾸지 않았고 변경된 lock의 전체 npm 감사는 취약점 0건이에요. CI의 npm ci·postinstall·보안 관문은 유지해요.

[Dependabot #97](https://github.com/hanjeun/reserve/security/dependabot/97)은 실행하지 않는 2026-09-13 동결 lock만 대상으로 재확인한 뒤 `not_used`와 실제 설치/배포 경로 근거를 남겨 정리했어요. 현재 frontend의 source-map-js는 1.2.2예요. 동결 lock·manifest·ZIP의 전후 SHA-256은 같고 열린 Dependabot 경고는 0건이에요. 보관본의 취약 의존성이 패치됐다는 뜻은 아니며 실행 경로를 추가하면 재검토해요.

로컬 변경 파일 린트, 설치/CSP 관문 25개, 로딩·OAuth 단위 항목 73개, 프로덕션 빌드와 번들 예산을 확인했어요. 실패한 비동기 대기 검사와 추가한 캐시 전환 검사는 보완 후 해당 항목만 재실행했으며 전체 suite·실기기 행렬·Sonar는 실행하지 않았어요. 이 후속 코드·Nginx 정책은 **미커밋·운영 미적용**이며 v2.10.0의 기존 운영 적용과 구분해요. 이후 등록·수정 폼의 로컬 구현과 최종 확인은 다음 항목을 따라요.

### 2026-10-10 등록·수정 영역 분리와 오류 처리의 출시 전 기록

등록·수정을 9개 영역으로 분리하고 필드 소유권·진입·검증·미리보기 수정 목적지를 `storeOnboarding.js`에 모았어요. 무료 예약의 마감 미선택 수정과 결제·환불 필수 검사 불일치를 고쳤어요. 당시 결제 마감을 나중 결제에 연결한 안내·표시 오류는 남아 있었으며 아래의 새 로컬 후속에서 서버의 실제 정책에 맞춰 수정해요. 날짜·시간은 필드 전체의 중립색 포커스를 유지하고 시간 선택·결과를 24시간제로 맞췄어요. 역순·동일 시각 범위는 조용히 뒤집지 않아요. 로컬의 공휴일 API 응답과 표시 문제는 구분하며, 폼에서 선택·사용 불가 상태인 공휴일도 빨강을 유지해요. 사용 불가 상태와 회색 선택면은 유지해요. 새 가게 등록 CTA·실제 상세·등록 미리보기·사업자/사용자 이용안내를 함께 맞췄어요.

이전 초안의 단계·방문 기록과 서버 기준값을 보존하고, 영역별 수정의 누락과 의도적 해제를 구분해요. 서버 multipart에서도 휴무·운영 기간·인원·회차·마감·브레이크 누락은 기존 값을 유지해요. 예약 당시 0원도 확정 금액이므로 이후 가게 예약금으로 바꾸지 않아요. 아직 예약별 환불 정책 스냅샷을 추가하지 않았으며, 남아 있는 유료 예약이 있으면 가게 행 잠금 아래에서 실제 환불 조건 변경을 거절해요. 이 방안은 새 DDL이 필요하지 않아요. 예약별 환불 기준 저장과 이행은 별도 후보로 남겨요.

사용자가 받은 새 Dots 두 ZIP에서 카메라·브라우저 상태 3종과 정책 메뉴 3종을 연결했어요. 납품 해시 목록 50/52개와 이전 에셋 98개의 보존을 대조했으며, Blender·코드·PNG·WebP·원문 라이선스를 소스에 보존해요. Windows에서 대소문자만 다른 라이선스 이름 하나는 별도 이름으로 보존했고 내용과 납품 해시 목록은 바꾸지 않았어요. 원본 ZIP을 삭제하거나 Blender 재렌더링을 수행하지 않았어요. 프론트 산출물에 신규 6종과 두 묶음의 CC0/MIT 원문 고지를 확인했어요.

최근 2시간의 운영 로그를 읽기 전용으로 집계한 결과 미처리 오류 17건이 모두 `AsyncRequestNotUsableException`이었고, 뒤따른 exception-handler 경고도 17건이었어요. 끊어진 SSE 응답에 JSON을 쓰려던 경로를 별도로 처리하고 실패한 emitter의 중복 complete를 제거했어요. 일반 서버 오류의 500 응답은 유지해요. 운영 헬스는 200이며 이 수정은 아직 운영에 적용하지 않았어요. 같은 조회의 CSP 경고 로그는 6건이었으며 다른 오류로 합산하지 않아요.

CI/CD 활성 서버 감지는 고정 SSH fingerprint를 대조하는 전용 스크립트로 옮겼어요. 실패할 수 있는 SSH 출력은 `GITHUB_OUTPUT`에 스트리밍하지 않고 종료 코드와 단일 upstream 값을 확인한 성공 시점에만 한 줄로 기록해요. 환불 스키마·웨이팅/가입/개인 삭제 호환성, 실제 활성 서버의 health, 잘못된 fingerprint·중복 출력의 거절을 유지해요. 기존 실패 run을 성공으로 바꾸거나 복구 표식만 붙여 우회하지 않았어요.

변경된 프론트/가이드 101개, 백엔드의 등록·수정·결제·환불·권한·SSE/웨이팅 69개, 실제 shell 실패/성공 경로를 포함한 CI/CD 관문 25개를 확인했어요. 검사 코드의 역할 조회·캐시 간섭·빈 값 표현을 보완하고 실패한 항목만 다시 확인했어요. 병행 빌드 중 시간 제한에 걸린 결제 시점 전환 항목은 동일 기본 제한으로 단독 확인했어요. 변경 파일 린트와 프론트 프로덕션 빌드가 통과했으며 초기 JS는 349.0KiB gzip, 가장 큰 청크는 436.3KiB예요. 350/600KiB 관문은 바꾸지 않았어요. 백엔드 bootJar·136개 운영 의존성 고지 생성이 통과했고, 실제 JAR에 새 환불 관문·결제·SSE·개인 삭제 클래스와 최종 프론트 HTML이 들어 있음을 확인했어요. 로컬 프리뷰 버전 2.9.0의 패키징 결과이며 새 출시 버전·SHA의 산출물로 간주하지 않아요. 이전 동일 입력의 npm 감사 0건·로딩 확인 근거는 위 기록과 구분해요.

새 출시 SHA·버전·원격 CI, 적용 직전 새 백업/격리 복원, 새 JAR의 실제 MySQL validate와 호환 복구 이미지·프론트, 운영 배포·이후 로그 감소는 아직 완료로 표시하지 않아요. 실제 휴대폰 QR·동의·중복·호출/입장·권한 복구·이탈 종료·미지원 흐름은 사용자가 정상이라고 확인했지만 기기/OS/브라우저별 근거를 대신하지 않아요. 이번 9개 영역의 일반 화면·휴대폰 사용감과 Kakao eval의 강제 CSP 대응은 남아요. 영상통화는 [후속 설계](architecture.md#영상통화-후속-설계-미구현)만 준비했어요.

#### 같은 프리뷰의 QR 복귀·로그인 로고·웨이팅 상세 출시 전 보완

`redirect.js`에서 해시·인코딩·경로 정규화 뒤에도 로그인/콜백으로 복귀하지 않도록 검사하고, `Login.jsx`는 router state가 우선이어도 이전 저장 경로를 소비해요. `OAuthCallback.jsx`는 이미 디코딩된 오류를 다시 디코딩하지 않고 서버가 반환한 약관 동의 상태를 확인해요. `WaitingJoin.jsx`는 현장 접수 주소의 fragment를 로그인·동의 전에 같은 탭에 보존하며, 이미 로그인·동의한 고객은 인증 주소로 이동하지 않고 접수 폼을 열어요. 이 보완은 코드와 자동 검사 근거이며, 사용자가 본 휴대폰의 OAuth 주소가 잠깐 표시된 것인지 계속 멈춘 것인지와 스캔 앱/브라우저는 아직 답변을 기다려요. 현장 QR 자체는 가게 주소로 생성돼요.

`Login.jsx`의 구글 로그인 원형 바탕을 테마와 무관한 흰색으로 고정했어요. `waiting.css`는 고객/사업자 리스트에 PC 20px·모바일 16px 좌우 여백과 버튼 줄바꿈을 적용하고 `WaitingSkeleton.jsx`도 같은 구조를 써요. `MyWaiting.jsx`·`WaitingTab.jsx`의 항목은 공통 `WaitingDetailModal.jsx`에서 목록 조회로 권한이 확인된 접수만 읽기 전용으로 보여줘요. 대기번호·인원·접수/호출/입장·취소 시각과 고객의 앞선 팀 수를 확인하며, 새 API·회원 연락처·QR 토큰을 상세에 추가하지 않아요. 실시간 목록 갱신과 계정 경계에서 상세도 갱신·폐기해요. 취소·호출·입장 QR은 상세 열기의 클릭 영역과 분리해요.

관련 로그인·세션·웨이팅 검사 121개를 확인했어요. 새 상세 조회 버튼과 기존 가게 링크의 의미 변경, 로딩 status와 경로 probe의 중복 조회 때문에 실패한 3개 검사만 고쳐 재확인했고, 주소 검사 구현의 린트 수정 후 해당 관문과 OAuth 검사도 다시 확인했어요. 변경 파일 린트와 최종 프론트 빌드가 통과했으며 초기 JS 349.1KiB gzip·최대 청크 436.7KiB로 기존 제한을 유지해요. 일반 PC/휴대폰 화면·실제 QR 재현·새 변경의 운영 적용은 아직 확인하지 않았어요. 이 프론트 빌드 이후 새 JAR를 다시 패키징하거나 새 출시 SHA로 간주하지 않았어요.

## v2.11.0 첫 자동 배포 실패와 재시도 성공

기능 PR [#330](https://github.com/hanjeun/reserve/pull/330), 릴리스 PR [#331](https://github.com/hanjeun/reserve/pull/331), dev 계보 복구 PR [#332](https://github.com/hanjeun/reserve/pull/332)를 거쳤어요. 실제 main은 `cfa3702fdb66c19f8f31e3edf95945a1d0b49294`, dev는 `b3db85c4d05b60801d531c1c70acf8bd2aea2d65`이며 main은 dev의 조상이고 두 트리는 같았어요. [v2.11.0 릴리스](https://github.com/hanjeun/reserve/releases/tag/v2.11.0)는 **2026-10-10 03:09:04 KST**에 게시됐어요. 출시 작업트리나 혼합 프리뷰의 브랜치 이름·패키지 값만으로 운영 버전을 판정하지 않아요.

| 실행·기록 | 실제 결과 |
|---|---|
| [CICD 37968923585 attempt 1](https://github.com/hanjeun/reserve/actions/runs/37968923585/attempts/1) | 테스트 증거 확인·프론트 빌드·백엔드 빌드·stage 성공. 배포 잡 `113951701453`은 `Conflict. The container name "/green" is already in use`로 exit 1, 2026-10-10 02:53:19 KST 실패 |
| production Deployment `6967408645` | 2026-10-10 02:53:20 KST `failure` 보존 |
| [같은 CICD attempt 2](https://github.com/hanjeun/reserve/actions/runs/37968923585/attempts/2) | 실패한 배포 잡만 재시도. `113952550686`은 02:54:54–02:56:16 KST 성공. 앞선 성공 빌드·stage를 재실행한 것으로 표시하지 않음 |
| production Deployment `6967449626` | 2026-10-10 02:56:17 KST `success`. 이 값은 GitHub 성공 기록 시각이며 실제 공개 전환의 정확한 순간으로 대체하지 않음 |
| [CodeQL 37968923709](https://github.com/hanjeun/reserve/actions/runs/37968923709) | 성공 |

테스트 잡은 입력·도구·성공 실행·해시·유효기간 관문을 통과한 기존 CI 증거를 재사용했어요. 새 테스트 전체를 실행했다는 뜻이 아니에요. 운영 빌드의 초기 JS는 **349.2KiB gzip / 350KiB**, 최대 JS 청크는 **436.8KiB 원본 / 600KiB**였고 전체 npm 감사는 취약점 0건이었어요. 350KiB 예산은 HTML에 연결된 초기 JS만 합산하며 첫 라우트의 동적 import까지 포함하는 실제 첫 방문 다운로드 총량과는 달라요. 이전 v2.9.0 성능 표본이나 routing으로 HTTP cache가 비활성화된 표본을 v2.11.0 개선율·정상 사용자 캐시 효과로 해석하지 않아요.

같은 main SHA의 이미지·프론트를 운영 **green / loopback 8081 / appuser / reserve_app / ddl-auto=validate**로 확인했어요. 이미지 계약은 `reserve.schema-compat=v270-refund-v1`, `reserve.feature-compat=waiting-signup-hidden-v2`예요. `nginxserver`의 실제 upstream과 `$service_url`은 green, root는 `/usr/share/nginx/html/releases/cfa3702fdb66c19f8f31e3edf95945a1d0b49294`였어요. 공개 `release-id.txt`도 같은 SHA이며 앱의 내부 `/actuator/health`는 UP였어요. 공개 SPA 경로의 200 응답을 앱 health로 대신하지 않아요.

읽기 전용 배포 verifier는 예약금·원장 위반과 확인이 필요한 결제·파일 삭제 항목 0건을 확인했어요. 새 green 시작 뒤 `2026-10-09T17:56:16Z`부터 조회한 로그는 ERROR 0·WARN 2·기존 닫힌 SSE 오류 서명 0·heartbeat 52건이었어요. 이는 해당 조회 범위의 결과이며 모든 과거 로그·실기기 화면 확인을 뜻하지 않아요. 첫 자연 백업은 **2026-10-10 03:10:01–05 KST**, 36테이블·`reserve-20261009-181001.sql.gz` 업로드 성공이었어요. 이 읽기 전용 후속에서 새 독립 S3 다운로드나 격리 복원을 다시 실행한 것은 아니에요. DDL 11→12→13→14, 전체 35개 모델 validate, 기존 61행·원문·신고 증거 보존, 사전·사후 독립 S3 읽기·격리 복원과 개인 삭제 지원 복구 묶음은 v2.10.0의 [백업](backup.md)·[DDL](manual-ddl.md) 근거를 구분해 유지해요.

v2.11.0에는 SSH 출력 처리·SSE 오류 보완·개발 도구 적용기·Kakao 후속 스크립트 정책·납품된 카메라/브라우저 3종과 정책 메뉴 3종 그림이 포함됐어요. 위 출시 전 기록의 "미커밋·운영 미적용"은 당시 단계의 기록이며 이 항목이 완료 범위를 갱신해요. 카메라 권한 거부·기기 사용 불가·실제 브라우저 미지원은 구분하고, BarcodeDetector는 선택적 추적 가이드로 실제 Html5Qrcode 디코더와 별개예요. iPhone Chrome 현장 QR 복귀의 전체 페이지 이동 보완 이후 실제 휴대폰 재확인은 남아 있어요.

[v2.9.0 자동 실행 37892549557](https://github.com/hanjeun/reserve/actions/runs/37892549557)과 [v2.10.0 자동 실행 37909670737](https://github.com/hanjeun/reserve/actions/runs/37909670737)은 실패 기록을 그대로 유지해요. v2.10.0의 별도 승인된 첫 호환 전환은 production Deployment `6957907420`과 **2026-10-09 18:40:44 KST** 공개 전환 근거로 구분해요. 첫 호환 전환은 새 스키마·백업·validate·호환 복구 묶음을 준비하는 별도 절차였고, 일반 자동 배포는 기존 live와 후보 양쪽의 호환성·health·스키마·복구 관문을 요구해요. 비활성 컨테이너 이름 충돌은 자동 배포 후속으로 남기며 실패를 지우려고 재배포하거나 호환 관문을 약하게 만들지 않아요.

CSP는 Report-Only를 유지해요. Kakao 진입 SDK `dapi.kakao.com`, 후속 스크립트 `t1.kakaocdn.net`, eval 호출의 Console·요청 출처를 따로 판단하며 앱 전체 `unsafe-eval`을 추가하지 않았어요. 채팅 유예 종료 후 첫 자연 파기·보류·파일 삭제 결과는 아직 확인 전이고 기존 `reserve-2` 예약은 중복 생성하지 않아요. 영상통화 구현과 js-yaml 5·Sentry React 11 메이저 변경도 이 출시의 완료 범위에 포함하지 않아요.

### 2026-10-10 결제 제한 안내와 스켈레톤 로컬 후속

결제 마감의 질문·필드 표시·필수 검증·등록 요약·실제 상세 미리보기·상세 결제 안내·연결된 가이드를 서버 정책에 맞춰요. 결제 마감은 나중 결제를 허용하지 않는 유료 예약에 적용하고, 나중 결제 허용·제한 없음(0)에는 미결제 자동 취소 안내를 붙이지 않아요. 로딩 중 고정 문구와 사진·그림의 누락도 공통 텍스트/이미지 로딩 관문으로 보완해요. 이 로컬 후보는 **운영 미적용**이며 v2.11.0의 검사 결과와 구분해요.

### 2026-10-11 전체 탭 스와이프·SNS 첫 출시의 로컬 구현

사용자가 전체 탭 스와이프와 모든 회원의 SNS 첫 출시 범위, 노쇼 예약금 상한 10만 원, 피드의 즉시 비공개·30일 후 원문/사진 파기를 승인했어요. 모바일 홈→탐색→혜택→웨이팅→피드는 큰 한 손가락 가로 제스처로 인접 탭 한 개를 이동하고, 세로 스크롤·사진/달력/입력·확대·열린 모달/메신저·가장자리 뒤로가기를 보호해요. 탭별 URL 필터와 스크롤 위치를 기억하며 이동한 화면과 터치 제어 코드는 필요할 때 지연 로딩해요. 실제 실기기 사용감은 확인이 남아 있으며 새 번들 검사는 아래 10/12의 최종 로컬 입력 기록을 따라요.

SNS는 공개 닉네임·소개와 선택한 계정 사진, 글·여러 사진·초안·실제 게시물 카드 미리보기, 게시/수정/삭제·내 글, 최신/지역/관심 가게/작성자 목록과 상세·공유 링크를 구현했어요. 사업자는 본인 가게·기존 혜택과 예약·웨이팅·문의를 연결해요. 신고 당시 원문/사진의 별도 스냅샷, 관리자 숨김/복원/보류/처리와 열람 기록, 기간 파기와 파일 삭제 outbox도 포함해요. 좋아요·저장·팔로우·댓글·알림·영상 및 AI·유료 혜택·MFA·영상통화는 후속이며 이번 구현 범위에 넣지 않아요. 예약금 입력의 새 0~100,000원 저장 관문은 기존 예약·결제 금액을 다시 쓰지 않아요.

이번 읽기 전용 재확인에서 운영 main/프론트 `release-id.txt`와 nginx 릴리스 root는 `cfa3702fdb66c19f8f31e3edf95945a1d0b49294`, 활성 green의 health는 UP·실행 사용자는 appuser·DB_USERNAME은 reserve_app·ddl-auto는 validate였어요. v2.11.0 attempt 1 실패와 attempt 2 성공, Deployment `6967449626` 성공을 구분해 유지해요. 실제 DB 계정 grant를 다시 검사한 결과로 확대하지 않아요. 공개 CSP 헤더는 Report-Only이고 dapi/t1 출처가 분리돼 있으며 unsafe-eval은 없어요. 10/12에 실제 eval Console/요청 출처와 현재 운영 버전의 첫 방문·재조회 LCP를 확인한 결과와 표본 한계는 [모니터링 문서](monitoring.md)에 기록했어요. Security #97은 동결 lock의 별도 `source-map-js` 경고로 dismissed 상태였으며 동결 원본의 취약 의존성이 수정됐다는 뜻은 아니에요. `reserve-2`의 기존 11월 3일 19:05 KST 확인 예약은 ACTIVE로 확인했고 새 예약은 만들지 않았어요.

10/11 작성 시점에는 새 피드 API를 실행 중인 로컬 백엔드에 적용하지 않았으며 검사·키 생성도 실행 전이었어요. 이후 10/12에 별도 로컬 키·사진 저장소·새 JAR 연결과 배포 준비 검사를 진행했어요. 로컬 코드는 계속 미커밋·운영 미적용이에요. `FEED_ENABLED=false`만으로 새 JAR의 스키마 검증을 우회할 수 없어요. [DDL 15절](manual-ddl.md#15-sns-피드-로컬-구현-운영-미적용)의 6개 모델과 별도 사진 키, 새 운영 백업·전체 모델 validate·피드 원문/암호문/키를 지원하는 복구 이미지/프론트는 첫 운영 전환 입력으로 다시 준비하고 확인해야 해요. 기존 waiting-signup-hidden-v2 표식은 SNS 호환성의 근거로 확대하지 않아요.

사용자는 같은 날 혜택의 가게 소식 작성 누락을 확인하고, 혜택/피드 같은 원본·피드 노출 해제, 제목/본문/사진 6장·임시저장·실제 미리보기·내 소식·수정/삭제, 소식/공지/행사/혜택과 기간/조건을 첫 출시 범위로 선택했어요. 기간이 지난 행사는 진행 목록에서 제외하고 상세/피드에 종료 표시로 남기며, 삭제는 두 화면에서 즉시 숨기고 30일 뒤 원문/사진을 파기해요. 로컬 구현은 혜택과 파트너 패널의 작성/관리 경로, 공통 원문 편집, SNS에서 기존 소식 선택, 양쪽 신고·관리자 숨김/복원과 독립 보존, 기존 소식의 폐업/탈퇴 soft-delete까지 연결해요. `promotion`에는 메타데이터·상태·revision의 추가 DDL이 필요하며 후보만 15절에 기록했어요. 기존 제목·본문·업종·ID·주소를 보존하고 과거 소식을 피드에 자동 게시하지 않아요. 실제 쿠폰/할인 결제는 후속이에요. 10/11의 검사 미실행·기존 로컬 백엔드 미적용 상태는 아래 10/12 기록으로 갱신됐으며 v2.11.0 운영 성공 근거와 구분해요.

### 2026-10-12 로컬 후속과 SNS 첫 호환 전환 준비

같은 프리뷰 브랜치에서 소식 작성 아이콘은 작성기를 바로 열고 내 소식 관리 아이콘은 파트너 소식 탭으로 이동하게 분리해요. 작성 불가 이유는 hover·포커스·클릭에서 안내해요. 웨이팅 가게 목록의 접수 상태·전체 활성 팀 수는 페이지에 포함된 가게만 집계하며 고객 신원·QR은 공개하지 않아요. 익명 목록은 화면 활성 중 30초 갱신과 복귀 조회를 사용하고 회원의 개인/직원 보드는 기존 SSE·폴링을 유지해요.

사용자가 승인한 로컬 피드 사진은 Git 밖 전용 폴더에 AES-GCM 암호문으로 저장하며 새 전용 키를 사용해요. 이전 사진·DB·키를 옮기거나 덮지 않아요. 로컬 Redis 8.2.9는 loopback·전용 인증·데이터 64MiB/noeviction·컨테이너 128MiB·TTL·RDB/AOF 비활성으로 기동했어요. 새 후보 JAR를 로컬 프로필·`validate`로 연결하고 health UP·알림 subscriber 1개를 확인했어요. 실제 Lua의 5회 허용/6회 거절·TTL·구간 회복과 합성 변경 알림의 subscriber 전달을 확인했어요. 접수/QR 요청 제한 공유 외의 MySQL 접수·중복 방지·호출·입장은 유지해요. 실제 Lettuce가 응답하지 않는 별도 loopback 연결에서 유한한 Bucket4j 복귀·6번째 요청 거절·재시도 backoff를 확인했으며 실행 중 Redis를 중지하거나 데이터를 비우지 않았어요. 재연결 조회·폴링을 유지하며 Redis 운영 설치/설정은 하지 않아요.

읽기 전용 재확인의 main/프론트는 `cfa3702fdb66c19f8f31e3edf95945a1d0b49294`이며 운영 green의 loopback health UP·appuser·reserve_app·validate를 확인했어요. attempt 1 실패/attempt 2 성공 기록은 유지해요. 앞선 승인 정책 추가 전 후보의 호환 표식은 `waiting-signup-hidden-feed-v3`이며 기존 v2 이미지는 SNS의 원문·사진·30일 파기와 소식 soft-delete를 지원하는 복구 묶음으로 취급하지 않아요. 첫 SNS 전환은 승인 정책을 포함한 새 v4 후보와 [DDL 15절](manual-ddl.md#15-sns-피드-로컬-구현-운영-미적용)의 새 스키마·전체 JAR 제한 계정 validate·새 백업/격리 복원·새 호환 이미지/프론트/키·설정을 준비하고 별도 승인으로 진행해요. 그 전에는 일반 자동 배포가 v2 live에서 차단되는 것이 정상이에요. 후보 compose에는 `FEED_ENABLED=false`를 기본으로 두고 실제 활성화에는 별도 피드 키를 요구해요. v2.10.0의 별도 전환과 v2.11.0의 자동 실행 기록을 다시 배포해 지우지 않아요.

로컬 배포 준비 검사에서 프론트·백엔드 전체 검사를 한 번 실행하고 실패 수정 후 해당 항목만 다시 확인했어요. 최종 Playwright 결과는 처음 통과한 218개와 수정 뒤 재확인한 8개, 의도된 스킵 4개로 구분해요. 마지막 전체 230개를 다시 실행한 결과는 아니에요. PC·모바일 소식/일반 회원의 글·사진 작성 4개는 API fixture 검사이며 실제 운영 업로드의 근거로 확대하지 않아요. 실제 MySQL의 가입 5개·개인 메시지 숨김 3개는 실패/스킵 0으로 통과했고, 최종 새 JAR의 624개 클래스·142개 라이브러리·루트 ORM 매핑으로 제한된 앱 계정의 41개 모델 validate를 통과했어요. 라이선스 142개·전체 npm 감사(모든 등급 0)·필요한 vendor postinstall 패치도 확인했어요.

최종 프론트 빌드는 초기 JS **348.9KiB gzip / 350KiB**, 최대 청크 **558.9KiB / 600KiB** 관문을 통과했어요. Sentry Replay는 초기 앱 시작 후 유휴 시점에 지연 로딩하며 기본 오류/트레이싱 수집과 개인정보 마스킹을 유지해요. 초기화 전 DOM 기록의 한계와 실제 현재 운영 버전의 Kakao·LCP 관측은 [모니터링 문서](monitoring.md)에 구분해요. 실제 새 JAR로 만든 로컬 후보 이미지는 appuser·`waiting-signup-hidden-feed-v3`·`v270-refund-v1`과 클래스 포함 관문을 확인했어요. 이 프리뷰 브랜치의 혼합 산출물은 운영 릴리스 입력이 아니며 정식 변경 선택·새 운영 백업/호환 복구 입력·명시적 승인 전에 Git 쓰기나 운영 적용을 하지 않아요.

### 2026-10-12 사용자 화면 후속과 로컬 실행 복구

02:18에 `backend/build/libs`의 JAR를 실행한 채 02:56에 같은 파일을 다시 만들었고, 이후 CORS 처리·가게 검색 등에서 ClassNotFound/NoClassDefFound 오류가 발생했어요. health 200만으로 실제 조회 정상이라고 판단할 수 없었어요. 기록된 프리뷰 프로세스만 종료하고 SHA별 Git 밖 실행용 사본으로 새 JAR를 시작했어요. 이후 현재 8080은 사용자의 IntelliJ 실행이 사용 중이며 health·가게·지역·공개 소식·작성 설정의 읽기 요청이 200임을 확인했어요. `scripts/start-local-preview-backend.ps1`은 기존 포트 사용 중이면 중단하고, 빌드 JAR의 해시가 같은 읽기 전용 사본·local 프로필·loopback·validate로 실행해요. 기존 IDE 환경 입력은 값 출력 없이 재사용하고 기존 키/DB/로그를 덮지 않아요. 스크립트가 반환한 PID는 시작 결과이며 그것만으로 health 성공을 주장하지 않아요.

소식 작성/관리 아이콘의 기본 회색 배경을 투명으로 바꾸고 hover/포커스 회색만 유지했어요. 지역 모달의 전용 flex/폭 CSS가 compact DataState 배치를 덮던 부분을 수정하고 제목·보조 안내·재시도를 같은 열에 맞췄어요. 로고 홈 이동은 준비된 홈 영역만 짧게 들어오도록 연결하며 새 탭 열기와 모션 최소화를 보존해요. 전체 지역 화살표는 공통 필터 회전을 사용해요. 가게 사진은 이미 로드된 같은 사진 주소의 슬라이드/복제본에 로딩 골격을 다시 얹지 않고, 홈 배너는 다음 반응형 사진 디코딩 후 이동하며 기다리는 동안의 다른 이동·페이지 숨김·언마운트를 확인해요. 실제 Vite 모듈 응답과 열린 혜택 화면은 확인했지만 이번 추가 수정의 테스트·린트·생산 빌드·자동 브라우저 검사는 실행하지 않았어요. 위 348.9KiB와 이전 검사 결과를 이 추가 입력의 통과 근거로 재사용하지 않아요.

2026-10-12의 후속 로컬 후보에 혜택 탭 전용 관리자 신청/승인, 사진 1~6장 필수, 승인 내용 변경 후 재심사와 감사 경로를 추가했어요. `promotion.benefit_*` 컬럼·심사 인덱스 및 단계별 모달/아이콘 변경 이후 테스트·린트·빌드·브라우저·전체 JAR validate는 실행하지 않았어요. 앞선 10/12의 성공 검사는 이전 후보의 기록이며 새 승인 정책을 증명하지 않아요. 8080의 기존 로컬 설정 조회에는 `benefitApprovalEnabled`가 없어 프론트는 승인형 혜택을 준비 상태로 닫아요. 기존 사용자 실행 프로세스는 중지하지 않았고, 새 JAR 생성/연결과 추가 로컬 DDL도 진행하지 않았어요. 다음 배포 준비 입력에는 `manual-ddl.md` 15.1절의 후보와 새 승인 정책을 포함한 새 호환 복구 JAR/프론트가 필요해요. 이후 후보의 호환 표식/일반 자동 배포 관문은 `waiting-signup-hidden-feed-v4`이며 이전 v3 이미지를 다시 표시해 복구 입력으로 쓰지 않아요. 운영 DDL·설정·배포 및 Git 작업은 적용하지 않았어요.
### 2026-10-12 피드 재사용·임시저장·좋아요·댓글 후속

사용자는 종합 좋아요를 통합 목록과 대상별 기록으로, 댓글은 공개 닉네임의 글 댓글·한 단계 답글·본인 수정/삭제·신고와 관리자 숨김으로 선택했어요. 가게의 기존 favorite는 보존하고 같은 가게 소식의 혜택/피드 좋아요는 promotion ID로 공유해요. 댓글 사진·댓글 좋아요·알림은 후속이에요. 원문/댓글 공개 권한, desired-state 좋아요, 요청 UUID·revision·계정 세대, 30일 댓글 원문 파기와 독립 신고 보존/보류/열람 감사를 후보에 추가했어요.

피드 위치 버튼과 작성 지역은 탐색의 RegionSheet를 공유하고, 피드/소식/미리보기 사진은 실제 가게 상세에서 추출한 PhotoGallery와 같은 확대 보기·모바일 스와이프를 써요. 피드 행의 본문/빈 영역은 키보드와 새 탭 열기를 지원하는 상세 링크이고 사진·작성자·좋아요 등의 별도 동작은 유지해요. 모바일 작성 모달의 데스크톱 centered 여백 충돌을 해당 모달 범위에서 수정했어요. 닫힌 AntD 본문의 memo 때문에 편집 초기화가 재실행되지 않던 부분은 열기 세대와 최신 상세 조회로 바꾸고, 임시저장 저장 후에는 내 임시저장 목록으로 연결해요. Modal 자체의 key는 바꾸지 않아요.

로컬 DESKTOP-2R1IST7:3306/reserve의 읽기 조회에서 region VARCHAR(50), 혜택 승인 5개 컬럼/심사 인덱스, content_like/feed_comment/feed_comment_report와 unique/CHECK/FK 및 CASCADE/SET NULL을 확인했어요. 사진 2장이 붙은 기존 DRAFT(id 1)는 남아 있고 다른 DRAFT(id 2), 새 PUBLISHED(id 3)도 별도 행이에요. 원문 내용·프로필·키 값은 출력하지 않았어요. 8080의 읽기 설정은 좋아요/댓글 enabled=true·댓글 1000자·답글 한 단계, 소식 사진 enabled=true·6장·7MiB·benefitApprovalEnabled=true예요. 앞의 미적용/옛 서버 설정 기록은 당시 상태이며 이 조회가 로컬 현재 상태를 갱신해요. 이 후속 작업에서 DDL/DML·백업 생성·서버 중지/재시작은 실행하지 않았어요.

테스트·린트·빌드·자동 브라우저·새 전체 JAR validate는 아직 실행하지 않았고, 설정/스키마 읽기를 작성·좋아요·댓글·신고의 실제 쓰기 성공으로 확대하지 않아요. 권한/중복/삭제·보존 경계의 검사 소스와 DDL 후보를 준비했으며 최종 입력에서 확인해야 해요. 현재 후보의 자동 배포/복구 관문은 waiting-signup-hidden-feed-v5이고 이전 v3/v4 이미지의 재표시로 대신하지 않아요. 운영 설정·DDL·배포와 Git 쓰기는 하지 않았어요.


### 2026-10-13 피드·혜택 분리 및 피드 도구줄 후속

사용자의 후속 선택으로 피드와 혜택의 동시 게시·소식 연결·피드 미리보기를 제거했어요. 앞의 동일 소식 공유 정책은 당시 선택이며 현재 후보에는 적용하지 않아요. 일반 피드는 공개 닉네임으로 별도 작성하고 혜택은 공개 닉네임 없이 가게 이름으로 사진 1~6장·관리자 승인·수정 재심사를 사용해요. STORE_NEWS_ENABLED와 혜택 사진 읽기/업로드를 독립 경로로 두며 기존 원문·사진·신고 자료는 유지해요. NEWS 좋아요와 POST 좋아요는 별개이고 통합 좋아요 목록에서 함께 볼 수 있어요. 쿠폰 발급·사용 기능을 추가하지 않았고 목록의 표시는 일반 제목 배지로 바꿨어요.

피드 제목·바깥 여백은 공통 페이지 제목/혜택 컨테이너를 사용하고 글은 가운데 640px 열을 유지해요. 왼쪽 작성/임시저장 폴더와 오른쪽 위치/보기 메뉴, 16px 본문/피드로 링크, 드래그 중 스냅 중단·animation frame 반영·놓을 때 정렬과 모션 최소화 처리를 적용했어요. 공통 FilterMenu의 비어 있던 transitionName을 기본 모션으로 복원했어요.

이번 후속의 테스트·린트·빌드·자동 브라우저·전체 JAR validate는 실행하지 않았어요. 운영 설정·DDL/DML·키 변경·서버 중지/재시작과 Git 쓰기는 하지 않았어요. 새 백엔드 코드/독립 설정과 현재 프론트를 같은 최종 후보로 실행해 권한·사진·초안·승인·재심사·신고 보존을 확인해야 하며 앞의 성공 기록을 현재 후보 통과로 표현하지 않아요.

### 2026-10-15 댓글 확장·로컬 삭제·주소 분리 후보

댓글 사진·댓글 좋아요·댓글 알림을 지원하는 후보예요. 사진은 기존 암호화 업로드·소유권·정렬/확대 틀을 재사용하고 글/소식/댓글 좋아요는 desired-state PUT과 통합 목록을 공유해요. 알림은 앱 내부 목록과 안 읽은 개수/읽음 처리이며 클릭하면 해당 댓글·답글로 이동해요. 자기 반응은 알리지 않고 같은 회원·작성자·댓글·종류의 이벤트를 중복 생성하지 않아요. 90일 보관과 삭제/숨김/탈퇴 제외를 적용해요. 댓글 신고 사진은 원문과 독립된 증거 참조·관리자 열람 경로·감사를 사용해요. 이메일/브라우저 푸시는 포함하지 않아요.

피드 폴더의 재클릭은 최신 목록으로 돌아오고 일반 관리 목록에서 삭제한 글/소식을 제외해요. 로컬 `127.0.0.1:3306/reserve`의 호스트·DB·삭제 상태·연결을 확인한 뒤 한 트랜잭션으로 삭제 글 4건/소식 2건/미디어 4건을 제거했어요. 피드 DRAFT 2건/PUBLISHED 1건·소식 DRAFT 1건을 보존했고 별도 파일 삭제 의도 4건은 이후 모두 COMPLETED로 확인했어요. 댓글 확장 DDL의 새 컬럼 3개/테이블 2개도 같은 로컬 DB에 적용했어요. 운영 DB나 기존 원문/암호문/키를 일괄 정리한 작업은 아니에요.

내 정보 패널/탈퇴 처리·예약 선택·광고 작성 값·QR 시작/종료와 서버의 가게 조회/사진/통계·예약 가능 시간/QR/완료/노쇼·공통 소유권 정책·결제 준비 책임을 분리했어요. 서비스 진입점·원장·멱등성·기존 트랜잭션 경계와 logger 이름을 유지하는 소스 변경이며 실제 저장/결제/카메라 동작의 새 성공 근거는 없어요. 좋아요는 요청 당시의 대상/캐시 키/계정 세대를 고정하며 새 댓글 기능은 서버의 지원 설정이 있을 때 표시해요. 모바일 메뉴/뒤로가기 그림을 각각 2px 가까이 맞추고 결과 전환/답글 펼침·접힘/late-loaded 3D 모션을 공통화했어요. 첫 날짜 선택 즉시 표시와 모션 최소화는 유지해요.

앱과 홍보 분리는 소스/선택형 배포 연결까지 준비했어요. `SiteUrls`/프론트 주소 관문, `marketing/`, 사진을 포함한 `/drafts/transfer`, 기존 주소 OAuth 허용 목록, `scripts/prepare-domain-split.mjs`의 Nginx 후보 생성과 `scripts/domain-release.sh`의 산출물 포인터 전환/복구를 추가했어요. `RESERVE_DOMAIN_SPLIT` 기본값은 false이며 이 변수나 운영 구성은 실제로 변경하지 않았어요. 앱·홍보·기존 초안 복구 앱을 같은 SHA로 묶고, 기존 `/api`·OAuth 진입/콜백은 일괄 리다이렉트하지 않아요. 일반 공개 링크는 대응하는 앱 경로로 302 이동하며 쿼리와 QR fragment를 보존하는 구성이에요.

**이 후보의 최종 검사와 새 JAR validate는 실행 전이에요.** 이전 188건/격리 HTTP 4건/모션 4건은 이전 입력 결과예요. 10/16 전체 후보의 현재 호환 표식은 `waiting-signup-hidden-feed-oauth-v7`이며 아래의 첫 v7 절차에서 피드 DDL과 16절 OAuth 키/복구 지원을 함께 준비해요. 구 댓글 모델·사진 파기나 활성 토큰 형식을 지원하지 않는 앱은 복구에 쓰지 않아요. 앱 인증서 발급·갱신 모의시험은 아래 10/15 기록처럼 완료했고 사용자는 로그인 리디렉션 URL 추가 완료를 전달했어요. 실제 앱 HTTPS 제공·전환, 등록 목록 대조와 로그인 왕복, 운영 DDL·실제 PG 확인은 남아 있어요.

<a id="첫-v6-및-도메인-전환-순서"></a>

#### 첫 v7 및 도메인 전환 순서

1. 정식 반영 범위와 최종 빌드·운영 설정을 확정해요. 준비 중에는 `RESERVE_DOMAIN_SPLIT=false`와 feature SHA 산출물을 사용할 수 있지만, 실제 도메인 분리용 **최종 main SHA의 빌드·staging 전에는 승인된 `RESERVE_DOMAIN_SPLIT=true`를 고정**해요. 이 값이 `VITE_APP_ORIGIN`, 같은 출처 API, marketing 아티팩트와 Nginx 후보를 결정하므로 false로 빌드한 뒤 전환 때만 true로 바꾸지 않아요.
2. 승인된 main squash 뒤 새 main SHA로 앱·홍보·JAR·실제 v7 이미지를 새로 빌드하고 필수 검사와 산출물 바이트·해시를 연결해요. feature SHA의 로컬 검사·JAR·이미지나 같은 release-id만으로 최종 main 산출물을 대신하지 않아요. 현재 v2 live를 거부하는 자동 배포 결과는 유지하고 일반 자동 배포의 live/target=v7 관문을 약하게 만들지 않아요.
3. 실제 DNS·앱 인증서/ACME 경로, 기존·앱 호스트의 Google/Naver/Kakao 로그인 Callback과 Kakao 지도·PG 복귀 등록을 대조해요. 아래의 10/15 발급·등록 전달 기록은 보존하되 필요한 항목만 재확인해요. 새 앱 설정 `APP_FRONTEND_URL=APP_PUBLIC_URL=https://app.reserve.it.kr`, `APP_MARKETING_URL=APP_LEGACY_FRONTEND_URL=https://reserve.it.kr`가 앞서 빌드에 고정한 VITE 출처와 일치하는지 대조하고 현재 키·고지 시각을 보존해요. 공급자 보안 사건 수신 3종은 최종 검증·공급자 등록·별도 활성화 승인 전까지 false를 유지해요.
4. [수동 DDL](manual-ddl.md) 15절 본문·15.1~15.8 및 16절과 실제 운영 스키마를 대조해 미적용 정의만 의존 순서대로 선별해요. 별도 승인된 유지보수에서 공개 트래픽·새 쓰기를 닫고 **구 v2 JVM을 종료해 writer 0을 확인한 뒤** 직전 백업·독립 S3 읽기·운영과 같은 MySQL의 격리 복원을 진행해요. 최종 main의 실제 전체 JAR로 원래 값·제약·FK·인덱스와 선별 DDL·제한 계정 `validate`를 확인한 뒤 승인된 DDL 계정으로 운영에 적용해요. flag=false여도 새 엔티티는 검증 대상이며 이전 v6의 47테이블 연습은 v7의 전체 검증을 대신하지 않아요.
5. 구 JVM이 종료된 유지보수 상태에서 최종 main의 **새 v7 JVM 하나**를 기동하고 제한된 앱 계정·`validate`·loopback health·실제 암호화 키 주입을 확인해요. Redis 용량은 아래 절의 단일 v7 JVM 기준으로 확인하고, 준비되지 않았다면 off를 유지해요. 공개 전환 전에 위 수동 롤백 요건의 보호 current-v7 묶음 하나를 실제 이미지/프론트·환경/대응 키·Nginx/upstream/세 포인터·DB 스키마/백업으로 준비·검증해요. 이 묶음은 자동 생성되거나 현재 이미 준비된 상태가 아니에요.
6. 같은 main SHA의 앱·홍보·기존 초안 복구 프론트와 준비한 v7 upstream을 Nginx 후보에 고정해요. `nginx -t`와 준비 확인 뒤 세 포인터·Nginx 설정·upstream을 함께 전환하고 HTML·자산·release-id·실제 API JSON을 확인해요. 첫 전환이 실패하면 유지보수를 유지하거나 검증된 v7 묶음으로 복구해요. 구 v2 앱 재기동이나 일반 CI의 호환 관문 우회를 복구로 사용하지 않아요. 활성화 후 일반 배포에서 도메인 변수를 false로 바꿔 일부 산출물만 되돌리지 않아요.
7. 기존 주소의 host-only 쿠키는 앱 주소로 옮기지 않으므로 새 앱에서 다시 로그인해요. 기존 Root `/drafts/transfer`에서 같은 계정의 IndexedDB 초안/사진을 내보내고 앱에서 가져오며 원래 만료일·서버 원본 지문을 유지해요. 로그인/가입/복귀·기존 공유/QR·결제 결과·초안 이전·메신저와 PC/모바일 메뉴를 확인해요. 기존 링크의 임시 302를 유지하고 영구 이전·초안 복구 화면 종료는 별도로 승인해요. QR 실기기·TEST PG·11월 3일 자연 파기는 소스 구현으로 확인 완료를 대신하지 않아요.

#### 2026-10-15 앱 DNS 연결과 TLS 준비

Route 53의 퍼블릭 `reserve.it.kr` 호스팅 영역에 `app.reserve.it.kr` A 레코드를 추가했어요. 기존 루트·www와 같은 `52.78.162.89`, TTL 300초, 단순 라우팅, 별칭 없음이에요. 변경 `/change/C04057761K721HZNYQB1B`는 `INSYNC`이며 공개 DNS `1.1.1.1` 조회도 같은 IP를 반환했어요. 기존 레코드·네임서버·메일 설정은 바꾸지 않았어요. 이 기록은 DNS 연결 결과이며 앱 HTTPS·서비스 전환 완료를 뜻하지 않아요.

인증서가 없는 첫 준비에서는 다음 명령으로 **설치하지 않는 후보 파일**을 만들어요. 출력은 Git 밖의 검토 경로를 지정해요.

```bash
node scripts/prepare-domain-split.mjs --source /approved-review-path/before-app-nginx.conf --http-only --output /approved-review-path/app-http.conf
node scripts/prepare-domain-split.mjs --source /approved-review-path/before-app-nginx.conf --output /approved-review-path/app-marketing.conf
```

HTTP 후보는 기존 운영 서버 설정을 유지하고 앱 호스트에 동일한 ACME webroot만 추가해요. 적용 전 실제 설치 설정·upstream·인증서·백업과 대조하고 템플릿의 `PRIVATE_IP`를 확정해요. 승인된 HTTP 구성 적용과 `nginx -t` 후 기존 Certbot webroot 방식으로 앱 인증서를 발급하며, 현재 호스트의 갱신 설정·reload 훅을 보존해요. 인증서 준비가 끝나기 전에는 두 번째 전체 HTTPS 후보를 설치하지 않아요. 앱 인증서·OAuth/지도 등록·현재 전체 후보의 스키마/복구 입력이 준비된 뒤에만 위 전환 순서를 진행해요.

`--source`에는 앱 HTTP 블록을 추가하기 **전** 설치 설정의 검토용 복사본을 사용해요. 생성기는 그 파일을 수정하지 않으며 입력·출력 경로가 같거나 앱 호스트가 이미 들어 있으면 거부해요. 옵션을 생략하면 저장소 템플릿을 사용하며, 기존 CI의 자기 체크아웃 안 후보 생성 방식은 유지해요. 아래 명령은 승인 후 서버에서 실행할 절차이며 지금 실행한 기록이 아니에요.

1. `certbot certificates`, `systemctl list-timers certbot.timer`와 현재 renewal/deploy 훅을 읽고 기존 두 인증서의 이름·SAN·만료·webroot를 대조해요. Certbot이 실행되는 **호스트 쪽** 경로와 `nginxserver` 안 `/usr/share/nginx/html/acme`가 같은 파일을 보는지 Docker mount로 확인해요. Nginx 백업은 root 전용 경로에 보관하고 `app-http.conf`와 원래 설정의 기존 호스트·upstream·로그·보안 헤더가 같은지 확인해요.
2. 별도 승인된 HTTP 후보 설치 후 `docker exec nginxserver nginx -t`와 reload를 진행해요. 같은 webroot에 만든 임의 challenge를 `http://app.reserve.it.kr/.well-known/acme-challenge/<임의값>`에서 읽고 파일을 지워요. 이 확인에는 HTTP 80을 사용하며 현재 다른 호스트의 인증서가 보이는 앱 HTTPS를 성공으로 취급하지 않아요.
3. 실제 호스트 경로를 확정한 뒤 앱 전용 인증서를 아래 형태로 발급해요. 기존 root/www·grafana 인증서의 도메인 집합은 변경하지 않아요. 발급된 SAN과 `/etc/letsencrypt/live/app.reserve.it.kr/`의 이름이 전체 후보와 일치하는지 확인해요.

   ```bash
   sudo certbot certonly --webroot --webroot-path <확인한-호스트-webroot> --cert-name app.reserve.it.kr -d app.reserve.it.kr
   ```

4. 기존 `nginxserver` 문법 검사·reload deploy 훅이 앱 인증서에도 적용되는지 확인한 뒤 `sudo certbot renew --cert-name app.reserve.it.kr --dry-run --run-deploy-hooks`로 앱의 staging 갱신과 훅을 함께 확인해요. 이 명령은 외부 ACME 요청과 실제 deploy 훅 실행을 포함하므로 단순 읽기 작업이 아니에요. [Certbot 문서](https://eff-certbot.readthedocs.io/en/stable/using.html#renewing-certificates)에 따라 인증서 이름으로 범위를 지정하고, 실제 갱신 설정과 systemd timer를 확인해요. root/www·grafana도 기존 갱신 경로를 유지해요.
5. 이후 승인된 전체 후보를 설치할 때 앱 HTTPS의 체인·이름·만료와 기존 root/www·grafana, API/OAuth callback을 다시 확인해요. 앱 인증서 발급은 서비스 전환과 다른 작업이며 `RESERVE_DOMAIN_SPLIT`을 활성화하는 근거로 단독 사용하지 않아요.

2026-10-15 사용자 SSH 조회에서는 Certbot 2.9.0·webroot 방식, 호스트와 컨테이너 모두 `/usr/share/nginx/html/acme`, `/etc/letsencrypt` 전체 mount를 확인했어요. root/www와 grafana의 두 인증서는 2026-12-18 UTC(한국 시간 12-19) 만료이며 앱 인증서는 없어요. `certbot.timer`는 활성이고 실행 가능한 `reload-nginx.sh`는 `docker exec nginxserver nginx -s reload`만 실행해요. 훅이 존재한다는 사실은 새 앱 인증서의 실제 갱신 성공을 뜻하지 않아요. 공개 HTTP 읽기에서는 앱 `/`가 기존 root로 301 이동하고 존재하지 않는 ACME 경로는 리다이렉트 없이 404였어요. 임의 challenge 본문 일치는 아직 확인하지 않았으므로 404만으로 도메인 검증 성공을 기록하지 않아요. 기존 기본 HTTP 서버가 앱 Host의 challenge를 실제 제공하면 인증서 발급에 HTTP 후보 설치가 필요하지 않을 수 있어요. 운영 승인을 받은 뒤 임의 challenge 파일을 만들어 외부 HTTP에서 본문을 확인하고 해당 파일만 정리한 후 발급해요. 인증서 발급·훅 변경·Nginx 설치/reload·앱 서비스 전환은 이 조회에서 실행하지 않았어요.

같은 날 사용자 SSH 실행에서 앱 도메인의 임의 HTTP-01 파일 본문 일치(`APP_ACME_HTTP_OK`)와 `certbot certonly --webroot --webroot-path /usr/share/nginx/html/acme --cert-name app.reserve.it.kr -d app.reserve.it.kr`의 발급 성공을 확인했어요. 인증서 경로는 `/etc/letsencrypt/live/app.reserve.it.kr/fullchain.pem`이며, OpenSSL 조회의 SAN은 `DNS:app.reserve.it.kr`, 유효 시작은 `2026-10-15 08:32:31 UTC`, 만료는 `2027-01-13 08:32:30 UTC`예요. Nginx 문법 검사 후 `certbot renew --cert-name app.reserve.it.kr --dry-run --run-deploy-hooks --verbose`가 앱 HTTP-01 갱신 모의시험을 통과했고 기존 `reload-nginx.sh` 실행과 Nginx의 `signal process started` 알림을 확인했어요. 이 알림은 stderr에 표시된 notice이며 훅 실패 코드가 보고된 결과는 아니에요. `certbot.timer`는 활성이고 다음 예약은 `2026-10-15 18:13:25 UTC`(한국 시간 10-16 03:13:25)예요. 외부 HTTPS 조회에서 기존 root는 200, `release-id.txt`는 기존 `cfa3702fdb66c19f8f31e3edf95945a1d0b49294`를 유지했어요. 기존 Nginx 설정에 앱 서버 블록을 추가하지 않고 발급했으며 실제 앱 HTTPS 제공·도메인 전환은 아직 적용하지 않았어요.

#### OAuth·지도 등록에 추가할 값

기존 서비스 앱·클라이언트에서 아래 값을 **추가**하고 현재 Root와 개발용 콜백을 유지해요. 인증 공급자 콜백은 백엔드의 `/login/oauth2/code/...`이며 프론트 `/oauth2/callback`을 등록하는 값으로 혼동하지 않아요.

| 대상 | 추가 값 | 기존 등록에서 유지할 값 |
|---|---|---|
| Google 승인된 리디렉션 URI | `https://app.reserve.it.kr/login/oauth2/code/google` | 현재 Root의 같은 `/google` 콜백 |
| Google 승인된 JavaScript 원본 | 브라우저 SDK를 사용하는 경우 `https://app.reserve.it.kr` | 실제 사용하는 기존 원본 |
| 네이버 Callback URL | `https://app.reserve.it.kr/login/oauth2/code/naver` | 현재 Root의 같은 `/naver` 콜백·기존 서비스 URL |
| 카카오 로그인 Redirect URI | `https://app.reserve.it.kr/login/oauth2/code/kakao` | 현재 Root의 같은 `/kakao` 콜백 |
| 카카오 지도 JavaScript 사이트 도메인 | `https://app.reserve.it.kr` | 현재 Root·www·개발용 등록 중 실제 사용하는 값 |

[Google](https://developers.google.com/identity/protocols/oauth2/web-server#redirect-uri-validation), [네이버](https://developers.naver.com/docs/login/devguide/devguide.md), [카카오 로그인](https://developers.kakao.com/docs/ko/kakaologin/prerequisite), [카카오 지도](https://apis.map.kakao.com/web/guide/)의 등록 요구사항과 실제 콘솔의 기존 목록을 대조해요. 네이버 서비스 URL 등 단일 대표값의 변경이 필요하면 기존 주소의 로그인/초안 복구를 함께 확인하고 그 변경 범위를 별도로 승인받아요. 등록 완료와 기존/앱 주소의 실제 로그인 왕복 확인을 구분해요. 새 클라이언트 생성·시크릿 교체·로그인/권한 범위 확대는 이 추가 작업에 포함하지 않아요.

현재 `Login.jsx`는 Google JavaScript SDK 대신 Spring의 `/oauth2/authorization/google`로 이동해요. 이 방식에서 필수 등록은 서버 리디렉션 URI이며, JavaScript 원본을 새 필수 조건으로 추가하지 않아요. 이미 등록했다면 소유한 앱 원본 `https://app.reserve.it.kr`을 유지할 수 있고 경로를 붙이지 않아요. [Google 서버 OAuth](https://developers.google.com/identity/protocols/oauth2/web-server)와 [브라우저 SDK 설정](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid)은 구분해요.

네이버의 현재 서비스 URL이 `reserve.it.kr`이면 앱 하위 도메인 때문에 반드시 교체할 필요는 없어요. [네이버 서비스 환경 등록 안내](https://developers.naver.com/docs/common/openapiguide/appregister.md)는 상위 도메인 등록 시 하위 도메인을 별도로 입력하지 않아도 된다고 설명해요. 서버의 새 Callback URL은 별도로 추가해요. 2026-10-15 사용자는 로그인 리디렉션 URL 추가를 완료했다고 전달했어요. 콘솔 목록 재조회·기존 및 앱 호스트 로그인 왕복·지도 동작은 이 전달만으로 확인 완료로 처리하지 않아요.

공급자의 연결 끊기 알림은 로그인 Callback URL과 별개예요. 현재 v7 후보에는 `POST /api/oauth/events/google`·`/api/oauth/events/kakao`의 서명된 SET와 `/api/oauth/events/naver`의 form 알림 수신, 검증·중복 방지 inbox·주체 cutoff·자체 세션 폐기를 준비했어요. 세 수신 flag는 모두 기본 false이며 실제 공급자 등록·운영 활성화는 하지 않았어요. [계정 보안 런북](account-security.md#공급자-보안-사건-수신-후보--운영-미적용)의 지원 사건·검증 범위와 새 전체 JAR·DDL 16절·복구 입력을 확인한 뒤 별도 승인으로 해당 수신 주소를 등록·활성화해요. 사건 수신은 회원·예약·결제 데이터를 삭제하지 않으며 Google의 제공 이벤트를 모든 계정 삭제의 직접 통지로 해석하지 않아요.

RESERVE 탈퇴의 발신은 암호화된 영속 outbox를 사용해요. 현재 네이버 코드는 [POST revoke 명세](https://developers.naver.com/docs/login/api/api.md)에 맞춰 `client_id`·`client_secret`·`token`·`token_type_hint`를 form 본문으로 보내며 시크릿·토큰을 URL에 넣지 않아요. 2xx 완료, 408/425/429·5xx·연결 장애 재시도와 그 밖의 영구 실패/설정 누락 BLOCKED를 구분해요. 만료된 토큰을 연결 해제 완료로 간주하지 않으며 실제 공급자 계정의 요청·수신 왕복·실패 관측은 아직 별도 확인이 필요해요. 새 어드민 키 권한을 임의로 추가하지 않아요.

[카카오 호출 허용 IP](https://developers.kakao.com/docs/ko/app-setting/app)는 해당 REST API·어드민 키 요청을 보내는 서버의 실제 공인 발신 IP 제한이에요. 지도 JavaScript 도메인과 공급자 웹훅을 받는 방화벽 설정은 별개예요. DNS의 A 값만으로 발신 IP를 확정하지 않으며, 실제 호출 경로·키의 사용처·복구 방법을 확인한 후 별도로 적용해요. 이 단계에서 Lightsail 방화벽이나 키 접근 범위를 변경하지 않아요.

#### 동일 SHA의 앱·홍보·기존 초안 복구 입력

도메인 설정을 고정하고 실제 main squash가 끝난 뒤 그 main SHA로 새로 만든 프론트·marketing 아티팩트의 `release-id.txt`, JAR store-shell과 실제 백엔드 image digest의 바이트·해시 연결을 확인해요. feature SHA 산출물은 준비 근거이며 최종 main의 검증 결과가 아니에요. 앱은 `html/releases/<SHA>`, 홍보는 `html/marketing/releases/<SHA>`, 기존 초안 복구 앱은 같은 앱 릴리스를 가리키는 `html/legacy-domain.current`를 사용해요. `scripts/domain-release.sh`는 앱 포인터 교체와 같은 배포 트랜잭션에서 marketing/legacy 포인터를 snapshot/promote/restore하며, 기존 프론트 교체·Nginx 백업/복구 경로를 함께 유지해요. 세 포인터만 복원하고 Nginx·upstream·백엔드의 호환 상태를 빼먹지 않아요.

검토용 설치 설정에는 앱 root가 이전 SHA에 고정돼 있을 수 있어요. `--source`로 만든 전체 HTTPS 후보도 그 root를 보존하므로 설치 전에 앱/홍보 root를 이번에 staging한 동일 SHA의 절대 경로로 확정해야 해요. CI는 저장소의 `html/current`·`marketing/current` 후보를 새 릴리스 경로로 치환하고 앱 root가 해당 SHA가 아니면 중단해요. 검토용 생성 결과를 이 확인 없이 바로 설치하지 않아요.

실제 최종 main 빌드 전에 `RESERVE_DOMAIN_SPLIT=true`를 고정하며 빌드 입력은 `VITE_APP_ORIGIN=https://app.reserve.it.kr`, `VITE_MARKETING_ORIGIN=VITE_LEGACY_APP_ORIGIN=https://reserve.it.kr`, 앱의 같은 출처 API예요. 준비 중의 false 설정·feature SHA·혼합 프리뷰 HEAD·기존 로컬 산출물을 최종 main의 빌드나 staging 근거로 재표시하지 않아요. 최종 main의 필수 CI와 실제 새 산출물을 확인한 뒤 별도 승인된 첫 v7 전환에 사용해요.

#### 2026-10-15 자동 갱신과 아이콘 규칙 후속 — 미배포

사용자는 검색·뒤로·현재 위치·사진 위 하트는 원형, 닫기·새로고침·작성·보기 전환·읽음 도구는 둥근 네모로 선택했어요. 공용 아이콘은 44px 동작 영역 안의 32px 면·20px 그림을 사용하며 도구 면의 반경은 10px이에요. 빠른 검색 추천어·폼·히어로의 기존 모양은 이 아이콘 정책의 대상이 아니에요. 원형/도구 역할과 골격은 [디자인 시스템](design-system.md)에 반영했어요.

공통 SSE와 화면 보존은 [아키텍처의 배경 갱신 절](architecture.md#목록의-이벤트-기반-배경-갱신--로컬-후보)을 따라요. 혜택·내 소식·혜택 심사·웨이팅·가게·즐겨찾기·예약 조회와 피드·댓글·알림을 연결했어요. 일시 조회 실패에는 목록·필터·입력·페이지를 유지하며, 권한 거부·삭제 상세는 가리고 오류 재시도는 남겨요. 상시 새로고침은 해당 서버 지원을 받은 화면에서만 숨겨요. 기존 NEWS/WAITING 스트림은 서버 호환 경로로 보존하고 실제 앱은 새 연결과 중복 구독하지 않아요. 공통 스트림을 위해 새 DDL이나 Redis/Kafka를 추가하지 않았어요.

이번 후속의 집중 검사에서는 프론트의 이벤트 라우팅·조회 중 변경·옛 계정 콜백 차단·권한/QR 캐시 제거·재연결/탭 복귀·필터 보존·행 위치 보정과 아이콘/골격 계약을 확인했어요. 백엔드는 커밋/롤백·공개/개인 수신 범위·회원 상태 변경·큐/DB 오류·실제 발행자의 경계 17개를 구간별로 확인했어요. 로컬 Chrome에서는 헤더 검색/위치의 원형, 닫기/보기/새로고침의 둥근 네모와 44/32/20px 치수를 대표 경로에서 확인했어요. 이는 전체 최종 후보의 통과 기록이 아니에요. 전체 suite·린트·제품 빌드·필수 브라우저 행렬·새 JAR 기동/validate·실제 두 계정 이벤트 전파는 아직 실행 전이에요. 실행 중인 기존 로컬 JAR은 새 공통 스트림 코드의 실행 근거로 쓰지 않아요.

최종 후보에서는 두 계정의 변경 전파, 재접속·탭 복귀·신호 중복/유실 보완, 저장 중 조회·스크롤·이미지 로딩과 작성 폼 보존, 삭제/비공개·권한 박탈 시 즉시 차단을 확인해요. 혜택 시작/종료와 목록 밖 새 항목, 오류 재시도, 관리자 심사 사유 보존·새 버전 확인 보호도 같은 입력으로 확인해요. QR 발급·결제·통계·신고 감사 조회가 자동 갱신 때문에 반복되지 않는지도 확인해요. 실제 배포 경로의 SSE 첫 `ready`·heartbeat와 프록시 버퍼링 여부는 공개 HTTPS에서 별도로 확인해요.

2026-10-15 후속 준비에서는 별도 CloudShell과 보호된 PC에 같은 정기 백업을 받고 MySQL 8.0.45의 네트워크 없는 격리 복원·선별 v6 DDL을 확인했어요. 36테이블·67행의 원래 값과 정의를 보존했으며 [백업 런북](backup.md#2026-10-15-준비용-정기-백업-독립-다운로드격리-복원)에 정확한 객체·해시·SQL·검증 범위를 남겼어요. 이 결과는 전환 직전 새 백업이나 최종 JAR 검증이 아니에요. 관리자 혜택 감사 GET은 주기 조회에서 제외하고 실제 변경/연결 복구 때의 갱신은 유지했어요. 댓글 첨부 공백·공통 아이콘 눌림·가게/피드 상세와 작성 창 골격을 수정했고 관련 선별 프론트 43건·백엔드 10건을 확인했어요. 삭제 글 조회의 옛 기대 불일치 1건도 같은 날 404 경계 검사로 해결했어요. 전체 후보의 suite·린트·빌드·앱 자동 브라우저 검사·새 JAR validate·운영 적용은 이 후속 작업에서 실행하지 않았어요. 공급자 연결 해제 수신/재시도·활성 회원 토큰 보호와 공개 아바타 CDN 캐시는 [계정 보안 런북](account-security.md)의 남은 보완을 함께 확인해요.

사용자에게는 로그인·MFA·보호된 자격 증명 입력, 실제 계정/휴대폰 확인과 구체적인 Git·운영 변경 승인만 요청해요. 로그인된 세션의 조회·별도 CloudShell 다운로드·보호 PC 폴더 준비·후보 검사·DDL 대조·격리 복원·같은 SHA 산출물/호환 복구 묶음은 가능한 도구로 진행하고 명령 전달을 기본값으로 삼지 않아요. 제어할 수 없는 파일 저장창 등 필요한 개입만 해당 시점에 요청해요. 운영 대상과 최종 SHA가 확정되기 전 범용 DDL을 먼저 실행하지 않아요. 인증서 발급·갱신 모의시험 완료와 OAuth 등록 완료 전달은 위 기록을 유지하며, 서비스 전환·새 JAR validate·현재 후보의 전체 검사 완료로 확대하지 않아요.

2026-10-15 후속 읽기 전용 운영 조회에서 현재 live는 `green`, SHA `cfa3702fdb66c19f8f31e3edf95945a1d0b49294`, 기능 표식 `waiting-signup-hidden-v2`예요. 실제 SQL 조회는 MySQL 8.0.45·`reserve_backup@localhost`·DB `reserve`·36테이블을 반환했고, 조회한 피드 테이블과 `promotion.benefit_design` 등 v6 정의는 없었어요. 설치 백업/복원 스크립트의 SHA-256은 현재 소스와 일치하고 설정은 `600 root`, 실행 파일은 `755 root`예요. 기존 정기 백업의 독립 다운로드 범위는 [백업 런북](backup.md#2026-10-15-준비용-정기-백업-독립-다운로드격리-복원)을 따라요. 운영 DDL·새 백업 생성·컨테이너 교체·Nginx reload·Git 변경·도메인 전환은 이 조회에서 실행하지 않았어요.

#### 2026-10-15 모양 보존과 Redis 운영 준비 후속 — 미배포

작은 텍스트 실행 버튼·모달 확인/취소는 기존 pill로 되돌리고 아이콘 도구의 10px 모서리와 일반/큰 폼·입력·셀렉터·카드의 기존 반경은 유지했어요. 최근 검색의 제목 아래 간격은 빠른 검색과 같은 20px이에요. 로컬 Chrome의 요청된 경로에서 두 간격 20px, 빠른 검색 칩의 100px 반경, 새로고침의 44px 동작 영역·32px 면·20px 래퍼/그림을 실제 DOM으로 확인했어요. 이는 일반 화면 전체나 모바일 사용감 검사가 아니에요. `AGENTS.md`·디자인 정본·지속 로컬 스킬에 동일 컴포넌트/역할 범위만 수정한다는 원칙을 반영했어요.

Redis의 MySQL 정본/서버 중계/SSE 브라우저 전달 구분과 범위는 [아키텍처](architecture.md#로컬-피드-사진과-redis-운영-이식-준비)를 따라요. 기본 off·내부 endpoint·환경별 namespace를 코드에서 강제하고 실제 Redis를 포함한 표적 4클래스·13건을 통과했어요. 두 Lettuce 연결·두 Spring 문맥의 검사이며 운영 연결·두 JVM·공통 스트림 원격 중계의 완료 근거로 확대하지 않아요. 일회용 검사 컨테이너는 제거했고 기존 로컬 Redis는 healthy예요. 새 운영 Redis는 아직 설치하지 않았어요.

운영 이식은 아래 준비 순서로 진행해요. 코드/설정 계약을 로컬과 맞추되 실제 데이터·암호·채널은 환경별로 분리해요.

1. 승인된 최종 후보와 실제 서버 용량을 확인해요. 첫 v7 유지보수에서는 구 JVM을 종료한 **단일 v7 JVM**의 실제 RSS·가용 메모리·swap/OOM 상태에 Redis의 `maxmemory 64mb`와 컨테이너 메모리/전체 메모리+swap 상한 128MiB를 더해 여유를 확인해요. 이 용량 확인이 끝나면 Redis를 한 번 설치·초기화할 수 있어요. 별도의 `docker-compose-redis.yml`은 Blue/Green 교체와 독립적으로 관리하고 호스트 포트를 추가하지 않아요. 로컬 격리는 운영 이식 전 시험 단계예요.
2. 서버에 전용 보호 `redis.conf`를 준비해요. 비루트 UID/GID 999가 읽을 수 있는 root 소유 파일(예: 640·그룹 999)과 접근 제한 부모 폴더를 사용해요. `bind 0.0.0.0`, `protected-mode yes`, `port 6379`, 32자 이상 무작위 `requirepass`, `save ""`, `appendonly no`, `maxmemory 64mb`, `maxmemory-policy noeviction`을 확인해요. 이 bind는 컨테이너 안의 인터페이스이며 Compose는 호스트 포트를 공개하지 않아요. 비밀 값·설정 전문은 채팅이나 로그에 출력하지 않아요.
3. `RESERVE_REDIS_CONFIG_PATH`를 그 절대 경로로 지정해 Redis 서비스만 설치하고 health·메모리 상한·내부 이름 `redis` 연결을 확인해요. 로컬 Redis나 현재 앱 컨테이너의 데이터는 옮기지 않아요. 현재 템플릿 health는 기본 사용자의 `requirepass`를 사용하므로 별도 ACL 사용자를 도입할 때는 health 인증도 함께 대조해요.
4. GitHub Actions의 `RESERVE_REDIS_PASSWORD` Secret에 같은 전용 값을 보관하고 Variables의 `RESERVE_REDIS_HOST=redis`, `RESERVE_REDIS_PORT=6379`와 기본 off를 확인해요. `RESERVE_REDIS_USERNAME`은 별도 ACL 사용자가 있을 때만 설정해요. 5개 값의 Actions→SSH→Blue/Green 전달 경로는 준비했고, Redis 설치 파일은 자동 앱 배포가 시작하거나 재기동하지 않아요.
5. 단일 v7 JVM과 Redis의 용량·연결을 확인한 뒤 별도 승인된 배포에서 `RESERVE_REDIS_ENABLED=true`를 사용해요. 첫 전환에서 이 설정을 반영하려고 앱을 다시 기동할 때도 기존 JVM을 종료한 뒤 새 JVM을 시작해요. 새 앱의 제한·웨이팅 신호·끊김 복구·로그를 확인하고 실패하면 이 옵션을 false로 되돌리는 호환 후보를 사용해요. Redis 장애는 앱 전체 health를 DOWN으로 바꾸지 않으므로 앱 health 200만으로 공유 제한의 정상 여부를 판정하지 않아요. 원본 데이터는 MySQL을 유지해요.

준비한 4개 YAML의 구문·기본 off·비밀 값의 Secret 참조·5개 변수 전달·고정 Redis 이미지·호스트 포트 부재와 배포 shell 구문을 확인했어요. 일반 전체 suite·린트·제품 빌드·자동 브라우저 행렬·새 전체 JAR validate는 실행하지 않았어요. GitHub Secrets/Variables·운영 Redis·DB·배포·도메인 설정은 변경하지 않았어요.

2026-10-15 이후 같은 대화에서 사용자가 중복 정리·보관기간 축소를 별도로 승인했어요. 서버의 동일 이미지 export 4개·977,344,512바이트와 S3의 9월 백업 9개·105,897바이트를 삭제하고 복구 묶음·현재 cfa 이미지·나머지 S3 22개를 보존했어요. 로컬 정기 백업의 3일 기준과 S3 현재 버전 14일/이전 버전 7일을 실제 설정에 적용·재조회했으며 정확한 경로·보존 해시·다음 cron 정리 시점은 [백업 런북](backup.md#2026-10-15-승인된-중복-정리와-보관기간-축소)을 따라요. 이 승인에는 Git 기록·운영 DB·앱/Redis 배포·도메인 전환은 포함되지 않아요.

#### 2026-10-16 화면 보존·공통 중계·계정 보안 후보 — 미배포

사용자가 선택한 색상 유지·고객지원 이름/문의 CTA 굵기 600과 웨이팅 정보 말풍선을 구현했어요. 목록·카드의 접수 방식/대기 팀 수는 하트 옆 정보 도구로 옮기고 접수 중지는 본문에도 남겨요. 공통 카드/목록에 링크 밖의 선택적 도구 자리만 추가해 다른 화면의 정보 배치를 바꾸지 않았어요. 일반 Tooltip과 버튼/색 토큰은 유지해요. 공개 프로필은 자동 무효화에서 제외하고 일시 실패에도 폼/사진을 보존하며, 홈 추천도 캐시를 오류 화면으로 교체하지 않아요. 경로 모듈 준비 전 일반 골격 선행 노출을 없애 해당 페이지 골격으로 이어져요.

공통 Redis 중계는 [아키텍처](architecture.md#목록의-이벤트-기반-배경-갱신--로컬-후보)의 환경 격리·대상 권한 재확인·재발행 방지·재연결 보완을 구현했어요. 기본 off와 운영 설치 별도 관리 원칙은 유지해요. 새 아바타 업로드의 no-store, Naver POST 해제·영구 실패 분리, 활성 토큰의 선택적 AES-GCM 저장과 전용 키 전달을 준비했어요. 결제/환불의 예외 객체를 그대로 기록하던 네 곳은 errorType만 기록하도록 바꿨으며 PG 호출이나 거래 흐름을 변경하지 않았어요.

첫 후보에서는 최초 가입 커밋 전 사건 경합 때문에 Google/Kakao 수신을 차단했어요. 후속 후보는 공통 subject 잠금·미가입 cutoff·불변 원인증 claim·발급/refresh/SSE 경계를 보완하고 Naver 공식 form 수신도 추가해요. 아래 앞선 검사 기록과 현재 입력의 확인을 구분하며, 기본 false와 실제 공급자 등록/운영 활성화의 별도 승인 원칙은 유지해요. 운영 CloudFront는 10/16 읽기에서 기본 Managed-CachingOptimized 하나를 확인했으며 프로필 전용 TTL 0 정책·기존 객체/캐시 보완은 아직 적용하지 않았어요. 공급자 실제 왕복/응답 시간도 미확인이에요. 자세한 경계는 [계정 보안](account-security.md)을 따라요.

최신 전체 호환 표식은 `waiting-signup-hidden-feed-oauth-v7`이에요. `member`의 토큰 TEXT·UTC 인증/폐기 시각과 새 inbox/subject 때문에 이전 v6 이미지/표식으로 복구하지 않아요. [DDL 16절](manual-ddl.md#16-oauth-토큰-보호와-공급자-보안-사건-후보-운영-미적용)을 15절 전체에 더하고 실제 converter·수신·중계 클래스의 JAR 포함 관문을 유지해요. schema-only 도구도 폴더명과 무관하게 실제 모델을 수집하고 Spring/DB 없이 현행 매핑을 만드는 표적 계약을 추가했어요. 이 도구 검사를 새 실제 JAR의 MySQL validate로 표현하지 않아요.

실행한 최소 표적 검사는 다음과 같아요. 실패의 원인/입력을 보완한 경우 해당 항목만 다시 확인한 **여러 실행의 고유 항목 수**이며 최종 SHA의 전체 성공 기록이 아니에요.

| 범위 | 이번 확인 | 제한 |
|---|---|---|
| 공개 프로필·홈·경로 골격·조회 표적 | 4파일 47건 | 첫 45통과/2실패 후 홈 비동기·URL 정규화 fixture를 고쳐 실패 2건만 재검사 통과 |
| 상태 말풍선·도구 링크 경계 | 1파일 9건 | 실제 화면 배치·일반 실기기 사용감은 사용자 확인 |
| 공통 Redis 중계·기존 스트림/설정 | 4클래스 24건 | 실제 연결 둘, JVM/운영 연결 아님. 재연결 세대 오류 수정 후 새 9건 재검사 |
| OAuth·CSRF·사진 캐시·metadata 도구·기존 JPA | 16클래스 69건 | H2/합성 키·서명, 공급자 왕복·실제 MySQL 잠금/최종 JAR 검증 아님 |
| CI/복구 계약 | 1파일 29건 | job의 main-push 관문을 누락한 옛 검사 기대를 보완하고 실패 항목 재검사, 실제 Actions 실행 아님 |
| 새 OAuth DDL | 일회용 MySQL 8.0.45의 합성 자료 | 원래 값/권한·CHECK/unique·재실행/잘못된 DB 차단. 운영 자료 복원 아님 |
| 변경한 설정 | YAML 4개·workflow shell 40개 구문 | 명령·배포·Secret 설정을 실제 실행하지 않음 |

최초 OAuth 검사 68건 중 경합 fixture 한 건은 Spring Data 추상 메서드를 Mockito callRealMethod로 실행한 문제였으며 제품 조건을 완화하지 않고 실제 scalar JPQL 대기로 고쳐 통과했어요. 빈 discovery를 400 대신 일시 오류 503으로 처리하도록 보완한 뒤 Keys 기존 3건/신규 1건만 재검사했어요. 일반 전체 테스트·린트·제품 빌드·자동 브라우저·최종 후보 SHA·새 bootJar/제한 앱 계정 validate는 실행하지 않았어요.

같은 10/16 대화의 후속 입력은 프리텐다드·기존 색을 유지하고 공통 원형 아바타·문의 문구·정적 제목 600을 적용해요. 모바일 목록의 72px/대화의 64px 제목 높이를 분리하고 메신저를 닫아 같은 history 항목으로 돌아갈 때 원래 스크롤을 복원해요. 채팅 사진은 실제 대화 영역의 위아래 240px·동시 2개·대기 32개를 사용해요. 피드/댓글의 AntD는 native lazy만으로 유효성 확인 요청을 막지 못한 것을 확인해 원본/대체 주소를 화면 근처까지 보류해요. 기존 eager 서류·갤러리와 전체 확대 목록은 유지해요.

이 후속 입력에서 공통 Avatar/이미지 35건·채팅 사진/대기열 24건·실제 AntD lazy 6건·메신저 복귀 5건·웨이팅 연결 3건, 합계 **고유 73건**을 최소 표적으로 확인했어요. 초기 실패는 URL resolver·비동기 fixture를 보완하고 해당 실패만 재확인했어요. 실제 HTTP/S3 요청 수를 계측한 결과나 일반 화면·실기기 검사가 아니에요. CI 계약은 앞선 29건 뒤 실제 새 JAR 필수 클래스 관문을 바꾼 항목만 재확인했으며 중복 실행을 새 통과 수로 더하지 않아요.

계정 보안 후속은 지정 24클래스의 **고유 122건**이 통과했어요. 이 수에는 실제 MySQL 8.0.45·REPEATABLE-READ 검사 7건과 최종 NumericDate 소수/범위 검사 2건이 포함돼요. 사건 선행/미커밋 가입 선행, 잠금 대기·INSERT 뒤 만료, 불변 principal, 자체 탈퇴 저장·옛 인증 거부/새 인증 허용과 회원·subject·두 outbox 전체 롤백을 확인했어요. 기존 탈퇴의 일괄 쿼리 후 분리된 회원을 변경하던 문제는 실제 `deletedAt=NULL` 재현 뒤 마지막 잠금 재조회로 보완했어요. 초기 CGLIB/provider HTTP 대역 설정 실패는 fixture를 고쳤고, 그 결과와 별도로 실제 저장 누락을 재현·수정했어요. 해당 합성 MySQL도 제거하고 잔존 0을 확인했어요. 실제 공급자 계정·기존 개발/복원 DB는 사용하지 않았어요.

OAuth DDL의 최종 파일 SHA-256은 `df5485625ef2ab32527cffd9bb47bd562d6897c1a458d6d8d6f3a3673d7f492c`예요. 새 subject 테이블과 비고유 주체 조회 인덱스를 포함한 이 파일을 MySQL 8.0.45의 별도 tmpfs/네트워크 차단 컨테이너에 적용해 기존 2행 값·토큰 NULL/2048자·인증 세대 보존, 인덱스/CHECK/unique·계정 권한과 잘못된 DB/재실행 차단을 확인하고 해당 컨테이너를 제거했어요. 운영 자료 복원·현재 전체 JAR validate를 대신하지 않아요.

기존 혼합 프리뷰·미추적 파일·Claude outputs를 보존하고 Git 쓰기·운영 DB/Redis·도메인·CDN·공급자 설정을 변경하지 않았어요. 새 DDL은 기존 개발/복원 DB에 적용하지 않았고 일회용 MySQL만 제거했어요. 다음 순서는 출시 범위/남은 보안 경계 결정 → 승인된 후보 SHA → 그 입력의 필수 CI/빌드 → 실제 스키마·직전 백업/독립 복원·전체 JAR validate → 같은 SHA의 세 프론트/호환 복구 → 구체적인 운영 승인과 전환이에요.

#### 2026-10-18 v7 출시 준비 — 미배포

후보 [초안 PR #337](https://github.com/hanjeun/reserve/pull/337)은 초기 `50b2afb`의 검사 실패 뒤 최소 수정 검증 중이에요. [10/17 정기 백업의 독립 다운로드·격리 복원](backup.md#2026-10-18-v7-준비용-정기-백업-독립-복원)에서 49테이블·기존 66행 보존과 준비용 2.12.0 JAR의 제한 앱 계정 `validate`·격리 전체 기동 health UP을 확인했어요. 실제 `/api/stores?page=0&size=48&sort=rating`의 success/content 배열과 `/api/store-news/config`·`/api/feed/interactions/config`의 JSON success도 확인했어요. 빈 `PORTONE_WEBHOOK_SECRET`의 fail-closed 경고는 합성 fixture 설정이며 실제 결제 호출은 0건이에요. 전환 직전 백업이나 최종 main SHA의 commit·산출물·CI 통과는 아니에요. 실제 운영 Nginx 이미지 digest `7f0adca1fc6c29c8dc49a2e90037a10ba20dc266baaed0988e9fb4d0d8b85ba0`와 live 설정으로 생성한 후보는 동일 이미지·합성 TLS 인증서·격리 Grafana DNS에서 `nginx -t`를 통과했어요. 실제 운영 TLS 왕복의 증거는 아니며 운영 개인키 복사·설치·reload는 하지 않았어요. CloudFront `E1VOAW2W8K0VA4`의 custom behavior는 여전히 0개이고 기존 프로필 객체 2개의 Cache-Control은 미설정/`max-age=86400`이었어요. 독립 CloudShell의 보호된 before/candidate 설정에 `users/*/profiles/*`·`users/*/feed/profiles/*`의 `Managed-CachingDisabled`(TTL 모두 0)를 준비했으며 실제 배포·객체·캐시는 변경하지 않았어요. 기존 outbox의 확인한 세 집계는 `0/0/0`이고 기존 JWT 목적 파생 키를 유지하며 GitHub 새 키는 설정하지 않았어요. 10/18 새 UI 요청은 계획만이며 이번 출시 완료 목록에 포함하지 않아요. 이 준비에서 운영 DDL·앱/Redis 배포·도메인/CDN·운영 키 변경은 하지 않았어요.
