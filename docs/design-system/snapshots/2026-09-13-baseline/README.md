# RESERVE 디자인 시스템 — 2026-09-13 보존 기준선

현재 로컬 프리뷰 작업트리의 디자인 소스 보관본입니다. 이번 헤더 수정 **전** `Header.jsx`·헤더 관련 글로벌 CSS·디자인 문서부터 SHA-256을 확인해 먼저 고정했고, 그 보관본은 이후 원본 변경으로 덮어쓰지 않습니다. 개별 파일의 `captured_at_utc`가 실제 캡처 시각입니다. 프로젝트 전체를 한 시각에 원자적으로 백업한 결과가 아닙니다.

`local-preview-all-changes`의 dirty/미통합 상태를 보관한 것으로 최신 `dev`, 운영 배포본, 릴리스 검증 기준선과 다릅니다. 새 프로젝트에서 즉시 실행되는 앱이나 배포 가능한 npm 패키지로 주장하지 않습니다. 이 보관 작업은 원래 앱 파일을 수정하지 않습니다.

## 어디에 무엇이 있나

- `source/`: 실제 소스를 원래 repo 상대 경로로 바이트 동일 보존합니다. 선택 범위만 복사하며 `src/` 전체를 가져오지 않습니다.
- `manifest.json`: source-relative path, snapshot-relative path, 분류, 바이트 수, SHA-256, 파일별 캡처 시각입니다. 무엇을 가져왔는지 이 목록이 정본입니다.
- `inventory.json`: 일반 코어, RESERVE 종속 패턴, 혼합 CSS, 통합 참조를 구분한 파일 목록입니다.
- `dependency-boundaries.json`: 정적으로 확인한 import/export 경로, 외부 패키지, 포함하지 않은 상대 의존성입니다. 정규식 기반 목록이며 동적 실행의 완전한 증명은 아닙니다.
- `baseline.json`: 현재 로컬 브랜치/HEAD와 선택 소스의 dirty 상태 등 출처 메타데이터입니다. `.git` 저장소나 Git 이력은 포함하지 않습니다.
- `licenses/`: 설치된 Pretendard의 원래 전문 라이선스와 SUITE의 공식 OFL 권리 고지입니다.
- `payload-manifest.json`: ZIP payload 파일의 바이트 수·SHA-256입니다. 자기 자신의 해시는 재귀 문제로 제외합니다.
- `reserve-design-system-2026-09-13-baseline.zip`, `archive.sha256`, `verification.json`: ZIP, ZIP 전체 해시, 엔트리 및 소스 복사본 해시 검사 결과입니다. ZIP 자신과 해시/검사 결과 파일은 ZIP 안에 다시 넣지 않습니다.

## 일반 코어와 RESERVE 패턴

일반 코어는 토큰, 버튼·배지·카드·폼·선택 메뉴·표·차트·페이지 컨테이너·스켈레톤 등 공통 UI, 모션/폭/테마/폼/이미지 미리보기 공유 훅입니다. React·AntD·아이콘·PropTypes 등의 peer 환경이 필요합니다. `Avatar`, `FilterToolbar`처럼 이름은 일반 UI라도 이미지 유틸리티나 앱 훅 barrel을 쓰는 파일은 **adapter-needed**로 별도 표시합니다.

RESERVE 종속 패턴은 `FavoriteButton`, `InquiryModal`, `KakaoMap`, 헤더 계정 메뉴·탐색 탭·푸터와 프로젝트 상수/쿼리 키 참조입니다. API 서비스, 실제 인증 store, 라우팅 정책, 지도 키·API 기점은 가져오지 않습니다. 새 프로젝트의 인터페이스와 교체해야 하며 해당 파일을 그대로 실행할 수 있다고 보장하지 않습니다.

글로벌 CSS는 일반 스타일과 가게·메신저·관리자 등 화면 선택자가 섞여 있습니다. 원래 cascade를 보존하기 위해 바이트 동일 보관하고 **mixed-global-style**로 구분합니다. 다음 프로젝트에서는 core 범위와 도메인 선택자를 분리하되 사용처/다크 모드/hover·active·focus/reduced-motion을 확인해야 합니다. `index.css`의 import 순서는 계약의 일부입니다.

`App.jsx`·`main.jsx`와 Vite/ESLint 설정은 실제 ConfigProvider 토큰·한국어 locale·Spin·QueryProvider·테마 초기화 연결을 잃지 않기 위한 **통합 참조**입니다. 선택한 파일만 있는 이 폴더의 실행 진입점이 아닙니다. 앱 라우트, 인증, 운영 모니터링 연결은 새 앱에서 따로 구성합니다. 실제 환경 값이나 운영 설정 파일은 제외했습니다.

## 이식 전에 확인할 의존성

1. 필요한 코어 파일만 선택하고 `dependency-boundaries.json`의 미포함 상대 의존성을 교체합니다. 앱 전체 `hooks/index.js`나 `constants/index.js`를 무심코 복사하면 API/인증 결합이 다시 생깁니다.
2. `frontend/package.json`과 lock은 **현재 앱의 의존성 출처 기록**입니다. 새 앱의 최소 package manifest가 아니며 전체 의존성을 그대로 설치하라는 뜻이 아닙니다. JSX가 직접 쓰는 `dayjs`는 현재 AntD 경유 설치에 기대므로 새 프로젝트는 명시적인 직접 의존성으로 검토합니다.
3. ConfigProvider의 색 토큰에는 CSS 변수가 아니라 원래 리터럴 색을 연결하고 CSS 토큰과 함께 맞춥니다. AntD 6 Select 구조를 AntD 5 선택자로 되돌리지 않습니다.
4. `patches/@rc-component+tabs+1.7.0.patch`는 현재 rc-tabs 버전에 묶인 호환 패치입니다. 버전을 바꾸면 재검토하며 기존 `postinstall: patch-package` 계약을 확인합니다.
5. SUITE woff2와 자체 로고만 필요한 정적 리소스로 보관합니다. Pretendard의 폰트 본체는 npm 의존성을 통해 가져오며 임의로 `node_modules` 전체를 ZIP에 넣지 않습니다.
6. 소스에 있는 상대 asset URL과 원래 브랜드명은 새 앱의 자산/권리 범위에 맞게 바꿉니다. 가게 실사진, 개인 프로필 업로드, 채팅 첨부, AI 배너/바로가기 세트는 이번 일반 디자인 코어 보존 범위에서 제외했습니다.

## 권리 고지와 비밀 제외

RESERVE 자체는 현재 별도 오픈소스 라이선스가 없는 all-rights-reserved 프로젝트입니다. 보관본 생성이 제3자 공개·npm 게시·로고 재사용 허락을 새로 만들지 않습니다. 실제 제3자 라이브러리 notice는 설치 패키지의 라이선스를 보존하며, `THIRD_PARTY_NOTICES.md`는 기존 요약 기록이지 이번 작업에서 전체 의존성 라이선스를 재감사한 결과가 아닙니다.

SUITE 전문 고지는 [공식 SUITE 저장소 LICENSE](https://raw.githubusercontent.com/sun-typeface/SUITE/main/LICENSE)를 2026-09-13 읽기 전용으로 확인해 보관했습니다. 현존 repo의 SUITE 파일 이름/기존 notice를 근거로 한 권리 고지 보존이며 폰트 바이너리의 upstream 버전 일치를 새로 증명한 것은 아닙니다. Pretendard는 현재 설치된 `pretendard@1.3.9/dist/LICENSE.txt`를 바이트 동일 복사했습니다.

`.env` 계열, backend·서버·AWS 운영 설정, `.git` 데이터/이력, API·서비스 구현, 실제 auth store·세션 저장 내용, 회원/가게 DB 데이터, 실제 개인 정보/대화/업로드, 캐시·로그·덤프, `node_modules`/`dist` 전체는 제외합니다. 테스트 파일은 공통 UI의 synthetic mock 예제이며 실제 사용자 자료가 아닙니다. 선택한 문서/lock/코드 텍스트에 알려진 credential·JWT/private-key 형태와 URL user/password 패턴을 검사하되 이 좁은 검사는 모든 종류의 비밀 부재 증명이 아닙니다. ZIP은 공개 업로드하지 않았습니다.

## 검증 및 재현

원래 repo에서 `scripts/design-system-snapshot.ps1 -Stage Header`는 초기 헤더 보존본을 만들고 이미 존재하는 소스를 덮어쓰지 않습니다. `-Stage Finalize`는 좁은 allowlist를 추가하고 manifest·ZIP을 만듭니다. `-Stage Verify`는 보관 파일/ZIP을 읽기 전용 검사합니다. 이미 완료된 스냅샷을 새 기준선으로 갱신하지 않으며 다른 날짜 기준선을 만들 때는 명시적인 새 대상 경로를 검토합니다.

복사 중 원본의 SHA-256을 앞뒤로 확인하고, ZIP의 각 엔트리를 다시 읽어 payload-manifest와 비교합니다. 헤더 원본이 이후 달라져도 보관본과 ZIP은 고정됩니다. 검사 결과의 current-source divergence는 작업 중 새 헤더 변경 등과 구분하기 위한 출처 정보이며 보관 파일 손상이라는 뜻이 아닙니다. 전체 앱 테스트/빌드·브라우저 검증·npm 패키지 실행 검증은 이 보관 작업의 결과가 아닙니다.
