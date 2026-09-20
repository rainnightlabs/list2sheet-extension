param(
  [string]$OutputDir = ".\dist"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $root "manifest.json"

if (-not (Test-Path $manifestPath)) {
  throw "manifest.json was not found at $manifestPath"
}

$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$version = $manifest.version

$stage = Join-Path $OutputDir "list2sheet-$version"
$zip = Join-Path $OutputDir "list2sheet-$version.zip"

if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
if (Test-Path $zip) { Remove-Item $zip -Force }
New-Item -ItemType Directory -Path $stage -Force | Out-Null

$rootFiles = @(
  "manifest.json",
  "popup.html",
  "popup.css",
  "popup.js",
  "background.js",
  "picker.js",
  "license.html",
  "license.css",
  "license.js"
)

foreach ($file in $rootFiles) {
  $source = Join-Path $root $file
  if (-not (Test-Path $source)) {
    throw "Required release file is missing: $file"
  }
  Copy-Item $source (Join-Path $stage $file)
}

$sharedSource = Join-Path $root "shared"
if (-not (Test-Path $sharedSource)) {
  throw "Required shared directory is missing."
}
Copy-Item $sharedSource (Join-Path $stage "shared") -Recurse

$iconsSource = Join-Path $root "icons"
if (Test-Path $iconsSource) {
  Copy-Item $iconsSource (Join-Path $stage "icons") -Recurse
}

Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zip -CompressionLevel Optimal

Write-Host ""
Write-Host "List2Sheet release package created:" -ForegroundColor Green
Write-Host $zip
Write-Host ""
Write-Host "Version: $version"
Write-Host "Tests/docs/source-only release files were intentionally excluded."
