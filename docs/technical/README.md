# 기술 문서 안내

RESERVE의 설계·운영·도메인 문서를 한곳에 모았어요. 문서와 코드가 다르면 코드가 정답이에요.

## 현황

| 문서 | 내용 |
|---|---|
| [품질 로드맵](quality-roadmap.md) | 남은 작업과 우선순위 |

## 구조

| 문서 | 내용 |
|---|---|
| [아키텍처](architecture.md) | 인프라·배포·S3 경로 |
| [코드 구조](structure.md) | 폴더 구조·라우트·환경 변수 |
| [모듈러 모놀리스 전환 계획](modularization-plan.md) | 도메인 경계 강제 단계와 규칙 |
| [디자인 시스템](design-system.md) | 디자인 토큰·공통 컴포넌트 |
| [UI 구현 결정](ui-decisions.md) | 공통 UI 구현 규칙 |

## 운영

| 문서 | 내용 |
|---|---|
| [배포 운영](deployments.md) | 릴리스·배포 절차와 저장소 설정 |
| [모니터링](monitoring.md) | Grafana·Loki·알림 규칙 |
| [백업·복구](backup.md) | MySQL 백업·복원 런북 |
| [수동 DDL](manual-ddl.md) | `ddl-auto`가 못 하는 DDL |

## 도메인

| 문서 | 내용 |
|---|---|
| [결제·환불](payments.md) | 결제·웹훅·환불 |
| [광고 결제](ad-payments.md) | 광고 결제·대사·환불 |
| [계정 보안](account-security.md) | 비밀번호·로그인 유지 |
| [데이터 생명주기](data-lifecycle.md) | 가게 영업 종료·회원 탈퇴·S3 삭제·휴지통 |
| [통합 메시지](messaging.md) | 고객지원·가게 문의·차단·신고 |
| [채팅 입력·관리](chat-controls.md) | 입력·설정·전송 취소·신고 증거 |
| [채팅 사진 키](chat-images.md) | `CHAT_IMAGE_ENCRYPTION_KEY` 생성·등록 |
| [가게 임시저장](store-drafts.md) | 가게 등록·수정 자동 저장 |
| [검색 화면](search-ui.md) | 검색 전용 화면과 헤더 |
| [홈 이미지 자산](home-visual-assets.md) | 홈 이미지와 사진 중심 탐색 |
| [지역 사진 자산](region-photo-assets.md) | 지역 대표 사진 API와 자산 출처 |

## 계획

| 문서 | 내용 |
|---|---|
| [API 버전 관리](api-versioning.md) | API v1 도입 기준 |
