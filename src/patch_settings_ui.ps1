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
if ($js2 -eq $js) { Write-Host "default pane already patched" } else { $js = $js2 }

$js2 = $js.Replace(
  @'
    visible: () =>
      Services.prefs.getBoolPref("browser.preferences.aiControls", false),
'@,
  @'
    visible: () => false,
'@
)
if ($js2 -eq $js) { Write-Host "ai visible already patched" } else { $js = $js2 }

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
if ($js2 -eq $js) { Write-Host "sync visible already patched" } else { $js = $js2 }

if ($js -notmatch "aura-plugins-pane") {
  $js = $js -replace '(module: "chrome://browser/content/preferences/config/about-firefox\.mjs",\s+visible: \(\) => srdSectionPrefs\.all,\s+\},)', @'
    module: "chrome://browser/content/preferences/config/about-firefox.mjs",
    visible: () => srdSectionPrefs.all,
  },
  plugins: {
    l10nId: "aura-plugins-header",
    iconSrc: "chrome://mozapps/skin/extensions/extension.svg",
    groupIds: ["auraPluginsList"],
    module: "chrome://browser/content/aura-welcome/aura-plugins-pane.mjs",
    visible: () => true,
  },
'@
  if ($js -notmatch "aura-plugins-pane") { throw "plugins pane insert failed" }
}

$legacy2 = $legacy.Replace(
  '["general", { category: "sync" }]',
  '["general", { category: "home" }]'
)
if ($legacy2 -eq $legacy) { Write-Host "legacy mapping already patched" } else { $legacy = $legacy2 }

if ($css -notmatch "Aura compact settings overlay") {
  $css = $css + $overlay
}

if ($xhtml -match 'id="helpButton"[^>]*hidden="true" hidden="true"') {
  $xhtml = $xhtml.Replace('hidden="true" hidden="true"', 'hidden="true"')
  Write-Host "helpButton duplicate hidden stripped"
} elseif ($xhtml -match 'id="helpButton"' -and $xhtml -notmatch 'id="helpButton"[^>]*hidden=') {
  $xhtml = $xhtml.Replace(
    '<html:moz-page-nav-button id="helpButton"',
    '<html:moz-page-nav-button id="helpButton" hidden="true"'
  )
} else {
  Write-Host "helpButton already hidden"
}

if ($xhtml -notmatch "category-aura-plugins") {
  $xhtml = $xhtml -replace '(<html:moz-page-nav-button id="category-about-firefox"[\s\S]*?</html:moz-page-nav-button>)', @'
      <html:moz-page-nav-button id="category-about-firefox"
        view="paneAbout"
        iconsrc="chrome://browser/skin/sidebar/firefox.svg"
        data-l10n-id="pane-about-firefox-title">
      </html:moz-page-nav-button>
      <html:moz-page-nav-button id="category-aura-plugins"
        view="panePlugins"
        iconsrc="chrome://mozapps/skin/extensions/extension.svg"
        data-l10n-id="pane-aura-plugins-title">
      </html:moz-page-nav-button>
'@
  if ($xhtml -notmatch "category-aura-plugins") { throw "plugins nav button insert failed" }
}

$ftlPath = "localization/en-US/browser/preferences/preferences.ftl"
$ftl = Get-ZipText $omni $ftlPath
if ($ftl -notmatch "pane-aura-plugins-title") {
  $ftl = $ftl.TrimEnd() + @"

pane-aura-plugins-title = Plugins
  .title = Plugins
aura-plugins-header = Plugins
  .title = Plugins
"@
}

$map = @{
  $prefJsPath = $js
  $prefCssPath = $css
  $legacyPath = $legacy
  $xhtmlPath = $xhtml
  $ftlPath = $ftl
}
Patch-Omni $omni $map
Write-Host "omni.ja patched"
