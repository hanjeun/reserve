# RESERVE

식당 예약 시스템 — Spring Boot + React 모노레포

## 기술 스택

| | 기술 |
|---|---|
| **Backend** | Spring Boot 3.5.6, Java 21, MySQL, Spring Security, OAuth2 |
| **Frontend** | React 19, Vite 7, Ant Design, React Query 5, Zustand |
| **배포** | EC2, Docker, Nginx, GitHub Actions (Blue/Green) |
| **결제** | 포트원 V2 (카카오페이) |

## 로컬 실행

### 백엔드

`backend/src/main/resources/application-local.yml`에 DB 접속 정보 설정 후:

```bash
cd backend
./gradlew bootRun --args='--spring.profiles.active=local'
```

### 프론트엔드

```bash
cd frontend
cp .env.example .env.local   # VITE_API_BASE_URL 등 설정
npm install
npm run dev
```

## 주요 기능

- 소셜 로그인 (Google / Naver / Kakao)
- 가게 검색 · 정렬 · 즐겨찾기
- 예약 및 노쇼 예약금 결제 (카카오페이)
- 사업자 패널 — 예약 승인/거절/완료/노쇼 처리
- 관리자 패널 — 사업자 인증 심사, 전체 예약 조회
- 리뷰 작성 · 수정 · 삭제
- 마이페이지 — 프로필 · 비밀번호 변경, 회원 탈퇴

## 문서

| 문서 | 내용 |
|---|---|
| [docs/deployment.md](docs/deployment.md) | 배포 · 인프라 · GitHub Secrets · OAuth 설정 · 트러블슈팅 |
| [docs/design-system.md](docs/design-system.md) | 디자인 토큰 · 공통 컴포넌트 · Import 패턴 |
| [docs/structure.md](docs/structure.md) | 폴더 구조 · 환경변수 · 라우트 목록 |

## 배포

```
https://reserve.hktech.kr
```

`main` 브랜치 push 시 GitHub Actions가 자동으로 Blue/Green 배포를 수행합니다.
