$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Get-ZipText($zipPath, $name) {
  $zr = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
  $ent = $zr.GetEntry($name)
  if (-not $ent) { $zr.Dispose(); throw "missing $name in $zipPath" }
  $rdr = New-Object System.IO.StreamReader($ent.Open())
  $txt = $rdr.ReadToEnd()
  $rdr.Close(); $zr.Dispose()
  return $txt
}

function Patch-Omni($zipPath, $textMap) {
  $tmp = "$zipPath.new"
  if (Test-Path $tmp) { Remove-Item $tmp -Force }
  $in = [System.IO.Compression.ZipFile]::Open($zipPath, 'Read')
  $outFs = [System.IO.File]::Open($tmp, 'Create')
  $out = New-Object System.IO.Compression.ZipArchive($outFs, [System.IO.Compression.ZipArchiveMode]::Create)
  foreach ($e in $in.Entries) {
    $ne = $out.CreateEntry($e.FullName, [System.IO.Compression.CompressionLevel]::NoCompression)
    $ns = $ne.Open()
    if ($textMap.ContainsKey($e.FullName)) {
      $bytes = [System.Text.Encoding]::UTF8.GetBytes($textMap[$e.FullName])
      $ns.Write($bytes, 0, $bytes.Length)
    } else {
      $es = $e.Open()
      $es.CopyTo($ns)
      $es.Close()
    }
    $ns.Close()
  }
  $in.Dispose()
  $out.Dispose()
  $outFs.Dispose()
  Remove-Item $zipPath -Force
  Move-Item $tmp $zipPath
}

$omni = "C:\AuraBrowser\engine\browser\omni.ja"
$overlay = Get-Content -Raw "C:\AuraBrowser\src\aura-preferences-overlay.css"

$prefJsPath = "chrome/browser/content/browser/preferences/preferences.js"
$prefCssPath = "chrome/browser/skin/classic/browser/preferences/preferences.css"
$legacyPath = "chrome/browser/content/browser/preferences/config/LegacyPaneMappings.mjs"
$xhtmlPath = "chrome/browser/content/browser/preferences/preferences.xhtml"

$js = Get-ZipText $omni $prefJsPath
$css = Get-ZipText $omni $prefCssPath
$legacy = Get-ZipText $omni $legacyPath
$xhtml = Get-ZipText $omni $xhtmlPath

$js2 = $js.Replace(
  @'
  const kDefaultCategoryInternalName = redesignEnabled
    ? "paneSync"
    : "paneGeneral";
  const kDefaultCategory = redesignEnabled ? "sync" : "general";
'@,
  @'
  const kDefaultCategoryInternalName = redesignEnabled
    ? "paneHome"
    : "paneGeneral";
  const kDefaultCategory = redesignEnabled ? "home" : "general";
'@
)
if ($js2 -eq $js) { throw "default pane replace failed" }
$js = $js2

$js2 = $js.Replace(
  @'
    visible: () =>
      Services.prefs.getBoolPref("browser.preferences.aiControls", false),
'@,
  @'
    visible: () => false,
'@
)
if ($js2 -eq $js) { throw "ai visible replace failed" }
$js = $js2

$js2 = $js.Replace(
  @'
    module: "chrome://browser/content/preferences/config/account-sync.mjs",
    replaces: "sync",
'@,
  @'
    module: "chrome://browser/content/preferences/config/account-sync.mjs",
    replaces: "sync",
    visible: () => false,
'@
)
if ($js2 -eq $js) { throw "sync visible replace failed" }
$js = $js2

$legacy2 = $legacy.Replace(
  '["general", { category: "sync" }]',
  '["general", { category: "home" }]'
)
if ($legacy2 -eq $legacy) { throw "legacy mapping replace failed" }
$legacy = $legacy2

if ($css -notmatch "Aura compact settings overlay") {
  $css = $css + $overlay
}

$xhtml2 = $xhtml.Replace(
  '<html:moz-page-nav-button id="helpButton"',
  '<html:moz-page-nav-button id="helpButton" hidden="true"'
)
if ($xhtml2 -eq $xhtml) {
  Write-Host "helpButton already hidden or pattern missed"
} else {
  $xhtml = $xhtml2
}

$map = @{
  $prefJsPath = $js
  $prefCssPath = $css
  $legacyPath = $legacy
  $xhtmlPath = $xhtml
}
Patch-Omni $omni $map
Write-Host "omni.ja patched"
