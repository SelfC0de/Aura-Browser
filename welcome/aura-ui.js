(function () {
  const Ci = Components.interfaces;
  const Cc = Components.classes;
  const Cr = Components.results;
  const { Services } = ChromeUtils.importESModule("resource://gre/modules/Services.sys.mjs");

  const P = {
    routes: "aura.routes",
    profiles: "aura.profiles",
    ttl: "aura.ttl",
    ttlAt: "aura.ttl.at",
    essentials: "aura.essentials",
    spaces: "aura.spaces",
    spaceCur: "aura.space.current",
    boosts: "aura.boosts",
    compact: "aura.compact",
    rtcBlock: "aura.webrtc.block",
    temp: "aura.tempContainers",
  };

  function jget(k, fb) {
    try {
      const s = Services.prefs.getStringPref(k, "");
      if (!s) return fb;
      return JSON.parse(s);
    } catch (e) {
      return fb;
    }
  }
  function jset(k, v) {
    try {
      Services.prefs.setStringPref(k, JSON.stringify(v));
    } catch (e) {}
  }
  function hostOf(win) {
    try {
      return win.gBrowser.currentURI.host;
    } catch (e) {
      return "";
    }
  }
  function originOf(win) {
    try {
      return win.gBrowser.currentURI.prePath;
    } catch (e) {
      return "";
    }
  }
  function principalOf(win) {
    try {
      return win.gBrowser.contentPrincipal;
    } catch (e) {
      return null;
    }
  }
  function stripUrl(u) {
    try {
      const x = new URL(u);
      const kill = (
        Services.prefs.getStringPref("privacy.query_stripping.strip_list", "") || ""
      ).split(/\s+/);
      for (const k of kill) x.searchParams.delete(k);
      return x.toString();
    } catch (e) {
      return u;
    }
  }

  function ensureContainers() {
    const { ContextualIdentityService } = ChromeUtils.importESModule(
      "resource://gre/modules/ContextualIdentityService.sys.mjs"
    );
    const want = [
      { name: "Банк", icon: "dollar", color: "green" },
      { name: "Гос", icon: "briefcase", color: "blue" },
      { name: "VK", icon: "fingerprint", color: "purple" },
      { name: "Мусор", icon: "circle", color: "orange" },
    ];
    const have = ContextualIdentityService.getPublicIdentities();
    for (const w of want) {
      if (!have.some((h) => h.name === w.name)) {
        try {
          ContextualIdentityService.create(w.name, w.icon, w.color);
        } catch (e) {}
      }
    }
    return ContextualIdentityService.getPublicIdentities();
  }
  function idByName(name) {
    const ids = ensureContainers();
    const hit = ids.find((x) => x.name === name);
    return hit ? hit.userContextId : 0;
  }

  function applyProfile(win, host, name) {
    const map = jget(P.profiles, {});
    map[host] = name;
    jset(P.profiles, map);
    const prin = principalOf(win);
    if (!prin) return;
    try {
      const { SitePermissions } = ChromeUtils.importESModule(
        "resource:///modules/SitePermissions.sys.mjs"
      );
      if (name === "bank") {
        Services.perms.addFromPrincipal(prin, "cookie", Services.perms.ALLOW_ACTION);
        try {
          SitePermissions.setForPrincipal(prin, "autoplay-media", SitePermissions.ALLOW);
        } catch (e) {}
      } else if (name === "media") {
        try {
          SitePermissions.setForPrincipal(prin, "autoplay-media", SitePermissions.ALLOW);
        } catch (e) {}
      } else {
        try {
          SitePermissions.removeFromPrincipal(prin, "autoplay-media");
        } catch (e) {}
      }
    } catch (e) {}
  }

  function forgetHost(host) {
    if (!host) return;
    try {
      const flags =
        Ci.nsIClearDataService.CLEAR_COOKIES |
        Ci.nsIClearDataService.CLEAR_DOM_QUOTA |
        Ci.nsIClearDataService.CLEAR_DOM_PUSH_NOTIFICATIONS |
        Ci.nsIClearDataService.CLEAR_HISTORY |
        Ci.nsIClearDataService.CLEAR_AUTH_TOKENS |
        Ci.nsIClearDataService.CLEAR_AUTH_CACHE |
        Ci.nsIClearDataService.CLEAR_CONTENT_PREFERENCES |
        Ci.nsIClearDataService.CLEAR_PREFLIGHT_CACHE |
        Ci.nsIClearDataService.CLEAR_STORAGE_ACCESS |
        Ci.nsIClearDataService.CLEAR_JS_CACHE |
        Ci.nsIClearDataService.CLEAR_IMAGE_CACHE |
        Ci.nsIClearDataService.CLEAR_NETWORK_CACHE;
      Services.clearData.deleteDataFromHost(host, true, flags, function () {});
    } catch (e) {}
  }

  let poisonObsOn = false;
  const AURA_HOME_CHROME = "chrome://browser/content/aura-welcome/index.html";
  const AURA_START_CHROME = "chrome://browser/content/aura-welcome/start.html";
  function chromeFromAura(s) {
    s = String(s || "").trim();
    if (/^aura:\/\/start\/?$/i.test(s) || s === "aura:start") return AURA_START_CHROME;
    if (/^aura:\/\/home\/?$/i.test(s) || /^aura:\/?\/?$/i.test(s) || s === "aura:home") return AURA_HOME_CHROME;
    return null;
  }
  function auraFromChrome(spec) {
    spec = String(spec || "");
    if (spec.indexOf("aura-welcome/start") !== -1) return "aura://start";
    if (spec.indexOf("aura-welcome") !== -1) return "aura://home";
    return null;
  }
  function poisonSpec(spec) {
    spec = String(spec || "").trim();
    if (/^(javascript:|vbscript:|view-source:javascript:|view-source:data:|ms-msdt:|search-ms:|ms-appinstaller:|ms-search:|ms-word:|ms-excel:|ms-powerpoint:)/i.test(spec))
      return true;
    if (/^data:/i.test(spec)) {
      if (/^data:image\/(png|jpe?g|gif|webp|bmp|avif)[;,]/i.test(spec)) return false;
      if (/^data:application\/pdf[;,]/i.test(spec)) return false;
      return true;
    }
    return false;
  }
  function fileAllowed(spec) {
    let s = String(spec || "");
    if (!/^file:/i.test(s)) return true;
    try {
      s = decodeURIComponent(s);
    } catch (e) {}
    const low = s.toLowerCase().replace(/\//g, "\\");
    if (low.indexOf("aurabrowser") !== -1) return true;
    return false;
  }
  function abortBad(spec, request, browser) {
    if (poisonSpec(spec) || !fileAllowed(spec)) {
      try {
        if (request) request.cancel(Cr.NS_BINDING_ABORTED);
      } catch (e) {}
      try {
        if (browser) browser.stop();
      } catch (e2) {}
      return true;
    }
    return false;
  }
  function registerContentPolicy() {
    if (registerContentPolicy.on) return;
    registerContentPolicy.on = true;
    const CID = Components.ID("{c8e4d2a1-0c19-4f8a-9e33-aa1100aa2200}");
    const CONTRACT = "@aura/content-policy;1";
    const ACCEPT = Ci.nsIContentPolicy.ACCEPT;
    const REJECT = Ci.nsIContentPolicy.REJECT_REQUEST;
    function AuraPolicy() {}
    AuraPolicy.prototype = {
      shouldLoad: function (contentLocation, loadInfo) {
        try {
          let spec = "";
          if (contentLocation && contentLocation.spec) spec = contentLocation.spec;
          else if (typeof contentLocation === "number" && loadInfo && loadInfo.spec) spec = loadInfo.spec;
          if (/^(javascript:|vbscript:)/i.test(String(spec || ""))) return REJECT;
          if (poisonSpec(spec) || !fileAllowed(spec)) return REJECT;
        } catch (e) {}
        return ACCEPT;
      },
      shouldProcess: function () {
        return ACCEPT;
      },
      QueryInterface: ChromeUtils.generateQI(["nsIContentPolicy"]),
    };
    const factory = {
      createInstance: function (outer, iid) {
        if (outer) throw Cr.NS_ERROR_NO_AGGREGATION;
        return new AuraPolicy().QueryInterface(iid);
      },
      QueryInterface: ChromeUtils.generateQI(["nsIFactory"]),
    };
    const registrar = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);
    try {
      registrar.registerFactory(CID, "AuraContentPolicy", CONTRACT, factory);
    } catch (e) {}
    try {
      const cat = Cc["@mozilla.org/categorymanager;1"].getService(Ci.nsICategoryManager);
      cat.addCategoryEntry("content-policy", "aura-content-policy", CONTRACT, false, true);
    } catch (e) {}
  }
  function wireAuraUrl(win) {
    try {
      if (win.gURLBar && !win.gURLBar.__auraSet) {
        win.gURLBar.__auraSet = true;
        const orig = win.gURLBar.setURI.bind(win.gURLBar);
        win.gURLBar.setURI = function (uri, ...args) {
          try {
            const spec = uri && uri.spec;
            const a = spec && auraFromChrome(spec);
            if (a) uri = Services.io.newURI(a);
          } catch (e) {}
          return orig(uri, ...args);
        };
      }
      if (win.gURLBar && !win.gURLBar.__auraCmd) {
        win.gURLBar.__auraCmd = true;
        const origCmd = win.gURLBar.handleCommand.bind(win.gURLBar);
        win.gURLBar.handleCommand = function (event) {
          const v = String(win.gURLBar.value || win.gURLBar.untrimmedValue || "").trim();
          if (poisonSpec(v) || !fileAllowed(v)) {
            try {
              if (event) {
                event.preventDefault();
                event.stopPropagation();
              }
            } catch (e) {}
            return;
          }
          const c = chromeFromAura(v);
          if (c) {
            try {
              if (event) {
                event.preventDefault();
                event.stopPropagation();
              }
            } catch (e) {}
            try {
              win.openTrustedLinkIn(c, "current");
            } catch (e) {
              try {
                win.gBrowser.loadURI(Services.io.newURI(c), {
                  triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
                });
              } catch (e2) {}
            }
            return;
          }
          return origCmd(event);
        };
      }
      if (win.openTrustedLinkIn && !win.__auraOpenTL) {
        win.__auraOpenTL = true;
        const origTL = win.openTrustedLinkIn.bind(win);
        win.openTrustedLinkIn = function (url, where, params) {
          const s = String(url || "");
          if (poisonSpec(s) || !fileAllowed(s)) return;
          return origTL(url, where, params);
        };
      }
      if (win.gBrowser && !win.gBrowser.__auraLoadWrap) {
        win.gBrowser.__auraLoadWrap = true;
        try {
          const origFix = win.gBrowser.fixupAndLoadURIString.bind(win.gBrowser);
          win.gBrowser.fixupAndLoadURIString = function (browser, uriString, opts) {
            const s = String(uriString || "");
            if (poisonSpec(s) || !fileAllowed(s)) return;
            return origFix(browser, uriString, opts);
          };
        } catch (e) {}
        try {
          const origLU = win.gBrowser.loadURI.bind(win.gBrowser);
          win.gBrowser.loadURI = function (browser, uri, opts) {
            const s = uri && uri.spec ? uri.spec : String(uri || "");
            if (poisonSpec(s) || !fileAllowed(s)) return;
            return origLU(browser, uri, opts);
          };
        } catch (e2) {}
      }
      if (win.openLinkIn && !win.__auraOpenLI) {
        win.__auraOpenLI = true;
        const origLI = win.openLinkIn.bind(win);
        win.openLinkIn = function (url, where, params) {
          const s = String(url || "");
          if (poisonSpec(s) || !fileAllowed(s)) return;
          return origLI(url, where, params);
        };
      }
    } catch (e) {}
  }

  function injectChrome(win) {
    const doc = win.document;
    if (!doc || doc.documentElement.getAttribute("windowtype") !== "navigator:browser") return;
    if (doc.getElementById("aura-shield-btn")) return;

    try {
      const { AboutNewTab } = ChromeUtils.importESModule("resource:///modules/AboutNewTab.sys.mjs");
      AboutNewTab.newTabURL = "chrome://browser/content/aura-welcome/index.html";
    } catch (e) {}
    wireAuraUrl(win);

    ensureContainers();
    try {
      Services.mm.loadFrameScript("chrome://browser/content/aura-welcome/aura-content.js", true);
    } catch (e) {}
    try {
      Services.mm.addMessageListener("Aura:Glance", function (msg) {
        if (msg.data && msg.data.url) openGlance(win, msg.data.url);
      });
      Services.mm.addMessageListener("Aura:WantBoost", function (msg) {
        const host = msg.data && msg.data.host;
        const css = jget(P.boosts, {})[host];
        if (css && msg.target) msg.target.sendAsyncMessage("Aura:Boost", { css: css });
      });
      Services.mm.addMessageListener("Aura:WantRtc", function (msg) {
        const host = msg.data && msg.data.host;
        const block = jget(P.rtcBlock, []);
        if (host && block.indexOf(host) !== -1 && msg.target) msg.target.sendAsyncMessage("Aura:RtcBlock", {});
      });
    } catch (e) {}

    const idBox = doc.getElementById("identity-box");
    const nav = doc.getElementById("nav-bar");
    const toolbox = doc.getElementById("navigator-toolbox");

    const shieldBtn = doc.createXULElement("toolbarbutton");
    shieldBtn.id = "aura-shield-btn";
    shieldBtn.setAttribute("tooltiptext", "Щит Aura");
    shieldBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      togglePanel(win, "aura-shield");
      fillShield(win);
    });
    if (idBox && idBox.parentNode) idBox.parentNode.insertBefore(shieldBtn, idBox.nextSibling);

    const lamps = doc.createXULElement("hbox");
    lamps.id = "aura-lamps";
    const rtc = doc.createXULElement("toolbarbutton");
    rtc.id = "aura-rtc-lamp";
    rtc.setAttribute("tooltiptext", "WebRTC");
    rtc.addEventListener("click", function () {
      const h = hostOf(win);
      if (!h) return;
      const block = jget(P.rtcBlock, []);
      const i = block.indexOf(h);
      if (i >= 0) block.splice(i, 1);
      else block.push(h);
      jset(P.rtcBlock, block);
      try {
        win.gBrowser.reload();
      } catch (e) {}
      paintLamps(win);
    });
    const trr = doc.createXULElement("toolbarbutton");
    trr.id = "aura-trr-lamp";
    trr.setAttribute("tooltiptext", "DNS over HTTPS");
    lamps.appendChild(rtc);
    lamps.appendChild(trr);
    if (nav) nav.appendChild(lamps);

    const ess = doc.createXULElement("hbox");
    ess.id = "aura-essentials";
    if (toolbox) toolbox.appendChild(ess);

    const spaces = doc.createXULElement("hbox");
    spaces.id = "aura-spaces";
    if (nav) nav.appendChild(spaces);

    const shield = htmlPanel(doc, "aura-shield");
    const palette = htmlPanel(doc, "aura-palette");
    palette.innerHTML =
      '<input id="aura-pal-q" type="text" placeholder="Команда…">' +
      '<div id="aura-pal-list"></div>';
    doc.documentElement.appendChild(shield);
    doc.documentElement.appendChild(palette);

    function wrapWebNav(browser) {
      try {
        if (!browser || browser.__auraWN) return;
        browser.__auraWN = true;
        const wn = browser.webNavigation;
        if (wn && wn.fixupAndLoadURIString) {
          const orig = wn.fixupAndLoadURIString.bind(wn);
          wn.fixupAndLoadURIString = function (str, opts) {
            const s = String(str || "");
            if (poisonSpec(s) || !fileAllowed(s)) return;
            return orig(str, opts);
          };
        }
        if (wn && wn.loadURI) {
          const origL = wn.loadURI.bind(wn);
          wn.loadURI = function (uri, opts) {
            const s = uri && uri.spec ? uri.spec : String(uri || "");
            if (poisonSpec(s) || !fileAllowed(s)) return;
            return origL(uri, opts);
          };
        }
      } catch (e) {}
    }
    try {
      for (const b of win.gBrowser.browsers) wrapWebNav(b);
      win.gBrowser.tabContainer.addEventListener("TabOpen", function (e) {
        try {
          wrapWebNav(e.target.linkedBrowser);
        } catch (ex) {}
      });
    } catch (e) {}
    bindKeys(win);
    bindContext(win);
    bindTabs(win);
    renderEssentials(win);
    renderSpaces(win);
    paintLamps(win);
    applyCompact(win);
    expireTtl();

    win.setInterval(function () {
      paintLamps(win);
    }, 2500);
    win.addEventListener("TabSelect", function () {
      paintLamps(win);
      fillShield(win);
    });
  }

  function htmlPanel(doc, id) {
    const d = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
    d.id = id;
    d.hidden = true;
    return d;
  }
  function togglePanel(win, id) {
    const el = win.document.getElementById(id);
    if (!el) return;
    el.hidden = !el.hidden;
    if (id === "aura-palette" && !el.hidden) {
      const q = win.document.getElementById("aura-pal-q");
      fillPalette(win, "");
      if (q) {
        q.value = "";
        q.focus();
      }
    }
  }
  function hidePanels(win) {
    ["aura-shield", "aura-palette", "aura-vault"].forEach(function (id) {
      const el = win.document.getElementById(id);
      if (el) el.hidden = true;
    });
    try {
      if (win.AuraVault && win.AuraVault.hide) win.AuraVault.hide();
    } catch (e) {}
  }

  function fillShield(win) {
    const box = win.document.getElementById("aura-shield");
    if (!box) return;
    const host = hostOf(win) || "—";
    const profiles = jget(P.profiles, {});
    const ttl = jget(P.ttl, {});
    const routes = jget(P.routes, {});
    const boosts = jget(P.boosts, {});
    const rtc = jget(P.rtcBlock, []);
    const cur = profiles[host] || "strict";
    const life = ttl[host] || "persist";
    const cont = routes[host] || "";
    const rtcOn = rtc.indexOf(host) !== -1;
    box.innerHTML =
      '<div class="hd">Щит · ' +
      esc(host) +
      "</div>" +
      '<div class="lab">Профиль</div>' +
      '<div class="seg" id="aura-prof">' +
      btn("strict", "Строгий", cur) +
      btn("bank", "Банк", cur) +
      btn("media", "Медиа", cur) +
      "</div>" +
      '<div class="lab">Жизнь данных</div>' +
      '<div class="seg" id="aura-ttl">' +
      btn("persist", "Держать", life) +
      btn("session", "Сессия", life) +
      btn("day", "Сутки", life) +
      "</div>" +
      '<div class="lab">Контейнер</div>' +
      '<div class="seg" id="aura-route">' +
      btn("", "Нет", cont) +
      btn("Банк", "Банк", cont) +
      btn("Гос", "Гос", cont) +
      btn("VK", "VK", cont) +
      btn("Мусор", "Мусор", cont) +
      "</div>" +
      '<label class="chk"><input type="checkbox" id="aura-rtc"' +
      (rtcOn ? " checked" : "") +
      "> Резать WebRTC на этом сайте</label>" +
      '<div class="lab">Boost CSS</div>' +
      '<textarea id="aura-boost-css" rows="3" placeholder="/* CSS только для этого хоста */">' +
      esc(boosts[host] || "") +
      "</textarea>" +
      '<div class="row">' +
      '<button id="aura-forget">Забыть сайт</button>' +
      '<button id="aura-pin">В essentials</button>' +
      '<button id="aura-boost-save">Save CSS</button>' +
      "</div>";
    box.querySelectorAll("#aura-prof button").forEach(function (b) {
      b.addEventListener("click", function () {
        applyProfile(win, host, b.getAttribute("data-v"));
        fillShield(win);
      });
    });
    box.querySelectorAll("#aura-ttl button").forEach(function (b) {
      b.addEventListener("click", function () {
        const t = jget(P.ttl, {});
        t[host] = b.getAttribute("data-v");
        jset(P.ttl, t);
        const at = jget(P.ttlAt, {});
        at[host] = Date.now();
        jset(P.ttlAt, at);
        fillShield(win);
      });
    });
    box.querySelectorAll("#aura-route button").forEach(function (b) {
      b.addEventListener("click", function () {
        const r = jget(P.routes, {});
        const v = b.getAttribute("data-v");
        if (v) r[host] = v;
        else delete r[host];
        jset(P.routes, r);
        reopenContainer(win, v);
        fillShield(win);
      });
    });
    box.querySelector("#aura-rtc").addEventListener("change", function (e) {
      const block = jget(P.rtcBlock, []);
      const i = block.indexOf(host);
      if (e.target.checked && i < 0) block.push(host);
      if (!e.target.checked && i >= 0) block.splice(i, 1);
      jset(P.rtcBlock, block);
    });
    box.querySelector("#aura-forget").addEventListener("click", function () {
      forgetHost(host);
      hidePanels(win);
    });
    box.querySelector("#aura-pin").addEventListener("click", function () {
      pinCurrent(win);
    });
    box.querySelector("#aura-boost-save").addEventListener("click", function () {
      const css = box.querySelector("#aura-boost-css").value;
      const b = jget(P.boosts, {});
      if (css.trim()) b[host] = css;
      else delete b[host];
      jset(P.boosts, b);
    });
  }
  function btn(v, lab, cur) {
    return (
      '<button type="button" data-v="' +
      esc(v) +
      '"' +
      (v === cur ? ' class="on"' : "") +
      ">" +
      lab +
      "</button>"
    );
  }
  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function reopenContainer(win, name) {
    const tab = win.gBrowser.selectedTab;
    const url = win.gBrowser.currentURI.spec;
    const cid = name ? idByName(name) : 0;
    if (tab.userContextId === cid) return;
    try {
      win.gBrowser.addTrustedTab(url, {
        userContextId: cid,
        relatedToCurrent: true,
        skipAnimation: true,
      });
      win.gBrowser.removeTab(tab);
    } catch (e) {}
  }

  function pinCurrent(win) {
    const url = win.gBrowser.currentURI.spec;
    const title = win.gBrowser.contentTitle || hostOf(win) || url;
    const pins = jget(P.essentials, []);
    if (pins.some(function (p) { return p.url === url; })) return;
    pins.push({ title: title, url: url });
    jset(P.essentials, pins.slice(0, 12));
    renderEssentials(win);
  }
  function renderEssentials(win) {
    const bar = win.document.getElementById("aura-essentials");
    if (!bar) return;
    bar.textContent = "";
    const pins = jget(P.essentials, []);
    pins.forEach(function (p) {
      const b = win.document.createXULElement("toolbarbutton");
      b.className = "aura-ess";
      b.setAttribute("label", (p.title || "").slice(0, 18));
      b.setAttribute("tooltiptext", p.url);
      try {
        b.setAttribute("image", new URL(p.url).origin + "/favicon.ico");
      } catch (e) {}
      b.addEventListener("click", function () {
        try {
          win.openTrustedLinkIn(p.url, "tab");
        } catch (e) {
          win.gBrowser.addTrustedTab(p.url);
        }
      });
      b.addEventListener("command", function () {});
      bar.appendChild(b);
    });
  }

  function renderSpaces(win) {
    const bar = win.document.getElementById("aura-spaces");
    if (!bar) return;
    bar.textContent = "";
    let spaces = jget(P.spaces, []);
    if (!spaces.length) {
      spaces = [
        { id: "home", name: "Дом" },
        { id: "work", name: "Работа" },
        { id: "bank", name: "Банк" },
      ];
      jset(P.spaces, spaces);
    }
    const cur = Services.prefs.getStringPref(P.spaceCur, "home");
    spaces.forEach(function (s) {
      const b = win.document.createXULElement("toolbarbutton");
      b.className = "aura-space" + (s.id === cur ? " on" : "");
      b.setAttribute("label", s.name);
      b.addEventListener("click", function () {
        switchSpace(win, s.id);
      });
      bar.appendChild(b);
    });
  }
  function tagTab(tab, id) {
    tab.setAttribute("aura-space", id);
  }
  function switchSpace(win, id) {
    Services.prefs.setStringPref(P.spaceCur, id);
    const tabs = win.gBrowser.tabs;
    let first = null;
    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i];
      if (tab.pinned) continue;
      const sid = tab.getAttribute("aura-space") || "home";
      if (sid === id) {
        try {
          win.gBrowser.showTab(tab);
        } catch (e) {
          tab.hidden = false;
        }
        if (!first) first = tab;
      } else {
        try {
          win.gBrowser.hideTab(tab);
        } catch (e) {
          tab.hidden = true;
        }
      }
    }
    if (first) win.gBrowser.selectedTab = first;
    renderSpaces(win);
  }

  function paintLamps(win) {
    const rtc = win.document.getElementById("aura-rtc-lamp");
    const trr = win.document.getElementById("aura-trr-lamp");
    if (rtc) {
      let on = false;
      try {
        const { webrtcUI } = ChromeUtils.importESModule("resource:///modules/webrtcUI.sys.mjs");
        const streams = webrtcUI.getActiveStreams ? webrtcUI.getActiveStreams() : [];
        on = streams.some(function (s) {
          return s.browser === win.gBrowser.selectedBrowser;
        });
      } catch (e) {}
      const blocked = jget(P.rtcBlock, []).indexOf(hostOf(win)) !== -1;
      rtc.setAttribute("state", blocked ? "block" : on ? "live" : "idle");
      rtc.setAttribute("tooltiptext", blocked ? "WebRTC режется на сайте" : on ? "WebRTC активен" : "WebRTC тихий");
    }
    if (trr) {
      let ok = false;
      try {
        ok = Services.prefs.getIntPref("network.trr.mode", 0) === 3;
      } catch (e) {}
      trr.setAttribute("state", ok ? "ok" : "bad");
      trr.setAttribute("tooltiptext", ok ? "DoH Mullvad (TRR3)" : "DoH не strict");
    }
  }

  function applyCompact(win) {
    const on = Services.prefs.getBoolPref(P.compact, false);
    win.document.documentElement.toggleAttribute("aura-compact", on);
  }

  function openGlance(win, url) {
    try {
      win.openTrustedLinkIn(url, "window", { relatedToCurrent: true });
    } catch (e) {
      try {
        win.openWebLinkIn(url, "window");
      } catch (e2) {}
    }
  }

  function splitNow(win) {
    try {
      const tabs = win.gBrowser.visibleTabs || win.gBrowser.tabs;
      const cur = win.gBrowser.selectedTab;
      if (cur.splitview) {
        win.document.getElementById("splitViewCmd_separateTabs").doCommand();
        return;
      }
      let other = null;
      const arr = Array.from(tabs);
      const i = arr.indexOf(cur);
      other = arr[i + 1] || arr[i - 1];
      if (!other) {
        other = win.gBrowser.addTrustedTab("about:blank", { relatedToCurrent: true, skipAnimation: true });
      }
      win.gBrowser.addTabSplitView([cur, other], { trigger: "menu_add" });
    } catch (e) {}
  }

  function expireTtl() {
    const ttl = jget(P.ttl, {});
    const at = jget(P.ttlAt, {});
    const now = Date.now();
    Object.keys(ttl).forEach(function (h) {
      if (ttl[h] === "day" && at[h] && now - at[h] > 86400000) {
        forgetHost(h);
        delete ttl[h];
        delete at[h];
      }
    });
    jset(P.ttl, ttl);
    jset(P.ttlAt, at);
  }

  function bindTabs(win) {
    win.gBrowser.tabContainer.addEventListener("TabOpen", function (e) {
      const tab = e.target;
      const cur = Services.prefs.getStringPref(P.spaceCur, "home");
      tagTab(tab, cur);
    });
    win.gBrowser.tabContainer.addEventListener("TabClose", function (e) {
      const tab = e.target;
      try {
        const host = tab.linkedBrowser.currentURI.host;
        const ttl = jget(P.ttl, {});
        if (ttl[host] === "session") forgetHost(host);
      } catch (ex) {}
    });
    win.gBrowser.addTabsProgressListener({
      onStateChange: function (browser, webProgress, request, flags) {
        try {
          if (!(flags & Ci.nsIWebProgressListener.STATE_START)) return;
          const chan = request.QueryInterface(Ci.nsIChannel);
          const spec = chan.URI.spec;
          if (abortBad(spec, request, browser)) return;
        } catch (e) {}
      },
      onLocationChange: function (browser, webProgress, req, loc) {
        if (!webProgress.isTopLevel) return;
        try {
          const spec = (loc && loc.spec) || "";
          if (abortBad(spec, req, browser)) return;
        } catch (e) {}
        try {
          const spec = (loc && loc.spec) || (browser.currentURI && browser.currentURI.spec) || "";
          if (spec.indexOf("chrome://browser/content/aura-welcome/") === 0) {
            try {
              if (win.gURLBar && win.gURLBar.setURI) {
                win.gURLBar.setURI(Services.io.newURI(spec.indexOf("/start") !== -1 ? "aura://start" : "aura://home"));
              }
            } catch (e2) {}
            return;
          }
        } catch (e) {}
        try {
          const host = browser.currentURI.host;
          const routes = jget(P.routes, {});
          const name = routes[host];
          const tab = win.gBrowser.getTabForBrowser(browser);
          if (!tab || tab._auraRouted === host) return;
          tab._auraRouted = host;
          if (name) {
            const cid = idByName(name);
            if (cid && tab.userContextId !== cid && browser === win.gBrowser.selectedBrowser) {
              reopenContainer(win, name);
            }
          }
        } catch (e) {}
      },
    });
  }

  function bindContext(win) {
    const menu = win.document.getElementById("contentAreaContextMenu");
    if (!menu || win.document.getElementById("aura-copy-clean")) return;
    const item = win.document.createXULElement("menuitem");
    item.id = "aura-copy-clean";
    item.setAttribute("label", "Копировать чистый URL");
    item.addEventListener("command", function () {
      let u = "";
      try {
        u = win.gContextMenu.linkURL || win.gBrowser.currentURI.spec;
      } catch (e) {
        u = win.gBrowser.currentURI.spec;
      }
      const clean = stripUrl(u);
      try {
        const helper = Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper);
        helper.copyString(clean);
      } catch (e) {}
    });
    menu.appendChild(item);
  }

  function commands(win) {
    return [
      { id: "split", label: "Split view", run: function () { splitNow(win); } },
      { id: "glance", label: "Glance текущий URL", run: function () { openGlance(win, win.gBrowser.currentURI.spec); } },
      { id: "shield", label: "Щит сайта", run: function () { togglePanel(win, "aura-shield"); fillShield(win); } },
      { id: "vault", label: "Сейф паролей", run: function () { if (win.AuraVault) win.AuraVault.toggle(); } },
      { id: "forget", label: "Забыть этот сайт", run: function () { forgetHost(hostOf(win)); } },
      { id: "pin", label: "В essentials", run: function () { pinCurrent(win); } },
      { id: "compact", label: "Compact chrome", run: function () {
        const on = !Services.prefs.getBoolPref(P.compact, false);
        Services.prefs.setBoolPref(P.compact, on);
        applyCompact(win);
      } },
      { id: "space-home", label: "Пространство Дом", run: function () { switchSpace(win, "home"); } },
      { id: "space-work", label: "Пространство Работа", run: function () { switchSpace(win, "work"); } },
      { id: "space-bank", label: "Пространство Банк", run: function () { switchSpace(win, "bank"); } },
      { id: "prefs", label: "Настройки", run: function () { win.openTrustedLinkIn("about:preferences", "tab"); } },
      { id: "copy", label: "Копировать чистый URL", run: function () {
        const helper = Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper);
        helper.copyString(stripUrl(win.gBrowser.currentURI.spec));
      } },
    ];
  }
  function fillPalette(win, q) {
    const list = win.document.getElementById("aura-pal-list");
    if (!list) return;
    const qq = (q || "").toLowerCase();
    list.textContent = "";
    commands(win)
      .filter(function (c) { return !qq || c.label.toLowerCase().indexOf(qq) !== -1 || c.id.indexOf(qq) !== -1; })
      .forEach(function (c) {
        const b = win.document.createElementNS("http://www.w3.org/1999/xhtml", "button");
        b.type = "button";
        b.textContent = c.label;
        b.addEventListener("click", function () {
          hidePanels(win);
          c.run();
        });
        list.appendChild(b);
      });
  }
  function bindKeys(win) {
    win.addEventListener(
      "keydown",
      function (e) {
        if (e.key === "Escape") hidePanels(win);
        if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === "k" || e.key === "K")) {
          e.preventDefault();
          togglePanel(win, "aura-palette");
        }
        if (e.ctrlKey && e.shiftKey && (e.key === "s" || e.key === "S")) {
          e.preventDefault();
          splitNow(win);
        }
        if (e.ctrlKey && e.shiftKey && (e.key === "c" || e.key === "C")) {
          e.preventDefault();
          const on = !Services.prefs.getBoolPref(P.compact, false);
          Services.prefs.setBoolPref(P.compact, on);
          applyCompact(win);
        }
      },
      true
    );
    win.document.addEventListener("input", function (e) {
      if (e.target && e.target.id === "aura-pal-q") fillPalette(win, e.target.value);
    });
  }

  function parseVer(s) {
    if (!s) return null;
    const m = String(s).trim().match(/^v?(\d+)\.(\d+)\.(\d+)\.(\d+)([prPR])?$/);
    if (!m) return null;
    return {
      a: +m[1],
      b: +m[2],
      c: +m[3],
      d: +m[4],
      kind: (m[5] || "").toLowerCase(),
      raw: m[1] + "." + m[2] + "." + m[3] + "." + m[4] + (m[5] ? m[5].toLowerCase() : ""),
    };
  }
  function cmpQuad(x, y) {
    return x.a - y.a || x.b - y.b || x.c - y.c || x.d - y.d;
  }
  function isNewer(remote, local) {
    const c = cmpQuad(remote, local);
    if (c > 0) return true;
    if (c < 0) return false;
    return remote.kind === "p" && local.kind !== "p";
  }
  function installRoot() {
    return Services.dirsvc.get("XREExeF", Ci.nsIFile).parent.parent;
  }
  function readLocalVer() {
    try {
      const f = installRoot();
      f.append("version.txt");
      if (!f.exists()) return parseVer("0.0.0.0");
      const is = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(Ci.nsIFileInputStream);
      is.init(f, 0x01, 0o400, 0);
      const s = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(Ci.nsIScriptableInputStream);
      s.init(is);
      const t = s.read(s.available() || 0);
      s.close();
      is.close();
      return parseVer(t) || parseVer("0.0.0.0");
    } catch (e) {
      return parseVer("0.0.0.0");
    }
  }
  function updatesDir() {
    const f = installRoot();
    f.append("updates");
    if (!f.exists()) f.create(Ci.nsIFile.DIRECTORY_TYPE, 0o755);
    return f;
  }
  function readShaFile(name) {
    try {
      const f = updatesDir();
      f.append(name);
      if (!f.exists()) return "";
      const is = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(Ci.nsIFileInputStream);
      is.init(f, 0x01, 0o400, 0);
      const s = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(Ci.nsIScriptableInputStream);
      s.init(is);
      const t = s.read(s.available() || 0);
      s.close();
      is.close();
      return String(t).replace(/\s+/g, "");
    } catch (e) {
      return "";
    }
  }
  function writeShaFile(name, sha) {
    const f = updatesDir();
    f.append(name);
    const os = Cc["@mozilla.org/network/file-output-stream;1"].createInstance(Ci.nsIFileOutputStream);
    os.init(f, 0x02 | 0x08 | 0x20, 0o644, 0);
    const t = Cc["@mozilla.org/intl/converter-output-stream;1"].createInstance(Ci.nsIConverterOutputStream);
    t.init(os, "UTF-8", 0, 0);
    t.writeString(sha + "\n");
    t.close();
  }
  function parseCommitSha(text) {
    const m = String(text).match(/\/commit\/([0-9a-f]{7,40})/i);
    return m ? m[1] : "";
  }
  function restartAura() {
    try {
      const stub = installRoot();
      stub.append("AuraBrowser.exe");
      if (stub.exists()) {
        const p = Cc["@mozilla.org/process/util;1"].createInstance(Ci.nsIProcess);
        p.init(stub);
        p.run(false, [], 0);
      }
    } catch (e) {}
    try {
      Services.startup.quit(Services.startup.eAttemptQuit);
    } catch (e2) {}
  }
  function hideToast(win) {
    try {
      const el = win.document.getElementById("aura-update-toast");
      if (el) el.remove();
    } catch (e) {}
  }
  function showToast(win) {
    const doc = win.document;
    if (!doc || doc.getElementById("aura-update-toast")) return;
    const el = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
    el.id = "aura-update-toast";
    el.style.cssText =
      "position:fixed;top:52px;right:18px;z-index:2147483646;width:320px;padding:16px 18px 14px;border-radius:16px;color:#f4e9ec;background-color:#4a1520;border:1px solid #2a0c12;box-shadow:inset 0 1px 0 rgba(255,220,230,.1),0 18px 40px rgba(0,0,0,.45);cursor:pointer;font:400 13px/1.35 Segoe UI,sans-serif";
    const h = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
    h.className = "h";
    h.textContent = "Update ready";
    const s = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
    s.className = "s";
    s.textContent = "Restart to install";
    el.appendChild(h);
    el.appendChild(s);
    el.addEventListener("click", function () {
      restartAura();
    });
    (doc.documentElement || doc.body).appendChild(el);
  }
  function paintToasts() {
    for (const win of Services.wm.getEnumerator("navigator:browser")) {
      try {
        showToast(win);
      } catch (e) {}
    }
  }
  function downloadUpdate(sha) {
    const xhr = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Ci.nsIXMLHttpRequest);
    xhr.open("GET", "https://codeload.github.com/SelfC0de/Aura-Browser/zip/refs/heads/main");
    xhr.responseType = "arraybuffer";
    xhr.setRequestHeader("User-Agent", "AuraBrowser");
    xhr.timeout = 120000;
    xhr.onload = function () {
      if (xhr.status < 200 || xhr.status >= 300) return;
      const dest = updatesDir();
      dest.append("repo.zip");
      IOUtils.write(dest.path, new Uint8Array(xhr.response)).then(function () {
        writeShaFile("pending.sha", sha);
        paintToasts();
      }).catch(function () {});
    };
    xhr.send();
  }
  let updateWatchOn = false;
  function checkGithub() {
    const xhr = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Ci.nsIXMLHttpRequest);
    xhr.open("GET", "https://github.com/SelfC0de/Aura-Browser/commits/main.atom");
    xhr.setRequestHeader("User-Agent", "AuraBrowser");
    xhr.timeout = 15000;
    xhr.onload = function () {
      try {
        if (xhr.status < 200 || xhr.status >= 300) return;
        const sha = parseCommitSha(xhr.responseText);
        if (!sha) return;
        if (sha === readShaFile("applied.sha")) return;
        const zip = updatesDir();
        zip.append("repo.zip");
        if (sha === readShaFile("pending.sha") && zip.exists()) {
          paintToasts();
          return;
        }
        downloadUpdate(sha);
      } catch (e) {}
    };
    xhr.send();
  }
  function startUpdateWatch() {
    if (updateWatchOn) return;
    updateWatchOn = true;
    const zip = updatesDir();
    zip.append("repo.zip");
    if (readShaFile("pending.sha") && zip.exists() && readShaFile("pending.sha") !== readShaFile("applied.sha")) {
      Services.tm.mainThread.dispatch(
        {
          run: function () {
            paintToasts();
          },
        },
        Ci.nsIThread.DISPATCH_NORMAL
      );
    }
    const t0 = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    t0.initWithCallback({ notify: checkGithub }, 8000, Ci.nsITimer.TYPE_ONE_SHOT);
    const t1 = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    t1.initWithCallback({ notify: checkGithub }, 4 * 3600 * 1000, Ci.nsITimer.TYPE_REPEATING_SLACK);
  }

  function boot() {
    try {
      registerContentPolicy();
    } catch (e) {}
    try {
      if (!poisonObsOn) {
        poisonObsOn = true;
        Services.obs.addObserver(
          {
            observe: function (win) {
              try {
                const spec = (win.document && win.document.documentURI) || "";
                if (poisonSpec(spec) || !fileAllowed(spec)) {
                  try {
                    win.stop();
                  } catch (e) {}
                  try {
                    win.location.replace("about:blank");
                  } catch (e2) {}
                }
              } catch (e) {}
            },
          },
          "content-document-global-created"
        );
      }
    } catch (e) {}
    try {
      Services.scriptloader.loadSubScript("chrome://browser/content/aura-welcome/aura-protocol.js");
    } catch (e) {}
    try {
      Services.prefs.setBoolPref("browser.tabs.splitView.enabled", true);
      Services.prefs.setBoolPref("browser.tabs.tabHide.enabled", true);
      Services.prefs.setBoolPref("privacy.userContext.enabled", true);
      Services.prefs.setBoolPref("privacy.userContext.ui.enabled", true);
    } catch (e) {}
    function attach(win) {
      try {
        injectChrome(win);
      } catch (e) {}
      try {
        startUpdateWatch();
      } catch (e) {}
    }
    Services.obs.addObserver(
      {
        observe: function (sub, top) {
          if (top === "browser-delayed-startup-finished") attach(sub);
        },
      },
      "browser-delayed-startup-finished"
    );
    for (const win of Services.wm.getEnumerator("navigator:browser")) attach(win);
  }

  if (document.readyState === "complete") boot();
  else addEventListener("load", boot);
})();
