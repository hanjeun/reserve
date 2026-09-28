<div align="center">

<a href="https://reserve.it.kr"><img src="frontend/public/og-image.png" alt="RESERVE — 예약이 필요한 순간" width="760" /></a>

### 예약이 필요한 순간, RESERVE

업종을 가리지 않고 **찾고 · 예약하고 · 결제까지** 한 번에 끝내는 범용 예약 플랫폼

[**서비스 바로가기**](https://reserve.it.kr) &nbsp;·&nbsp;
[손님 가이드](docs/guide/user-guide.md) &nbsp;·&nbsp;
[사장님 가이드](docs/guide/owner-guide.md) &nbsp;·&nbsp;
[업데이트 소식](docs/CHANGELOG.md) &nbsp;·&nbsp;
[기술 문서](docs/technical/README.md)

<br />

[![Release](https://img.shields.io/github/v/release/hanjeun/reserve?style=flat-square&label=release&color=2F80ED)](https://github.com/hanjeun/reserve/releases)
[![CI/CD](https://img.shields.io/github/actions/workflow/status/hanjeun/reserve/CICD.yml?branch=main&style=flat-square&label=CI%2FCD)](https://github.com/hanjeun/reserve/actions/workflows/CICD.yml)
![Spring Boot](https://img.shields.io/badge/Spring_Boot-3.5.6-6DB33F?style=flat-square&logo=springboot&logoColor=white)
![Java](https://img.shields.io/badge/Java-21-007396?style=flat-square&logo=openjdk&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)
![MySQL](https://img.shields.io/badge/MySQL-8.0-4479A1?style=flat-square&logo=mysql&logoColor=white)
![AWS](https://img.shields.io/badge/AWS-Lightsail-FF9900?style=flat-square&logo=amazonaws&logoColor=white)

</div>

<br />

## 한눈에 보기

<table>
  <tr>
    <td width="33%" valign="top">
      <h4>🙋 손님</h4>
      가게를 찾고, 빈자리를 달력에서 바로 확인해 예약하고, 노쇼 예약금까지 카카오페이로 결제해요.
    </td>
    <td width="33%" valign="top">
      <h4>🏪 사장님</h4>
      예약 승인·거절, QR 출석 기록, 예약금·환불 정책, 광고와 통계를 한 화면에서 관리해요.
    </td>
    <td width="33%" valign="top">
      <h4>🛡️ 관리자</h4>
      사업자 심사, 회원·예약·광고 조회, 휴지통 복구와 감사 로그로 서비스를 운영해요.
    </td>
  </tr>
</table>

## 화면

아래 화면은 운영 사이트([reserve.it.kr](https://reserve.it.kr))를 그대로 찍은 것이에요.
이메일·전화번호는 찍기 전에 가리고, 출처와 해시는 [`manifest.json`](docs/images/readme-v2.6/manifest.json)에 남겨요.

<p align="center">
  <img src="docs/images/readme-v2.6/home.png" alt="홈 — 운영 안내 배너와 서비스별 찾기" width="100%" />
</p>

<table>
  <tr>
    <td width="50%"><img src="docs/images/readme-v2.6/stores.png" alt="가게 목록" /></td>
    <td width="50%"><img src="docs/images/readme-v2.6/store-detail.png" alt="가게 상세와 예약하기" /></td>
  </tr>
  <tr>
    <td align="center"><sub><b>가게 목록</b> · 카드/리스트 보기, 분야·정렬·지역 필터</sub></td>
    <td align="center"><sub><b>가게 상세</b> · 운영 정보와 예약 신청</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/images/readme-v2.6/business.png" alt="사업자 파트너 패널 통계" /></td>
    <td width="50%"><img src="docs/images/readme-v2.6/admin.png" alt="관리자 패널 대시보드" /></td>
  </tr>
  <tr>
    <td align="center"><sub><b>사업자 패널</b> · 예약·리뷰·예약금·광고 통계</sub></td>
    <td align="center"><sub><b>관리자 패널</b> · 심사·예약·휴지통·감사 로그</sub></td>
  </tr>
  <tr>
    <td colspan="2"><img src="docs/images/readme-v2.6/monitoring.png" alt="Grafana 운영 로그 대시보드" /></td>
  </tr>
  <tr>
    <td colspan="2" align="center"><sub><b>모니터링</b> · Grafana로 오류·로그인 실패·결제 연동·예약 흐름을 한눈에</sub></td>
  </tr>
</table>

<details>
<summary><b>스크린샷 다시 찍기</b></summary>

`frontend` 폴더에서 [`capture-readme-live.mjs`](frontend/scripts/capture-readme-live.mjs)를 실행해요.
로그인이 필요한 화면(사업자·관리자·Grafana)은 사람이 직접 로그인한 캡처 전용 Chrome에서 로그인 상태만 복사해 와요.

```powershell
npm run capture:readme              # 공개 화면 (+ 로그인 상태가 있으면 전부)
npm run capture:readme:auth         # 캡처 전용 Chrome의 로그인 상태 복사
npm run capture:readme -- --only=monitoring
npm run capture:readme:clean        # 복사한 로그인 상태 삭제
```

</details>

## 주요 기능

<details open>
<summary><b>🙋 손님</b></summary>

- 가게 검색 · 정렬 · 즐겨찾기, 서비스 분야별 찾기와 가까운 가게 **우리동네 배지**
- 시간대 · 회차 · 날짜 단위의 세 가지 예약 방식, 빈자리와 마감을 보여 주는 **예약 달력**
- 노쇼 예약금 **카카오페이 결제**, 환불 정책에 따른 취소·환불
- 승인된 예약 방문 시 **QR 체크인**
- 리뷰 작성 · 수정 · 삭제
- 고객지원과 가게 문의를 한곳에서 보는 **통합 메시지**(차단 · 신고 · 숨김)
- Google / Naver / Kakao 소셜 로그인

</details>

<details>
<summary><b>🏪 사장님 (파트너)</b></summary>

- 가게 등록 · 수정 · 삭제, 운영 기간 · 영업시간 · 브레이크 타임 · 휴무일 설정
- 예약 승인 / 거절 / 완료 / 노쇼 처리, **QR 스캔 출석 기록**
- 자동 승인 · 예약금 · 환불 정책 · 동시간대 정원 · 중복 예약 허용 설정
- **광고 등록 · 결제** — 카드·리스트 상단 노출형, 가게 목록 배너형(제목·내용 직접 작성, 미리보기)
- 예약 · 리뷰 · 예약금 **통계**
- 예약 알림 이메일, 가게 문의 받은편지함 · 답장

</details>

<details>
<summary><b>🛡️ 관리자</b></summary>

- 사업자 인증 심사 (승인 / 거절)
- 전체 회원 · 가게 · 예약 · 광고 · 메일함 조회
- 소프트 삭제 · 휴지통 복구
- 시스템 로그(감사 기록) 조회, 통계 대시보드

</details>

## 기술 스택

| 영역 | 기술 |
|---|---|
| **Backend** | Spring Boot 3.5.6 · Java 21 · Spring Security · JWT · OAuth2 |
| **Frontend** | React 19 · Vite · Ant Design 6 · TanStack Query 5 · Zustand · Recharts |
| **Database** | MySQL 8.0 |
| **Infra** | AWS Lightsail · Docker · Nginx · GitHub Actions · S3 + CloudFront |
| **결제 · 메일** | 포트원 V2 (카카오페이) · Resend |
| **모니터링** | Grafana · Loki · Promtail · Sentry · UptimeRobot |
| **품질** | JUnit · Vitest · Playwright · ESLint · SonarCloud |

## 아키텍처

<p align="center">
  <img src="docs/images/RESERVE_Architecture.png" alt="RESERVE 아키텍처" width="100%" />
</p>

`main`에 release PR이 반영되면 GitHub Actions가 빌드부터 무중단 전환까지 진행해요.
자세한 절차와 배포 기록은 [배포 운영 문서](docs/technical/deployments.md)에 있어요.

```mermaid
flowchart LR
    PR["release PR → main"] --> BE["build-backend<br/>Gradle · Docker 이미지"]
    PR --> FE["build-frontend<br/>테스트 · Vite 빌드"]
    BE --> DEPLOY["deploy-backend<br/>비활성 Blue/Green 기동 · health 확인"]
    FE --> DEPLOY
    DEPLOY --> SWITCH["Nginx reload 한 번으로<br/>새 프론트 + 새 upstream 전환"]
    SWITCH --> SMOKE{"Nginx 경유 smoke"}
    SMOKE -- 통과 --> DONE["구 컨테이너 종료"]
    SMOKE -- 실패 --> ROLLBACK["프론트 경로 · Nginx 설정 ·<br/>upstream 함께 롤백"]
```

## 문서

| 분류 | 문서 |
|---|---|
| **사용 안내** | [손님 가이드](docs/guide/user-guide.md) · [사장님 가이드](docs/guide/owner-guide.md) · [업데이트 소식](docs/CHANGELOG.md) |
| **구조** | [아키텍처](docs/technical/architecture.md) · [코드 구조](docs/technical/structure.md) · [디자인 시스템](docs/technical/design-system.md) · [UI 구현 결정](docs/technical/ui-decisions.md) |
| **운영** | [배포 운영](docs/technical/deployments.md) · [모니터링](docs/technical/monitoring.md) · [백업 · 복구](docs/technical/backup.md) · [현재 상태](docs/technical/current-status.md) |
| **도메인** | [결제 · 환불](docs/technical/payments.md) · [통합 메시지](docs/technical/messaging.md) · [가게 임시저장](docs/technical/store-drafts.md) · [데이터 생명주기](docs/technical/data-lifecycle.md) |
| **보안 · API** | [계정 보안](docs/technical/account-security.md) · [API 버전 관리](docs/technical/api-versioning.md) · [보안 정책](SECURITY.md) |
| **자산 · 규칙** | [지역 사진 자산](docs/technical/region-photo-assets.md) · [서드파티 고지](THIRD_PARTY_NOTICES.md) · [코드 컨벤션](docs/rules/code-conventions.md) · [Git 워크플로우](docs/rules/git-workflow.md) |
| **전체 색인** | [기술 문서 안내](docs/technical/README.md) · [품질 로드맵](docs/technical/quality-roadmap.md) |

<br />

<div align="center">
<sub>RESERVE는 1인 풀스택 포트폴리오 프로젝트예요 · <a href="https://reserve.it.kr">reserve.it.kr</a></sub>
</div>
