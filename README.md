# RESERVE

식당 예약 시스템 — Spring Boot + React 모노레포

## 기술 스택

| | 기술 |
|---|---|
| **Backend** | Spring Boot 3.5.6, Java 21, MySQL 8, Spring Security, JWT, OAuth2 |
| **Frontend** | React 19, Vite 7, Ant Design 5, React Query 5, Zustand |
| **배포** | AWS EC2, Docker, Nginx, GitHub Actions (Blue/Green) |
| **결제** | 포트원 V2 (카카오페이) |

## 주요 기능

- 소셜 로그인 (Google / Naver / Kakao) + 이메일 회원가입
- 가게 목록 검색 · 정렬 · 즐겨찾기
- 예약 생성 · 노쇼 예약금 결제 (카카오페이)
- 사업자 패널 — 예약 승인 / 거절 / 완료 / 노쇼 처리
- 관리자 패널 — 사업자 인증 심사, 전체 예약 조회
- 리뷰 작성 · 수정 · 삭제 / 마이페이지 · 회원 탈퇴

## 로컬 실행

**백엔드** — `backend/src/main/resources/application-secret.yml`에 OAuth, DB 등 민감 정보 설정 후:

```bash
cd backend
./gradlew bootRun
```

`application.yml`에 `profiles.active: local`이 기본값으로 설정되어 있습니다.

**프론트엔드**

```bash
cd frontend
cp .env.example .env.local   # VITE_API_BASE_URL 등 설정
npm install
npm run dev
```

## 배포

`main` 브랜치 push 시 GitHub Actions가 자동으로 Blue/Green 배포를 수행합니다.

```
https://reserve.hktech.kr
```

## 문서

| 문서 | 내용 |
|---|---|
| [docs/deployment.md](docs/deployment.md) | 인프라 구조 · EC2 초기화 · GitHub Secrets · 트러블슈팅 |
| [docs/structure.md](docs/structure.md) | 폴더 구조 · 환경변수 · 라우트 |
| [docs/design-system.md](docs/design-system.md) | 디자인 토큰 · 공통 컴포넌트 · Import 패턴 |
