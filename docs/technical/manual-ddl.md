# 데이터베이스 구조 변경

테이블·컬럼·인덱스 같은 데이터베이스 구조를 바꾸는 작업을 DDL이라고 해요.

## 설정

| 환경 | 설정 |
|---|---|
| 개발 | Hibernate가 필요한 구조를 갱신하는 update |
| 운영 | 이미 준비된 구조가 앱과 맞는지 검사하는 validate |

이 저장소는 Flyway나 Liquibase를 사용하지 않아요. 운영 구조 변경은 앱 실행과 분리해 관리해요.

## 변경 기준

- 변경할 구조와 기존 데이터에 미치는 영향을 먼저 확인해요.
- 백업과 복구 버전의 호환성을 확인해요.
- 구조 변경 전용 권한을 사용하고 앱 계정의 권한은 넓히지 않아요.
- 새 앱의 구조 검사가 실패하면 원인을 확인해요. update나 root 계정으로 우회하지 않아요.
- 컬럼 삭제·자료형 변경·제약·FULLTEXT 인덱스는 특히 별도 검토가 필요해요.

## 코드 위치

| 위치 | 내용 |
|---|---|
| backend/src/main/java/kr/it/reserve | 엔티티와 저장 규칙 |
| [scripts/sql](../../scripts/sql) | 개별 구조 변경 SQL |
| [VerifyDatabaseSchema.java](../../scripts/java/kr/it/reserve/tools/VerifyDatabaseSchema.java) | 스키마 확인 도구 |
| [login-methods.sql](../../backend/src/main/resources/db/manual/login-methods.sql) | 기존 회원을 보존하는 로그인 수단 관리와 검증 요청 |
| [jwt-session.sql](../../backend/src/main/resources/db/manual/jwt-session.sql) | 원문 토큰을 저장하지 않는 기기별 로그인 세션 |
| [reservation-admission.sql](../../backend/src/main/resources/db/manual/reservation-admission.sql) | 같은 요청의 예약 결과를 복구하는 멱등성 기록 |

새 로그인 세션을 사용하는 버전은 기존 로그인 정보를 다시 사용하지 않아요. 적용 후 한 번 다시 로그인해야 하며, 복구 이미지도 새 세션과 예약 요청 기록을 이해하는 버전이어야 해요. SQL 파일의 준비와 실제 운영 적용은 별도예요.

[읽기 전용 점검 도구](../../scripts/verify-post-deploy-readonly.sh)의 로그인·입장 스키마 추가 검사는 제한된 백업 역할로 컬럼·인덱스·외래 키와 InnoDB 계약을 확인해요. 실제 릴리스 JAR의 전체 매핑 검사도 별도로 필요해요.

스키마 확인 결과와 실제 운영 적용은 구분해요. 데이터 복구의 기본 원칙은 [백업과 복구](backup.md)를 보세요.
