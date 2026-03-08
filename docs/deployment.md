# 배포 가이드

Spring Boot + React 모노레포를 EC2 위 Docker Blue/Green 방식으로 배포합니다.

---

## 인프라 구조

```
로컬 PC
  │ git push origin main
  ▼
GitHub Actions
  ├── backend build → DockerHub push
  ├── frontend build → EC2 SCP 전송
  └── EC2 SSH → Blue/Green 전환

EC2 Ubuntu
  ├── nginxserver  (포트 80, 443)
  ├── blue         (포트 8080) ─┐ 둘 중 하나만 실행
  ├── green        (포트 8081) ─┘
  └── mysql        (포트 3306)
```

### 요청 흐름

```
브라우저 → https://reserve.hktech.kr
  ▼
DNS: reserve.hktech.kr → EC2 퍼블릭 IP
  ▼
nginxserver (:443)
  ├── /uploads/*  → /home/ubuntu/uploads/ (파일 직접 서빙)
  ├── /api/*      → service-env.inc 읽어서 blue:8080 or green:8081
  ├── /oauth2/*   → blue or green
  └── /*          → /usr/share/nginx/html/index.html (React SPA)
```

### Blue/Green 배포 원리

```
1. green 컨테이너 새로 띄움 (8081)
2. /actuator/health 헬스체크 통과 확인
3. service-env.inc → "set $service_url green;"
4. nginx reload (무중단)
5. blue 컨테이너 종료
```

---

## EC2 디렉토리 구조

```
/home/ubuntu/
  ├── nginx/
  │   ├── default.conf       ← CI/CD가 매 배포마다 덮어씀
  │   └── service-env.inc    ← "set $service_url blue/green;"
  ├── uploads/               ← 업로드 이미지 (컨테이너 volume mount)
  ├── reserve-frontend/      ← React 빌드 결과물
  ├── docker-compose-blue.yml
  └── docker-compose-green.yml
```

업로드 파일은 `/home/ubuntu/uploads/` ↔ 컨테이너 `/uploads/` bind mount로 컨테이너 재생성 시에도 유지됩니다.

---

## GitHub Secrets

Repository → Settings → Secrets and variables → Actions

| Secret | 설명 |
|---|---|
| `RESERVE_SERVER_IP` | EC2 퍼블릭 IP |
| `EC2_SSH_KEY` | EC2 SSH 프라이빗 키 (PEM) |
| `DOCKERHUB_USERNAME` | DockerHub 계정명 |
| `DOCKERHUB_TOKEN` | DockerHub Access Token |
| `DB_PASSWORD` | MySQL root 비밀번호 |
| `JWT_SECRET_KEY` | JWT 서명 키 (64자 이상) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` | Naver OAuth |
| `KAKAO_CLIENT_ID` / `KAKAO_CLIENT_SECRET` | Kakao OAuth |
| `MAIL_USERNAME` / `MAIL_PASSWORD` | Gmail 앱 비밀번호 |
| `PORTONE_V2_SECRET` | 포트원 V2 API Secret |
| `PORTONE_STORE_ID` | 포트원 Store ID |
| `VITE_PORTONE_CHANNEL_KEY` | 포트원 채널 키 (프론트) |

---

## EC2 초기화 (최초 1회)

```bash
# uploads 폴더 생성
mkdir -p /home/ubuntu/uploads

# Docker 네트워크 생성
sudo docker network create app-network

# MySQL 컨테이너 실행
sudo docker run -d \
  --name mysql \
  --network app-network \
  -e MYSQL_ROOT_PASSWORD=${DB_PASSWORD} \
  -e MYSQL_DATABASE=reserve \
  -v mysql-data:/var/lib/mysql \
  --restart unless-stopped \
  mysql:8.0

# Nginx 컨테이너 실행
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

# service-env.inc 초기화
mkdir -p /home/ubuntu/nginx
echo 'set $service_url green;' | sudo tee /home/ubuntu/nginx/service-env.inc

# 관리자 계정 role 설정
sudo docker exec -it mysql mysql -u root -p -e \
  "UPDATE reserve.member SET role='ADMIN' WHERE email='your@email.com';"
```

---

## OAuth Redirect URI

각 콘솔에 아래 URI를 등록합니다. 로컬 개발용 URI도 함께 등록해야 로컬에서 소셜 로그인이 정상 동작합니다.

| 콘솔 | URI |
|---|---|
| Google Cloud Console | `https://reserve.hktech.kr/login/oauth2/code/google` |
| | `http://localhost:8080/login/oauth2/code/google` |
| Naver Developers | `https://reserve.hktech.kr/login/oauth2/code/naver` |
| | `http://localhost:8080/login/oauth2/code/naver` |
| Kakao Developers | `https://reserve.hktech.kr/login/oauth2/code/kakao` |
| | `http://localhost:8080/login/oauth2/code/kakao` |

---

## 트러블슈팅

| 증상 | 원인 | 해결 |
|---|---|---|
| nginx `service-env.inc` 없음 에러 | 컨테이너 재생성 시 파일 소실 | `echo 'set $service_url green;' \| sudo tee /home/ubuntu/nginx/service-env.inc` |
| 이미지 업로드 후 404 | volume 미마운트 | `docker-compose`에 `/home/ubuntu/uploads:/uploads` 확인 |
| SPA 새로고침 시 404 | nginx `try_files` 미설정 | `location / { try_files $uri $uri/ /index.html; }` 확인 |
| OAuth 로그인 후 배포 서버로 리다이렉트 | `OAuth2AuthenticationSuccessHandler`가 `server.env`로 환경 판단 | `application-local.yml`에 `server.env: local` 확인 |
| GitHub Actions push 트리거 안 됨 | Billing 예산 $0 | Settings → Billing → Budget을 $1 이상으로 변경 |
