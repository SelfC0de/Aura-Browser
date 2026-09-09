import zipfile
from pathlib import Path

ROOT = Path(r"C:\AuraBrowser")
AURA_PNG = (ROOT / "Aura.png").read_bytes()

BRAND_FTL = """\
-brand-shorter-name = Aura
-brand-short-name = Aura
-brand-shortcut-name = Aura
-brand-full-name = Aura
-brand-product-name = Aura
-vendor-short-name = Aura
trademarkInfo = Aura
"""

BRAND_PROPS = """\
brandShorterName=Aura
brandShortName=Aura
brandFullName=Aura
"""

WORDMARK = """\
<svg xmlns="http://www.w3.org/2000/svg" width="72" height="24" viewBox="0 0 72 24">
  <text x="0" y="18" font-family="Segoe UI, sans-serif" font-size="18" font-weight="600" fill="#e8e8ea">Aura</text>
</svg>
"""

LOGO_SVG = """\
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect x="8" y="10" width="48" height="36" rx="3" fill="#1a1a1c" stroke="#2a2a30"/>
  <rect x="12" y="14" width="40" height="28" fill="url(#g)"/>
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#7a2bb8"/>
      <stop offset="1" stop-color="#e0243a"/>
    </linearGradient>
  </defs>
  <circle cx="50" cy="50" r="3" fill="#3dff6a"/>
</svg>
"""

PNG_SLOTS = {
    "chrome/browser/content/branding/about-logo.png",
    "chrome/browser/content/branding/about-logo@2x.png",
    "chrome/browser/content/branding/about-logo-private.png",
    "chrome/browser/content/branding/about-logo-private@2x.png",
    "chrome/browser/content/branding/about.png",
    "chrome/browser/content/branding/icon16.png",
    "chrome/browser/content/branding/icon32.png",
    "chrome/browser/content/branding/icon48.png",
    "chrome/browser/content/branding/icon64.png",
    "chrome/browser/content/branding/icon128.png",
}

TEXT_SLOTS = {
    "localization/en-US/branding/brand.ftl": BRAND_FTL,
    "chrome/en-US/locale/branding/brand.properties": BRAND_PROPS,
    "chrome/browser/content/branding/about-wordmark.svg": WORDMARK,
    "chrome/browser/content/branding/firefox-wordmark.svg": WORDMARK,
    "chrome/browser/content/branding/about-logo.svg": LOGO_SVG,
}


def patch_zip(path: Path, text_map: dict, png_slots: set):
    tmp = path.with_suffix(".ja.new")
    with zipfile.ZipFile(path, "r") as zin, zipfile.ZipFile(tmp, "w") as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename in text_map:
                data = text_map[item.filename].encode("utf-8")
            elif item.filename in png_slots:
                data = AURA_PNG
            info = zipfile.ZipInfo(filename=item.filename, date_time=item.date_time)
            info.compress_type = item.compress_type
            info.external_attr = item.external_attr
            zout.writestr(info, data)
    tmp.replace(path)


def main():
    log = ROOT / "src" / "patch_brand.log"
    try:
        _main()
        log.write_text("ok\n", encoding="utf-8")
    except Exception:
        import traceback
        log.write_text(traceback.format_exc(), encoding="utf-8")
        raise


def _main():
    browser = ROOT / "engine" / "browser" / "omni.ja"
    toolkit = ROOT / "engine" / "omni.ja"
    patch_zip(browser, TEXT_SLOTS, PNG_SLOTS)

    toolkit_map = {}
    with zipfile.ZipFile(toolkit, "r") as z:
        raw = z.read("localization/en-US/toolkit/branding/brandings.ftl").decode("utf-8")
    raw = raw.replace("Firefox View", "Aura View")
    raw = raw.replace("Firefox Home", "Aura Home")
    raw = raw.replace("Firefox Suggest", "Aura Suggest")
    raw = raw.replace("Firefox Labs", "Aura Labs")
    toolkit_map["localization/en-US/toolkit/branding/brandings.ftl"] = raw
    patch_zip(toolkit, toolkit_map, set())


if __name__ == "__main__":
    main()
