# Third-Party Notices

RESERVE bundles third-party open-source software. All dependencies are
distributed under permissive licenses; their copyright and license notices
are retained in accordance with those licenses. This file does not change the
license of RESERVE itself (all rights reserved).

## Frontend (npm)

License summary (production + dev, via `license-checker`):
MIT 263, ISC 22, Apache-2.0 13, BSD-2-Clause 7, BSD-3-Clause 4,
0BSD 1, Python-2.0 1, CC-BY-4.0 1, OFL-1.1 1 (fonts).
No copyleft (GPL / LGPL / AGPL / MPL) dependencies are present.

Regenerate the full per-package list:

    cd frontend && npx license-checker --production --out ../THIRD_PARTY_frontend.txt

## Backend (Gradle)

Spring Boot, Jackson, JJWT, AWS SDK, Bucket4j and other libraries are licensed
under Apache-2.0 or MIT.

Database driver: MySQL Connector/J (com.mysql:mysql-connector-j) is licensed
under GPL-2.0 with the Universal FOSS Exception. It is used only as a runtime
JDBC driver on the server and is not redistributed as part of a product. To
avoid GPL entirely, MariaDB Connector/J (LGPL-2.1) is a drop-in alternative.