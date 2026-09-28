# 품질 로드맵

남은 작업을 우선순위대로 모았어요.

## P0 — 결제·데이터

- TEST PG 시나리오 확인: 결제 복귀, PAID 복구, 서명 웹훅, 동시 환불의 단일 PG 호출, 응답 유실, PG 성공 뒤 DB 반영 실패 → [결제·환불](payments.md)
- MySQL 8에서 금융 잠금·lease 인계, 폐업·제재 경합, 검색·count, 거리순 쿼리 계획 확인
- 가게 검색 FULLTEXT 켜기 → [수동 DDL](manual-ddl.md)
- 대화 사진 키 보관·복구와 실제 S3 사진 왕복 확인 → [채팅 사진 키](chat-images.md)
- 광고 과거 주문번호를 PG 거래 이력과 대조 → [광고 결제](ad-payments.md)

## P1 — 운영 관측

- Grafana 알림 실제 수신 확인 → [모니터링](monitoring.md)
- nginx 로그를 Promtail → Loki로 수집하고, CSP Report-Only 관측 뒤 강제 CSP로 전환
- CPU collector와 대시보드 적용
- CDN 삭제 잔존과 invalidation 정책 정하기

## P1 — 실기기·실계정

- 실제 Safari 뒤로가기, iPhone 가상 키보드, 320/375/768/1440 화면 확인
- 로그아웃·다른 탭 세션, 쿠키 만료·소셜 로그인 조합 확인
- 두 계정으로 가게 채팅·신고·차단 확인 → [통합 메시지](messaging.md)

## P2 — 코드·저장소

- 남은 빈 catch와 사업자 가게 필터 오류 처리: 통신 실패와 빈 목록을 구분하고 재시도 제공
- 이미지 열기·닫기·뒤로가기 모션 정리
- 큰 JS 청크와 거리 검색 비용 줄이기
- 모듈 경계 정리 → [모듈러 모놀리스 전환 계획](modularization-plan.md) 1단계
- GitHub 설정 정리: Dependabot 라벨, 필수 검사 strict 여부, main 관리자 예외

## 이후

- API v1 → [API 버전 관리](api-versioning.md)
- 광고 지표: 공정 회전, viewability
- 메시지별 읽음 `1`, AI 자동답변, 유료 혜택, MFA, reset-code 해시화, 광고 권리 확인·선검수
- 공개 사이트(`reserve.it.kr`)와 앱(`app.reserve.it.kr`) 분리
