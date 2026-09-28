# 지역 대표 사진 API

지역 선택 화면은 한국관광공사 관광정보 API에서 서버가 이용 조건을 확인한 사진만 써요. 사진이 없으면 outline 핀 아이콘을 보여 줘요.

지자체 CI·BI와 로고는 쓰지 않아요. 사진은 지역 선택을 돕는 관광 대표 이미지이며, 공공기관과의 제휴나 보증을 뜻하지 않아요.

## 이용 조건

- `detailImage2` 응답의 `cpyrhtDivCd`가 공공누리 제1유형인 사진만 등록해요.
- 상업 이용 제한이 있는 제2·4유형과 변경 금지인 제3·4유형은 등록하지 않아요.
- 화면의 출처 링크와 공개 `/content-sources#region-photos` 표에 제공기관, 저작물명, 콘텐츠 ID, 이용 조건, 확인일을 표시해요.
- 원본 이미지와 가공본은 프런트나 S3에 보관하지 않아요.

## 서버 동작

데이터 원본은 [한국관광공사 국문 관광정보 서비스 GW](https://www.data.go.kr/data/15101578/openapi.do?recommendDataYn=Y)예요. 서비스 키와 원본 URL은 브라우저에 내보내지 않아요.

1. `areaBasedList2`에서 17개 시도 코드별 후보를 찾아요.
2. 후보 네 건까지 `detailImage2`로 이용 조건을 확인해요.
3. 통과한 항목의 지역 코드, 콘텐츠 ID, 제공기관, 저작물명, 원본 URL, 출처 URL, 이용 조건, 확인 시각을 MySQL `tourism_region_photo`에 저장해요.
4. 화면에는 `/api/tourism/region-photos/{region}/image` 프록시 주소만 돌려줘요. 프록시는 등록된 `visitkorea.or.kr` 이미지만 읽고 MIME과 8MB 상한을 확인해요.
5. 정상 항목은 30일, 실패한 지역은 6시간 캐시해요.

지역 선택 화면은 보이는 인기 지역의 시도만 최대 6개씩 요청하고, 처음 요청된 시도는 서버가 같은 절차로 자동 등록해요.

## 공개 API

| 경로 | 용도 |
|---|---|
| `GET /api/tourism/region-photos?regions=서울,경기` | 최대 6개 시도의 사진 조회 |
| `GET /api/tourism/region-photos/catalog` | 콘텐츠 출처·권리 안내 표 |
| `GET /api/tourism/region-photos/{region}/image` | 검증된 이미지 전달 |

`/content-sources#region-photos` 표는 DB 카탈로그로 만들어요.

## 키 설정

| 이름 | 용도 |
|---|---|
| `TOURISM_API_SERVICE_KEY` | 한국관광공사 관광정보 API 서비스 키 |

로컬에서는 백엔드를 실행하는 PowerShell 세션에 설정해요.

```powershell
# 현재 PowerShell 세션에서만 사용하는 예시. 실제 키를 채팅이나 문서에 기록하지 않는다.
$env:TOURISM_API_SERVICE_KEY = '<발급받은 서비스키>'
cd backend
.\gradlew.bat bootRun
```

운영은 GitHub Secret `TOURISM_API_SERVICE_KEY` → CI/CD SSH 환경변수 → Blue/Green Compose 환경변수 순으로 전달돼요.
