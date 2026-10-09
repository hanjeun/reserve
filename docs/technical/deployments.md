# 배포 운영

릴리즈 노트 동기화, GitHub Deployments 기록, CI 구조, 배포 후 점검과 롤백 절차예요.

모든 명령은 **레포 루트에서 `gh` 로그인 상태**로 실행해요. 대상 저장소는 `REPO` 환경변수로 바꿀 수 있어요(기본 `hanjeun/reserve`).
버전별 변경 내용은 [업데이트 소식](../CHANGELOG.md)을 봐요.

## 기본 규칙

- 커밋, PR, merge, tag, 배포, GitHub 설정 변경, 운영 쓰기는 **각각 현재 대화에서 별도 승인**을 받아요.
- `sync-release-notes.mjs --apply`는 릴리스 승인 뒤에 실행해요.
- 배포 직전에는 서버 SSH fingerprint를 별도 경로로 확인해요.
- 의존성 PR과 제품 통합은 분리해요.

### 2026-10-08~09 프리뷰 출시 준비 (최종 입력·운영 적용 전)

`local-preview-all-changes`에는 다른 작업의 수정·미추적 코드와 에셋이 함께 있어요. 2026-10-09 사용자는 지금까지 요청한 기능을 이번 출시 후보에 포함하고 배포 준비를 진행하도록 선택했어요. 대상은 고객 웨이팅·접수 중지/예약 사용 설정·질문형 등록/수정·실제 상세 미리보기·QR/UI 피드백·가입 인증 보완·같은 탭의 지역 유지·브라우저 최근 검색·직접 날짜 입력·공개 이용안내 3개·Dots 신규 4종이에요. 버전 후보는 기능 추가에 맞춰 **v2.9.0**이며 앱 버전과 CHANGELOG 초안을 맞췄어요. 최종 SHA는 커밋 승인 전이라 아직 없어요. 혼합 프리뷰의 다른 작업이나 고유 근거를 자동으로 커밋하지 않고, 코드·잠금 파일·워크플로·스키마를 목적별로 선별해요. 의존성 PR #314–318은 기능 출시와 분리하며 js-yaml·Sentry React의 새 메이저는 미뤄요. 쿠폰·MFA·한정판 판매 대기열·추가 모듈 분리는 제외해요.

사용자는 기존 일반 화면이 잘 동작한다고 알려줬어요. 새 메시지 진입·링크 색 수정과 실제 휴대폰 QR·미지원 브라우저 확인까지 완료했다는 근거는 아직 없어요. 긴 업종 값의 잔상 종료 처리를 보완하고, 접수·예약·웨이팅 방식 설명에 같은 모션을 연결했어요. 2026-10-09 피드백으로 빠른 선택은 한 번의 진행 중인 모션에 최신 글자를 반영하며, 운영 방식을 등록 후 바꿀 수 있다는 안내는 복원했어요. 별도 등록 요약을 PC·모바일 상세 미리보기의 정보 영역 안으로 옮겨 전체 항목의 수정 버튼과 미입력·미사용 상태를 표시해요. 수정은 기존 질문으로 이동하고 ←로 미리보기에 복귀하며, 이 동작은 등록 API를 실행하지 않아요. 휴대폰 미리보기는 기종별 장식 없이 기존 프레임 크기를 유지해요. PC·모바일 미리보기에서 웨이팅 접수 영역을 제거했고 8종의 보완 에셋을 적용했어요. 코드 수정과 사용자에게 전달된 스크린샷만으로 미확인 화면을 검증 완료로 바꾸지 않아요.

PC 미리보기는 좁은 화면에서 전체 폭에 맞춰 시작하고 **확대**를 누르면 원래 폭에서 좌우로 볼 수 있어요. 처음의 과도한 공백·설명 간격을 조정하고 **등록할 내용** 제목을 제거했어요. 기존 가게는 수정할 항목 선택 → 질문 → 실제 상세 미리보기로 이동하며 **수정 완료**만 기존 수정 API를 호출해요. 질문의 ←는 들어온 선택 화면이나 미리보기로 복귀해요. 소유자·관리자 권한, 기존 수정값·사진 순서·저장 검증은 유지해요. 지역은 유효한 URL을 우선해 같은 탭의 이동·새로고침까지 복원하고 다른 탭에 실시간 전파하지 않아요. 최근 검색은 실제 실행한 검색만 이 브라우저에 최대 10개 저장하며 로그인·로그아웃·세션 전환 때 비워요.

같은 날 전체 페이지의 코드에서 웨이팅·관리 도구줄과 선택 탭의 골격, 화면 전체 상태 그림, FAQ 삭제 등 아이콘 반응을 보완했어요. 일반 선택 글자의 이동 방향은 위·아래 항목 순서를 따르고, 분야만 선택한 가게 목록은 탐색 헤더를 유지해요. 초기 로딩은 로컬의 개발용 API 지연을 3초에서 0으로 바꾸고, 홈의 간접 import를 줄이며 현재 공개 페이지 코드와 인증 확인을 함께 시작해요. 페이지 API는 여전히 인증 확인 뒤에 실행해요. 실행 중인 Vite가 새 환경값을 읽은 뒤 로컬 설정이 적용돼요. 공통 코드와 문서의 수정은 운영 반영이나 전체 화면 확인 완료를 뜻하지 않아요.

10/9 운영의 익명 GET만 사용하는 Chromium 측정에서 첫 표본의 DCL/FCP/LCP는 3,231.6/3,444/4,052ms·CLS 0이었고 68개 자원·약 1.30MB 전송과 101~203ms의 긴 JS 작업을 관측했어요. 새 컨텍스트의 다음 표본은 DCL 542.1ms·서버 응답 대기 9.7ms, 같은 컨텍스트 재로딩은 DCL 255.3ms·응답 대기 8.1ms였어요. 실제 인증/운영 쓰기는 차단했고 별도 파일을 만들지 않았어요. 표본 간 차이가 커 항상 느린 운영 API라고 확정하지 않으며 초기 다운로드·JS 실행과 연결/캐시 상태를 구분해요. 이 값은 구 운영 앱의 관측이며 후보 배포의 개선 폭이나 실휴대폰 성능 근거로 재사용하지 않아요.

내 예약의 웨이팅도 기존 예약 도구줄을 재사용해 보기 아이콘 옆 건수·오른쪽 상태/최신 예약순·아래 왼쪽 검색/오른쪽 새로고침으로 맞췄어요. 가게명·대기번호 검색과 상태·최신/오래된 정렬은 서버의 본인·기존 표시 기간 안에서 페이지와 전체 건수에 함께 적용해요. 예약 필터와 분리한 URL 값과 첫 로딩 골격을 보완하고, 검색 중 입력·같은 계정의 기존 목록을 유지해요. 계정·세션이 바뀌면 이전 목록을 표시하지 않아요.

공개 `/waiting` 탐색도 보기 아이콘 옆 가게 수·오른쪽 위치/접수 상태/정렬을 같은 도구줄로 맞췄어요. 위치와 접수 중/중지, 추천/별점/리뷰/최신 등록 정렬은 서버 조회에 먼저 적용해 페이지와 전체 건수가 같은 조건을 따르게 해요. 숨김·삭제 가게와 웨이팅 사용 안 함은 제외하며, 검색은 가게명·업종의 리터럴 검색을 유지해요. 같은 탭의 지역 복원·첫 로딩 골격·검색 포커스를 함께 연결했어요. 지역/상태/정렬·페이지·리터럴 검색과 잘못된 필터의 DB 조회 전 거부를 다룬 실제 서비스/저장소 검사 3개가 통과했어요.

10/9 추가 선택으로 푸터를 **이용안내**로 바꾸고 `/guide/user`·`/guide/business`·`/guide/common`을 로그인 없이 읽는 별도 페이지로 연결했어요. 기존 `/operation-guide`는 query/hash를 유지하며 공통 안내로 복귀해요. 홈 안내 링크·로딩 골격·클라이언트 SEO·Nginx 공개 메타정보·사이트맵을 함께 맞춰요. 가게 수정의 업종·접수 방식·예약 방식·웨이팅은 기존 3D 에셋을 재사용하고, 운영 설정·소개/사진·접수 중지·웨이팅 사용 안 함은 수령한 신규 4종의 512/768px 정지 WebP 8개를 적용했어요. 제작 코드·manifest·해시·CC0/MIT 원문을 보존하고 PNG·Blender 원본이 든 ZIP은 보호 보관 경로에 유지해요.

10/9 격리 후보의 최종 로컬 검사에서는 프론트 단위검사의 기존 성공 117파일을 유지하고 실패 24파일과 신규 웨이팅 1파일의 289개 검사를 다시 확인해 통과했어요. 백엔드 일반 실행은 1,011개 중 1,006개 통과·MySQL 전용 5개 제외였으며, 해당 5개는 별도 격리 MySQL에서 모두 통과했어요. 공개 웨이팅 필터의 실제 서비스/저장소 검사 3개도 통과했어요. PC·모바일 브라우저 첫 실행은 226개 중 163개 통과·59개 실패·기존 기기별 4개 제외였어요. 14개 검사 파일의 옛 문구·입력 이름·등록 순서·에셋 경로·로딩 골격/포커스 기대값을 현재 구현에 맞추고, 원본 실패 자료를 유지하며 실패한 PC 29개와 모바일 30개만 재실행해 모두 통과했어요. 최종 결과는 **222개 통과·기기별 4개 제외**이며, 실행 앱 코드·제외 조건·시간 제한·검증 관문을 바꾸지 않았어요.

전체 `src` 린트와 보완한 브라우저 검사 파일 린트, 정책·운영 스크립트·배포 교체/복구·동결 스냅샷·후보 문서 링크·프론트 빌드/용량·backend bootJar는 통과했어요. 로컬 Node는 지원 범위의 24.19.0이고 원격 CI는 `.nvmrc`의 22를 사용해요. 이 로컬 결과를 원격 CI나 실제 휴대폰 QR·미지원 브라우저 확인으로 표시하지 않으며, 요청하지 않은 Sonar는 실행하지 않았어요. 아래의 개발 의존성 HIGH 4건은 전체 감사의 남은 항목으로 유지해요. 커밋·원격 CI·운영 적용은 아직 실행하지 않았고, 앱 빌드 이후의 보완은 검사 소스와 활성 런북에 한정했으므로 성공한 앱 빌드와 DB 복원을 반복하지 않았어요.

1. 사용자 화면 확인 → 출시 범위·최종 입력 확정 → 새 백업·복원 및 호환 복구 이미지 준비 → 필요한 최종 검사 → 작업별 승인에 따른 운영 적용 순서로 진행해요. 의존성·활성 문서는 최종 입력 선별에 맞춰 정리해요. 보고서·인덱스·인수인계 복사본을 추가하지 않아요. 기존 미추적 코드·Claude outputs·원본 ZIP·QR 캡처·라이선스·운영 근거는 보존해요.
2. 포함 기능의 운영 스키마·보호된 백업·고지·복구 입력을 준비해요. 고객 웨이팅과 접수 설정은 [DDL 11·12절](manual-ddl.md), 가입 인증은 13절이 필요해요. 2026-10-09 02:14~02:18 KST 읽기 전용 조회의 운영 `reserve`/MySQL 8.0.45는 35테이블이며 이 컬럼과 이메일 unique가 없었어요. 적용 직전에 실제 스키마를 다시 읽고, 새 DDL 승인을 받기 전 실행하지 않으며 앱 계정과 `validate`를 유지해요. 후보용 읽기 전용 verifier의 새 계약 검사도 최종 격리 DB에서 확인한 뒤 사용해요.
3. 최종 코드·잠금 파일·워크플로·스키마 입력이 정해진 뒤 필요한 검사를 한 번 실행해요. 수정 중 테스트·린트·빌드·자동 브라우저·성능·Sonar는 실행하지 않아요. 같은 입력의 성공한 증거는 반복하지 않으며, 실패 수정으로 입력이 바뀌면 해당 실패·변경 경계만 다시 확인해요. 필수 CI의 unit/통합·빌드·보안 관문과 결제·권한·DB·복구 검증은 유지해요. 새 가입 인증에는 MySQL 동시 최초 발송·실패 누적·한 번 소비·가입 실패 롤백, 웨이팅에는 동의·고지 관문·개인 조회·접수 중지·기존 접수 유지 경계를 포함해요.
4. 이 요청의 QR Playwright 42개 예시 캡처는 완료됐으며 다시 촬영하지 않아요. 일반 화면·휴대폰 터치 확인은 사용자가 맡아요. 기존 캡처는 실제 QR 검증·카메라 추적 성능·운영 부하의 근거가 아니에요. 새 스트레스·다중 인스턴스·전체 실기기 행렬·운영 롤백 훈련을 필수 목록에 추가하지 않아요.
5. 커밋·PR·머지·태그·배포는 각 작업의 새 명시적 승인으로 진행해요. 신규 운영 DDL과 고지 게시·운영 변수 쓰기도 별도 승인 범위예요. 이전 배포나 DDL 승인을 확대하지 않아요.

고객 웨이팅은 실제 접수 안내와 처리방침을 운영에 게시한 시각을 `WAITING_CUSTOMER_RETENTION_NOTICE_PUBLISHED_AT`에 등록해요. 현재 고객 게시 시각은 미정이며 10/4의 직원 접수·채팅 고지 시각을 쓰지 않아요. 새 백엔드는 고객 변수가 준비되기 전 새 고객 접수를 거부해요. 공개 정책 API·접수 화면·실제 컨테이너 설정을 대조한 뒤 대상 가게 접수를 열어요. 방침 초안의 수정 날짜와 실제 게시 시각은 별개예요. 기존 채팅 파기 시작 **2026-11-03 18:44:15 KST**는 유지하며, 배포 때 실제 정책 값을 다시 읽고 유예 종료 후 첫 worker의 파기 수·보류·파일 삭제 결과를 확인해요.

첫 활성 작업을 후보 0건에서도 확인할 수 있도록 로컬 scheduler에 완료 시각·후보·실패 집계 로그를 추가했어요. 정책·실행 주기는 바꾸지 않았고 운영 작업을 실행하지 않았어요. 후보 집계와 실제 파기·파일 삭제 결과의 구분은 [모니터링 런북](monitoring.md#채팅-유예-종료-후-첫-작업-확인-로컬-보완-운영-미적용)을 따라요.

가입 인증 응답은 `ApiResponse.data`의 원래 만료 시각과 가입 증명을 사용해요. 같은 SHA의 프론트·백엔드를 함께 전환하고, 기존 열린 가입 화면은 새 화면에서 다시 발송·인증해야 해요. 고객 접수도 새 고지 확인·동의 본문이 없는 구 화면 요청을 허용하지 않아요. API v1 별칭은 같은 권한·본문 계약을 유지해요.

자동 배포는 이전 앱과 새 앱이 모두 기존 `reserve.schema-compat=v270-refund-v1`과 새 `reserve.feature-compat=waiting-signup-v1`을 갖춰야 해요. 새 표식은 고객 명단·접수 중지·예약 차단·가입 증명을 유지할 수 있는 코드에만 붙여요. live 판별 때 먼저 거부하고, cutover 직전 현재 연결 대상과 두 이미지 표식을 다시 확인해요. DB와 설정은 롤백 때 되돌리지 않아요. 라벨은 준비된 이미지의 계약 표식이며, 실제 동작 검증을 대신하지 않아요.
2026-10-09 02:14~02:18 KST 재조회에서도 blue SHA `51a3825efd33812c9482ce381ab54cae033e90b8`에는 기존 스키마 표식만 있고 새 기능 표식은 비어 있었어요. 서버의 로컬 이미지 14개에서도 새 표식을 찾지 못했으며 원격 레지스트리 전체를 조회한 것은 아니에요. 운영 라벨을 변경하지 않았어요.

현재 운영 이미지에는 새 기능 복구 표식이 없으므로 **첫 전환은 일반 자동 배포로 진행할 수 없어요**. 최종 입력의 검사와 별도 운영 승인 후, 신규 쓰기를 차단한 전환 절차로 호환 프론트·백엔드 기본 릴리스를 먼저 준비해야 해요. 기본 릴리스와 수정 후보의 SHA·스키마 validate·필수 설정·활성 고객 QR 처리·예약 차단·가입 인증을 확인한 뒤 자동 배포를 사용해요. 구 이미지에 표식을 임의로 붙이거나 관문을 무시해서 통과시키지 않아요. 기능 사용 뒤 복구도 DB·실제 고지 시각·새 설정을 유지하는 호환 수정 이미지가 우선이며, 없으면 신규 쓰기를 닫고 복구해요. 자세한 보호된 사전/사후 스냅샷과 전체 복원의 승인 경계는 [백업 런북](backup.md)을 따라요.

10/9 **11:29~11:30 KST** 준비 조회에서도 live blue는 위 SHA이며 서버 로컬 이미지 14개에 새 기능 표식이 없었어요. 새 정기 백업의 독립 CloudShell 다운로드와 서버 원본 해시 일치를 확보했고, [백업 런북](backup.md)에 대상·보관 경로와 35테이블·61행의 실제 격리 복원 결과를 기록했어요. 운영의 호환 기본 이미지 설치는 아직 실행하지 않았어요. 사용자는 첫 전환의 쓰기 제한 시간에 제약을 두지 않았으므로, 별도 일정 조율 없이 최종 입력과 준비가 갖춰졌을 때 승인된 전환을 진행할 수 있어요. 이 선택은 DDL·권한·고지/설정 쓰기·배포의 실행 승인을 대신하지 않아요.

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

2026-10-09 재조회에서 [#314](https://github.com/hanjeun/reserve/pull/314)·[#315](https://github.com/hanjeun/reserve/pull/315)·[#316](https://github.com/hanjeun/reserve/pull/316)·[#317](https://github.com/hanjeun/reserve/pull/317)·[#318](https://github.com/hanjeun/reserve/pull/318)는 모두 OPEN·BEHIND이며 dev 대상이고, 10/8에 확인한 head를 유지해요. 사용자 선택에 따라 #314·315 및 #318의 AWS/Sentry Java 후보를 **로컬 package/lock에 준비**했으며 PR 입력·상태는 변경하지 않았어요. 격리 후보에서 설치·resolution·postinstall·로컬 검사·빌드를 실행했으며 아래의 실제 산출물 근거와 원격 PR의 CI·머지를 구분해요. 승인 직전에 head와 충돌·호환성을 다시 읽어요.

- #318 head `1791b4a1341952e6b35bd70ae433030f78894102`: AWS SDK `2.55.11`, Sentry Java `8.59.0`, Gradle `9.8.0` 후보예요. AWS JAR 30종에는 LICENSE·NOTICE가 있고 기존 수집 관문으로 동봉해요. 원문이 없는 Sentry JAR 5종은 해당 태그 LICENSE와 JAR·문서 해시를 보충 목록에 연결했어요. 기존 8.58.0 고지는 남겨요.
- 같은 #318 head의 기존 백엔드 CI는 `io.sentry:sentry-reactor:8.59.0` 원문 고지 누락으로 실패했어요. 로컬 보충 목록·원문 준비와 해당 PR의 입력 반영·최종 JAR 동봉 성공은 구분해요. 이번에는 CI를 다시 실행하거나 PR에 변경을 올리지 않았어요.
- [Spring Boot 3.5.16의 명시적 Gradle 지원](https://docs.spring.io/spring-boot/3.5/system-requirements.html)은 7.6.4 이상 7.x와 8.4 이상 8.x예요. 사용자가 Boot 3.5를 유지한 지원 버전을 선택했으므로 wrapper는 9.6.1에서 **8.14.6**으로 준비했어요. [공식 8.14.6 릴리스](https://docs.gradle.org/8.14.6/release-notes.html)는 HIGH 취약점 3건의 수정판이며 #318의 9.8.0은 채택하지 않아요. 배포 ZIP SHA-256 `7988ed071b2a07900e2ec715fca15c6ab72bce6db433af301fa7fa7e9407bd24`를 properties에 고정하고, wrapper JAR은 공식 생성용 원문의 SHA-256 `ad16bca46cb71bb5887c546860d93992aeee35c1fdaf4a242b0a612375d937e0`와 대조했어요. 기존 launcher를 보존했으며 실제 Java 21·Gradle 8.14.6으로 백엔드 검사와 `bootJar`가 통과했어요.
- Sentry 8.59.0의 직접 logs/metrics 호출 동작 변경은 [원문 릴리스 노트](https://github.com/getsentry/sentry-java/releases/tag/8.59.0)를 따라요. 현재 소스에서는 직접 `Sentry.logger()`·metrics 호출을 찾지 못했고 `send-default-pii=false`를 유지해요. 패키지 버전 변경만으로 개인정보 설정까지 검증됐다고 말하지 않아요.
- #315는 PortOne browser 0.1.13·TanStack Query 5.104.1·coverage-v8/Vitest 5.0.3·globals 17.13.0 후보예요. PortOne 결제 응답·웹훅/환불 경계와 Query의 세션·무효화, Vitest peer 정합성을 최종 입력으로 확인해요. AntD 자체가 이 그룹에서 오른다고 쓰지 않으며, rc-tabs 잠금 버전이 바뀐 경우에만 기존 패치 적용 여부를 다시 확인해요.
- 로컬 입력은 ESLint 10.12.0, 위 #315 버전과 Vitest 관련 peer/mocker/spy 5.0.3, AWS SDK 2.55.11·Sentry Java 8.59.0을 잠금파일과 함께 반영했어요. AntD 6.6.5·rc-tabs 1.13.0을 유지하며 후보 `npm ci`의 postinstall 패치 적용과 전체 src 린트가 통과했어요. 프론트 dist에는 실제 번들 패키지 102개·PortOne 0.1.13의 MIT/Apache 원문과 Sentry React 원문이 포함돼요. `reserve-2.9.0.jar`에는 라이브러리 136개와 원문 고지, Sentry Java 8.59.0의 보충 원문이 실제 동봉됐고 JAR의 공개 가게 HTML이 같은 dist/index.html과 일치해요.
- 위 미커밋 후보 JAR은 87,331,568바이트·SHA-256 `c557f774f35177e3aae247d11b37cf23a0144d7524a2e28253be30a5c51b741b`예요. 이 산출물 해시는 Git 커밋 SHA가 아니며 커밋·원격 CI·운영 배포 완료를 뜻하지 않아요. Vite 빌드와 기존 용량 관문은 초기 JS 348.6 KiB gzip/최대 청크 435.1 KiB로 통과했어요.
- `source-map-js`는 1.2.2로 패치했어요. 후보 런타임 의존성 감사는 취약점 0건이며 전체 감사에는 `patch-package` → `find-yarn-workspace-root` → `micromatch` → `braces`의 개발 도구 경로에서 HIGH 4건이 남아요. [공급자 취약점 고지](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)의 패치 버전은 아직 없으며 자동 제안인 patch-package 6.0.7 다운그레이드를 적용하지 않았어요. 이 개발 패키지들은 실제 번들 고지/모듈 목록에 없어요. 런타임 0건과 전체 감사 통과를 혼동하지 않으며 필수 보안 CI는 유지해요.
- #316 js-yaml 5·#317 Sentry React 11은 이번 준비에서 제외해요. js-yaml **4.3.2**·Sentry React **10.69.0**과 기존 PII/Replay 설정을 유지했으며 아래 메이저 이동 항목은 후속 검토예요. PR을 닫거나 ignore 코멘트를 보내지 않았어요.
- #316은 js-yaml 5.4.2의 [공식 이동 지침](https://github.com/nodeca/js-yaml/blob/5.4.2/docs/migrate_v4_to_v5.md)을 따라요. 현재 직접 사용처는 `scripts/tests/cicd-contract.test.mjs`의 CommonJS `load()`이고, 빈 입력·기본 스키마·merge/사용자 태그·ESM default export 차이를 확인해요. 테스트를 실행하지 않았으므로 호환 완료로 표시하지 않아요.
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

이번 출시에서는 Report-Only를 유지하고, 카카오 지도를 이유로 앱 전체에 `unsafe-eval`을 추가하지 않아요. [카카오 공식 가이드](https://apis.map.kakao.com/web/guide/)와 현재 `kakaoMapsLoader.js`의 진입 스크립트는 `dapi.kakao.com/v2/maps/sdk.js`예요. 이전 운영 재현에서 확인한 `t1.kakaocdn.net`의 후속 스크립트와 `eval`은 별개의 검토 항목이에요. 최종 SDK 입력에서 후속 스크립트가 계속 필요하면 확인된 HTTPS 출처만 허용 후보로 준비해요. 이미지를 위한 `*.kakaocdn.net` 허용이 스크립트까지 허용하지는 않아요.

[MDN의 `script-src` 설명](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src#unsafe_eval_expressions)에 따라 출처 허용이나 nonce/hash를 넣는 것만으로 문자열 코드 실행 문제가 해결되지는 않아요. SDK의 eval 없는 로딩 경로가 확인되기 전에는 강제 모드 전환을 보류해요. 이번 수정에서는 Nginx 헤더를 변경하지 않았고 자동 브라우저 재현도 실행하지 않았어요. 공식 공급자에게 문의하거나 별도 지도 로딩 구조로 바꾸는 작업은 구현 범위를 정한 뒤 진행해요.

1. 배포 후 https://reserve.it.kr 에서 개발자도구 콘솔을 열고 **PC와 실제 모바일에서 주요 화면을 한 바퀴 돌며**
   `[Report Only]` 경고를 모아요.
   → 홈 / 가게 목록 · 검색 / 가게 상세(**카카오맵이 뜨는 화면**) / 예약 · **결제** / 로그인(소셜 3사) /
     마이페이지 이미지 업로드 · 미리보기 / 관리자 패널
2. Loki에 `reserve` 스트림이 들어오는지 확인한 뒤 아래 쿼리로 위반을 봐요.

   ```logql
   {job="reserve"} |= `CSP violation observed`
   ```

3. 수동 시나리오를 모두 통과하고 **최소 7일** 동안 설명되지 않는 위반이 없으면 헤더명에서 `-Report-Only`를 지우는 별도 PR을 만들어요.
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

프론트는 새 백엔드가 준비된 뒤에 live로 바뀌어요.

1. `stage-release`가 dist 아티팩트를 `/usr/share/nginx/html/releases/<commit-sha>`에 staging하고 SHA별 nginx 템플릿을 보관해요. `current` symlink, nginx 설정, backend upstream은 바꾸지 않아요.
   - `scripts/preserve-frontend-assets.sh`가 live와 보존된 릴리스 하나의 해시 자산을 새 staging에 복사해요.
   - `reserve-assets.sha256`은 각 릴리스의 원래 파일만 기록해요.
   - 파일명이 같은데 SHA-256이 다르면 배포를 중단해요.
2. `deploy-backend`가 nginx의 `service-env.inc`로 live upstream을 읽고 health와 스키마·기능 복구 표식을 확인한 뒤, 반대편 Blue/Green 컨테이너를 SHA 이미지로 기동해요. 새 컨테이너의 loopback health가 통과해야 다음 단계로 가요. 전환 직전에도 live 경로와 두 이미지의 호환 표식을 확인해요.
3. 전환 직전 `default.conf`, `service-env.inc`, `current` 포인터를
   `/home/ubuntu/release-rollback-<새 commit-sha>-<run-id>-<run-attempt>/`에 저장해요.
4. nginx 후보에 새 프론트의 **SHA 절대 경로**와 새 backend upstream을 함께 넣고, `nginx -t`가 통과하면 `current` 포인터를 갱신한 뒤 nginx를 **한 번만 reload**해요.
5. nginx를 거치는 HTML·정적 asset·공개 API smoke가 성공하면 구 backend를 정지하고 오래된 릴리스를 정리해요.
6. health, 후보 검사, reload, smoke 중 하나라도 실패하거나 실행이 취소되면 저장한 두 nginx 파일과 프론트 포인터를 복원하고 새 backend를 제거해요.

- 자동 정리는 현재 프론트와 최신 두 릴리스 디렉터리만 보존해요.
- 배포 워크플로는 호스트 전체 `docker image/system prune`을 실행하지 않아요.

### 수동 롤백

nginx `root`가 SHA 절대 경로에 고정되므로 두 nginx 파일을 함께 복구해요.

1. 대상 SHA·현재 upstream·해당 실행의 rollback 디렉터리를 읽기 전용으로 확인해요. 복구할 프론트 자산, 백엔드 SHA 이미지, 현재 보호된 설정과 [DB·설정 복구 경로](backup.md)를 함께 제시하고 별도 운영 승인을 받아요.
2. 성공한 배포는 이전 백엔드 컨테이너를 제거하므로 nginx 파일만 되돌리면 종료된 upstream으로 연결될 수 있어요. 복구 이미지가 `reserve.schema-compat=v270-refund-v1`과 `reserve.feature-compat=waiting-signup-v1`을 갖고 실제로 예약 사용·웨이팅 중지·접수 방식·가입 증명을 유지하는지 확인해요. 현재 live를 덮어쓰지 않는 반대편 Blue/Green을 같은 SHA 이미지·해당 compose와 **현재 보호된 환경값**으로 준비해요. 제한된 앱 계정의 `validate`와 loopback health가 실패하면 라우팅을 바꾸지 않아요.
3. 최신 DB·가게 설정·고객 고지 시각을 유지해요. 과거 `.env`나 전체 DB 덤프를 함께 되돌리지 않아요. 새 명단·QR 처리와 예약 차단을 유지할 호환 이미지가 없으면 트래픽·신규 쓰기를 닫는 승인된 복구 경로를 사용해요. 구 이미지에 표식만 추가하거나 `ddl-auto=update`로 우회하지 않아요.
4. 백엔드와 프론트가 동일한 인증·웨이팅 계약을 지원하는 상태에서 rollback 디렉터리의 `default.conf`와 `service-env.inc`를 함께 복구해요. 해당 파일에 지정된 upstream이 준비한 백엔드인지, 프론트 SHA 경로와 자산이 존재하는지 대조해요. `current` 포인터도 해당 프론트 SHA로 맞춰요.
5. `nginx -t` 뒤 한 번 reload하고 nginx를 거치는 HTML·자산·API와 새 설정의 유지 상태를 확인해요. 성공이 확인되기 전에는 기존 live 컨테이너와 복구 자료를 정리하지 않아요.

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
