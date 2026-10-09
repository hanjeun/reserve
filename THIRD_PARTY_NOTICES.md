# 제3자 소프트웨어 고지 / Third-Party Notices

[한국어](#한국어) · [English](#english)

## 한국어

RESERVE가 쓰는 제3자 소프트웨어와 글꼴의 라이선스 안내예요. RESERVE 자체의 권리와 각 의존성의 라이선스는 별개예요. 이 안내는 원문 라이선스나 개별 저작권 고지를 대체하지 않고, 허용·의무 판단은 해당 버전의 원문을 기준으로 해요.

### 프론트엔드 (npm)

- 각 패키지의 LICENSE·NOTICE·저작권 고지를 유지해야 해요.
- 전체 의존성이 허용적 라이선스라거나 copyleft가 없다고 보장하지 않아요.
- 릴리스 후보를 확정한 뒤 고정 버전의 감사 도구로 설치된 의존성을 다시 검사하고, 프로덕션 전용 결과와 개발 의존성 포함 결과를 구분해요.
- 패키지 매니저의 license 필드만으로는 원문 고지 포함 여부나 모든 배포 의무를 확인할 수 없어요.

### 함께 제공하는 글꼴

| 글꼴 | 도입 버전/선언 | 파일 | 라이선스 |
|---|---|---|---|
| Pretendard | npm `pretendard@^1.3.9` (정확한 버전은 lockfile 기준) | `frontend/src/index.css` import | OFL-1.1 |
| SUITE | 기존 도입 기록: 2.0.4 | `frontend/public/fonts/SUITE-Variable.woff2` | OFL-1.1 |

원본: [Pretendard](https://github.com/orioncactus/pretendard), [SUITE](https://github.com/sun-typeface/SUITE).

- 포함·재배포할 때 [SIL Open Font License 1.1 원문](https://openfontlicense.org/open-font-license-official-text/)과 각 글꼴의 저작권 고지를 함께 유지해야 해요.
- npm 밖에 저장한 글꼴은 npm 라이선스 도구 검사만으로 확인되지 않아요.
- SUITE 2.0.4 원본과 글꼴 파일의 해시가 같아요. [SUITE-LICENSE.txt](frontend/public/fonts/SUITE-LICENSE.txt)에 원문 고지를 함께 보관해요. 실제 릴리스 산출물에 원문이 동봉되는지도 확인해요.

### 백엔드 (Gradle)

`bootJar`는 실제 production runtime JAR의 원문 고지와, JAR에 빠진 해당 버전의 공식 원문을 `META-INF/THIRD_PARTY_NOTICES.txt`에 동봉해요. `backend/licenses/supplemental.json`에 원본 출처와 JAR·문서 SHA-256을 고정하며, 누락·변경이 있으면 빌드를 중단해요. 빌드 중에는 고지를 새로 다운로드하지 않아요. 원문 동봉은 바이너리 배포 방식에 따른 모든 의무를 충족했다는 보장이 아니에요.

Spring Boot, Jackson, JJWT, AWS SDK 등의 원문 라이선스·고지를 보존해야 해요. 백엔드 전체가 MIT/Apache-2.0이라고 단정하지 않아요.

의존성 [PR #318](https://github.com/hanjeun/reserve/pull/318)의 Sentry Java `8.59.0` 후보는 해당 태그의 [원문 LICENSE](https://github.com/getsentry/sentry-java/blob/8.59.0/LICENSE)를 `backend/licenses/upstream/sentry-8.59.0.txt`에 보존하고, 실제 Maven Central JAR 5종의 SHA-256을 보충 목록에 연결했어요. 기존 `8.58.0` 고지는 함께 유지해요. 이번 로컬 출시 후보의 build·lockfile은 `8.59.0`을 선택했으며, 운영 적용과 최종 실행 JAR의 원문 동봉 확인은 별도로 진행해요.

같은 PR의 AWS SDK `2.55.11` JAR 30종은 각 아티팩트의 `META-INF/LICENSE.txt`·`NOTICE.txt`를 제공해요. `third-party-jackson-core`의 추가 LICENSE·NOTICE도 기존 수집 규칙에 포함돼요. BOM과 Gradle wrapper는 production runtime JAR 목록과 구분하며, 후보 버전과 실제 릴리스 산출물의 고지 목록을 출시 단계에서 대조해요.

**MySQL Connector/J** — 현재 lockfile의 `9.7.0`은 GPLv2와 추가 허용 및 Universal FOSS Exception 적용 대상이에요. [해당 버전 원문](https://github.com/mysql/mysql-connector-j/blob/9.7.0/LICENSE)을 확인해요. runtime 의존성도 실행 JAR·Docker 이미지에 포함되므로, 서버에서만 쓴다고 재배포 의무가 없다고 단정할 수 없어요. 외부에 바이너리/이미지를 제공한다면 배포 방식과 예외 적용 조건을 따로 검토해야 해요.

**MariaDB Connector/J** — LGPL 계열 라이선스라 무조건적인 copyleft 회피책이 아니에요. 드라이버 교체는 라이선스 판단과 JDBC URL·옵션·트랜잭션 호환성 검증이 필요한 별도 변경이에요. [MariaDB 공식 안내](https://mariadb.com/docs/connectors/mariadb-connector-j/about-mariadb-connector-j)

Vite 빌드는 실제 출력 청크가 사용한 npm 패키지의 LICENSE·NOTICE를 `THIRD_PARTY_NOTICES.txt`에 동봉해요.
루트 고지가 없는 icons-svg·victory-vendor는 해당 버전의 공식 저장소 원문을 함께 보관해요.
is-mobile의 원문은 패키지 README의 License 절에 있어요. victory-vendor 내부의 D3 고지도 포함해요.
이번 후보의 PortOne browser-sdk `0.1.13`은 패키지에 `(MIT OR Apache-2.0)`을 선언하고 `LICENSE-MIT`·`LICENSE-APACHE` 원문을 제공해요. Vite는 실제 출력 청크에 사용된 버전의 두 원문을 수집해요. 이전 `0.1.11`의 라이선스 선언·원문 부재와 공식 연동 안내/README 보존은 그 버전에 해당하며 새 버전의 원문으로 대신하지 않아요.

## English


This notice describes third-party software and fonts used by RESERVE. Rights in RESERVE and licenses of its dependencies are separate. This summary does not replace upstream license texts or individual copyright notices; the applicable version's original terms control.

### Frontend (npm)

- Keep each package's LICENSE, NOTICE and copyright notices.
- This document does not certify that every dependency is permissively licensed or copyleft-free.
- Audit the finalized release with a pinned tool version, distinguishing production-only dependencies from the full development inventory.
- Package metadata alone does not establish notice inclusion or complete distribution compliance.

### Bundled fonts

| Font | Recorded version/declaration | File | License |
|---|---|---|---|
| Pretendard | npm `pretendard@^1.3.9` (resolved version in lockfile) | Imported by `frontend/src/index.css` | OFL-1.1 |
| SUITE | Adoption record: 2.0.4 | `frontend/public/fonts/SUITE-Variable.woff2` | OFL-1.1 |

Upstream: [Pretendard](https://github.com/orioncactus/pretendard), [SUITE](https://github.com/sun-typeface/SUITE).

- Retain the [SIL Open Font License 1.1](https://openfontlicense.org/open-font-license-official-text/) and each font's copyright notices when bundling or redistributing.
- Fonts vendored outside npm require separate verification.
- The font matches the upstream SUITE 2.0.4 file by hash. Its original notice accompanies it in [SUITE-LICENSE.txt](frontend/public/fonts/SUITE-LICENSE.txt). Verify inclusion in actual release artifacts separately.

### Backend (Gradle)

`bootJar` bundles the actual production dependencies' original notices into `META-INF/THIRD_PARTY_NOTICES.txt`. Version-specific supplemental texts and source/JAR/document hashes are pinned in `backend/licenses/supplemental.json`; missing or changed originals fail the build. Builds never fetch notice texts. Notice inclusion does not certify every external binary distribution obligation.

Retain upstream licenses and notices for Spring Boot, Jackson, JJWT, AWS SDK and other dependencies. Do not assume the entire backend is MIT/Apache-2.0 licensed.

## RESERVE camera/browser states and policy menu illustrations

The six Dots illustrations `camera-denied`, `camera-unavailable`, `browser-unsupported`, `edit-booking-policy`, `edit-deposit`, and `edit-refund` retain the delivered CC0 1.0 image/model notices and MIT production-code notice. Original Blender files, code, PNG/WebP, manifests and checksum lists are preserved under `frontend/src/assets/state-illustrations/source/camera-browser-states-v1` and `frontend/src/assets/choice-icons/source/policy-menu-icons-v1`. Builds bundle each kit's asset notice, full CC0 text and MIT text in `THIRD_PARTY_NOTICES.txt`.

Both archives contain prior notices whose names differ only by `LICENSE-ASSETS.txt` versus `LICENSE-assets.txt`. Windows cannot keep those names together, so the lowercase copy is stored as `LICENSE-assets-lowercase.txt`; its bytes and the delivered checksum list remain unchanged. All 50 and 52 declared source hashes were verified against the original archives before import; existing project assets and downloaded ZIPs are preserved.

For the Sentry Java `8.59.0` candidate in [PR #318](https://github.com/hanjeun/reserve/pull/318), the tag's [original LICENSE](https://github.com/getsentry/sentry-java/blob/8.59.0/LICENSE) is retained in `backend/licenses/upstream/sentry-8.59.0.txt`, with hashes for all five Maven Central JARs pinned in the supplemental manifest. The `8.58.0` notices remain available. The local release candidate's build and lockfile select `8.59.0`; production application and original-notice verification in the final executable JAR remain separate steps.

The same PR's 30 AWS SDK `2.55.11` JARs supply `META-INF/LICENSE.txt` and `NOTICE.txt`; the additional LICENSE/NOTICE entries in `third-party-jackson-core` also match the existing collection rule. The BOM and Gradle wrapper are separate from the production runtime JAR inventory. Compare the chosen versions and packaged notices at release time.

**MySQL Connector/J** — The locked `9.7.0` is GPLv2 with additional permissions and the Universal FOSS Exception. See its [original license](https://github.com/mysql/mysql-connector-j/blob/9.7.0/LICENSE). Runtime dependencies are bundled into the executable JAR/Docker image. Server use alone does not establish absence of distribution obligations; review external binary/image distribution separately.

**MariaDB Connector/J** — LGPL licensed, not an unconditional copyleft workaround. Switching drivers requires separate licensing and JDBC compatibility review. [MariaDB documentation](https://mariadb.com/docs/connectors/mariadb-connector-j/about-mariadb-connector-j)
