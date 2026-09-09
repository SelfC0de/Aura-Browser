# Pack install tree into aura-payload.zip and optionally append it to AuraLauncher.exe
# GitHub release:
#   tag:    v0.0.0.1r   or  v0.0.0.1p
#   asset:  Aura-0.0.0.1r-win64.zip  (same layout as aura-payload.zip)
# Zip root = install folder:
#   AuraBrowser.exe
#   version.txt
#   Aura.png
#   engine\
# Never include: data\, src\, updates\, AuraLauncher.exe

$ErrorActionPreference = "Stop"
$root = "C:\AuraBrowser"
$ver = (Get-Content "$root\version.txt" -Raw).Trim()
$zip = "$root\src\Aura-$ver-win64.zip"
$stage = "$root\src\_dist"
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage | Out-Null

Copy-Item "$root\AuraBrowser.exe" $stage
Copy-Item "$root\version.txt" $stage
if (Test-Path "$root\Aura.png") { Copy-Item "$root\Aura.png" $stage }
Copy-Item "$root\engine" "$stage\engine" -Recurse

if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path "$stage\*" -DestinationPath $zip -CompressionLevel Optimal
Copy-Item $zip "$root\aura-payload.zip" -Force
Write-Host "zip $zip  $((Get-Item $zip).Length) bytes"

$launch = "$root\AuraLauncher.exe"
if (Test-Path $launch) {
  $out = "$root\AuraSetup-$ver.exe"
  $exe = [IO.File]::ReadAllBytes($launch)
  $pay = [IO.File]::ReadAllBytes($zip)
  $ms = New-Object IO.MemoryStream
  $ms.Write($exe, 0, $exe.Length)
  $ms.Write($pay, 0, $pay.Length)
  $mag = [Text.Encoding]::ASCII.GetBytes("AURAPAYLOAD1")
  $ms.Write($mag, 0, 12)
  $len = [BitConverter]::GetBytes([uint64]$pay.Length)
  $ms.Write($len, 0, 8)
  [IO.File]::WriteAllBytes($out, $ms.ToArray())
  Write-Host "sfx $out  $((Get-Item $out).Length) bytes"
}

Remove-Item $stage -Recurse -Force
Write-Host "packed"
