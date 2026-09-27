# 지역 대표 사진 API

2026-09-21 기준이다. 지역 선택 화면은 한국관광공사 관광정보 API에서 서버가 확인한 사진만 사용한다. 프런트 번들에는 지역 사진을 저장하지 않는다. 지역 사진이 없거나 프록시 이미지가 실패하면 outline 핀 아이콘을 표시한다.

지자체 CI·BI와 로고는 사용하지 않는다. 사진은 지역 선택을 돕는 관광 대표 이미지이며, 공공기관과의 제휴나 보증을 나타내지 않는다.

## 이용 조건

- 서버는 `detailImage2` 응답의 `cpyrhtDivCd`가 공공누리 제1유형인 사진만 카탈로그에 등록한다.
- 상업 이용 제한이 있는 제2·4유형과 변경 금지인 제3·4유형은 등록하지 않는다.
- 화면의 출처 링크와 공개 `/content-sources#region-photos` 표에는 제공기관, 저작물명, 콘텐츠 ID, 이용 조건, 확인일을 표시한다.
- 원본 이미지 바이트와 160 × 160 가공본은 프런트나 S3에 보관하지 않는다.

## 서버 구현

데이터 원본은 [한국관광공사 국문 관광정보 서비스 GW](https://www.data.go.kr/data/15101578/openapi.do?recommendDataYn=Y)다. 서비스 키, 원본 URL, 외부 API 응답은 브라우저에 내보내지 않는다.

1. `areaBasedList2`에서 고정된 17개 시도 코드별 후보를 찾는다.
2. 후보 네 건까지 `detailImage2`로 다시 확인한다.
3. 조건을 통과한 항목의 지역 코드, 콘텐츠 ID, 제공기관, 저작물명, 원본 URL, 출처 URL, 이용 조건, 확인 시각을 MySQL `tourism_region_photo`에 저장한다.
4. 화면에는 `/api/tourism/region-photos/{region}/image` 프록시 주소만 반환한다. 프록시는 등록된 `visitkorea.or.kr` 이미지만 읽고 MIME과 8MB 상한을 확인한다.
5. 정상 항목은 30일, 실패한 지역은 6시간 동안 캐시한다. 이전 카탈로그가 있으면 외부 조회 실패에도 그 항목을 유지한다.

MySQL에는 사진 바이트가 아니라 검증 카탈로그만 저장한다. 이미지 바이트는 요청 시 서버 프록시가 전달한다.

17개 시도 코드는 지원 범위이며, 시작할 때 모든 사진을 미리 등록한다는 뜻은 아니다. 지역 선택 화면은 현재 표시하는 인기 지역의 시도만 최대 6개씩 요청한다. 새 시도가 인기 목록에 나타나면 서버가 같은 검증 절차로 자동 등록한다. 사람이 지역별 사진을 추가할 필요는 없다.

## 공개 API와 출처 표기

| 경로 | 용도 | 브라우저에 공개되는 값 |
|---|---|---|
| `GET /api/tourism/region-photos?regions=서울,경기` | 최대 6개 시도의 검증 사진 조회 | 내부 이미지 프록시 경로와 출처 카탈로그 |
| `GET /api/tourism/region-photos/catalog` | 콘텐츠 출처·권리 안내 표 | 제공기관, 저작물명, 콘텐츠 ID, 이용 조건, 확인일 |
| `GET /api/tourism/region-photos/{region}/image` | 검증된 이미지를 같은 출처로 전달 | 이미지 바이트만 |

`/content-sources#region-photos`는 DB 카탈로그로만 표를 만든다. 화면별로 출처 문구를 복제하지 않는다.

## 키 보관과 실행

발급 키는 대화, Git, `application-secret.yml`, 프런트 `.env`에 넣지 않는다. 로컬에서는 백엔드를 시작하는 IDE 또는 PowerShell 프로세스에만 `TOURISM_API_SERVICE_KEY`를 설정한다.

```powershell
# 현재 PowerShell 세션에서만 사용하는 예시. 실제 키를 채팅이나 문서에 기록하지 않는다.
$env:TOURISM_API_SERVICE_KEY = '<발급받은 서비스키>'
cd backend
.\gradlew.bat bootRun
```

새 터미널이나 IDE는 이미 떠 있는 프로세스의 환경변수를 물려받지 않는다. 사용자 환경변수에 등록했다면 새로 열어야 한다. 운영은 GitHub Secret `TOURISM_API_SERVICE_KEY` → CI/CD SSH 환경변수 → Blue/Green Compose 환경변수 순으로 전달한다. 실제 운영 API 응답 확인은 배포 승인 뒤에 별도로 기록한다.
