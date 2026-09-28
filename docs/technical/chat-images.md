# 채팅 사진 키

`CHAT_IMAGE_ENCRYPTION_KEY`는 S3에 저장하는 채팅 사진을 AES-256-GCM으로 암호화·복호화하는 앱 전용 키예요.

| 이름 | 용도 |
|---|---|
| `CHAT_IMAGE_ENCRYPTION_KEY` | 채팅 사진 암호화 키 |

## 키 형식

- 난수 32바이트를 표준 Base64로 인코딩한 44자 문자열이에요(끝의 `=` 포함).
- 백엔드에서만 써요. `VITE_` 변수나 프론트 파일에는 넣지 않아요.

## 생성

Windows PowerShell에서 실행하면 키가 클립보드에 복사돼요.

```powershell
$chatKeyBytes = New-Object byte[] 32
$chatKeyRng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
    $chatKeyRng.GetBytes($chatKeyBytes)
    Set-Clipboard -Value ([Convert]::ToBase64String($chatKeyBytes))
} finally {
    $chatKeyRng.Dispose()
    [Array]::Clear($chatKeyBytes, 0, $chatKeyBytes.Length)
}
```

## 등록

1. 암호관리자에 `RESERVE production chat image key`라는 이름으로 저장해요.
2. GitHub 저장소 **Settings → Secrets and variables → Actions**의 Repository secrets 또는 **Environments → production** Environment secrets에 `CHAT_IMAGE_ENCRYPTION_KEY`로 등록해요. 같은 이름이 양쪽에 있으면 Environment 값이 우선해요.
3. 로컬에서 쓰려면 IntelliJ 백엔드 Run/Debug Configuration 환경변수에 등록해요.
4. 붙여넣기가 끝나면 `Set-Clipboard -Value ''`로 클립보드를 비워요.

등록한 값은 다음 배포 때 compose를 거쳐 Blue/Green 서버에 똑같이 주입돼요. 설정 여부는 로그인 후 `/api/chat/images/config`의 `enabled`로 확인할 수 있어요.

참고: [GitHub Secret 안내](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets), [수동 DDL](manual-ddl.md), [S3 경로](architecture.md).
