# RESERVE

<div align="center">

**식당 예약 플랫폼** — 가게를 찾고, 예약하고, 결제까지 한번에

🌐 **[reserve.it.kr](https://reserve.it.kr)**

![Spring Boot](https://img.shields.io/badge/Spring_Boot-3.5.6-6DB33F?style=flat&logo=springboot&logoColor=white)
![Java](https://img.shields.io/badge/Java-21-007396?style=flat&logo=java&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-8.0-4479A1?style=flat&logo=mysql&logoColor=white)
![AWS](https://img.shields.io/badge/AWS-Lightsail-FF9900?style=flat&logo=amazonaws&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Blue/Green-2496ED?style=flat&logo=docker&logoColor=white)

</div>

---

## 소개

RESERVE는 음식점 예약을 더 쉽고 빠르게 만들기 위한 풀스택 예약 플랫폼입니다.

손님은 원하는 가게를 검색하고 간편하게 예약할 수 있으며, 사장님은 예약 관리와 승인/거절을 한 곳에서 처리할 수 있습니다. 노쇼 방지를 위한 예약금 결제 기능도 제공합니다.

---

## 주요 기능

### 손님
- 가게 검색 · 정렬 · 즐겨찾기
- 날짜 · 시간 · 인원 선택 후 예약
- 노쇼 예약금 카카오페이 결제
- 예약 내역 조회 · 취소
- 리뷰 작성 · 수정 · 삭제
- Google / Naver / Kakao 소셜 로그인

### 사장님 (파트너)
- 가게 등록 · 수정 · 삭제
- 예약 승인 / 거절 / 완료 / 노쇼 처리
- 자동 승인 · 예약금 · 환불 정책 설정
- 예약 알림 이메일 수신 설정

### 관리자
- 사업자 인증 심사 (승인 / 거절)
- 전체 회원 · 예약 조회

---

## 기술 스택

| 영역 | 기술 |
|---|---|
| **Backend** | Spring Boot 3.5.6, Java 21, Spring Security, JWT, OAuth2 |
| **Frontend** | React 19, Vite, Ant Design 5, React Query 5, Zustand |
| **Database** | MySQL 8.0 |
| **인프라** | AWS Lightsail, Docker, Nginx, GitHub Actions |
| **배포 방식** | Blue/Green 무중단 배포 |
| **스토리지** | AWS S3 + CloudFront CDN |
| **이메일** | Resend |
| **결제** | 포트원 V2 (카카오페이) |
| **소셜 로그인** | Google, Naver, Kakao OAuth2 |

---

## 문서

| 문서 | 내용 |
|---|---|
| [손님 가이드](docs/guide/user-guide.md) | 회원가입부터 예약·결제까지 |
| [사장님 가이드](docs/guide/owner-guide.md) | 가게 등록부터 예약 관리까지 |
| [아키텍처](docs/technical/architecture.md) | 인프라 구조 · 배포 방식 |
| [코드 구조](docs/technical/structure.md) | 폴더 구조 · 라우트 · 환경변수 |
| [디자인 시스템](docs/technical/design-system.md) | 디자인 토큰 · 공통 컴포넌트 |

---

## 브랜치 전략

```
main          ← 배포 브랜치 (CI/CD 트리거, reserve.it.kr 자동 반영)
  ↑
dev           ← 개발 통합 브랜치 (기본 브랜치, PR 받는 곳)
  ↑
feature/기능명  ← 기능별 작업 브랜치
```

| 브랜치 | 역할 |
|---|---|
| `main` | 운영 배포. push 시 CI/CD 자동 실행 |
| `dev` | 개발 중인 작업 통합. 배포 준비가 된 후 `main`으로 PR |
| `feature/*` | 기능별 작업. 완료 후 `dev`로 PR |
| `hotfix/*` | 긴급 수정. `main`에 직접 PR |

**일반 작업 흐름:**
```bash
git checkout dev && git pull origin dev
git checkout -b feature/기능명
# ... 작업 ...
git add . && git commit -m "feat: 설명"
git push origin feature/기능명
# GitHub에서 feature/기능명 → dev PR 머지
```

**배포 흐름:**
```bash
# GitHub에서 dev → main PR 머지
# → GitHub Actions 자동 실행 → reserve.it.kr 반영
```
