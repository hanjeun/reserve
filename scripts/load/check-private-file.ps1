param([Parameter(Mandatory = $true)][string]$LiteralPath)
$ErrorActionPreference = 'Stop'
try {
    $drive = [System.IO.DriveInfo]::new([System.IO.Path]::GetPathRoot($LiteralPath))
    if ($drive.DriveType -ne [System.IO.DriveType]::Fixed) { throw 'not private' }
    $currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $allowed = @($currentSid, 'S-1-5-18', 'S-1-5-32-544')
    $acl = Get-Acl -LiteralPath $LiteralPath
    if ($allowed -notcontains $acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value) { throw 'not private' }
    foreach ($rule in $acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier])) {
        if ($rule.AccessControlType -eq [System.Security.AccessControl.AccessControlType]::Allow -and $allowed -notcontains $rule.IdentityReference.Value) { throw 'not private' }
    }
    Write-Output 'PRIVATE'
    exit 0
} catch {
    Write-Output 'NOT_PRIVATE'
    exit 1
}
