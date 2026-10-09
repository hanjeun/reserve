# 백업 · 복구 런북

RESERVE MySQL의 백업 구성과 복원 절차예요.

| 항목 | 값 |
|---|---|
| 대상 | MySQL 8 컨테이너 `mysql`, DB `reserve` |
| 방식 | `mysqldump --single-transaction` (서비스 중단 없음) |
| 주기 | 매일 03:10 KST (root cron, 18:10 UTC) |
| 보관 | 로컬 7일 + S3 `reserve-it-kr-backup/mysql/` 90일(Standard, 옛 버전은 7일 뒤 삭제) |
| 스크립트 | `scripts/backup-mysql.sh`, `scripts/restore-mysql.sh` |
| 설치 위치 | `/usr/local/bin/reserve-backup`·`reserve-restore`, 설정 `/etc/reserve-backup.env`(600 root), 덤프 `/var/backups/reserve` |
| 로그 | `/var/log/reserve/backup.log` → Alloy → Loki → Grafana |

백업은 `/etc/reserve-backup.env`, 관리자 복원은 `/etc/reserve-restore.env`의 해당 계정 비밀번호를 사용해요. 앱·백업·관리자 비밀번호를 서로 복사하지 않아요.

2026-10-09 02:14~02:18 KST 읽기 전용 재조회에서 root cron의 `10 18 * * * reserve-backup`과 두 설정 파일의 `600 root`를 확인했어요. 최신 로컬 파일은 `/var/backups/reserve/reserve-20261007-181001.sql.gz`(14,687바이트, `600 root`)예요. 로그에는 35테이블 검증과 같은 이름의 S3 `mysql/` 객체 업로드·정상 종료가 기록돼 있어요. 이번 조회에서 S3를 별도 다운로드하거나 이 최신 파일을 격리 복원하지는 않았어요. 아래 10/2·10/3의 **34테이블** 독립 복원 근거를 새 35테이블 백업의 복원 성공으로 재사용하지 않아요. Codex의 확인 예약과 이 실제 서버 cron은 다른 작업이에요.

같은 조회에서 정기 덤프 디렉터리 `/var/backups/reserve`는 `755 ubuntu`로, 아래의 `700 root` 보관 기준과 달랐어요. `/var/backups/reserve-scripts`는 `700 root`였어요. 승인된 10/9 첫 전환 준비에서 정기 보관 디렉터리를 **`700 root`**로 보완했어요. root cron의 접근을 유지하고 기존 덤프 9개의 해시가 모두 같음을 확인했어요.

2026-10-09 **11:29~11:30 KST** 재조회에서는 새 정기 파일 `/var/backups/reserve/reserve-20261008-181001.sql.gz`(14,689바이트, `600 root`)과 같은 실행의 35테이블·S3 업로드 완료 기록을 확인했어요. cron·설정 파일 권한과 위 디렉터리 소유권 차이는 그대로예요. 업로드 전용 자격의 S3 `HeadObject` 403은 조회 권한의 한계이며 객체 부재를 뜻하지 않아요.

이후 사용자가 로그인한 **별도 CloudShell 읽기 접근**으로 같은 객체의 14,689바이트·수정 시각 `2026-10-08T18:10:05Z`·`AES256` 암호화와 VersionId `.HAxBE2YxQsiGPC_.IAuWMKqfm6x5KpN`을 확인하고, `/home/cloudshell-user/reserve-backups/20261009/reserve-20261008-181001.sql.gz`에 받았어요. CloudShell 디렉터리는 `700`, 파일은 `600`이며 원문을 출력하지 않았어요. 서버 원본과 다운로드본의 SHA-256은 모두 `633ecf9a0f93b9c29212823b40ce804eae1495985afd6fd39d638e2a894eaaa4`예요.

같은 날 이 정기 파일을 PC의 USER·SYSTEM 전용 보호 경로 `C:/Users/USER/AppData/Local/RESERVE/release-prep/20261009/backups/`로 전송해 같은 크기·해시와 gzip 무결성을 확인했어요. 새 전용 볼륨을 사용하는 로컬 Docker MySQL **8.0.45**의 격리 복원 DB에서 **35테이블·61행**을 복원했고, DDL 11→12→13 적용 전후 모든 기존 컬럼의 행·값 digest가 같았어요. 기존 제약 86개·인덱스 구성 요소 173개·CHECK 3개·FK 연결 27개를 보존했으며 새 컬럼 7개·강제 CHECK 2개·고객 조회 인덱스와 이메일 unique/중복 0을 대조했어요. 기존 CHECK 문자열의 문자셋 표기 정규화는 허용 상태 값·강제 여부와 구분해 확인했어요. 이 준비 검사는 아래의 새 직전 백업과 실제 운영 JAR 검증을 대신하지 않아요.

같은 격리 DB에서 후보 `verify-post-deploy-readonly.sh`의 실제 SQL·판별식은 정상 정의를 통과시키고, `waiting_intake_mode`의 잘못된 기본값·강제하지 않는 CHECK·잘못된 고객 목록 인덱스 순서를 각각 거부했어요. 각 합성 변경은 전용 DDL 계정으로 즉시 복구했고 마지막 정상 실행도 통과했어요. 전후 35테이블·61행의 기존/신규 컬럼 값·행 수와 전체 컬럼/제약/인덱스/FK 메타데이터가 동일해요. 제한된 앱 계정과 검사 관문을 완화하지 않았으며 운영에서 실행한 결과는 아니에요.

실제 `reserve-2.9.0.jar`(87,331,568바이트·SHA-256 `c557f774f35177e3aae247d11b37cf23a0144d7524a2e28253be30a5c51b741b`)로 Java 21의 독립 `VerifyDatabaseSchema`를 실행해 **제한된 `reserve_app`·34개 엔티티 모델·`validate` 통과**를 확인했어요. Spring·스케줄러·외부 연동을 시작하지 않았고 검증 전후 전체 데이터/메타데이터가 동일해요. Windows의 긴 경로 때문에 클래스는 원본 547개 바이트가 같은 class-JAR로, 라이브러리는 원본 136개 JAR로 로드했으며 검증 대상은 원래 실행 JAR이에요. 격리 가입 합성 DB는 검사 종료 뒤 0테이블이에요.

같은 로컬 후보 JAR로 복구 이미지 `reserve-local:v2.9.0-c557f774f351`을 새로 만들고 내부 `/app.jar` 해시·비루트 UID 100·Java 21·두 호환 라벨을 확인했어요. 보호된 `release-prep/20261009/recovery/reserve-v2.9.0-c557f774f351.tar`는 244,337,152바이트·SHA-256 `2594d1654871c6b1b6ca32b93c9ca49840dfe397577f93f4b523d28db3ec5773`예요. 구 운영 이미지를 다시 표기한 것이 아니며 **이 로컬 후보 이미지**는 레지스트리 push·서버 설치·실제 앱 health 확인에 사용하지 않았어요. 이후 최종 main의 원격 빌드 이미지로 진행한 운영 호환 전환·현재 설정 보존은 [배포 런북](deployments.md)과 아래 실제 보관 이력을 따라요.

### 2026-10-09 첫 전환의 새 직전 백업

승인된 첫 전환에서 공개 503을 연속 확인하고 구 blue 앱을 멈춰 Java writer 0을 확인한 뒤 새 백업을 만들었어요. 사전 보관 경로는 `/var/backups/reserve-scripts/20261009T062420Z-before-customer-waiting-signup/`이며 디렉터리 `700 root`·설정/백업 파일 `600 root`예요. 구 이미지 244,276,736바이트와 구 프론트 7,084,834바이트도 별도 보호 export로 보존했어요.

새 파일 `database/reserve-20261009-063011.sql.gz`는 **14,688바이트**, SHA-256 **`41a76b0b1539ad6d4c1f864ed30202983f12eeefbe7110312ae1094199bb8f65`**예요. gzip CRC·덤프 종료 표식·35테이블/61행·S3 업로드를 확인했어요. 독립 CloudShell 접근에서 `s3://reserve-it-kr-backup/mysql/reserve-20261009-063011.sql.gz`의 같은 크기, `AES256`, VersionId `z95pnpYuPFM.eLj2bkecTPad4VdPdsdD`, 수정 시각 `2026-10-09T06:30:15Z`를 확인하고 실제 다운로드했어요. `/home/cloudshell-user/reserve-backup-verification/20261009/`는 700·파일은 600이며 gzip 검사와 서버 원본의 해시 일치도 통과했어요. 원문 덤프·키·자격은 출력하지 않았어요.

보호된 PC 복사도 USER·SYSTEM 전용 ACL과 같은 크기·해시를 확인했어요. 새 로컬 격리 DB `reserve_restore_main_20261009_062420`의 MySQL 8.0.45에 **이 직전 백업을 실제 복원**해 35테이블·61행과 서버 사전 스냅샷의 원래 컬럼 row digest가 같음을 확인했어요. 격리 `reserve_ddl`로 11→12→13을 적용하고 기존 값·메타데이터 의미, 새 7컬럼·강제 CHECK 2개와 세 가게의 `OFF`·일시 중지 false·예약 true를 대조했어요. 최종 원격 JAR **87,331,569바이트·SHA-256 `7d569faca35745721ab2b0be6ae16238d0456d1f76dddab5ec5e266115d454d1`**로 15:36:35 KST에 격리 제한 계정 `validate` 34모델, 15:38:51 KST에 SQL verifier를 통과했어요. 라이브러리 136개·클래스 547개도 원본 바이트를 유지했어요. 이 검사 뒤 실제 운영 DDL과 제한된 `reserve_app` 검증까지 통과한 시각은 [DDL 이력](manual-ddl.md#11-고객-웨이팅-확장-2026-10-09-운영-ddl-적용)을 따라요.

### 2026-10-09 적용 후 설정과 호환 복구 보관

공개 재개와 실제 고객 고지 반영 뒤 **16:04:16 KST**의 `/var/backups/reserve-scripts/20261009T070416Z-after-customer-waiting-signup/`에 사후 설정·green/Nginx/MySQL 정의·구 blue 자료를 함께 보관했어요. 디렉터리 `700 root`·파일 `600 root`이고 기존 키·직원/채팅 고지와 새 고객 고지 **`2026-10-09T06:54:37Z`**를 유지해요. **16:06:27 KST**의 제한 계정 조회에서 원래 35테이블·61행 값 digest와 DDL 직후 메타데이터가 모두 같았으며 기존 정기 덤프 9개도 변경하지 않았어요.

- 직후 `reserve-20261009-070416.sql.gz`는 **14,867바이트·SHA-256 `f597dd25f51368155b5bdd47e1a956dd7813a04927ce1317dfe2bfe116c638a3`**예요. 서버 gzip·35테이블·S3 업로드를 확인했어요. 독립 CloudShell 읽기 접근에서도 같은 객체의 `AES256`·VersionId `zMvnsQ.0x5ftMTAt8l3ab6Sn6Hi_bCLY`·수정 시각 `2026-10-09T07:04:19Z`를 확인하고 실제 다운로드했어요. **16:09:42 KST**에 `/home/cloudshell-user/reserve-backup-verification/20261009/reserve-20261009-070416.sql.gz`의 `600`·gzip 무결성·서버 해시 일치를 확인했어요. 이 다운로드 검증과 직전 덤프의 실제 격리 복원은 서로 다른 근거예요.
- 같은 사후 경로의 `compatible-backend.tar`는 **244,330,496바이트·SHA-256 `3f43e022910882629c22c079be98e9f3b7aaf47bf7214e3c8cc6a44ce04df438`**예요. 최종 image digest `sha256:7c13f58c62a9de5b0c7673b6347f859edde8c702254b87d6b5cce5f2a3f9b3c2`의 실제 index → manifest → config와 모든 layer의 descriptor·크기·blob 해시, 두 호환 라벨을 대조했어요. Docker 29의 manifest image ID와 config ID는 서로 다른 객체이며 이를 같다고 가정하지 않아요.
- `compatible-frontend.tar.gz`는 **8,731,011바이트·SHA-256 `6324b0fb55af8d6c9854e315d4ae9483979bf8bbf4c04dc5db30f52d3fba8549`**예요. 실제 프론트와 JAR store-shell의 HTML, release 식별자가 최종 main `b32c08943c5215ebaf589b1311efefc01f6c4024`와 일치해요. 이 이미지·프론트·사후 설정은 새 고객 명단·QR·접수/예약 차단·가입 증명을 이해하는 실제 복구 입력이에요. 구 이미지 export는 원래 자료 보존용이며 새 기능이 사용된 뒤 단독 앱 롤백 대상으로 쓰지 않아요.
- 같은 POST의 `compatible-recovery.tar.gz`는 **251,929,721바이트·SHA-256 `4e71835e0e90f035e3c14ee5549a85e879cabb2fc0d99be77fd6fc60f5478f2f`**예요. 새 이미지·프론트·현재 환경/역할·직후 DB·현재 메타데이터를 묶고 필수 복구물 7개·tar entry 28개를 확인했어요. **16:13:11 KST**에 이 묶음과 직후 덤프를 PC의 `C:/Users/USER/AppData/Local/Packages/OpenAI.Codex_2p2nqsd0c76g0/LocalCache/Local/RESERVE/release-prep/20261009/production/20261009T070416Z/`로 binary 복사해 USER·SYSTEM 전용 ACL·크기·해시를 대조했어요. 이 파일에는 보호 환경값이 있으므로 Git·일반 Downloads·공개 첨부에 올리지 않아요. **16:15:20 KST**의 마지막 읽기 전용 consistent snapshot과 health 조회도 기존 데이터/메타데이터·세 가게 설정·최종 SHA·고객 정책의 일치를 확인했어요. 운영 DB를 덮어쓰는 전체 복원이나 실제 운영 rollback 훈련은 실행하지 않았어요.

> **2026-10-02 검증:** 별도 읽기 접근으로 받은 S3 객체 `mysql/reserve-20260930-181001.sql.gz`는
> 13,883바이트이며 SHA-256은 `8c886711714827452cbb9e813c49520b58ddbed784791e830e0428c06064f1d6`이다.
> Linux MySQL **8.0.45**에 독립 복원해 34테이블·66행과 34개 테이블의 `CHECK TABLE` 성공을 확인했다.
> 암호화 채팅 사진 1건도 독립 다운로드·무결성 확인 후 사용자가 별도 보관 키를 숨김 입력해 복호화 `PASS`를 확인했다.
> 운영 설치본과 **10/2 03:10 KST 정기 백업의 34테이블 검증·업로드·종료 기록**을 확인했다.
> 이후 백업 역할과 `--no-tablespaces`를 적용했다. 10/3 03:10 KST 정기 실행은 `reserve_backup` 계정으로
> 34테이블·13,943바이트·gzip 무결성·덤프 종료 표시·업로드·정상 종료를 확인했다. 같은 실행의 로그 6줄도 Loki에서 조회됐다.
> 10/3 재로그인한 AWS CloudShell의 별도 읽기 접근으로 `mysql/reserve-20261002-181001.sql.gz`를 내려받았다.
> 서버 원본·CloudShell·PC 다운로드의 SHA-256은 모두
> `ef3e38c17bc8ab657f5578b8bf313371b145066cd0a598a5eb5dd902cef28feb`였다.
> PC의 격리 MySQL **8.0.45**에서 34테이블·62행을 복원하고 `CHECK TABLE` 34건을 통과했다.
> 같은 격리 DB의 `token_hash VARCHAR(60) NULL` 추가도 `ALGORITHM=INSTANT`로 확인했다.
> 이 새 백업의 DB 복원과 앞선 운영 이미지·사진 복구 검증은 서로 다른 검증 범위다.
> 현재 운영 이미지까지 사용하는 격리 복구도 통과했다. 이전 백업에 없는
> `store.image_autoplay_enabled`는 스키마 갱신으로 추가한 뒤 검증 모드로 재기동했고,
> 기존 34테이블의 원래 컬럼 값·66행을 유지했다. 상세 범위와 미검증 항목은 2-5를 따른다.

### 고객 웨이팅·새 접수 설정 출시 전 백업과 복구 준비

최종 기능 범위가 정해지면 [수동 DDL](manual-ddl.md) 11·12절의 `store`·`waiting_entry`를, 가입 인증 보완까지 포함하면 13절의 `email_verification`·`member`도 대상으로 삼아요. 사전 전체 덤프는 기존 백업 스크립트로 만들고, 실제 시각의 `/var/backups/reserve-scripts/<UTC시각>-before-customer-waiting-signup/`에 대상 정의·행 수·기존 값과 함께 보호해요. 원본 디렉터리 700·파일 600·root 소유를 유지하고 일반 다운로드·채팅·로그로 개인정보나 키를 옮기지 않아요. 첫 전환의 실제 보관 경로와 생성·독립 복원은 위 이력을 따르며 이후 운영 변경도 해당 시각의 새 백업과 승인을 확인해요.

출시 관문에서는 별도 읽기 접근으로 받은 실제 백업의 해시·종료 표식을 대조하고, 운영과 같은 MySQL 8.0.45의 **격리 대상**에 복원해요. 새 스키마 추가 뒤 후보 앱의 제한된 계정 `validate`와 unique·CHECK·인덱스를 대조해요. 서버의 `reserve-restore --target reserve_restore_<이름>`는 같은 운영 MySQL에 새 DB를 만드는 쓰기 작업이므로 별도 승인 없이는 쓰지 않아요. 현재 단계에는 실제 운영 롤백 훈련·스트레스·다중 인스턴스 시험을 추가하지 않아요.

2026-10-09 사용자 선택의 복원 환경은 **기존 로컬 Docker·WSL의 격리 MySQL**이에요. 이 날 중지돼 있던 Docker daemon을 시작하고 loopback `127.0.0.1:55777`에만 노출한 새 컨테이너 `reserve-release-mysql-20261009-24861ec9`와 전용 볼륨·검사 계정을 준비했어요. 기존 개발 DB·운영 `mysql`·복구 보관본은 덮어쓰지 않았어요. 실제 백업 복원 DB와 가입 동시성 검사의 빈 합성 DB는 분리했으며, 원문 덤프는 일반 Downloads나 Git 경로를 거치지 않았어요. Windows 앱의 가상화 경로는 Docker bind에 그대로 전달하지 않고 보호 파일을 새 전용 설정 볼륨으로 복사했어요.

보호된 출시 후보 복사본에서 Java 21과 격리 MySQL 전용 opt-in으로 `EmailVerificationMySqlReleaseTest` **5개 실행·실패 0·skip 0**을 확인했어요. 동시 최초 발송의 gap lock 경합, 실패 5회 누적, 가입 증명 한 번 소비, 가입 실패 롤백과 원래 만료 시각 유지, 만료·오류 증명 미소비를 검증했어요. 검사 종료 후 합성 DB는 create-drop 정리로 0테이블이며 실제 백업 복원 DB는 35테이블을 유지했어요. 이 결과는 운영 앱 변경이나 최종 JAR의 제한된 계정 스키마 검증을 대신하지 않아요.

새 설정이 사용된 뒤에는 DDL 전 덤프만으로 최신 상태를 복구할 수 없어요. `waiting_intake_mode`·`waiting_paused`·`reservation_enabled`, 활성 접수와 동의한 고지 버전, 실제 고객 고지 변수의 보호된 **적용 후** 스냅샷도 보존해요. 우선 복구는 DB를 그대로 둔 채 이 설정을 이해하는 수정 이미지로 진행해요. 첫 기능 릴리스 이전 앱은 새 차단 설정과 가입 증명을 모르므로 일반 Blue/Green 이전 이미지 롤백 대상에서 제외해요. 호환 이미지가 준비되지 않았으면 신규 쓰기를 닫고 복구해요. 전체 DB 복원은 이후 접수·예약·결제 변경까지 덮을 수 있으므로 별도 승인, 복원 직전 백업, 최신 설정의 대조·회복 계획이 필요해요.

고객 고지의 실제 게시 시각·이미지 SHA·신규 설정 값을 복구 입력으로 보관해요. 키는 기존 보호 보관본을 유지하고, 복구 시각을 새 게시 시각으로 입력하지 않아요. 채팅의 30일 유예나 고지 시각도 앞당기지 않아요. 기존 ZIP·Blender/PNG·QR 캡처·동결 라이선스·고유 운영 근거·복구용 Promtail/positions를 백업 정리 대상에 넣지 않아요.

자동 cutover는 이전·새 이미지의 `reserve.feature-compat=waiting-signup-v1`과 기존 스키마/환불 표식을 요구해요. 전환 전 blue는 새 기능 복구 대상이 아니므로 승인된 첫 전환에서 최종 main의 호환 기본 릴리스를 별도로 설치했어요. 라벨만 복사해서 호환성을 만들지 않아요. 이후에도 복구 후보의 실제 QR·접수 설정·예약 차단·가입 증명 코드와 제한된 앱 계정의 `validate`를 확인해요. 새 설정과 고지 시각을 보관한 실제 사후 경로는 위 이력을 따라요.

## 1. 설치 (서버에서 1회)

### 1-1. 스크립트 배치

```bash
# 레포에서 서버로 (또는 git pull 후 서버 경로에서)
sudo cp scripts/backup-mysql.sh  /usr/local/bin/reserve-backup
sudo cp scripts/restore-mysql.sh /usr/local/bin/reserve-restore
sudo chmod +x /usr/local/bin/reserve-backup /usr/local/bin/reserve-restore

sudo install -d -m 700 -o root -g root /var/backups/reserve
```

서버에 레포가 없으면 승인된 스크립트 커밋의 파일을 받아 해시를 대조한 뒤 설치해요.
현재 계정 분리 스크립트는 운영 앱 v2.8.3보다 새 버전이에요. 앱 태그만 보고 옛 설치본으로 되돌리지 않아요.

```bash
SCRIPT_REF=228d1dfbbc7050f282c2d6efe8e8d178c10dd0a3
curl -fsSL -o /tmp/reserve-backup  https://raw.githubusercontent.com/hanjeun/reserve/$SCRIPT_REF/scripts/backup-mysql.sh
curl -fsSL -o /tmp/reserve-restore https://raw.githubusercontent.com/hanjeun/reserve/$SCRIPT_REF/scripts/restore-mysql.sh
sha256sum /tmp/reserve-backup /tmp/reserve-restore   # 레포의 같은 커밋 파일 해시와 같아야 한다
sudo install -m 0755 /tmp/reserve-backup /tmp/reserve-restore /usr/local/bin/
```

### 1-2. 설정 파일

신규 서버에서는 백업 전용 계정을 먼저 만들고 그 비밀번호를 숨김 입력해요. 앱 비밀번호를 복사하지 않아요.
기존 설정이 있으면 아래 신규 생성 절차를 중단하고 해당 계정의 교체 절차를 따라요.
업로드는 스크립트의 docker 폴백(`amazon/aws-cli`)이 해요.

```bash
(
  set -euo pipefail
  sudo test ! -e /etc/reserve-backup.env
  read -rsp 'reserve_backup DB_PASSWORD: ' DBPW; echo
  read -rsp 'AWS_ACCESS_KEY_ID: ' AK; echo
  read -rsp 'AWS_SECRET_ACCESS_KEY: ' SK; echo
  test -n "$DBPW" && test -n "$AK" && test -n "$SK"
  sudo install -m 600 -o root -g root /dev/null /etc/reserve-backup.env
  printf 'DB_USER=reserve_backup\nDB_PASSWORD=%q\nBACKUP_S3_BUCKET=reserve-it-kr-backup\nBACKUP_S3_PREFIX=mysql\nLOCAL_RETENTION_DAYS=7\nAWS_ACCESS_KEY_ID=%q\nAWS_SECRET_ACCESS_KEY=%q\nAWS_DEFAULT_REGION=ap-northeast-2\n' \
    "$DBPW" "$AK" "$SK" | sudo tee /etc/reserve-backup.env >/dev/null
  unset AK SK DBPW
  sudo stat -c '%a %U %n' /etc/reserve-backup.env
)
```

AWS 키는 백업 전용 사용자 `reserve-backup-uploader`의 키를 써요.

### DB 역할 분리와 복원 설정

2026-10-02 승인된 운영 변경으로 백업은 `reserve_backup@localhost`를 사용해요.
`SELECT`·`SHOW VIEW`·`SHOW_ROUTINE`·`TRIGGER`·`EVENT`와 `--no-tablespaces`로
34개 테이블의 덤프 정의·종료 표식을 확인한 뒤 `/etc/reserve-backup.env`를 전환했어요.
앱용 DML 계정과 DDL 계정은 실제 Docker 서브넷에 한정했으며, 현재 운영 이미지의 앱 접속도 전환했어요.
앱의 `ddl-auto: update`에 DDL 권한부터 제거하지 않아요. 필요한 스키마를 DDL 단계에서 맞춘 뒤
앱은 `ddl-auto: validate`로 기동해야 해요.

복원 관리자 설정은 `/etc/reserve-restore.env`(root 소유, 600)에 따로 보관해요.
`RESERVE_RESTORE_ENV`로 명시한 경로가 우선이며, 기존 `RESERVE_BACKUP_ENV` 명시도 호환돼요.
두 변수를 지정하지 않았고 복원 설정이 없을 때만 기존 `/etc/reserve-backup.env`로 돌아가요.
백업 계정은 데이터 쓰기 권한이 없으므로 복원이나 관리자 SQL에 쓰지 않아요.
변경 전 원본은 `/var/backups/reserve-scripts/20261002-before-db-roles/`에 보관했어요.
전환 후 첫 10/3 03:10 KST 정기 백업은 이 계정으로 덤프 검증·업로드·종료를 마쳤고, 위 독립 복원도 통과했어요.

MySQL **8.0.45** 격리 시험에서 검증한 권한 후보는 다음과 같다. 호스트 범위는 실제 컨테이너
접속 경로에 맞춰 제한하고, 계정 암호는 보호된 입력으로 생성한다. 아래 `localhost`는 시험 범위다.

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON reserve.* TO 'reserve_app'@'localhost';
GRANT SELECT, CREATE, ALTER, DROP, INDEX, REFERENCES ON reserve.* TO 'reserve_ddl'@'localhost';
GRANT SELECT, SHOW VIEW, TRIGGER, EVENT ON reserve.* TO 'reserve_backup'@'localhost';
GRANT SHOW_ROUTINE ON *.* TO 'reserve_backup'@'localhost';
```

`SHOW_ROUTINE`이 없으면 `mysqldump --routines`가 **종료 코드 0으로도 프로시저 본문을 생략**했다.
이때 `information_schema.routines`에서도 해당 객체가 숨겨져 0건 조회가 안전한 근거가 되지 않았다.
로컬 후보는 덤프 전에 전용 계정의 직접 `SHOW_ROUTINE` 권한을 확인하고, 없으면 파일 생성·업로드 전에
중단한다. 기존 관리자와의 호환을 위해 직접 전역 `SELECT` 권한도 인식하지만 백업 전용 계정에는
부여하지 않는다. 역할을 통해 간접 부여하는 구성은 이 후보의 검증 범위 밖이다.
이 권한은 전역 프로시저·함수 정의를 조회하지만 전역 테이블 `SELECT` 권한은 주지 않는다.
`TRIGGER`·`EVENT`는 해당 객체를 만드는 권한도 포함하므로 백업 계정을 절대적인 읽기 전용 계정으로
표현하지 않는다. 시험에서는 백업 계정의 데이터 쓰기, 앱 계정의 DDL, DDL 계정의 데이터 쓰기가 거부됐다.
데이터 마이그레이션에 필요한 별도 DML 권한은 해당 변경의 승인 범위에서만 추가한다.

로컬 백업 후보는 `--no-tablespaces`로 불필요한 `PROCESS` 권한 요구를 제거했다.
운영 앱 테이블은 사용자 정의 general tablespace에 속하지 않았고 GTID는 OFF였다.
사용자 정의 general tablespace·GTID·엔진 구성이 바뀌면 이 전제를 다시 검증한다.
12개 InnoDB 테이블과 뷰·프로시저·트리거·이벤트를 만든 뒤 **현재 백업 스크립트 → gzip → 실제 복원**을
통과했다. S3 업로드만 stub으로 대체했으므로 이 시험은 업로드나 운영 권한 변경의 증거가 아니다.

```powershell
python -B scripts/tests/backup-mysql-roles_test.py --run --docker-host npipe:////./pipe/dockerDesktopLinuxEngine --bash 'C:\Program Files\Git\bin\bash.exe'
```

### 1-3. 백업 전용 S3·IAM

버킷은 이미지 버킷과 분리한 `reserve-it-kr-backup`(서울 리전)이에요.

| 설정 | 값 |
|---|---|
| Object Ownership | **Bucket owner enforced** (ACL 사용 안 함) |
| Block Public Access | 네 항목 전부 활성화 |
| Versioning | 활성화 |
| 기본 암호화 | SSE-S3(AES256). 스크립트도 업로드 때 `--sse AES256`을 붙여요 |
| 버킷 정책 | `aws:SecureTransport=false` 요청 거부(TLS 강제), 공개 Allow 없음 |
| 객체명 | `mysql/reserve-YYYYMMDD-HHMMSS.sql.gz` — `If-None-Match: *`로 덮어쓰기 거부 |

라이프사이클은 Standard 90일 보관 후 만료, 옛 버전 7일 뒤 삭제, 끊긴 멀티파트 업로드 1일 뒤 정리예요.

```bash
aws s3api put-bucket-lifecycle-configuration --bucket reserve-it-kr-backup --lifecycle-configuration '{"Rules":[{"ID":"mysql-90d","Filter":{"Prefix":"mysql/"},"Status":"Enabled","Expiration":{"Days":90},"NoncurrentVersionExpiration":{"NoncurrentDays":7},"AbortIncompleteMultipartUpload":{"DaysAfterInitiation":1}}]}'
```

버킷 정책:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "DenyInsecureTransport",
    "Effect": "Deny",
    "Principal": "*",
    "Action": "s3:*",
    "Resource": [
      "arn:aws:s3:::reserve-it-kr-backup",
      "arn:aws:s3:::reserve-it-kr-backup/*"
    ],
    "Condition": { "Bool": { "aws:SecureTransport": "false" } }
  }]
}
```

`reserve-backup-uploader`에는 인라인 정책 `reserve-backup-put-only`로 쓰기만 줘요.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PutBackupObjectsOnly",
      "Effect": "Allow",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::reserve-it-kr-backup/mysql/*"
    }
  ]
}
```

- 스크립트는 5GB 이하 파일을 `s3api put-object` 한 번으로 올려요
- 복원에 필요한 `s3:GetObject`/`ListBucket`은 관리자 또는 단기 복원 자격증명으로 써요
- 이미지용 `reserve-s3-user`는 인라인 정책 `reserve-app-images-rw`로 `reserve-it-kr-bucket/*`의 PutObject·GetObject·DeleteObject만 가져요

### 1-4. cron 등록

여러 번 실행해도 줄이 중복되지 않아요.

```bash
( sudo crontab -l 2>/dev/null | grep -v '/usr/local/bin/reserve-backup'; echo '10 18 * * * /usr/local/bin/reserve-backup >/dev/null 2>&1' ) | sudo crontab -
sudo crontab -l | grep reserve-backup; date   # 서버는 UTC — 18:10 UTC = 03:10 KST
```

### 1-5. 첫 실행 확인

```bash
sudo /usr/local/bin/reserve-backup
tail -20 /var/log/reserve/backup.log
ls -lh /var/backups/reserve/
```

로그에 `verified: ... , NN tables`와 `upload ok`가 찍히면 정상이에요. S3 쪽은 CloudShell에서 `aws s3 ls s3://reserve-it-kr-backup/mysql/ --human-readable`로 확인해요.

## 2. 복원

### 2-1. 백업 목록 확인

```bash
sudo reserve-restore --list   # 설정 파일이 root 전용이라 sudo가 필요하다. S3 목록은 서버에 aws가 없어 "(unavailable)"로 나온다
```

### 2-2. 검증만 (DB를 건드리지 않음)

```bash
sudo reserve-restore --dry-run /var/backups/reserve/reserve-20260731-031000.sql.gz
```

### 2-3. 실제 복원 (운영)

운영 복원은 별도 승인 후에만 실행해요. 파일의 생성 시각·테이블 수를 현재 스키마와 대조하고,
`--dry-run`을 통과한 실제 경로로 `RESTORE_FILE`을 바꿔요. 아래 명령은 같은 셸에서 실행해요.
어느 단계든 실패하면 다음 단계나 다른 색상 기동으로 넘어가지 않아요.

```bash
(
  set -euo pipefail
  RESTORE_FILE='/var/backups/reserve/reserve-YYYYMMDD-HHMMSS.sql.gz'
  test -f "$RESTORE_FILE"
  command -v jq >/dev/null
  sudo reserve-restore --dry-run "$RESTORE_FILE"

  # 1. nginx의 현재 대상을 먼저 확인한다. 잘못된 설정이면 쓰기 차단 전에 중단한다.
  SERVICE_ENV_LINE=$(sudo docker exec nginxserver cat /etc/nginx/conf.d/service-env.inc | tr -d '\r\n')
  case "$SERVICE_ENV_LINE" in
    'set $service_url blue;') ACTIVE_COLOR=blue; ACTIVE_PORT=8080 ;;
    'set $service_url green;') ACTIVE_COLOR=green; ACTIVE_PORT=8081 ;;
    *) echo 'Invalid nginx upstream; refusing to restore' >&2; exit 1 ;;
  esac
  sudo docker inspect "$ACTIVE_COLOR" >/dev/null

  # 2. 쓰기를 차단하고 지금 상태를 백업한다(잘못 복원했을 때의 되돌릴 지점).
  sudo docker stop blue green 2>/dev/null || true
  if sudo docker ps --format '{{.Names}}' | grep -Exq 'blue|green'; then
    echo 'An app container is still running; refusing to restore' >&2
    exit 1
  fi
  sudo /usr/local/bin/reserve-backup

  # 3. 복원 — 'RESTORE reserve'를 입력해야 진행된다.
  sudo reserve-restore "$RESTORE_FILE"

  # 4. 기존 활성 컨테이너를 시작한다. 수동 셸의 빈 CI 시크릿으로 재생성하지 않는다.
  sudo docker start "$ACTIVE_COLOR"
  HEALTH_BODY=
  for attempt in {1..12}; do
    HEALTH_BODY=$(curl -fsS --max-time 10 "http://127.0.0.1:${ACTIVE_PORT}/actuator/health" 2>/dev/null) || HEALTH_BODY=
    if printf '%s\n' "$HEALTH_BODY" | jq -e '.status == "UP"' >/dev/null 2>&1; then break; fi
    sleep 5
  done
  printf '%s\n' "$HEALTH_BODY" | jq -e '.status == "UP"' >/dev/null
  API_BODY=$(curl -fsS --max-time 20 --resolve reserve.it.kr:443:127.0.0.1 \
    'https://reserve.it.kr/api/stores?page=0&size=1')
  printf '%s\n' "$API_BODY" | jq -e '.success == true and (.data.content | type == "array")' >/dev/null
)
```

공개 `/actuator/health`의 HTTP 200만으로 백엔드가 정상이라고 판단하지 않아요.
그 경로가 HTML SPA를 반환할 수 있으므로, 활성 포트의 Actuator JSON `status=UP`과
nginx 경유 공개 API JSON을 각각 확인해요. 로컬 덤프 격리 복원 성공도 이 운영 절차의 리허설이나
S3 원본 복원 성공을 뜻하지 않아요.

명령 분기와 중단 조건은 레포 루트에서 `node --test scripts/tests/backup-runbook.test.mjs`로
검사할 수 있어요. 모든 외부 명령을 대체한 모의 검사이므로 앱 중단·백업·DB 복원은 실행하지 않아요.
blue/green 선택, 잘못된 upstream, 남은 쓰기 프로세스, 현재 상태 백업 실패와 HTML 응답 거부를
검사하며, 실제 격리 DB 복원 훈련을 대신하지 않아요.

### 2-4. S3에서 복원

CloudShell(관리자 권한)에서 10분짜리 임시 다운로드 주소를 만들고, 서버는 그 주소로 파일을 받아요.

```bash
# CloudShell
aws s3 ls s3://reserve-it-kr-backup/mysql/ --human-readable
aws s3 presign s3://reserve-it-kr-backup/mysql/reserve-20260731-031000.sql.gz --expires-in 600

# 서버 — 위에서 나온 주소를 따옴표로 감싸 붙여 넣는다
curl -fsSL -o /var/backups/reserve/reserve-20260731-031000.sql.gz '<presigned URL>'
sudo reserve-restore --dry-run /var/backups/reserve/reserve-20260731-031000.sql.gz
```

### 2-5. 백업과 앱 버전의 스키마 호환 확인

백업 생성 뒤 필드가 추가됐으면 SQL 복원이 성공해도 최신 앱이 바로 기동하지 않을 수 있다.
**백업 객체 → MySQL 복원 → 해당 앱 이미지의 스키마 대조 → 앱 기동 → 실제 API 본문**을
한 묶음으로 확인한다. 변경 전 백업과 이미지를 보존하고, 필요한 DDL을 승인한 뒤 적용한다.
백업의 스키마를 최신 스키마와 같다고 가정하지 않는다.

10/2에는 실제 운영 이미지
`hanjeun/reserve@sha256:be607831a3a095a47c3b92eacf83956400bd34f0036d6c0653077ae9b47b21fe`
와 독립 S3 백업을 Linux MySQL 8.0.45 격리 컨테이너에서 함께 확인했다.
처음 `ddl-auto: validate` 기동은 `store.image_autoplay_enabled` 누락으로 실패했다.
격리 DDL 계정으로 현재 앱의 `update`를 실행하자 이 컬럼 하나가 추가됐고,
원래 컬럼 값을 행별로 직렬화한 해시와 행 수가 모두 같았다.
그 뒤 데이터 조회 권한만 가진 시험 계정으로 `validate` 기동과 컨테이너 재시작을 통과했다.

- 직접 Actuator는 JSON `status=UP`, 가게 목록 API는 `success=true`·배열 본문이었다.
- 재시작 전후 34테이블의 `CHECKSUM TABLE ... EXTENDED` 결과와 기존 데이터 해시가 같았다.
- `JAVA_OPTS`의 heap·GC·시스템 속성이 실제 PID 1의 Java 인자에 포함됐고 실행 UID는 100이었다.
- 외부 통신은 차단했고, 메일·PG·AWS·OAuth에는 합성 키만 사용했다. 시험 컨테이너는 제거했다.

이 검증은 **DB와 현재 백엔드 이미지의 격리 복구** 범위다. 운영 서버 중단·재부팅,
nginx Blue/Green 실패 전환, 이전 프론트 lazy 자산의 보존, 실제 PG·S3 호출과
앱에서의 전체 사진·과거 암호화 키 호환은 별도 검증한다.

## 3. 복원 훈련 (분기 1회)

운영 DB를 건드리지 않고 별도 DB로 복원해 확인해요.

```bash
# 관리자 복원 설정은 root 셸 안에서만 읽는다. 백업 계정으로 복원하지 않는다.
sudo bash <<'BASH'
set -euo pipefail
. /etc/reserve-restore.env
export MYSQL_PWD="${DB_PASSWORD:?}"

# 아래 고정 이름의 기존 훈련 DB가 있으면 덮어쓴다. 운영 DB는 대상이 아니다.
F=$(find /var/backups/reserve -maxdepth 1 -name 'reserve-*.sql.gz' -type f | sort | tail -n 1)
test -n "$F"
reserve-restore --dry-run "$F"
reserve-restore --target reserve_restore_test "$F"

# 백업 시각 이후의 운영 변경은 DIFF가 날 수 있다.
docker exec -e MYSQL_PWD -e DB_USER="${DB_USER:-root}" mysql sh -c '
  set -eu
  tables=$(mysql --user="$DB_USER" -N -e "SELECT table_name FROM information_schema.tables WHERE table_schema=\"reserve\"")
  for t in $tables; do
    a=$(mysql --user="$DB_USER" -N -e "SELECT COUNT(*) FROM reserve.$t")
    b=$(mysql --user="$DB_USER" -N -e "SELECT COUNT(*) FROM reserve_restore_test.$t")
    if [ "$a" = "$b" ]; then echo "same $t $a"; else echo "DIFF $t prod=$a restored=$b"; fi
  done'

# 대조 후 훈련 DB 하나만 제거한다. 운영 데이터베이스 이름으로 바꾸지 않는다.
docker exec -e MYSQL_PWD mysql mysql --user="${DB_USER:-root}" -e 'DROP DATABASE reserve_restore_test;'
unset MYSQL_PWD DB_PASSWORD
BASH
```

## 4. 서버 재구축 시 MySQL 되살리기

레포의 `docker-compose-mysql.yml`을 써요. 기존 서버라면 파일 상단 주석의 `docker inspect` 대조 절차를 먼저 해요. 데이터는 볼륨 `mysql-data`(`/var/lib/mysql`)에 있어요.

신규 서버라면:

```bash
docker network create app-network            # 없다면
export DB_PASSWORD=<운영 DB 비밀번호>
sudo -E docker compose -f docker-compose-mysql.yml up -d

# 최신 백업으로 복원 — S3에서 받는 방법은 2-4
sudo reserve-restore /var/backups/reserve/<최신파일>
```

## 5. 모니터링

백업 전용 Promtail job을 반영한 서버는 Loki `{job="backup"}`에서 봐요.

```logql
{job="backup"} |= "backup done"
{job="backup"} |= "upload ok"
{job="backup"} |= "ERROR"
```

최근 26시간 동안 완료 로그가 없으면 알리는 규칙은 [모니터링](monitoring.md)을 따라요.
운영 설치본의 26시간 창·No data/Error Alerting과 활성 상태를 확인했어요. 실제 정기 실행의 새
backup 스트림과 자연 평가·메일 수신은 별도로 확인해요. 기존 메일 한 경로를 유지해요. 기존 positions를 초기화하거나 과거 로그를
재주입해서 수집 성공으로 만들지 않아요.

Loki 결과가 비어 있으면 root cron, 원본 `backup.log`, 로컬 덤프와 S3 최신 객체를 각각
읽기 전용으로 대조해요. 수집 실패와 백업 실패는 달라요. 업로더의 PutObject 권한은
HeadObject/GetObject/ListBucket을 보장하지 않으며, 403은 객체가 없다는 증거가 아니에요.

## 6. 복구 범위

- RPO는 24시간이에요. 마지막 백업 이후 데이터는 복구되지 않아요
- `--single-transaction`은 InnoDB 테이블을 전제로 해요. 확인: `SELECT table_name, engine FROM information_schema.tables WHERE table_schema='reserve' AND engine <> 'InnoDB';`

## 7. 운영 DB 계정과 비밀번호 교체

2026-10-02 같은 운영 이미지에서 앱 접속을 `reserve_app`으로 바꾸고 Hibernate를
`validate`로 전환했어요. 엔티티 33개를 제한된 계정으로 먼저 검증했고, 전환 뒤
건강 검사·공개 JSON API·앱 연결 10개·읽기 전용 verifier가 통과했어요.
원래 컨테이너와 설정은 `/var/backups/reserve-scripts/20261002-before-db-roles/`에
보존해요. 계정 전환은 새 앱 버전 배포와 별개예요.

새 릴리스의 blue/green Compose는 앱 계정과 `validate`를 고정해요.
`DB_APP_PASSWORD`가 비면 Compose와 배포 시작 단계가 실패하며 root 비밀번호로 대체하지 않아요.
새 배포 작업에는 관리자 Secret `DB_PASSWORD`를 전달하지 않아요. 이전 main의 재실행은
여전히 옛 설정을 사용하므로 피하고, 기존 `DB_USERNAME`·`DB_DDL_AUTO` Variables는
새 릴리스 적용 전까지 유지해요.

| 대상 | 계정·권한 | 설정 위치 |
|---|---|---|
| 앱 | `reserve_app@172.18.0.0/255.255.0.0`, SELECT·INSERT·UPDATE·DELETE | 서버 컨테이너; 새 Compose는 `reserve_app`·`validate` 고정, GitHub Secret `DB_APP_PASSWORD` |
| DDL | `reserve_ddl@172.18.0.0/255.255.0.0`, SELECT·CREATE·ALTER·DROP·INDEX·REFERENCES | 서버 역할 보관본; 자동 실행하지 않음 |
| 백업 | `reserve_backup@localhost`, SELECT·SHOW VIEW·TRIGGER·EVENT·SHOW_ROUTINE | `/etc/reserve-backup.env` |
| 복원·관리자 | root | `/etc/reserve-restore.env`; 기존 GitHub 관리자 Secret `DB_PASSWORD` |

백업 역할은 데이터 쓰기 권한이 없지만 TRIGGER·EVENT 정의 권한을 포함하므로
절대적인 읽기 전용 계정으로 설명하지 않아요. 역할 보관본은 `/etc/reserve-db-roles.json`
(root 600)에 있어요. 키·비밀번호 값은 명령 출력이나 문서에 남기지 않아요.

새 릴리스의 스키마는 해당 JAR로 `scripts/java/kr/it/reserve/tools/VerifyDatabaseSchema.java`를 실행해
확인해요. 이 도구는 앱을 부팅하지 않고 제한된 앱 계정으로 스키마만 검증해요.
필요한 DDL은 대상·롤백을 검토해 별도로 적용하며 검증 실패를 `update`로 우회하지 않아요.

비밀번호는 역할마다 독립적으로 교체해요. root 교체 시 앱·백업 비밀번호를 root 값으로
바꾸거나 기존 main CI를 재실행하지 않아요. 해당 계정에 새 비밀번호를 추가하고
(RETAIN CURRENT PASSWORD), 해당 계정의 설정만 갱신해 연결을 검증해요.
관리자는 복원 설정과 GitHub 관리자 Secret, 앱은 앱 Secret과 접속 설정,
백업은 백업 설정과 실제 덤프를 확인해요. 해당 사용처가 전부 전환된 뒤 그 계정의
옛 비밀번호만 DISCARD OLD PASSWORD로 폐기해요. 교체 전에는 구체적인 운영 승인과
복구 경로를 확인해요.

## 복원 훈련 이력

| 날짜 | 대상 | 확인한 범위 |
|---|---|---|
| 2026-10-02 | S3 `reserve-20260930-181001.sql.gz`, 34 tables·13,883 bytes | Linux MySQL 8.0.45 독립 복원 34테이블·66행, `CHECK TABLE` 34건 성공; 원본 객체 해시 확인, 운영 DB 불변; 새 정기 백업은 별도 확인 |
| 2026-10-02 | 최소 권한 합성 fixture | 현재 백업 스크립트로 12테이블·뷰·프로시저·트리거·이벤트 복원 성공; `SHOW_ROUTINE` 누락 시 성공 코드의 프로시저 생략 재현; S3 업로드 stub, 운영 계정 불변 |
| 2026-10-03 | S3 `reserve-20261002-181001.sql.gz`, 34 tables·13,943 bytes | CloudShell·PC 독립 다운로드와 서버 SHA-256 일치; 격리 MySQL 8.0.45 복원 34테이블·62행 및 `CHECK TABLE` 34건 성공; `token_hash` INSTANT DDL 확인; 운영 DB 복원 아님 |
