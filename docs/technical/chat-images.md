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

## 원본과 다운로드 이름

- 업로드한 바이트를 재인코딩하지 않고 AES-GCM으로 암호화해요. 권한 확인 후 복호화한 바이트가 사진 조회·다운로드 원본이에요.
- 새 사진의 원래 파일명은 `chat_message.image_original_filename`에 저장하고, 신고 스냅샷에도 복사해요. 파일명은 S3 키나 로그에 넣지 않아요.
- 경로·제어문자·방향 제어문자·운영체제 금지 문자를 제거하고 실제 MIME에 맞는 확장자를 유지해요. UTF-8 255바이트를 넘지 않아요.
- 사진 조회의 `Content-Disposition`과 다운로드 메뉴는 이 안전한 파일명을 써요. 파일명을 저장하지 않은 이전 사진은 `reserve-chat-photo-{id}.{ext}`를 써요.
- 투명 사진의 알파와 원래 비율을 유지하고, 채팅 썸네일에는 회색 미리보기 덮개를 사용하지 않아요.

참고: [GitHub Secret 안내](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets), [수동 DDL](manual-ddl.md), [S3 경로](architecture.md).
