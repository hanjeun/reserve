# 채팅 사진 키 생성·등록·복구

`CHAT_IMAGE_ENCRYPTION_KEY`는 외부에서 발급받는 키가 아니다. 앱이 S3에 저장하는 대화 사진을
AES-256-GCM으로 암호화/복호화하는 전용 키다. JWT·AWS·OAuth 키를 재사용하지 않는다.
키 이름과 주입 경로는 구현됐지만, 이번 작업에서 실제 운영 키를 생성하거나 등록하지 않았다.

## 조건

- 암호학적으로 안전한 난수 **32바이트**를 **표준 Base64**로 인코딩한다.
- 결과는 44자이며 끝의 `=`도 포함한다. URL-safe Base64, UUID, 비밀번호, 32자 문자열은 대체물이 아니다.
- 백엔드만 사용한다. `VITE_` 변수, 프론트 파일, Git, 대화, 로그, CLI 인자에 넣지 않는다.
- 값이 비면 사진만 비활성이고 텍스트 채팅은 유지된다. 잘못된 형식/길이는 앱 기동을 실패시킨다.

## 본인 PC에서 한 번 생성

키 생성 사이트에 운영 키를 맡기지 않는다. 다음은 Windows PowerShell 5.1/7에서 실행하는 명령이다.
**본인이 별도 터미널에서 실행**한다. 값은 화면/명령 기록에 출력하지 않고 클립보드에만 복사한다.
실행 전 Windows 클립보드 기록·장치 간 동기화를 끄고 화면 공유/녹화를 종료한다.

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

난수 API는 [Microsoft RandomNumberGenerator 문서](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.randomnumbergenerator.getbytes)를 따른다.
실행 때마다 다른 키가 생긴다. 최초 키를 보관/등록한 뒤 반복 생성해서 덮어쓰지 않는다.

## 등록 순서

1. 사용자가 관리하는 암호화 금고/암호관리자에 `RESERVE production chat image key`라는 이름으로
   복구본을 저장한다. 저장한 값을 다시 복사할 수 있는지 본인이 확인한다. 키를 대화에 보내지 않는다.
2. GitHub 저장소 **Settings → Secrets and variables → Actions → Repository secrets** 또는
   **Environments → production → Environment secrets**에 `CHAT_IMAGE_ENCRYPTION_KEY`라는 이름으로
   같은 값을 등록한다. 둘 다 현재 배포 job에서 사용할 수 있으며 중복 등록은 필요 없다.
   Variables가 아닌 Secret이다. 프론트 빌드에는 전달하지 않는다.
3. 로컬 IntelliJ의 **백엔드** Run/Debug Configuration 환경변수에도 필요하면 등록한다.
   `Store as project file`을 켜지 않고 값이 포함된 설정을 Git에 넣지 않는다.
   [IntelliJ 실행 설정 공유 문서](https://www.jetbrains.com/help/idea/run-debug-configuration.html#share-configurations)를 참고한다.
   로컬은 별도 키와 격리 DB/S3 prefix를 권장하며 운영 사진을 로컬 키로 덮어쓰지 않는다.
   로컬 등록이 GitHub/서버 등록을 대신하지 않는다.
4. 붙여넣기를 마친 뒤 `Set-Clipboard -Value ''`로 비운다. 클립보드 기록이 켜져 있었다면
   별도로 기록도 삭제한다. GitHub Secret은 저장 후 원문을 다시 내려받는 복구 금고가 아니다.

기존 GitHub Secret 이름이 repo와 Environment 양쪽에 있다면 Environment 값이 우선한다.
범위를 섞지 않고 production 한 곳을 정본으로 관리한다.
[GitHub Secret 안내](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets),
[범위별 우선순위](https://docs.github.com/en/actions/reference/security/secrets).

## 배포·복구 관문

- Secret 등록만으로 현재 서버는 바뀌지 않는다. 승인된 새 배포/재시작에서 compose를 거쳐 주입한다.
- 운영 Blue/Green 모두 **같은 운영 키**가 필요하다. rollback 때도 같은 키를 전달한다.
- 새 채팅 사진 컬럼과 `sender_role` OWNER 등 [수동 DDL](manual-ddl.md)을 먼저 대조한다.
  키만 등록해 DB 호환성 문제를 해결했다고 판단하지 않는다.
- 인증된 `/api/chat/images/config`의 `enabled:true`는 설정 확인일 뿐이다. 두 계정의 실제 업로드·조회,
  외부 계정 거부·차단·신고 접근과 기존 [S3 경로](architecture.md)를 별도로 검증한다.
- 현재 key-ID/다중 키 복호화가 없다. 키 유실·무계획 교체는 기존 사진 복구 손실이다.
  DB/S3 백업만으로 키는 복구되지 않는다. 회전은 기존 사진 재암호화·rollback 계획을 별도로 만든다.
- 새 AWS KMS·버킷·유료 암호관리자 가입을 요구하지 않는다. 사진은 기존 S3를 사용하며 사용량 비용은 별개다.
