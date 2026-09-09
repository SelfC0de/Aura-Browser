(function () {
  function openAuraSettings(e) {
    try {
      e.stopImmediatePropagation();
      e.preventDefault();
    } catch (ex) {}
    try {
      if (window.PanelUI) PanelUI.hide();
    } catch (ex) {}
    try {
      openTrustedLinkIn("about:preferences", "tab");
    } catch (ex) {
      try {
        openPreferences();
      } catch (ex2) {}
    }
  }
  function wire() {
    var btn = document.getElementById("PanelUI-menu-button");
    if (!btn || btn.getAttribute("data-aura-wired") === "1") return;
    btn.setAttribute("data-aura-wired", "1");
    btn.addEventListener("click", openAuraSettings, true);
  }
  addEventListener("load", function () {
    wire();
    setTimeout(wire, 300);
    setTimeout(wire, 1200);
  });
  if (document.readyState === "complete") wire();
  addEventListener(
    "click",
    function (e) {
      var n = e.target;
      while (n) {
        if (n.nodeType === 1) {
          var href = "";
          try {
            href = String(n.href || (n.getAttribute && (n.getAttribute("href") || n.getAttribute("support-page"))) || "");
          } catch (ex) {}
          if (href && /mozilla\.org|firefox\.com|firefox\.net|addons\.mozilla/i.test(href)) {
            e.preventDefault();
            e.stopImmediatePropagation();
            return;
          }
        }
        n = n.parentElement || n.parentNode || n.host;
      }
    },
    true
  );
})();
