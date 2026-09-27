# 기술 문서 안내

이 폴더에는 현재 제품 계약, 실행 계획, 그리고 프리뷰 작업 당시의 검증 기록이 함께 있다. 현재 동작의 판단은 항상 코드와 새로 실행한 검사 결과가 우선이며, 날짜가 붙은 기록은 그 시점의 근거로만 사용한다.

기능의 배포 수준은 [현재 상태](current-status.md)에서 코드 존재, 로컬 검증, `dev` 병합,
production 배포, 외부 실증으로 나눠 관리한다. 다른 문서의 완료 표현과 충돌하면 이 상태표와 실제
코드·새 실행 결과를 우선한다.

## 현재 계약과 운영 문서

- [현재 상태](current-status.md), [아키텍처](architecture.md), [코드 구조](structure.md), [디자인 시스템](design-system.md), [UI 구현 결정](ui-decisions.md)
- [계정 보안](account-security.md), [데이터 생명주기](data-lifecycle.md), [결제·환불](payments.md), [광고 결제](ad-payments.md), [통합 메시지](messaging.md)
- [배포 운영](deployments.md), [모니터링](monitoring.md), [백업·복구](backup.md), [수동 DDL](manual-ddl.md)
- [가게 임시저장](store-drafts.md), [지역 사진 자산](region-photo-assets.md)

## 현재 계획

- [API 버전 관리](api-versioning.md): v1 도입은 호환성 계약과 폐기 일정을 확정한 뒤 시작한다.
- [품질 로드맵](quality-roadmap.md): 검증되지 않은 위험과 다음 점검 순서다.

## 날짜가 붙은 작업 기록과 스냅샷

[`history/2026-09-preview/`](history/2026-09-preview/)에는
[2026-09-03 프리뷰 분리 계획](history/2026-09-preview/preview-release-plan-2026-09-03.md),
`*-2026-09-13.md`, `*-2026-09-14.md`, `session-handoff-*.md`, `skeleton-audit-*.md`,
`stabilization-progress-*.md` 같은 당시의 구현 범위와 검사 근거를 둔다. 현재 계약으로 복사하거나
현재 미완료 목록으로 재사용하지 않는다.

`../design-system/snapshots/2026-09-13-baseline/`은 재현용 기준선이다. 캡처, 소스 사본, manifest,
해시, ZIP이 서로 연결되어 있으므로 일부 파일만 삭제하거나 다시 만들지 않는다.
[재현 스크립트](../../scripts/design-system-snapshot.ps1)는 **PowerShell 7 이상**에서 실행하며 CI도
불변 snapshot을 검증한다. 2026-09-23 로컬 검사에서 보존 소스 108/108과 payload·ZIP 해시가 일치했다.

CI의 문서 관문은 `scripts/check-doc-links.mjs`로 Markdown 로컬 링크를 검사한다. 2026-09-23 현재
실행은 Markdown 60개에서 로컬 링크 327개를 확인해 누락 0건으로 끝났다. 이 수치는 링크 대상의 존재를
증명하지만 문서 내용이나 운영 상태의 정확성을 자동으로 증명하지 않는다.

## 콘텐츠 권리 안내

로컬 v2.6 사용자 화면의 상세 고지는 공개 경로 `/content-sources`에 구현돼 있다. production 제공은
별도 배포 확인이 필요하다. 지역 사진의 자산별 근거와 추가 등록 절차는
[지역 사진 자산](region-photo-assets.md)에 둔다.
