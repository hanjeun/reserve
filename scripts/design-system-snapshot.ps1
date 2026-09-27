param([ValidateSet('Header', 'Finalize', 'Verify')][string]$Stage = 'Header')

$minimumPowerShellMajor = 7
if ($PSVersionTable.PSVersion.Major -lt $minimumPowerShellMajor) {
    throw "PowerShell $minimumPowerShellMajor or newer is required to verify the immutable design-system snapshot."
}

$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$snapshotRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot 'docs/design-system/snapshots/2026-09-13-baseline'))
$sourceRoot = Join-Path $snapshotRoot 'source'
if (!$snapshotRoot.StartsWith($repoRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Snapshot target must stay inside this repository.'
}

function Write-Json([string]$name, $value) {
    [IO.File]::WriteAllText((Join-Path $snapshotRoot $name), (ConvertTo-Json -InputObject $value -Depth 12) + "`n", [Text.UTF8Encoding]::new($false))
}

function Save-Source([string]$relative, [string]$category, [string]$snapshotRelative = '') {
    if (!$snapshotRelative) { $snapshotRelative = 'source/' + $relative }
    $source = [IO.Path]::GetFullPath((Join-Path $repoRoot $relative))
    $target = [IO.Path]::GetFullPath((Join-Path $snapshotRoot $snapshotRelative))
    if (!$source.StartsWith($repoRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or
        !$target.StartsWith($snapshotRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Path escaped its source/target root: $relative"
    }
    if (!(Test-Path -LiteralPath $source -PathType Leaf)) { throw "Missing explicit source: $relative" }
    if (Test-Path -LiteralPath $target) { return }
    $before = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
    New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($target)) -Force | Out-Null
    Copy-Item -LiteralPath $source -Destination $target
    $after = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
    $copyHash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($before -ne $after -or $before -ne $copyHash) { throw "Source changed during copy: $relative" }
    $record = [ordered]@{
        source_relative_path = $relative.Replace('\', '/')
        snapshot_relative_path = $snapshotRelative.Replace('\', '/')
        category = $category
        bytes = (Get-Item -LiteralPath $target).Length
        sha256 = $copyHash
        captured_at_utc = [DateTime]::UtcNow.ToString('o')
    }
    $records = @()
    if (Test-Path -LiteralPath (Join-Path $snapshotRoot 'capture-records.json')) {
        $records = @(Get-Content -LiteralPath (Join-Path $snapshotRoot 'capture-records.json') -Raw | ConvertFrom-Json)
    }
    $records += [pscustomobject]$record
    [IO.File]::WriteAllText((Join-Path $snapshotRoot 'capture-records.json'), (ConvertTo-Json -InputObject @($records) -Depth 5) + "`n", [Text.UTF8Encoding]::new($false))
}

if ($Stage -eq 'Header') {
    $files = @(
        'frontend/src/components/layout/Header.jsx',
        'frontend/src/components/layout/HeaderAccountMenu.jsx',
        'frontend/src/components/layout/DiscoveryNav.jsx',
        'frontend/src/components/layout/Footer.jsx',
        'frontend/src/index.css',
        'frontend/src/styles/theme.css',
        'frontend/src/styles/global/foundation.css',
        'frontend/src/styles/global/interactions.css',
        'frontend/src/styles/global/components-and-forms.css',
        'frontend/src/styles/global/navigation-and-media.css',
        'frontend/src/styles/global/feature-surfaces.css',
        'docs/technical/design-system.md'
    )
    foreach ($relative in $files) { Save-Source $relative 'reserve-shell-baseline' }
    Write-Output 'Header baseline captured and hash verified.'
    exit 0
}

$zipPath = Join-Path $snapshotRoot 'reserve-design-system-2026-09-13-baseline.zip'

if ($Stage -eq 'Finalize') {
    if (Test-Path -LiteralPath $zipPath) { throw 'A finalized baseline is immutable. Use Verify, not overwrite.' }
    $groups = [ordered]@{
        'shared-ui-hook' = @(
            'frontend/src/hooks/useMessage.js', 'frontend/src/hooks/useReducedMotion.js',
            'frontend/src/hooks/useWindowWidth.js', 'frontend/src/hooks/useTheme.js',
            'frontend/src/hooks/useExitAnimation.js', 'frontend/src/hooks/useImagePreview.jsx',
            'frontend/src/hooks/useImagePreviewSwipe.js', 'frontend/src/hooks/useFormReady.js',
            'frontend/src/hooks/useFormErrors.js', 'frontend/src/hooks/useDebounce.js',
            'frontend/src/hooks/useOnlineStatus.js', 'frontend/src/hooks/useGoBack.js',
            'frontend/src/hooks/useQueryParamState.js', 'frontend/src/hooks/__tests__/useGoBack.test.jsx'
        )
        'generic-adapter-needed' = @('frontend/src/utils/image.js')
        'generic-ui-helper' = @('frontend/src/utils/validation.js', 'frontend/src/utils/form.js', 'frontend/src/constants/pagination.js')
        'reserve-pattern-reference' = @('frontend/src/constants/discovery.js', 'frontend/src/constants/roles.js', 'frontend/src/hooks/queryKeys.js')
        'integration-reference-not-entrypoint' = @(
            'frontend/src/App.jsx', 'frontend/src/main.jsx', 'frontend/vite.config.js',
            'frontend/eslint.config.js', 'frontend/src/test/setup.js'
        )
        'dependency-and-rule-reference' = @(
            'frontend/package.json', 'frontend/package-lock.json',
            'frontend/scripts/eslint-reserve-rules.mjs', 'frontend/scripts/eslint-reserve-rules.test.mjs',
            '.gitattributes', 'THIRD_PARTY_NOTICES.md'
        )
        'design-document' = @(
            'docs/technical/design-system.md', 'docs/technical/interaction-audit-2026-09-13.md',
            'docs/technical/design-measurements-2026-09-13.md', 'docs/technical/home-visual-assets.md',
            'docs/rules/code-conventions.md'
        )
        'owned-brand-asset' = @(
            'frontend/public/icons/R_logo.png', 'frontend/public/icons/RESERVE_logo.png',
            'frontend/public/icons/favicon.svg', 'frontend/public/icons/apple-touch-icon.png'
        )
        'font-asset' = @('frontend/public/fonts/SUITE-Variable.woff2')
        'reproduction-script' = @('scripts/design-system-snapshot.ps1')
    }
    foreach ($category in $groups.Keys) {
        foreach ($relative in $groups[$category]) { Save-Source $relative $category }
    }
    foreach ($folder in @('frontend/src/styles', 'frontend/src/components/common', 'frontend/src/components/layout', 'frontend/patches')) {
        foreach ($item in (Get-ChildItem -LiteralPath (Join-Path $repoRoot $folder) -Recurse -File | Sort-Object FullName)) {
            $relative = [IO.Path]::GetRelativePath($repoRoot, $item.FullName).Replace('\', '/')
            if ($item.Extension -notin @('.js', '.jsx', '.css', '.patch')) { throw "Unexpected file in explicit design folder: $relative" }
            $category = if ($folder -eq 'frontend/src/styles') {
                if ($relative -match '/tokens/') { 'core-token' } else { 'mixed-global-style' }
            } elseif ($folder -eq 'frontend/src/components/layout') { 'reserve-shell-baseline' }
            elseif ($folder -eq 'frontend/patches') { 'dependency-patch-reference' }
            elseif ($item.Name -match '^(FavoriteButton|InquiryModal|KakaoMap|kakaoMapOverlay)(\.|$)') { 'reserve-coupled-pattern' }
            elseif ($item.Name -in @('Avatar.jsx', 'FilterToolbar.jsx', 'index.js')) { 'generic-adapter-needed' }
            elseif ($item.Name -eq 'Skeletons.jsx') { 'mixed-generic-and-reserve-pattern' }
            else { 'generic-ui-component' }
            Save-Source $relative $category
        }
    }
    Save-Source 'frontend/node_modules/pretendard/dist/LICENSE.txt' 'font-license-reference' 'licenses/Pretendard-LICENSE.txt'
    Save-Source 'frontend/node_modules/pretendard/package.json' 'font-dependency-reference' 'licenses/Pretendard-package.json'

    $records = @(Get-Content -LiteralPath (Join-Path $snapshotRoot 'capture-records.json') -Raw | ConvertFrom-Json)
    # Correct the early header-stage grouping without changing preserved source bytes.
    foreach ($record in $records) {
        if ($record.source_relative_path -eq 'frontend/src/index.css') { $record.category = 'core-style-entry' }
        elseif ($record.source_relative_path -match '^frontend/src/styles/' -and $record.category -eq 'reserve-shell-baseline') { $record.category = 'mixed-global-style' }
        elseif ($record.source_relative_path -eq 'docs/technical/design-system.md') { $record.category = 'design-document' }
    }
    $records = @($records | Sort-Object source_relative_path)
    Write-Json 'manifest.json' @($records)
    Write-Json 'inventory.json' @($records | Group-Object category | ForEach-Object {
        [ordered]@{ category = $_.Name; count = $_.Count; source_relative_paths = @($_.Group.source_relative_path) }
    })
    $branch = (& git -C $repoRoot branch --show-current).Trim()
    $head = (& git -C $repoRoot rev-parse HEAD).Trim()
    $dirty = @(& git -C $repoRoot status --porcelain -- @($records.source_relative_path))
    Write-Json 'baseline.json' ([ordered]@{
        branch = $branch; head = $head; baseline = 'dirty-local-preview-unintegrated'
        production_or_latest_dev_proof = $false
        capture_is_per_file_not_atomic_repository_backup = $true
        finalized_at_utc = [DateTime]::UtcNow.ToString('o')
        selected_source_git_status_at_finalization = @($dirty)
        git_repository_or_history_in_payload = $false
        live_app_files_modified_by_this_script = $false
    })

    $dependencies = @()
    foreach ($record in $records) {
        if ([IO.Path]::GetExtension($record.source_relative_path) -notin @('.js', '.jsx', '.css')) { continue }
        $text = Get-Content -LiteralPath (Join-Path $snapshotRoot $record.snapshot_relative_path) -Raw
        $pattern = '(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*|@import\s*)["'']([^"'']+)["'']'
        foreach ($match in [regex]::Matches($text, $pattern)) {
            $specifier = $match.Groups[1].Value
            $resolvedRelative = $null
            if ($specifier.StartsWith('.')) {
                $base = [IO.Path]::GetFullPath((Join-Path ([IO.Path]::GetDirectoryName((Join-Path $repoRoot $record.source_relative_path))) $specifier))
                foreach ($candidate in @($base, "$base.js", "$base.jsx", "$base.css", (Join-Path $base 'index.js'), (Join-Path $base 'index.jsx'))) {
                    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
                        $resolvedRelative = [IO.Path]::GetRelativePath($repoRoot, $candidate).Replace('\', '/')
                        break
                    }
                }
            }
            $included = $null -ne $resolvedRelative -and $resolvedRelative -in $records.source_relative_path
            $dependencies += [ordered]@{
                source = $record.source_relative_path; specifier = $specifier
                kind = if ($specifier.StartsWith('.')) { 'relative' } else { 'external-package' }
                resolved_source_relative_path = $resolvedRelative; included_in_snapshot = $included
                note = if ($specifier.StartsWith('.') -and !$included) { 'Adapter or app implementation intentionally not preserved; not a runnable-package claim.' } else { '' }
            }
        }
    }
    Write-Json 'dependency-boundaries.json' ([ordered]@{
        method = 'static-import-export-regex-not-runtime-or-complete-module-graph'
        edges = @($dependencies)
        omitted_relative_edges = @($dependencies | Where-Object { $_.kind -eq 'relative' -and !$_.included_in_snapshot })
    })
    Write-Json 'licenses/provenance.json' @(
        [ordered]@{ file = 'licenses/Pretendard-LICENSE.txt'; source = 'frontend/node_modules/pretendard/dist/LICENSE.txt'; handling = 'byte-identical local installed package copy' },
        [ordered]@{ file = 'licenses/SUITE-OFL-1.1.txt'; source = 'https://raw.githubusercontent.com/sun-typeface/SUITE/main/LICENSE'; accessed_date = '2026-09-13'; handling = 'official license text transcribed with LF line endings; not binary upstream-version verification' }
    )
}

$secretPattern = '(?:AKIA|ASIA)[A-Z0-9]{16}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|https?://[^\s/"''@]+:[^\s/"''@]+@'
$payloadFiles = @(Get-ChildItem -LiteralPath $snapshotRoot -Recurse -File | Where-Object {
    $_.Name -notin @('reserve-design-system-2026-09-13-baseline.zip', 'archive.sha256', 'verification.json', 'payload-manifest.json')
} | Sort-Object FullName)
foreach ($item in $payloadFiles) {
    $relative = [IO.Path]::GetRelativePath($snapshotRoot, $item.FullName).Replace('\', '/')
    if ($relative -match '(^|/)(\.git|\.env[^/]*)(/|$)|^source/(backend/|frontend/src/(api|services|store)/)|\.(sql|log|pem|key)$') {
        throw "Forbidden payload path: $relative"
    }
    if ($item.Extension -in @('.js', '.jsx', '.css', '.json', '.md', '.txt', '.svg', '.patch')) {
        if ([regex]::IsMatch((Get-Content -LiteralPath $item.FullName -Raw), $secretPattern)) {
            throw "Known credential/private-key/JWT/URL-password pattern detected in $relative. No matched value is printed."
        }
    }
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
if ($Stage -eq 'Finalize') {
    $payload = @($payloadFiles | ForEach-Object { [ordered]@{
        path = [IO.Path]::GetRelativePath($snapshotRoot, $_.FullName).Replace('\', '/')
        bytes = $_.Length; sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    } })
    Write-Json 'payload-manifest.json' @($payload)
    $zip = [IO.Compression.ZipFile]::Open($zipPath, [IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($item in @($payloadFiles) + (Get-Item -LiteralPath (Join-Path $snapshotRoot 'payload-manifest.json'))) {
            $name = [IO.Path]::GetRelativePath($snapshotRoot, $item.FullName).Replace('\', '/')
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $item.FullName, $name, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
    } finally { $zip.Dispose() }
    $zipHash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
    [IO.File]::WriteAllText((Join-Path $snapshotRoot 'archive.sha256'), "$zipHash  reserve-design-system-2026-09-13-baseline.zip`n", [Text.UTF8Encoding]::new($false))
}

$manifest = @(Get-Content -LiteralPath (Join-Path $snapshotRoot 'manifest.json') -Raw | ConvertFrom-Json)
$diverged = @()
foreach ($record in $manifest) {
    $saved = Join-Path $snapshotRoot $record.snapshot_relative_path
    if ((Get-Item -LiteralPath $saved).Length -ne $record.bytes -or (Get-FileHash -LiteralPath $saved -Algorithm SHA256).Hash.ToLowerInvariant() -ne $record.sha256) {
        throw "Preserved source failed hash check: $($record.source_relative_path)"
    }
    $current = Join-Path $repoRoot $record.source_relative_path
    if (!(Test-Path -LiteralPath $current) -or (Get-FileHash -LiteralPath $current -Algorithm SHA256).Hash.ToLowerInvariant() -ne $record.sha256) { $diverged += $record.source_relative_path }
}
$payload = @(Get-Content -LiteralPath (Join-Path $snapshotRoot 'payload-manifest.json') -Raw | ConvertFrom-Json)
$zip = [IO.Compression.ZipFile]::OpenRead($zipPath)
try {
    if ($zip.Entries.Count -ne $payload.Count + 1) { throw 'ZIP entry count differs from explicit payload manifest.' }
    foreach ($item in $payload) {
        $entry = $zip.GetEntry($item.path)
        if (!$entry -or $entry.Length -ne $item.bytes) { throw "Missing/invalid ZIP entry: $($item.path)" }
        $stream = $entry.Open()
        $sha = [Security.Cryptography.SHA256]::Create()
        try { $actual = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
        finally { $stream.Dispose(); $sha.Dispose() }
        if ($actual -ne $item.sha256) { throw "ZIP entry hash differs: $($item.path)" }
    }
    $entryCount = $zip.Entries.Count
} finally { $zip.Dispose() }
$zipHash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
$expectedZip = (Get-Content -LiteralPath (Join-Path $snapshotRoot 'archive.sha256') -Raw).Split(' ')[0]
if ($zipHash -ne $expectedZip) { throw 'ZIP archive digest differs from archive.sha256.' }
$result = [ordered]@{
    verified_at_utc = [DateTime]::UtcNow.ToString('o')
    preserved_sources = $manifest.Count; source_bytes = ($manifest | Measure-Object bytes -Sum).Sum
    zip_entries = $entryCount; zip_bytes = (Get-Item -LiteralPath $zipPath).Length; zip_sha256 = $zipHash
    copied_source_hashes_match = $true; zip_payload_hashes_match = $true
    narrow_known_secret_pattern_check = 'passed-not-universal-secret-absence-proof'
    current_source_divergence = @($diverged)
    divergence_is_not_snapshot_corruption = $true
}
if ($Stage -eq 'Finalize') { Write-Json 'verification.json' $result }
$result | ConvertTo-Json -Depth 4
