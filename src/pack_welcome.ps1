$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$omni = "C:\AuraBrowser\engine\browser\omni.ja"
$tmp = "$omni.new"
if (Test-Path $tmp) { Remove-Item $tmp -Force }

$xhtmlPath = "chrome/browser/content/browser/browser.xhtml"
$inRead = [System.IO.Compression.ZipFile]::OpenRead($omni)
$ent = $inRead.GetEntry($xhtmlPath)
$sr = New-Object IO.StreamReader($ent.Open())
$xhtml = $sr.ReadToEnd()
$sr.Close(); $inRead.Dispose()

$tag = '<script src="chrome://browser/content/aura-welcome/aura-menu.js"/>'
if ($xhtml -notmatch "aura-menu.js") {
  $xhtml = $xhtml.Replace("</html:body>", "  $tag`n</html:body>")
  if ($xhtml -notmatch "aura-menu.js") { throw "failed to inject aura-menu.js into browser.xhtml" }
}
$tag2 = '<script src="chrome://browser/content/aura-welcome/aura-ui.js"/>'
if ($xhtml -notmatch "aura-ui.js") {
  $xhtml = $xhtml.Replace("</html:body>", "  $tag2`n</html:body>")
  if ($xhtml -notmatch "aura-ui.js") { throw "failed to inject aura-ui.js into browser.xhtml" }
}
$tag3 = '<script src="chrome://browser/content/aura-welcome/aura-vault.js"/>'
if ($xhtml -notmatch "aura-vault.js") {
  $xhtml = $xhtml.Replace("</html:body>", "  $tag3`n</html:body>")
  if ($xhtml -notmatch "aura-vault.js") { throw "failed to inject aura-vault.js into browser.xhtml" }
}
$tag4 = '<script src="chrome://browser/content/aura-welcome/aura-plugins.js"/>'
if ($xhtml -notmatch "aura-plugins.js") {
  $xhtml = $xhtml.Replace("</html:body>", "  $tag4`n</html:body>")
  if ($xhtml -notmatch "aura-plugins.js") { throw "failed to inject aura-plugins.js into browser.xhtml" }
}

$map = @{
  "chrome/browser/content/browser/aura-welcome/index.html"   = "C:\AuraBrowser\engine\welcome\index.html"
  "chrome/browser/content/browser/aura-welcome/welcome.css"  = "C:\AuraBrowser\engine\welcome\welcome.css"
  "chrome/browser/content/browser/aura-welcome/welcome.js"   = "C:\AuraBrowser\engine\welcome\welcome.js"
  "chrome/browser/content/browser/aura-welcome/start.html"   = "C:\AuraBrowser\engine\welcome\start.html"
  "chrome/browser/content/browser/aura-welcome/start.js"     = "C:\AuraBrowser\engine\welcome\start.js"
  "chrome/browser/content/browser/aura-welcome/aura-menu.js" = "C:\AuraBrowser\engine\welcome\aura-menu.js"
  "chrome/browser/content/browser/aura-welcome/aura-ui.js"   = "C:\AuraBrowser\engine\welcome\aura-ui.js"
  "chrome/browser/content/browser/aura-welcome/aura-vault.js" = "C:\AuraBrowser\engine\welcome\aura-vault.js"
  "chrome/browser/content/browser/aura-welcome/aura-content.js" = "C:\AuraBrowser\engine\welcome\aura-content.js"
  "chrome/browser/content/browser/aura-welcome/aura-protocol.js" = "C:\AuraBrowser\engine\welcome\aura-protocol.js"
  "chrome/browser/content/browser/aura-welcome/aura-plugins.js" = "C:\AuraBrowser\engine\welcome\aura-plugins.js"
  "chrome/browser/content/browser/aura-welcome/plugins.html" = "C:\AuraBrowser\engine\welcome\plugins.html"
  "chrome/browser/content/browser/aura-welcome/plugins.css" = "C:\AuraBrowser\engine\welcome\plugins.css"
  "chrome/browser/content/browser/aura-welcome/plugins-page.js" = "C:\AuraBrowser\engine\welcome\plugins-page.js"
  $xhtmlPath = $null
}

$compLine = "component {b7e4d2a1-0c19-4f8a-9e33-aa1100aa1100} browser/content/browser/aura-welcome/aura-protocol.js"
$contLine = "contract @mozilla.org/network/protocol;1?name=aura {b7e4d2a1-0c19-4f8a-9e33-aa1100aa1100}"
$chromeManPath = "chrome/chrome.manifest"

$in = [System.IO.Compression.ZipFile]::Open($omni, 'Read')
$outFs = [System.IO.File]::Open($tmp, 'Create')
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
  } elseif ($map.ContainsKey($e.FullName) -and $map[$e.FullName]) {
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
  if (-not $map[$k]) { continue }
  $ne = $out.CreateEntry($k, [System.IO.Compression.CompressionLevel]::NoCompression)
  $ns = $ne.Open()
  $bytes = [IO.File]::ReadAllBytes($map[$k])
  $ns.Write($bytes, 0, $bytes.Length)
  $ns.Close()
  Write-Host "added $k"
}
$in.Dispose(); $out.Dispose(); $outFs.Dispose()
Remove-Item $omni -Force
Move-Item $tmp $omni
Write-Host "packed"
