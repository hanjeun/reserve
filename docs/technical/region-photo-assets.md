# 지역 대표 사진 API

지역 선택 화면은 한국관광공사 관광정보 API에서 서버가 이용 조건을 확인한 사진만 써요. 프런트 번들에는 지역 사진을 넣지 않고, 사진이 없거나 프록시 이미지가 실패하면 outline 핀 아이콘을 보여 줘요.

지자체 CI·BI와 로고는 쓰지 않아요. 사진은 지역 선택을 돕는 관광 대표 이미지이며, 공공기관과의 제휴나 보증을 뜻하지 않아요.

## 이용 조건

- 서버는 `detailImage2` 응답의 `cpyrhtDivCd`가 공공누리 제1유형인 사진만 카탈로그에 등록해요.
- 상업 이용 제한이 있는 제2·4유형과 변경 금지인 제3·4유형은 등록하지 않아요.
- 화면의 출처 링크와 공개 `/content-sources#region-photos` 표에 제공기관, 저작물명, 콘텐츠 ID, 이용 조건, 확인일을 표시해요.
- 원본 이미지 바이트와 160 × 160 가공본은 프런트나 S3에 보관하지 않아요.

## 서버 동작

데이터 원본은 [한국관광공사 국문 관광정보 서비스 GW](https://www.data.go.kr/data/15101578/openapi.do?recommendDataYn=Y)예요. 서비스 키, 원본 URL, 외부 API 응답은 브라우저에 내보내지 않아요.

1. `areaBasedList2`에서 고정된 17개 시도 코드별 후보를 찾아요.
2. 후보 네 건까지 `detailImage2`로 다시 확인해요.
3. 조건을 통과한 항목의 지역 코드, 콘텐츠 ID, 제공기관, 저작물명, 원본 URL, 출처 URL, 이용 조건, 확인 시각을 MySQL `tourism_region_photo`에 저장해요.
4. 화면에는 `/api/tourism/region-photos/{region}/image` 프록시 주소만 돌려줘요. 프록시는 등록된 `visitkorea.or.kr` 이미지만 읽고 MIME과 8MB 상한을 확인해요.
5. 정상 항목은 30일, 실패한 지역은 6시간 캐시해요. 이전 카탈로그가 있으면 외부 조회가 실패해도 그 항목을 유지해요.

- MySQL에는 사진 바이트가 아니라 검증 카탈로그만 저장해요. 바이트는 요청 때 서버 프록시가 전달해요.
- 17개 시도는 지원 범위일 뿐, 시작할 때 모든 사진을 미리 등록하지는 않아요. 지역 선택 화면은 지금 보이는 인기 지역의 시도만 최대 6개씩 요청하고, 새 시도가 인기 목록에 나타나면 서버가 같은 절차로 자동 등록해요. 사람이 지역별 사진을 추가할 필요는 없어요.

## 공개 API와 출처 표기

| 경로 | 용도 | 브라우저에 공개되는 값 |
|---|---|---|
| `GET /api/tourism/region-photos?regions=서울,경기` | 최대 6개 시도의 검증 사진 조회 | 내부 이미지 프록시 경로와 출처 카탈로그 |
| `GET /api/tourism/region-photos/catalog` | 콘텐츠 출처·권리 안내 표 | 제공기관, 저작물명, 콘텐츠 ID, 이용 조건, 확인일 |
| `GET /api/tourism/region-photos/{region}/image` | 검증된 이미지를 같은 출처로 전달 | 이미지 바이트만 |

`/content-sources#region-photos`는 DB 카탈로그로만 표를 만들어요. 화면마다 출처 문구를 복제하지 않아요.

## 키 보관과 실행

발급 키는 대화, Git, `application-secret.yml`, 프런트 `.env`에 넣지 않아요. 로컬에서는 백엔드를 시작하는 IDE 또는 PowerShell 프로세스에만 `TOURISM_API_SERVICE_KEY`를 설정해요.

```powershell
# 현재 PowerShell 세션에서만 사용하는 예시. 실제 키를 채팅이나 문서에 기록하지 않는다.
$env:TOURISM_API_SERVICE_KEY = '<발급받은 서비스키>'
cd backend
.\gradlew.bat bootRun
```

- 새 터미널이나 IDE는 이미 떠 있는 프로세스의 환경변수를 물려받지 않아요. 사용자 환경변수에 등록했다면 새로 열어야 해요.
- 운영은 GitHub Secret `TOURISM_API_SERVICE_KEY` → CI/CD SSH 환경변수 → Blue/Green Compose 환경변수 순으로 전달해요.
