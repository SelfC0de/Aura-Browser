param(
  [string]$Root = "C:\AuraBrowser"
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$welcome = Join-Path $Root "engine\welcome"
$omni = Join-Path $Root "engine\browser\omni.ja"
if (-not (Test-Path $omni)) { throw "omni.ja missing" }
$tmp = "$omni.new"
if (Test-Path $tmp) { Remove-Item $tmp -Force }

$xhtmlPath = "chrome/browser/content/browser/browser.xhtml"
$inRead = [System.IO.Compression.ZipFile]::OpenRead($omni)
$ent = $inRead.GetEntry($xhtmlPath)
$sr = New-Object IO.StreamReader($ent.Open())
$xhtml = $sr.ReadToEnd()
$sr.Close(); $inRead.Dispose()

foreach ($js in @("aura-menu.js","aura-ui.js","aura-vault.js")) {
  $tag = "<script src=`"chrome://browser/content/aura-welcome/$js`"/>"
  if ($xhtml -notmatch [regex]::Escape($js)) {
    $xhtml = $xhtml.Replace("</html:body>", "  $tag`n</html:body>")
  }
}

$map = @{
  "chrome/browser/content/browser/aura-welcome/index.html" = Join-Path $welcome "index.html"
  "chrome/browser/content/browser/aura-welcome/welcome.css" = Join-Path $welcome "welcome.css"
  "chrome/browser/content/browser/aura-welcome/welcome.js" = Join-Path $welcome "welcome.js"
  "chrome/browser/content/browser/aura-welcome/start.html" = Join-Path $welcome "start.html"
  "chrome/browser/content/browser/aura-welcome/start.js" = Join-Path $welcome "start.js"
  "chrome/browser/content/browser/aura-welcome/aura-menu.js" = Join-Path $welcome "aura-menu.js"
  "chrome/browser/content/browser/aura-welcome/aura-ui.js" = Join-Path $welcome "aura-ui.js"
  "chrome/browser/content/browser/aura-welcome/aura-vault.js" = Join-Path $welcome "aura-vault.js"
  "chrome/browser/content/browser/aura-welcome/aura-content.js" = Join-Path $welcome "aura-content.js"
  "chrome/browser/content/browser/aura-welcome/aura-protocol.js" = Join-Path $welcome "aura-protocol.js"
}

$compLine = "component {b7e4d2a1-0c19-4f8a-9e33-aa1100aa1100} browser/content/browser/aura-welcome/aura-protocol.js"
$contLine = "contract @mozilla.org/network/protocol;1?name=aura {b7e4d2a1-0c19-4f8a-9e33-aa1100aa1100}"
$chromeManPath = "chrome/chrome.manifest"

$in = [System.IO.Compression.ZipFile]::Open($omni, "Read")
$outFs = [System.IO.File]::Open($tmp, "Create")
$out = New-Object System.IO.Compression.ZipArchive($outFs, [System.IO.Compression.ZipArchiveMode]::Create)
$seen = @{}
foreach ($e in $in.Entries) {
  $ne = $out.CreateEntry($e.FullName, [System.IO.Compression.CompressionLevel]::NoCompression)
  $ns = $ne.Open()
  if ($e.FullName -eq $xhtmlPath) {
    $bytes = [Text.Encoding]::UTF8.GetBytes($xhtml)
    $ns.Write($bytes, 0, $bytes.Length)
    $seen[$e.FullName] = $true
  } elseif ($e.FullName -eq $chromeManPath) {
    $sr2 = New-Object IO.StreamReader($e.Open())
    $man = $sr2.ReadToEnd()
    $sr2.Close()
    if ($man -notmatch "name=aura") {
      $man = $man.TrimEnd() + "`n$compLine`n$contLine`n"
    }
    $bytes = [Text.Encoding]::UTF8.GetBytes($man)
    $ns.Write($bytes, 0, $bytes.Length)
    $seen[$e.FullName] = $true
  } elseif ($map.ContainsKey($e.FullName) -and (Test-Path $map[$e.FullName])) {
    $bytes = [IO.File]::ReadAllBytes($map[$e.FullName])
    $ns.Write($bytes, 0, $bytes.Length)
    $seen[$e.FullName] = $true
  } else {
    $es = $e.Open(); $es.CopyTo($ns); $es.Close()
  }
  $ns.Close()
}
foreach ($k in $map.Keys) {
  if ($seen.ContainsKey($k)) { continue }
  if (-not (Test-Path $map[$k])) { continue }
  $ne = $out.CreateEntry($k, [System.IO.Compression.CompressionLevel]::NoCompression)
  $ns = $ne.Open()
  $bytes = [IO.File]::ReadAllBytes($map[$k])
  $ns.Write($bytes, 0, $bytes.Length)
  $ns.Close()
}
$in.Dispose(); $out.Dispose(); $outFs.Dispose()
Remove-Item $omni -Force
Move-Item $tmp $omni
Write-Host "packed omni"
