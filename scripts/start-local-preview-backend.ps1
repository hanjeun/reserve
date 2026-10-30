param(
    [string]$JarPath = '',
    [string]$JavaPath = '',
    [ValidateRange(1024, 65535)][int]$Port = 8080,
    [switch]$StartupCheck,
    [switch]$DisableBackgroundJobs,
    [switch]$EnableUnpaidExpiry
)

$ErrorActionPreference = 'Stop'
if ($EnableUnpaidExpiry -and (-not $DisableBackgroundJobs -or $StartupCheck)) {
    throw 'Unpaid expiry requires -DisableBackgroundJobs and cannot run during StartupCheck.'
}
$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $PSBoundParameters.ContainsKey('JavaPath')) {
    $JavaPath = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.cache/reserve-java/v21.0.13/jdk21.0.13_0/bin/java.exe'
}
if (-not $JarPath) {
    $buildFile = Get-Content -LiteralPath (Join-Path $repoRoot 'backend/build.gradle') -Raw
    $versionMatch = [regex]::Match($buildFile, "(?m)^version\s*=\s*'([^']+)'")
    if (-not $versionMatch.Success) { throw 'Cannot determine the current backend version. Supply -JarPath.' }
    $JarPath = Join-Path $repoRoot ('backend/build/libs/reserve-{0}.jar' -f $versionMatch.Groups[1].Value)
}
$sourceJar = (Resolve-Path -LiteralPath $JarPath).Path
$buildRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot 'backend/build/libs')) + [IO.Path]::DirectorySeparatorChar
if (-not $sourceJar.StartsWith($buildRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'The preview JAR must be an existing build from this checkout.'
}
if ([string]::IsNullOrWhiteSpace($JavaPath) -or -not (Test-Path -LiteralPath $JavaPath -PathType Leaf)) {
    throw 'The selected Java executable is unavailable. Prepare the verified Corretto 21.0.13 preview cache or select an installed runtime explicitly with -JavaPath; no fallback runtime was selected.'
}
if (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) {
    throw "Port $Port is already in use. Stop the intended local preview before starting another one."
}

$jarHash = (Get-FileHash -LiteralPath $sourceJar -Algorithm SHA256).Hash.ToLowerInvariant()
$runtimeRoot = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.codex/local-data/RESERVE/preview-runtime'
$runtimeDir = Join-Path $runtimeRoot $jarHash
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
$runtimeJar = Join-Path $runtimeDir 'reserve.jar'
if (-not (Test-Path -LiteralPath $runtimeJar)) {
    Copy-Item -LiteralPath $sourceJar -Destination $runtimeJar
}
if ((Get-FileHash -LiteralPath $runtimeJar -Algorithm SHA256).Hash.ToLowerInvariant() -ne $jarHash) {
    throw 'The JAR changed during the copy. No application was started.'
}
# 다음 빌드가 실행 중인 JVM의 JAR를 덮어쓰지 않도록 별도 경로를 사용한다.
(Get-Item -LiteralPath $runtimeJar).IsReadOnly = $true

# IDE 파일을 수정하거나 비밀값을 출력하지 않고 기존 로컬 설정을 읽는다.
$environmentBefore = @{}
$allowedNames = @('AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'CHAT_IMAGE_ENCRYPTION_KEY',
    'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'HOLIDAY_API_KEY', 'JWT_SECRET_KEY',
    'KAKAO_CLIENT_ID', 'KAKAO_CLIENT_SECRET', 'KAKAO_REST_API_KEY', 'MAIL_WEBHOOK_SECRET',
    'NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET', 'PORTONE_STORE_ID', 'PORTONE_V2_SECRET',
    'PORTONE_WEBHOOK_SECRET', 'RESEND_API_KEY', 'TOURISM_API_SERVICE_KEY')
$workspacePath = Join-Path $repoRoot 'backend/.idea/workspace.xml'
try {
    if (Test-Path -LiteralPath $workspacePath) {
        [xml]$workspace = Get-Content -LiteralPath $workspacePath -Raw -Encoding UTF8
        $configuration = $workspace.SelectSingleNode("//component[@name='RunManager']/configuration[@name='ReserveApplication'][envs/env]")
        foreach ($entry in $configuration.envs.env) {
            if ($entry.name -notin $allowedNames) { continue }
            $environmentBefore[$entry.name] = [Environment]::GetEnvironmentVariable($entry.name, 'Process')
            [Environment]::SetEnvironmentVariable($entry.name, $entry.value, 'Process')
        }
    }
    $logStamp = Get-Date -Format 'yyyyMMddTHHmmssfff'
    $stdout = Join-Path $runtimeDir "$logStamp.out.log"
    $stderr = Join-Path $runtimeDir "$logStamp.err.log"
    $launchArguments = @('-jar', ('"{0}"' -f $runtimeJar),
        '--spring.profiles.active=local', '--spring.jpa.hibernate.ddl-auto=validate',
        '--spring.devtools.restart.enabled=false', '--server.address=127.0.0.1', "--server.port=$Port")
    if ($StartupCheck -or $DisableBackgroundJobs) {
        $launchArguments += @('--reserve.scheduling.enabled=false', '--reservation.code-backfill.enabled=false',
            '--reserve.reservation-retention.enabled=false', '--reserve.reservation-retention.purge-enabled=false',
            '--reserve.reservation-consent.enabled=false')
    }
    if ($EnableUnpaidExpiry) {
        $launchArguments += '--reserve.preview.unpaid-expiry-enabled=true'
    }
    if ($StartupCheck) {
        # 진단 기동은 데이터 보정·예약·환불 작업을 실행하지 않는다.
        $launchArguments += @('--spring.datasource.hikari.read-only=true', '--reserve.redis.enabled=false',
            '--reserve.admission.enabled=false', '--reserve.service-admission.enabled=false',
            '--feed.media.local-enabled=false', '--sentry.dsn=')
    }
    $process = Start-Process -FilePath $JavaPath -ArgumentList $launchArguments `
        -WorkingDirectory (Join-Path $repoRoot 'backend') -WindowStyle Hidden `
        -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
    [pscustomobject]@{ ProcessId = $process.Id; Port = $Port; JarSha256 = $jarHash; RuntimeJar = $runtimeJar;
        StandardOutput = $stdout; StandardError = $stderr }
} finally {
    foreach ($name in $environmentBefore.Keys) {
        [Environment]::SetEnvironmentVariable($name, $environmentBefore[$name], 'Process')
    }
}
