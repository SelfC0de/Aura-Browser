# Overlay zip for updates: Aura layer only, not Gecko dlls.
# GitHub Release:
#   first install:  Aura-<ver>-win64.zip   (pack_setup.ps1)
#   later updates:  Aura-<ver>-files.zip   (this script)
# Launcher: if Aura is already installed, Download prefers -files.zip.

$ErrorActionPreference = "Stop"
$root = "C:\AuraBrowser"
$ver = (Get-Content "$root\version.txt" -Raw).Trim()
$zip = "$root\src\Aura-$ver-files.zip"
$stage = "$root\src\_dist_files"
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage | Out-Null

function Place($from, $to) {
  if (-not (Test-Path $from)) { return }
  $dir = Split-Path $to
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  Copy-Item -Force $from $to
}

Copy-Item "$root\AuraBrowser.exe" "$stage\AuraBrowser.exe"
Copy-Item "$root\version.txt" "$stage\version.txt"
if (Test-Path "$root\Aura.png") { Copy-Item "$root\Aura.png" "$stage\Aura.png" }

New-Item -ItemType Directory -Force -Path "$stage\engine\chrome","$stage\engine\welcome","$stage\engine\defaults\pref","$stage\engine\distribution","$stage\engine\filters","$stage\engine\browser" | Out-Null

Place "$root\engine\aura.cfg" "$stage\engine\aura.cfg"
Place "$root\engine\user.js" "$stage\engine\user.js"
Copy-Item "$root\engine\chrome\*" "$stage\engine\chrome\" -Force
Copy-Item "$root\engine\welcome\*" "$stage\engine\welcome\" -Force
Copy-Item "$root\engine\defaults\pref\*" "$stage\engine\defaults\pref\" -Force
Place "$root\engine\distribution\policies.json" "$stage\engine\distribution\policies.json"
Place "$root\engine\distribution\distribution.ini" "$stage\engine\distribution\distribution.ini"
if (Test-Path "$root\engine\filters") {
  Copy-Item "$root\engine\filters\*" "$stage\engine\filters\" -Force
}
Place "$root\engine\browser\omni.ja" "$stage\engine\browser\omni.ja"
Place "$root\engine\omni.ja" "$stage\engine\omni.ja"

if (Test-Path $zip) { Remove-Item $zip -Force }
& tar.exe -a -c -f $zip -C $stage *
if ($LASTEXITCODE -ne 0) { throw "tar failed" }
$n = (Get-ChildItem $stage -Recurse -File | Measure-Object Length -Sum)
Write-Host ("files zip {0}  {1:N1} MB  ({2} files)" -f $zip, ((Get-Item $zip).Length/1MB), $n.Count)
Remove-Item $stage -Recurse -Force
Write-Host "packed overlay"
