# 기술 문서 안내

RESERVE의 설계·운영·도메인 문서를 한곳에 모았어요. 문서와 코드가 다르면 실제 코드와 새로 돌린 검사 결과가 정답이에요.

## 현재 상태

| 문서 | 내용 |
|---|---|
| [현재 상태](current-status.md) | 운영 버전, 반영된 기능, 남은 실제 환경 확인 |
| [품질 로드맵](quality-roadmap.md) | 검증되지 않은 위험과 다음 작업 우선순위 |

## 구조

| 문서 | 내용 |
|---|---|
| [아키텍처](architecture.md) | 인프라·배포·S3 경로 |
| [코드 구조](structure.md) | 폴더 구조·라우트·환경 변수 |
| [모듈러 모놀리스 전환 계획](modularization-plan.md) | 도메인 경계 강제 단계와 규칙 |
| [디자인 시스템](design-system.md) | 디자인 토큰·공통 컴포넌트 |
| [UI 구현 결정](ui-decisions.md) | 공통 UI의 선택 이유와 회귀 경계 |

## 운영

| 문서 | 내용 |
|---|---|
| [배포 운영](deployments.md) | 릴리스 노트 동기화·Deployments 기록·저장소 보호 설정 |
| [모니터링](monitoring.md) | Grafana·Loki·알림 규칙 |
| [백업·복구](backup.md) | MySQL 백업·복원 런북 |
| [수동 DDL](manual-ddl.md) | `ddl-auto`가 못 하는 DDL과 적용 이력 |

## 도메인

| 문서 | 내용 |
|---|---|
| [결제·환불](payments.md) | 결제 안전장치·웹훅·미결 대응 런북 |
| [광고 결제](ad-payments.md) | 광고 결제 시도·대사·환불 |
| [계정 보안](account-security.md) | 비밀번호·로그인 유지 계약 |
| [데이터 생명주기](data-lifecycle.md) | 가게 영업 종료·회원 탈퇴·S3 삭제 outbox·휴지통 |
| [통합 메시지](messaging.md) | 고객지원·가게 문의·차단·신고 |
| [채팅 입력·관리](chat-controls.md) | 입력·설정·전송 취소·신고 증거 |
| [채팅 설정과 확장 판단](chat-architecture.md) | 채팅 설정 범위와 확장 제안 |
| [채팅 사진 키](chat-images.md) | `CHAT_IMAGE_ENCRYPTION_KEY` 생성·등록·복구 |
| [가게 임시저장](store-drafts.md) | 가게 등록·수정 자동 저장 |
| [검색 화면](search-ui.md) | 검색 전용 화면과 헤더 |
| [홈 이미지 자산](home-visual-assets.md) | 홈 이미지와 사진 중심 탐색 |
| [지역 사진 자산](region-photo-assets.md) | 지역 대표 사진 API와 자산별 근거 |

## 계획

| 문서 | 내용 |
|---|---|
| [API 버전 관리](api-versioning.md) | v1은 호환성 계약과 폐기 일정을 정한 뒤 시작해요 |

## 릴리스 기록

| 문서 | 내용 |
|---|---|
| [v2.7.0 릴리스 기록](release-candidate-2026-09-27.md) | 담긴 변경·공용 인터페이스·남은 후속 작업 |
| [프리뷰 변경 분리·릴리스 계획](preview-release-plan.md) | 분리 계획 기록 안내 |
| [2026-09 프리뷰 기록](history/2026-09-preview/) | 날짜별 구현·검사 기록. 예: [2026-09-03 분리 계획](history/2026-09-preview/preview-release-plan-2026-09-03.md) |

> 주의: `history/`의 기록은 그 시점의 근거예요. 현재 계약이나 남은 작업 목록으로 옮겨 쓰지 않아요.

## 디자인 스냅샷과 문서 검사

- `../design-system/snapshots/2026-09-13-baseline/`은 재현용 기준선이에요. 캡처·소스 사본·manifest·해시·ZIP이 서로 묶여 있어 일부만 지우거나 다시 만들지 않아요.
- [재현 스크립트](../../scripts/design-system-snapshot.ps1)는 **PowerShell 7 이상**에서 실행하고, CI도 이 스냅샷을 검증해요.
- CI는 `scripts/check-doc-links.mjs`로 Markdown 로컬 링크를 검사해요. 링크 대상이 있는지만 확인하고 내용의 정확성은 보장하지 않아요.

## 콘텐츠 권리

사용자 화면의 상세 고지는 공개 경로 `/content-sources`에 있어요. 지역 사진의 근거와 추가 등록 절차는 [지역 사진 자산](region-photo-assets.md)을 봐요.
