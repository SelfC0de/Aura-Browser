$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Patch-Omni($zipPath, $textMap, $pngBytes, $pngSlots) {
  $tmp = "$zipPath.new"
  if (Test-Path $tmp) { Remove-Item $tmp -Force }
  $in = [System.IO.Compression.ZipFile]::Open($zipPath, 'Read')
  $outFs = [System.IO.File]::Open($tmp, 'Create')
  $out = New-Object System.IO.Compression.ZipArchive($outFs, [System.IO.Compression.ZipArchiveMode]::Create)
  foreach ($e in $in.Entries) {
    $ne = $out.CreateEntry($e.FullName)
    $ns = $ne.Open()
    if ($textMap.ContainsKey($e.FullName)) {
      $bytes = [System.Text.Encoding]::UTF8.GetBytes($textMap[$e.FullName])
      $ns.Write($bytes, 0, $bytes.Length)
    } elseif ($pngSlots -contains $e.FullName) {
      $ns.Write($pngBytes, 0, $pngBytes.Length)
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

$png = [System.IO.File]::ReadAllBytes("C:\AuraBrowser\Aura.png")
$brandFtl = @"
-brand-shorter-name = Aura
-brand-short-name = Aura
-brand-shortcut-name = Aura
-brand-full-name = Aura
-brand-product-name = Aura
-vendor-short-name = SelfCode
trademarkInfo = Aura by SelfCode
"@
$brandProps = @"
brandShorterName=Aura
brandShortName=Aura
brandFullName=Aura
"@
$word = @"
<svg xmlns="http://www.w3.org/2000/svg" width="72" height="24" viewBox="0 0 72 24"><text x="0" y="18" font-family="Segoe UI, sans-serif" font-size="18" font-weight="600" fill="#e8e8ea">Aura</text></svg>
"@
$logo = @"
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="8" y="10" width="48" height="36" rx="3" fill="#1a1a1c"/><rect x="12" y="14" width="40" height="28" fill="#9a2a7a"/><circle cx="50" cy="50" r="3" fill="#3dff6a"/></svg>
"@

$browserMap = @{
  "localization/en-US/branding/brand.ftl" = $brandFtl
  "chrome/en-US/locale/branding/brand.properties" = $brandProps
  "chrome/browser/content/branding/about-wordmark.svg" = $word
  "chrome/browser/content/branding/firefox-wordmark.svg" = $word
  "chrome/browser/content/branding/about-logo.svg" = $logo
}
$pngSlots = @(
  "chrome/browser/content/branding/about-logo.png",
  "chrome/browser/content/branding/about-logo@2x.png",
  "chrome/browser/content/branding/about-logo-private.png",
  "chrome/browser/content/branding/about-logo-private@2x.png",
  "chrome/browser/content/branding/about.png",
  "chrome/browser/content/branding/icon16.png",
  "chrome/browser/content/branding/icon32.png",
  "chrome/browser/content/branding/icon48.png",
  "chrome/browser/content/branding/icon64.png",
  "chrome/browser/content/branding/icon128.png"
)

function Get-ZipText($zipPath, $name) {
  $zr = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
  $ent = $zr.GetEntry($name)
  $rdr = New-Object System.IO.StreamReader($ent.Open())
  $txt = $rdr.ReadToEnd()
  $rdr.Close(); $zr.Dispose()
  $txt
}

$browserJa = "C:\AuraBrowser\engine\browser\omni.ja"
$ftl = Get-ZipText $browserJa "localization/en-US/browser/aboutDialog.ftl"
$ftl = $ftl.Replace(
  "community-2 = { -brand-short-name } is designed by <label data-l10n-name=`"community-mozillaLink`">{ -vendor-short-name }</label>, a <label data-l10n-name=`"community-creditsLink`">global community</label> working together to keep the Web open, public and accessible to all.",
  "community-2 = { -brand-short-name } by <label data-l10n-name=`"community-mozillaLink`">{ -vendor-short-name }</label> · <label data-l10n-name=`"community-creditsLink`">GitHub</label>"
)
$ftl = $ftl.Replace(
  "helpus = Want to help? <label data-l10n-name=`"helpus-donateLink`">Make a donation</label> or <label data-l10n-name=`"helpus-getInvolvedLink`">get involved!</label>",
  "helpus = <label data-l10n-name=`"helpus-donateLink`">VK</label> · <label data-l10n-name=`"helpus-getInvolvedLink`">Telegram</label>"
)
$xhtml = Get-ZipText $browserJa "chrome/browser/content/browser/aboutDialog.xhtml"
$xhtml = $xhtml.Replace("https://www.mozilla.org/?utm_source=firefox-browser&#38;utm_medium=firefox-desktop&#38;utm_campaign=about-dialog", "https://github.com/SelfC0de")
$xhtml = $xhtml.Replace("https://foundation.mozilla.org/?form=firefox-about", "https://vk.com/selfcode_dev")
$xhtml = $xhtml.Replace("https://www.mozilla.org/contribute/?utm_source=firefox-browser&#38;utm_medium=firefox-desktop&#38;utm_campaign=about-dialog", "https://t.me/selfcode_dev")
$xhtml = $xhtml.Replace("https://www.mozilla.org/about/legal/terms/firefox/", "https://github.com/SelfC0de")
$xhtml = $xhtml.Replace("https://www.mozilla.org/privacy/firefox/?utm_source=firefox-browser&#38;utm_medium=firefox-desktop&#38;utm_campaign=about-dialog", "https://vk.com/selfcode_dev")
$xhtml = $xhtml.Replace('href="about:credits"', 'href="https://github.com/SelfC0de"')
$browserMap["localization/en-US/browser/aboutDialog.ftl"] = $ftl
$browserMap["chrome/browser/content/browser/aboutDialog.xhtml"] = $xhtml

Patch-Omni $browserJa $browserMap $png $pngSlots
Write-Output "browser omni patched"

$in = [System.IO.Compression.ZipFile]::OpenRead("C:\AuraBrowser\engine\omni.ja")
$e = $in.GetEntry("localization/en-US/toolkit/branding/brandings.ftl")
$sr = New-Object System.IO.StreamReader($e.Open())
$raw = $sr.ReadToEnd()
$sr.Close(); $in.Dispose()
$raw = $raw.Replace("Firefox View","Aura View").Replace("Firefox Home","Aura Home").Replace("Firefox Suggest","Aura Suggest").Replace("Firefox Labs","Aura Labs")
$toolkitMap = @{ "localization/en-US/toolkit/branding/brandings.ftl" = $raw }
Patch-Omni "C:\AuraBrowser\engine\omni.ja" $toolkitMap $png @()
Write-Output "toolkit omni patched"
