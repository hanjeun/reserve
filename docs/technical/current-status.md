# 현재 상태

운영 버전과 설정으로 꺼 둔 기능을 정리했어요.

## 운영 버전

| 항목 | 내용 |
|---|---|
| 운영 버전 | **v2.7.1** |
| 배포 방식 | Blue/Green 무중단 배포 → [배포 운영](deployments.md) |
| 변경 내역 | [업데이트 소식](../CHANGELOG.md) |

## 설정으로 꺼 둔 기능

| 기능 | 설정 | 동작 |
|---|---|---|
| 가게 검색 FULLTEXT | `search.store.fulltext-enabled` | 기본 꺼짐. 꺼져 있으면 LIKE 검색을 써요 → [수동 DDL](manual-ddl.md) |
| 대화 원문·사진 90일 파기 | `CHAT_RETENTION_ENABLED` | 기본 꺼짐 → [채팅 입력·관리](chat-controls.md) |
| 대화 사진 첨부 | `CHAT_IMAGE_ENCRYPTION_KEY` | 값이 비어 있으면 사진 첨부만 꺼져요 → [채팅 사진 키](chat-images.md) |

남은 작업은 [품질 로드맵](quality-roadmap.md)에 있어요.
