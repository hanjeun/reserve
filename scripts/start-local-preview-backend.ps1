param(
    [string]$JarPath = '',
    [string]$JavaPath = 'C:\Program Files\Java\jdk-21\bin\java.exe'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $JarPath) {
    $JarPath = Join-Path $repoRoot 'backend/build/libs/reserve-2.11.0.jar'
}
$sourceJar = (Resolve-Path -LiteralPath $JarPath).Path
$buildRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot 'backend/build/libs')) + [IO.Path]::DirectorySeparatorChar
if (-not $sourceJar.StartsWith($buildRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'The preview JAR must be an existing build from this checkout.'
}
if (-not (Test-Path -LiteralPath $JavaPath -PathType Leaf)) {
    throw 'Java 21 is required. Supply the installed Java executable with -JavaPath.'
}
if (Get-NetTCPConnection -State Listen -LocalPort 8080 -ErrorAction SilentlyContinue) {
    throw 'Port 8080 is already in use. Stop the intended local preview before starting another one.'
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
# A running JVM must never use a JAR that Gradle can overwrite during the next build.
(Get-Item -LiteralPath $runtimeJar).IsReadOnly = $true

# Reuse the existing local IDE inputs without printing secrets or changing the IDE file.
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
    $process = Start-Process -FilePath $JavaPath -ArgumentList @('-jar', ('"{0}"' -f $runtimeJar),
        '--spring.profiles.active=local', '--spring.jpa.hibernate.ddl-auto=validate',
        '--spring.devtools.restart.enabled=false', '--server.address=127.0.0.1', '--server.port=8080') `
        -WorkingDirectory (Join-Path $repoRoot 'backend') -WindowStyle Hidden `
        -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
    [pscustomobject]@{ ProcessId = $process.Id; JarSha256 = $jarHash; RuntimeJar = $runtimeJar;
        StandardOutput = $stdout; StandardError = $stderr }
} finally {
    foreach ($name in $environmentBefore.Keys) {
        [Environment]::SetEnvironmentVariable($name, $environmentBefore[$name], 'Process')
    }
}
