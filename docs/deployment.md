# 배포 가이드

Spring Boot + React 모노레포를 EC2 위 Docker Blue/Green 방식으로 배포합니다.

---

## 인프라 구성

```
EC2 (Ubuntu)
 ├── Docker
 │    ├── reserve-backend (Spring Boot, 포트 8080/8081)
 │    └── MySQL
 └── Nginx (80/443 → 8080 또는 8081 프록시)

DockerHub : {USERNAME}/reserve
GitHub Actions : .github/workflows/CICD.yml
```

---

## 1. GitHub Secrets 등록

Repository → Settings → Secrets and variables → Actions

| Secret | 설명 | 비고 |
|---|---|---|
| `RESERVE_SERVER_IP` | EC2 퍼블릭 IP | 기존 `RESERVATION_SYSTEM_SERVER_IP` 대체 |
| `EC2_SSH_KEY` | EC2 SSH 프라이빗 키 (PEM) | |
| `DOCKERHUB_USERNAME` | DockerHub 계정명 | |
| `DOCKERHUB_TOKEN` | DockerHub Access Token | |
| `JWT_SECRET_KEY` | JWT 서명 키 (32자 이상) | |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID | |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret | |
| `NAVER_CLIENT_ID` | Naver OAuth Client ID | |
| `NAVER_CLIENT_SECRET` | Naver OAuth Client Secret | |
| `KAKAO_CLIENT_ID` | Kakao OAuth Client ID | |
| `KAKAO_CLIENT_SECRET` | Kakao OAuth Client Secret | |
| `MAIL_USERNAME` | Gmail 계정 | |
| `MAIL_PASSWORD` | Gmail 앱 비밀번호 | |
| `PORTONE_IMP_KEY` | 포트원 V1 API Key | |
| `PORTONE_IMP_SECRET` | 포트원 V1 API Secret | |
| `PORTONE_IMP_CODE` | 포트원 가맹점 식별코드 | |
| `PORTONE_V2_SECRET` | 포트원 V2 API Secret | **신규** |
| `PORTONE_STORE_ID` | 포트원 Store ID | **신규** |
| `VITE_PORTONE_CHANNEL_KEY` | 포트원 채널 키 (프론트) | **신규** |

---

## 2. DockerHub 레포지토리

DockerHub에서 `reserve` 이름으로 새 Repository 생성.

이미지 이름: `{DOCKERHUB_USERNAME}/reserve`

---

## 3. DNS 설정

도메인 레지스트라(또는 Route 53)에서 A 레코드 등록:

```
reserve.hktech.kr  →  {EC2 퍼블릭 IP}
```

---

## 4. OAuth Redirect URI 변경

세 콘솔 모두 `reservation.hktech.kr` → `reserve.hktech.kr` 로 변경.

| 콘솔 | Redirect URI |
|---|---|
| Google Cloud Console | `https://reserve.hktech.kr/login/oauth2/code/google` |
| Naver Developers | `https://reserve.hktech.kr/login/oauth2/code/naver` |
| Kakao Developers | `https://reserve.hktech.kr/login/oauth2/code/kakao` |

---

## 5. EC2 Nginx 설정

`/etc/nginx/sites-available/reserve`:

```nginx
server {
    listen 80;
    server_name reserve.hktech.kr;

    # React SPA — 모든 경로를 index.html로 fallback
    location / {
        root   /usr/share/nginx/html;
        index  index.html;
        try_files $uri $uri/ /index.html;
    }

    # API 프록시
    location /api/ {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # 업로드 파일 서빙
    location /uploads/ {
        proxy_pass http://localhost:8080/uploads/;
    }
}
```

설정 적용:
```bash
sudo nginx -t && sudo systemctl reload nginx
```

---

## 6. Blue/Green 배포 흐름

1. `main` 브랜치 push → GitHub Actions 트리거
2. 백엔드 빌드 → Docker 이미지 빌드 → DockerHub push
3. 프론트엔드 `npm run build` → `dist/` → EC2 Nginx 정적 폴더 복사
4. EC2에서 현재 실행 중인 포트 확인 (8080 또는 8081)
5. 반대 포트로 새 컨테이너 기동 → health check
6. Nginx upstream 전환 → 기존 컨테이너 종료
