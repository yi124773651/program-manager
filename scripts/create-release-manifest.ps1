[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$OutputPath,

    [Parameter(Mandatory = $true, ValueFromRemainingArguments = $true)]
    [string[]]$ArtifactPath,

    [Parameter(Mandatory = $false)]
    [string]$Version,

    [Parameter(Mandatory = $false)]
    [string]$Commit,

    [Parameter(Mandatory = $false)]
    [string]$BuiltAt,

    [Parameter(Mandatory = $false)]
    [string]$RepositoryRoot = (Get-Location).Path
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $RepositoryRoot -PathType Container)) {
    throw "仓库目录不存在：$RepositoryRoot"
}

$resolvedArtifacts = @(
    foreach ($path in $ArtifactPath) {
        if (Test-Path -LiteralPath $path -PathType Leaf) {
            Get-Item -LiteralPath $path
            continue
        }

        $matches = @(Get-ChildItem -Path $path -File -ErrorAction SilentlyContinue)
        if ($matches.Count -eq 0) {
            throw "找不到发布产物：$path"
        }
        $matches
    }
) | Sort-Object -Property FullName -Unique

if ($resolvedArtifacts.Count -eq 0) {
    throw '发布产物列表为空'
}

$root = (Resolve-Path -LiteralPath $RepositoryRoot).Path
$artifactRecords = @(
    foreach ($artifact in $resolvedArtifacts) {
        $signature = Get-AuthenticodeSignature -LiteralPath $artifact.FullName
        $relativePath = [IO.Path]::GetRelativePath($root, $artifact.FullName).Replace('\', '/')
        $signer = if ($signature.SignerCertificate) {
            $signature.SignerCertificate.Subject
        } else {
            ''
        }
        $timestamp = if ($signature.TimeStamperCertificate) {
            $signature.TimeStamperCertificate.Subject
        } else {
            ''
        }

        [ordered]@{
            path = $relativePath
            fileName = $artifact.Name
            size = $artifact.Length
            sha256 = (Get-FileHash -LiteralPath $artifact.FullName -Algorithm SHA256).Hash
            signatureStatus = [string]$signature.Status
            signer = $signer
            timestampSigner = $timestamp
        }
    }
)

$manifest = [ordered]@{
    schemaVersion = 1
    product = 'program-manager'
    version = if ([string]::IsNullOrWhiteSpace($Version)) { '' } else { $Version }
    commit = if ([string]::IsNullOrWhiteSpace($Commit)) { '' } else { $Commit }
    builtAt = if ([string]::IsNullOrWhiteSpace($BuiltAt)) { [DateTimeOffset]::UtcNow.ToString('O') } else { $BuiltAt }
    generatedAt = [DateTimeOffset]::UtcNow.ToString('O')
    artifacts = $artifactRecords
}

$outputDirectory = Split-Path -Parent $OutputPath
if (-not [string]::IsNullOrWhiteSpace($outputDirectory)) {
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}

$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $OutputPath -Encoding utf8
Write-Host "发布清单已生成：$OutputPath"
$artifactRecords | ForEach-Object {
    Write-Host ("{0} | SHA256={1} | 签名={2}" -f $_.path, $_.sha256, $_.signatureStatus)
}
