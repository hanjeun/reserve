<div align="center">

<a href="https://reserve.it.kr"><img src="frontend/public/og-image.png" alt="RESERVE — 예약이 필요한 순간" width="760" /></a>

[**서비스 바로가기**](https://reserve.it.kr)

<br />

[![Release](https://img.shields.io/github/v/release/hanjeun/reserve?style=flat-square&label=release&color=2F80ED)](https://github.com/hanjeun/reserve/releases)
[![CI/CD](https://img.shields.io/github/actions/workflow/status/hanjeun/reserve/CICD.yml?branch=main&style=flat-square&label=CI%2FCD)](https://github.com/hanjeun/reserve/actions/workflows/CICD.yml)
![Spring Boot](https://img.shields.io/badge/Spring_Boot-4.1.2-6DB33F?style=flat-square&logo=springboot&logoColor=white)
![Java](https://img.shields.io/badge/Java-21-007396?style=flat-square&logo=openjdk&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)
![MySQL](https://img.shields.io/badge/MySQL-8.0-4479A1?style=flat-square&logo=mysql&logoColor=white)
![AWS](https://img.shields.io/badge/AWS-Lightsail-FF9900?style=flat-square&logo=amazonaws&logoColor=white)

</div>

<br />

## 소개

RESERVE는 가게 탐색부터 예약·웨이팅·결제·문의까지 제공하는 예약 플랫폼이에요.

## 화면

예약 서비스([app.reserve.it.kr](https://app.reserve.it.kr))의 화면 예시예요.

| 홈 | 가게 목록 |
|---|---|
| ![홈](docs/images/home.jpg) | ![가게 목록](docs/images/stores.png) |

| 가게 상세 | 사업자 패널 |
|---|---|
| ![가게 상세](docs/images/store-detail.png) | ![사업자 패널](docs/images/business.jpg) |

| 관리자 패널 | 모니터링 |
|---|---|
| ![관리자 패널](docs/images/admin.png) | ![Grafana 모니터링](docs/images/grafana.jpg) |

## 주요 기능

| 영역 | 기능 |
|---|---|
| 탐색 | 분야·지역 검색, 정렬, 즐겨찾기 |
| 예약·웨이팅 | 시간대·회차·날짜 예약, 빈자리·정원 확인, 현장 대기 |
| 결제 | 예약금 결제, 취소·환불 |
| 방문 | QR 체크인, 완료·노쇼 처리 |
| 메시지 | 고객지원·가게 문의, 사진·차단·신고 |
| 가게 운영 | 운영 일정·예약 정책·광고·통계 |
| 관리 | 인증 심사·계정 관리·감사 기록 |

## 기술 스택

| 영역 | 기술 |
|---|---|
| **Backend** | Spring Boot 4.1.2 · Java 21 · Spring Security · JWT · OAuth2 |
| **Frontend** | React 19 · Vite · Ant Design 6 · TanStack Query 5 · Zustand · Recharts |
| **Database** | MySQL 8.0 · Redis 8.2 |
| **Infra** | AWS Lightsail · Docker · Nginx · GitHub Actions · S3 + CloudFront |
| **결제 · 메일** | 포트원 V2 · Resend |
| **모니터링** | Grafana · Loki · Alloy · Sentry · UptimeRobot |
| **품질** | JUnit · Vitest · Playwright · ESLint · CodeQL · SonarCloud(수동 정적 분석) |

## 아키텍처

<p align="center">
  <img src="docs/images/RESERVE_Architecture.png" alt="RESERVE 아키텍처" width="100%" />
</p>

## 문서

| 분류 | 문서 |
|---|---|
| **사용 안내** | [손님 가이드](docs/guide/user-guide.md) · [사장님 가이드](docs/guide/owner-guide.md) · [업데이트 소식](docs/CHANGELOG.md) |
| **기술 · 운영** | [기술 문서](docs/technical/README.md) |
| **정책** | [보안 정책](SECURITY.md) · [서드파티 고지](THIRD_PARTY_NOTICES.md) |
