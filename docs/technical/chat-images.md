# 채팅 사진 키 생성·등록·복구

`CHAT_IMAGE_ENCRYPTION_KEY`는 S3에 저장하는 대화 사진을 AES-256-GCM으로 암호화·복호화하는 앱 전용 키예요. 외부에서 발급받는 키가 아니고, JWT·AWS·OAuth 키를 재사용하지 않아요.

## 키 조건

- 암호학적으로 안전한 난수 **32바이트**를 **표준 Base64**로 인코딩해요.
- 결과는 끝의 `=`까지 포함해 44자예요. URL-safe Base64, UUID, 비밀번호, 32자 문자열은 대체물이 아니에요.
- 백엔드만 써요. `VITE_` 변수, 프론트 파일, Git, 대화, 로그, CLI 인자에 넣지 않아요.
- 값이 비면 사진만 꺼지고 텍스트 채팅은 그대로예요. 형식·길이가 틀리면 앱 기동이 실패해요.

## 본인 PC에서 한 번 생성

키 생성 사이트에 운영 키를 맡기지 않아요. 아래 명령은 Windows PowerShell 5.1/7용이고, **본인이 별도 터미널에서** 실행해요. 값은 화면·명령 기록에 출력하지 않고 클립보드에만 복사해요.

> 주의: 실행 전에 Windows 클립보드 기록·장치 간 동기화를 끄고 화면 공유·녹화를 종료하세요.

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

난수 API는 [Microsoft RandomNumberGenerator 문서](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.randomnumbergenerator.getbytes)를 따라요. 실행할 때마다 다른 키가 나오니, 최초 키를 보관·등록한 뒤 다시 생성해서 덮어쓰지 마세요.

## 등록 순서

1. 본인이 관리하는 암호 금고/암호관리자에 `RESERVE production chat image key`라는 이름으로 복구본을 저장해요. 저장한 값을 다시 복사할 수 있는지 확인해요. 키는 대화에 보내지 않아요.
2. GitHub 저장소 **Settings → Secrets and variables → Actions → Repository secrets** 또는 **Environments → production → Environment secrets**에 `CHAT_IMAGE_ENCRYPTION_KEY`로 같은 값을 등록해요. 둘 다 배포 job에서 쓸 수 있어서 한 곳이면 충분해요. Variables가 아니라 Secret이고, 프론트 빌드에는 전달하지 않아요.
3. 필요하면 로컬 IntelliJ **백엔드** Run/Debug Configuration 환경변수에도 등록해요. `Store as project file`을 켜지 말고, 값이 든 설정을 Git에 넣지 않아요([IntelliJ 실행 설정 공유 문서](https://www.jetbrains.com/help/idea/run-debug-configuration.html#share-configurations)). 로컬은 별도 키와 격리 DB/S3 prefix를 권장하고, 운영 사진을 로컬 키로 덮어쓰지 않아요.
4. 붙여넣기가 끝나면 `Set-Clipboard -Value ''`로 비워요. 클립보드 기록이 켜져 있었다면 기록도 지워요. GitHub Secret은 원문을 다시 내려받을 수 있는 복구 금고가 아니에요.

같은 이름의 Secret이 repo와 Environment 양쪽에 있으면 Environment 값이 우선해요. 범위를 섞지 말고 production 한 곳을 정본으로 관리해요.
[GitHub Secret 안내](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets),
[범위별 우선순위](https://docs.github.com/en/actions/reference/security/secrets).

## 배포·복구 관문

- Secret 등록만으로 서버는 바뀌지 않아요. 승인된 새 배포/재시작에서 compose를 거쳐 주입돼요.
- 운영 Blue/Green 모두 **같은 운영 키**가 필요하고, rollback 때도 같은 키를 전달해요.
- 새 채팅 사진 컬럼과 `sender_role` OWNER 등 [수동 DDL](manual-ddl.md)을 먼저 대조해요. 키 등록으로 DB 호환 문제가 풀리지는 않아요.
- 인증된 `/api/chat/images/config`의 `enabled:true`는 설정 확인일 뿐이에요. 두 계정의 실제 업로드·조회, 외부 계정 거부·차단·신고 접근, 기존 [S3 경로](architecture.md)는 따로 검증해요.
- 새 AWS KMS·버킷·유료 암호관리자는 필요 없어요. 사진은 기존 S3를 쓰고, 사용량 비용은 별개예요.

> 주의: key-ID·다중 키 복호화가 없어요. 키를 잃거나 계획 없이 바꾸면 기존 사진을 복구할 수 없고, DB/S3 백업으로도 키는 돌아오지 않아요. 키 회전에는 기존 사진 재암호화와 rollback 계획이 따로 필요해요.
