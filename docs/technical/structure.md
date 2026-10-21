# 코드 구조

백엔드는 예약과 권한을 처리하고, 프론트엔드는 화면과 사용자 입력을 담당해요.

## 주요 폴더

~~~text
backend/                 Spring Boot 서버
frontend/src/            React 앱
marketing/               서비스 소개 화면
nginx/                   화면·API 연결 설정
scripts/                 빌드·운영 도구
docs/                    공개 문서
~~~

## 백엔드

Java 패키지의 시작점은 kr.it.reserve예요.

| 영역 | 역할 |
|---|---|
| member·config | 회원·인증·접근 권한 |
| store·reservation·waiting | 가게·예약·웨이팅 |
| payment·advertisement | 예약금·광고·환불 |
| chat·feed·community·promotion | 대화·피드·커뮤니티·가게 소식 |
| file·audit | 파일 접근·삭제 처리·감사 기록 |

각 영역은 요청을 받는 controller, 업무 규칙을 처리하는 service, 저장을 담당하는 repository, 데이터 모델인 entity로 나눠요.

## 프론트엔드

| 폴더 | 역할 |
|---|---|
| pages | 주소별 화면 |
| components | 공통 UI와 기능별 화면 조각 |
| hooks | 조회·저장과 화면 상태 |
| api·services | 서버 요청 |
| store | 로그인 등 공유 상태 |
| styles·assets | 디자인 토큰·CSS·이미지 |
| utils | 날짜·사진·입력 처리 |

주요 화면은 가게 탐색·상세, 예약·웨이팅, 메시지, 마이페이지, 사업자 패널, 관리자 패널이에요. 실제 주소와 접근 권한은 [App.jsx](../../frontend/src/App.jsx)에서 확인할 수 있어요.

## 설정

- 서버 설정은 backend/src/main/resources의 application 설정 파일에서 읽어요.
- 브라우저에 필요한 공개 설정만 VITE_ 환경 변수로 전달해요.
- 비밀번호·암호화 키·공급자 비밀 값은 서버 환경에만 두어요.
- 개발·시험·운영은 별도 프로필과 저장 경로를 사용해요.
