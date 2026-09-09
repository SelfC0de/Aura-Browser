$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$srcJpg = "C:\Users\Admin\.grok\sessions\C%3A%5CUsers%5CAdmin\01a08206-dcf4-7831-a04c-f771d240a281\images\20.jpg"
$pngOut = "C:\AuraBrowser\Aura.png"
$icoOut = "C:\AuraBrowser\src\Aura.ico"
$dir = "C:\AuraBrowser\engine\browser\chrome\icons\default"
New-Item -ItemType Directory -Force -Path $dir | Out-Null

$src = [Drawing.Image]::FromFile($srcJpg)
$src.Save($pngOut, [Drawing.Imaging.ImageFormat]::Png)

function New-PngBytes([Drawing.Image]$img, [int]$px) {
  $bmp = New-Object Drawing.Bitmap $px, $px, ([Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = "HighQuality"
  $g.InterpolationMode = "HighQualityBicubic"
  $g.PixelOffsetMode = "HighQuality"
  $g.CompositingQuality = "HighQuality"
  $g.Clear([Drawing.Color]::FromArgb(255, 10, 10, 16))
  $g.DrawImage($img, 0, 0, $px, $px)
  $g.Dispose()
  $ms = New-Object IO.MemoryStream
  $bmp.Save($ms, [Drawing.Imaging.ImageFormat]::Png)
  $bmp.Save((Join-Path $dir "default$px.png"), [Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  return $ms.ToArray()
}

$sizes = @(16, 20, 24, 32, 40, 48, 64, 128, 256)
$entries = @()
foreach ($s in $sizes) {
  $bytes = New-PngBytes $src $s
  $entries += @{ w = $s; bytes = $bytes }
  Write-Output ("png $s = " + $bytes.Length)
}
$src.Dispose()

$count = $entries.Count
$offset = 6 + (16 * $count)
$ms = New-Object IO.MemoryStream
$bw = New-Object IO.BinaryWriter $ms
$bw.Write([uint16]0)
$bw.Write([uint16]1)
$bw.Write([uint16]$count)
foreach ($e in $entries) {
  $ww = if ($e.w -ge 256) { [byte]0 } else { [byte]$e.w }
  $hh = $ww
  $bw.Write($ww)
  $bw.Write($hh)
  $bw.Write([byte]0)
  $bw.Write([byte]0)
  $bw.Write([uint16]1)
  $bw.Write([uint16]32)
  $bw.Write([int32]$e.bytes.Length)
  $bw.Write([int32]$offset)
  $offset += $e.bytes.Length
}
foreach ($e in $entries) { $bw.Write($e.bytes) }
$bw.Flush()
[IO.File]::WriteAllBytes($icoOut, $ms.ToArray())
Copy-Item -Force $icoOut "$dir\default.ico"
Copy-Item -Force $icoOut "C:\AuraBrowser\engine\firefox.ico"
Copy-Item -Force $icoOut "C:\AuraBrowser\engine\browser\chrome\icons\default\default.ico"
Write-Output ("ICO " + (Get-Item $icoOut).Length)
