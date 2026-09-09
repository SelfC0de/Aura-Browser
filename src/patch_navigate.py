import zipfile
from pathlib import Path

omni = Path(r"C:\AuraBrowser\engine\omni.ja")
tmp = Path(r"C:\AuraBrowser\engine\omni.ja.new")
name = "chrome/remote/content/marionette/navigate.sys.mjs"
old = """navigate.navigateTo = function (browsingContext, url) {
  const opts = {
    loadFlags: Ci.nsIWebNavigation.LOAD_FLAGS_IS_LINK,
    // Fake user activation.
    hasValidUserGestureActivation: true,
    // Prevent HTTPS-First upgrades.
    schemelessInput: Ci.nsILoadInfo.SchemelessInputTypeSchemeful,
    triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
  };

  browsingContext.fixupAndLoadURIString(url.href, opts);
};"""
new = """navigate.navigateTo = function (browsingContext, url) {
  const href = String(url && url.href || url || "");
  const low = href.toLowerCase();
  const blockedScheme = /^(javascript:|vbscript:|data:text\\/html|data:application\\/javascript|data:text\\/javascript|data:image\\/svg|data:application\\/xhtml|view-source:javascript:|view-source:data:)/i.test(href);
  const blockedFile = /^file:/i.test(href) && low.indexOf("aurabrowser") === -1;
  if (blockedScheme || blockedFile) {
    throw new lazy.error.UnknownError("Aura blocked URI");
  }
  const opts = {
    loadFlags: Ci.nsIWebNavigation.LOAD_FLAGS_IS_LINK,
    // Fake user activation.
    hasValidUserGestureActivation: true,
    // Prevent HTTPS-First upgrades.
    schemelessInput: Ci.nsILoadInfo.SchemelessInputTypeSchemeful,
    triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
  };

  browsingContext.fixupAndLoadURIString(url.href, opts);
};"""

zin = zipfile.ZipFile(omni, "r")
src = zin.read(name).decode("utf-8")
if old not in src:
    zin.close()
    raise SystemExit("navigate.navigateTo block not found")
src = src.replace(old, new, 1)
if tmp.exists():
    tmp.unlink()
zout = zipfile.ZipFile(tmp, "w", compression=zipfile.ZIP_STORED)
for info in zin.infolist():
    data = src.encode("utf-8") if info.filename == name else zin.read(info.filename)
    zout.writestr(info, data)
zin.close()
zout.close()
omni.unlink()
tmp.rename(omni)
print("patched", name)
