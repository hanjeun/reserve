# 아키텍처

RESERVE는 React 화면, Spring Boot 서버, MySQL 데이터베이스로 구성된 예약 플랫폼이에요.

## 서비스 구성

~~~mermaid
flowchart LR
    U[사용자] --> N[Nginx]
    N --> W[React 화면]
    N --> A[Spring Boot API]
    A --> D[(MySQL)]
    A --> R[(Redis)]
    A --> S[S3 파일 저장소]
    S --> C[CloudFront 이미지 전송]
~~~

- reserve.it.kr는 서비스 소개, app.reserve.it.kr는 예약·계정·관리 화면을 제공해요.
- Nginx가 HTTPS 연결을 받고 화면 파일과 API 요청을 나눠 전달해요.
- API 서버는 예약·결제·회원 권한을 확인하고 데이터를 처리해요.

## 데이터 저장

| 구성 | 역할 |
|---|---|
| MySQL | 회원·가게·예약·결제·메시지의 원본 데이터 |
| Redis | 여러 서버가 함께 쓰는 요청 제한과 변경 알림 중계 |
| S3 | 사진·첨부파일 저장 |
| CloudFront | 공개 이미지의 빠른 전송 |

Redis 알림은 원본 데이터를 대신하지 않아요. 브라우저는 서버가 보내는 갱신 알림(SSE)을 받으면 API에서 최신 데이터를 다시 읽어요.

프로필·가게 사진은 공개 이미지예요. 사업자 서류와 채팅·피드 첨부파일은 권한을 확인한 뒤 제공해요.

## 배포

GitHub Actions가 검사와 빌드를 수행해요. Lightsail의 Blue/Green 컨테이너 중 새 버전을 준비한 뒤, Nginx가 화면과 API를 함께 전환해요. 전환에 실패하면 호환성을 확인한 이전 버전으로 돌아가요.

## 외부 서비스

| 서비스 | 용도 |
|---|---|
| AWS Lightsail·Route 53 | 서버와 도메인 |
| S3·CloudFront | 파일 저장과 이미지 전송 |
| PortOne | 예약금·광고 결제 |
| Resend | 이메일 발송 |
| Google·Kakao·Naver | 소셜 로그인 |
| Grafana·Loki·Alloy·Sentry | 서버 상태와 오류 관측 |

코드 위치는 [코드 구조](structure.md), 검사와 배포 흐름은 [배포](deployments.md)를 보세요.
