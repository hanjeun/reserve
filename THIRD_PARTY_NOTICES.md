# 제3자 소프트웨어 고지 / Third-Party Notices

[한국어](#한국어) · [English](#english)

## 한국어

RESERVE가 사용하는 제3자 소프트웨어와 글꼴의 라이선스 안내입니다. RESERVE 자체의 권리와
각 의존성의 라이선스는 별개입니다. 이 안내는 원문 라이선스나 개별 저작권 고지를 대체하지
않으며, 허용·의무의 판단은 해당 버전의 원문을 기준으로 합니다.

### 프론트엔드 (npm)

각 패키지의 LICENSE·NOTICE·저작권 고지를 유지해야 합니다. 이전 문서의 라이선스별 개수는
현재 package-lock.json을 재감사한 결과가 아니므로 삭제했습니다. 전체 의존성이 허용적
라이선스라는 주장이나 copyleft가 없다는 보장은 하지 않습니다.

릴리스 후보를 확정한 뒤 고정 버전의 감사 도구로 설치된 의존성을 다시 검사하고,
프로덕션 전용 결과와 개발 의존성 포함 결과를 구분합니다. 패키지 매니저의 license 필드만으로
원문 고지 포함 여부나 모든 배포 의무를 확인할 수는 없습니다.

### 함께 제공하는 글꼴

| 글꼴 | 도입 버전/선언 | 파일 | 라이선스 |
|---|---|---|---|
| Pretendard | npm `pretendard@^1.3.9` (정확한 버전은 lockfile 기준) | `frontend/src/index.css` import | OFL-1.1 |
| SUITE | 기존 도입 기록: 2.0.4 | `frontend/public/fonts/SUITE-Variable.woff2` | OFL-1.1 |

원본: [Pretendard](https://github.com/orioncactus/pretendard),
[SUITE](https://github.com/sun-typeface/SUITE).
[SIL Open Font License 1.1 원문](https://openfontlicense.org/open-font-license-official-text/)과
각 글꼴의 저작권 고지를 포함·재배포 시 함께 유지해야 합니다. npm 밖에 저장한 글꼴은 npm
라이선스 도구의 검사만으로 확인되지 않습니다. 현재 vendored SUITE 파일 옆에는 원문 고지
파일이 없으므로, 배포 산출물의 원문 동봉은 별도로 확인해야 합니다.

### 백엔드 (Gradle)

Spring Boot, Jackson, JJWT, AWS SDK 등의 원문 라이선스·고지를 보존해야 합니다.
백엔드 전체가 MIT/Apache-2.0이라고 단정하지 않습니다.

현재 lockfile의 MySQL Connector/J `9.4.0`은 GPLv2와 추가 허용 및 Universal FOSS
Exception 적용 대상입니다. [해당 버전 원문](https://github.com/mysql/mysql-connector-j/blob/9.4.0/LICENSE)을
확인합니다. runtime 의존성도 실행 JAR·Docker 이미지에 포함되므로, 서버 사용만으로 재배포
의무가 없다고 단정할 수 없습니다. 외부에 바이너리/이미지를 제공하는 경우 배포 방식과
예외 적용 조건을 따로 검토해야 합니다.

MariaDB Connector/J 역시 LGPL 계열 라이선스이며 무조건적인 copyleft 회피책은 아닙니다.
드라이버 교체는 라이선스 판단과 JDBC URL·옵션·트랜잭션 호환성 검증이 필요한 별도 변경입니다.
[MariaDB 공식 안내](https://mariadb.com/docs/connectors/mariadb-connector-j/about-mariadb-connector-j)

## English

This notice describes third-party software and fonts used by RESERVE. Rights in RESERVE
and licenses of its dependencies are separate. This summary does not replace upstream
license texts or individual copyright notices; the applicable version's original terms control.

### Frontend (npm)

Keep each package's LICENSE, NOTICE and copyright notices. Historical package counts
were removed because they have not been re-audited against the current lockfile.
This document does not certify that every dependency is permissively licensed or copyleft-free.

Audit the finalized release with a pinned tool version, distinguishing production-only
dependencies from the full development inventory. Package metadata alone does not establish
notice inclusion or complete distribution compliance.

### Bundled fonts

| Font | Recorded version/declaration | File | License |
|---|---|---|---|
| Pretendard | npm `pretendard@^1.3.9` (resolved version in lockfile) | Imported by `frontend/src/index.css` | OFL-1.1 |
| SUITE | Adoption record: 2.0.4 | `frontend/public/fonts/SUITE-Variable.woff2` | OFL-1.1 |

Upstream: [Pretendard](https://github.com/orioncactus/pretendard),
[SUITE](https://github.com/sun-typeface/SUITE).
Retain the [SIL Open Font License 1.1](https://openfontlicense.org/open-font-license-official-text/)
and each font's copyright notices when bundling or redistributing.
Fonts vendored outside npm require separate verification. No upstream notice file currently
accompanies the vendored SUITE file in its directory; inclusion in release artifacts remains to be checked.

### Backend (Gradle)

Retain upstream licenses and notices for Spring Boot, Jackson, JJWT, AWS SDK and other
dependencies. Do not assume the entire backend is MIT/Apache-2.0 licensed.

The locked MySQL Connector/J `9.4.0` is GPLv2 with additional permissions and the
Universal FOSS Exception. See its [original license](https://github.com/mysql/mysql-connector-j/blob/9.4.0/LICENSE).
Runtime dependencies are bundled into the executable JAR/Docker image. Server use alone does
not establish absence of distribution obligations; review external binary/image distribution separately.

MariaDB Connector/J is LGPL licensed, not an unconditional copyleft workaround.
Switching drivers requires separate licensing and JDBC compatibility review.
[MariaDB documentation](https://mariadb.com/docs/connectors/mariadb-connector-j/about-mariadb-connector-j)
