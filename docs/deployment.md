# 배포 가이드

Spring Boot + React 모노레포를 EC2 위 Docker Blue/Green 방식으로 배포합니다.

---

## 전체 인프라 구조

```
로컬 PC
  │ git push origin main
  ▼
GitHub (hanjeun/reserve)
  │ CICD.yml 트리거
  ▼
GitHub Actions Runner (임시 Ubuntu VM)
  ├── Job1: backend build → DockerHub push
  ├── Job2: frontend build → EC2 SCP 전송 → nginx 정적 파일 배포
  └── Job3: EC2 SSH → Blue/Green 전환

DockerHub (hanjeun/reserve:latest)
  │ docker pull
  ▼
EC2 Ubuntu (15.165.103.103)
  ├── nginxserver 컨테이너 (포트 80, 443)
  │     마운트: /home/ubuntu/nginx → /etc/nginx/conf.d
  │            /home/ubuntu/uploads → /home/ubuntu/uploads
  │            /usr/share/nginx/html → /usr/share/nginx/html
  ├── blue 컨테이너 (포트 8080) ─┐ 둘 중 하나만 실행
  ├── green 컨테이너 (포트 8081) ─┘
  └── mysql 컨테이너 (포트 3306)
```

---

## 사용자 요청 흐름

```
브라우저 → https://reserve.hktech.kr
  │
  ▼ DNS (가비아): reserve.hktech.kr → 15.165.103.103
  │
  ▼ EC2 :443 → nginxserver
        │
        ├── /uploads/*    → /home/ubuntu/uploads/ (파일 직접 서빙)
        ├── /api/*        → service-env.inc 읽어서 blue:8080 or green:8081
        ├── /oauth2/*     → blue or green
        └── /*            → /usr/share/nginx/html/index.html (React SPA)
```

---

## Blue/Green 배포 스위칭 원리

```
배포 전: blue(8080) 실행 중
  nginx → service-env.inc: "set $service_url blue;"

배포 중:
  1. docker-compose 파일 EC2로 전송 (volume 설정 포함)
  2. green 컨테이너 새로 띄움 (8081)
  3. green 헬스체크 통과 (/env 엔드포인트)
  4. service-env.inc → "set $service_url green;" 으로 변경
  5. nginx reload (무중단!)
  6. blue 컨테이너 종료

배포 후: green(8081) 실행 중
```

---

## EC2 디렉토리 구조

```
/home/ubuntu/
  ├── nginx/
  │     ├── default.conf       ← CI/CD가 매 배포마다 덮어씀
  │     └── service-env.inc    ← "set $service_url blue/green;"
  ├── uploads/                 ← 업로드 이미지 (컨테이너와 마운트)
  ├── reserve-frontend/        ← CI/CD가 배포한 React 빌드 파일
  ├── docker-compose-blue.yml  ← CI/CD가 매 배포마다 덮어씀
  └── docker-compose-green.yml ← CI/CD가 매 배포마다 덮어씀

/usr/share/nginx/html/
  ├── index.html               ← reserve.hktech.kr React SPA
  └── company/                 ← hktech.kr 회사 사이트
```

---

## 이미지 파일 저장 구조

```
업로드 흐름:
  사용자 → POST /api/... (multipart)
         → Spring Boot FileStorageService
         → 컨테이너 내부 /uploads/ 저장
         → 실제 저장 위치: EC2 /home/ubuntu/uploads/ (volume mount)

서빙 흐름:
  브라우저 → GET /uploads/파일명
           → nginxserver (alias /home/ubuntu/uploads/)
           → 파일 직접 반환 (Spring Boot 거치지 않음)
```

⚠️ 컨테이너 재생성 시에도 /home/ubuntu/uploads/ 는 유지됨 (volume mount)

---

## 1. GitHub Secrets 등록

Repository → Settings → Secrets and variables → Actions

| Secret | 설명 |
|---|---|
| `RESERVE_SERVER_IP` | EC2 퍼블릭 IP |
| `EC2_SSH_KEY` | EC2 SSH 프라이빗 키 (PEM) |
| `DOCKERHUB_USERNAME` | DockerHub 계정명 |
| `DOCKERHUB_TOKEN` | DockerHub Access Token |
| `JWT_SECRET_KEY` | JWT 서명 키 (32자 이상) |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret |
| `NAVER_CLIENT_ID` | Naver OAuth Client ID |
| `NAVER_CLIENT_SECRET` | Naver OAuth Client Secret |
| `KAKAO_CLIENT_ID` | Kakao OAuth Client ID |
| `KAKAO_CLIENT_SECRET` | Kakao OAuth Client Secret |
| `MAIL_USERNAME` | Gmail 계정 |
| `MAIL_PASSWORD` | Gmail 앱 비밀번호 |
| `PORTONE_IMP_KEY` | 포트원 V1 API Key |
| `PORTONE_IMP_SECRET` | 포트원 V1 API Secret |
| `PORTONE_IMP_CODE` | 포트원 가맹점 식별코드 |
| `PORTONE_V2_SECRET` | 포트원 V2 API Secret |
| `PORTONE_STORE_ID` | 포트원 Store ID |
| `VITE_PORTONE_CHANNEL_KEY` | 포트원 채널 키 (프론트) |

---

## 2. DockerHub 레포지토리

DockerHub에서 `reserve` 이름으로 Repository 생성.
이미지: `{DOCKERHUB_USERNAME}/reserve:latest`

---

## 3. DNS 설정

가비아에서 A 레코드:
```
reserve.hktech.kr → {EC2 퍼블릭 IP}
```

---

## 4. OAuth Redirect URI

| 콘솔 | Redirect URI |
|---|---|
| Google Cloud Console | `https://reserve.hktech.kr/login/oauth2/code/google` |
| Naver Developers | `https://reserve.hktech.kr/login/oauth2/code/naver` |
| Kakao Developers | `https://reserve.hktech.kr/login/oauth2/code/kakao` |

---

## 5. EC2 nginx 컨테이너 실행 (최초 or 재생성 시)

```bash
sudo docker run -d \
  --name nginxserver \
  --network app-network \
  -p 80:80 -p 443:443 \
  -v /etc/letsencrypt:/etc/letsencrypt:ro \
  -v /usr/share/nginx/html:/usr/share/nginx/html \
  -v /home/ubuntu/uploads:/home/ubuntu/uploads \
  -v /home/ubuntu/nginx:/etc/nginx/conf.d \
  --restart unless-stopped \
  nginx:latest
```

nginx 재생성 후 반드시 service-env.inc 복구:
```bash
mkdir -p /home/ubuntu/nginx
echo 'set $service_url green;' | sudo tee /home/ubuntu/nginx/service-env.inc
```

---

## 6. 첫 배포 전 EC2 초기 설정

```bash
# uploads 폴더 생성
mkdir -p /home/ubuntu/uploads

# docker network 생성
sudo docker network create app-network

# mysql 컨테이너 실행
sudo docker run -d \
  --name mysql \
  --network app-network \
  -e MYSQL_ROOT_PASSWORD=1234 \
  -e MYSQL_DATABASE=reserve \
  -v mysql-data:/var/lib/mysql \
  --restart unless-stopped \
  mysql:8.0

# 관리자 계정 role 설정 (최초 1회)
sudo docker exec -it mysql mysql -u root -p1234 -e \
  "UPDATE reserve.member SET role='ADMIN' WHERE email='hanjeun11@gmail.com';"
```

---

## 7. S3 업그레이드 로드맵 (향후)

현재 구조의 한계:
- EC2 디스크 용량 제한
- 서버 다중화 시 이미지 불일치 문제

S3 전환 시 변경 사항:
1. `FileStorageService.java` → S3Client 사용
2. `build.gradle` → `spring-cloud-aws` 의존성 추가
3. `application.yml` → S3 버킷명, 리전 설정
4. GitHub Secrets → `AWS_ACCESS_KEY`, `AWS_SECRET_KEY` 추가
5. CloudFront 붙이면 CDN까지 완성

---

## 트러블슈팅

| 증상 | 원인 | 해결 |
|---|---|---|
| nginx `service-env.inc` 없음 에러 | 컨테이너 재생성 시 파일 소실 | `echo 'set $service_url green;' \| sudo tee /home/ubuntu/nginx/service-env.inc` |
| 이미지 업로드 후 404 | 컨테이너에 volume 미마운트 | docker-compose에 `volumes: - /home/ubuntu/uploads:/uploads` 확인 |
| OAuth 로그인 500 | nginx가 `/oauth2/callback`을 백엔드로 프록시 | `location /oauth2/callback`은 `try_files`로 처리 (React Router) |
| GitHub Actions push 트리거 안 됨 | Billing Budget $0 설정 | Settings → Billing → Budget을 $1 이상으로 변경 |
