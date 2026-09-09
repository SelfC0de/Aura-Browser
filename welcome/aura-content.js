/* Aura frame script — glance, boost, webrtc block, scheme/ICE filters */
(function () {
  function hardenDevices(win) {
    if (!win || win.__auraDev) return;
    win.__auraDev = true;
    try {
      var raw = win.wrappedJSObject || win;
      var md = raw.navigator && raw.navigator.mediaDevices;
      if (md && md.enumerateDevices) {
        var orig = md.enumerateDevices.bind(md);
        md.enumerateDevices = function () {
          return orig().then(function (list) {
            try {
              if (!list || !list.length) return [];
              for (var i = 0; i < list.length; i++) {
                if (list[i] && list[i].label) return list;
              }
              return [];
            } catch (e) {
              return [];
            }
          });
        };
      }
      try {
        Object.defineProperty(raw.navigator, "maxTouchPoints", {
          get: function () {
            return 0;
          },
          configurable: true,
        });
      } catch (e2) {}
    } catch (e) {}
  }
  function hardenNav(win) {
    if (!win || win.__auraNav) return;
    win.__auraNav = true;
    function bad(u) {
      u = String(u || "").trim();
      if (/^(javascript:|vbscript:|data:text\/html|data:application\/javascript|data:text\/javascript|data:image\/svg|data:application\/xhtml|file:)/i.test(u))
        return true;
      return false;
    }
    var raw = win.wrappedJSObject || win;
    try {
      var origOpen = raw.open;
      raw.open = function (url) {
        if (bad(url)) return null;
        return origOpen.apply(this, arguments);
      };
    } catch (e) {}
    function wrapHref(protoName, prop) {
      try {
        var proto = raw[protoName] && raw[protoName].prototype;
        if (!proto) return;
        var d = Object.getOwnPropertyDescriptor(proto, prop);
        if (!d || !d.set) return;
        Object.defineProperty(proto, prop, {
          configurable: true,
          enumerable: d.enumerable,
          get: d.get,
          set: function (v) {
            if (bad(v)) return;
            return d.set.call(this, v);
          },
        });
      } catch (e) {}
    }
    wrapHref("HTMLIFrameElement", "src");
    wrapHref("HTMLFrameElement", "src");
    wrapHref("HTMLAnchorElement", "href");
    wrapHref("HTMLAreaElement", "href");
    try {
      var locProto = raw.Location && raw.Location.prototype;
      if (locProto) {
        var dh = Object.getOwnPropertyDescriptor(locProto, "href");
        if (dh && dh.set) {
          Object.defineProperty(locProto, "href", {
            configurable: true,
            enumerable: dh.enumerable,
            get: dh.get,
            set: function (v) {
              if (bad(v)) return;
              return dh.set.call(this, v);
            },
          });
        }
        ["assign", "replace"].forEach(function (fn) {
          try {
            var orig = locProto[fn];
            locProto[fn] = function (v) {
              if (bad(v)) return;
              return orig.call(this, v);
            };
          } catch (e2) {}
        });
      }
    } catch (e) {}
    try {
      var aProto = raw.HTMLAnchorElement && raw.HTMLAnchorElement.prototype;
      if (aProto && aProto.click) {
        var origClick = aProto.click;
        aProto.click = function () {
          try {
            if (bad(this.getAttribute("href") || this.href)) return;
          } catch (e) {}
          return origClick.apply(this, arguments);
        };
      }
    } catch (e) {}
  }
  function hardenRtc(win) {
    if (!win || win.__auraIce) return;
    win.__auraIce = true;
    var Orig = win.RTCPeerConnection || win.mozRTCPeerConnection;
    if (!Orig) return;
    function Wrap(cfg, certs) {
      var pc = certs ? new Orig(cfg, certs) : new Orig(cfg);
      function drop(cand) {
        var s = "";
        try {
          s = typeof cand === "string" ? cand : cand && (cand.candidate || cand);
        } catch (e) {}
        return /typ (host|srflx)/i.test(String(s || ""));
      }
      function stripSdp(desc) {
        if (!desc || !desc.sdp) return desc;
        var sdp = desc.sdp
          .split(/\r?\n/)
          .filter(function (line) {
            return !/typ (host|srflx)/i.test(line);
          })
          .join("\r\n");
        try {
          return new win.RTCSessionDescription({ type: desc.type, sdp: sdp });
        } catch (e) {
          desc.sdp = sdp;
          return desc;
        }
      }
      var origAdd = pc.addIceCandidate.bind(pc);
      pc.addIceCandidate = function (c) {
        if (c && drop(c)) return Promise.resolve();
        return origAdd.apply(pc, arguments);
      };
      pc.addEventListener(
        "icecandidate",
        function (e) {
          if (e.candidate && drop(e.candidate)) {
            e.stopImmediatePropagation();
            try {
              Object.defineProperty(e, "candidate", { get: function () { return null; } });
            } catch (ex) {}
          }
        },
        true
      );
      var origOffer = pc.createOffer.bind(pc);
      var origAnswer = pc.createAnswer.bind(pc);
      var origLocal = pc.setLocalDescription.bind(pc);
      pc.createOffer = function () {
        return origOffer.apply(pc, arguments).then(stripSdp);
      };
      pc.createAnswer = function () {
        return origAnswer.apply(pc, arguments).then(stripSdp);
      };
      pc.setLocalDescription = function (desc) {
        return origLocal(stripSdp(desc));
      };
      return pc;
    }
    Wrap.prototype = Orig.prototype;
    win.RTCPeerConnection = Wrap;
    win.webkitRTCPeerConnection = Wrap;
    win.mozRTCPeerConnection = Wrap;
  }

  addEventListener(
    "DOMWindowCreated",
    function (e) {
      try {
        var w = e.target.defaultView;
        hardenRtc(w);
        hardenDevices(w);
        hardenNav(w);
      } catch (ex) {}
    },
    true
  );

  function killBadNav(e) {
    var n = e.target;
    while (n && n.nodeType !== 1) n = n.parentNode;
    var a = n && n.closest ? n.closest("a[href], area[href]") : null;
    if (!a) return false;
    var href = String(a.getAttribute("href") || a.href || "");
    if (/^(javascript|vbscript|data|ms-msdt|search-ms|ms-appinstaller|ms-search|ms-word|ms-excel|ms-powerpoint|file):/i.test(href)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return true;
    }
    return false;
  }
  addEventListener("mousedown", function (e) { killBadNav(e); }, true);
  addEventListener(
    "click",
    function (e) {
      if (killBadNav(e)) return;
      var n = e.target;
      while (n && n.nodeType !== 1) n = n.parentNode;
      var a = n && n.closest ? n.closest("a[href]") : null;
      if (!a) return;
      var href = String(a.getAttribute("href") || a.href || "");
      if (!e.altKey) return;
      if (!href || href.indexOf("javascript:") === 0) return;
      e.preventDefault();
      e.stopPropagation();
      sendAsyncMessage("Aura:Glance", { url: href });
    },
    true
  );

  addEventListener(
    "DOMContentLoaded",
    function (e) {
      var doc = e.originalTarget;
      if (!doc || !doc.location) return;
      try {
        sendAsyncMessage("Aura:WantBoost", { host: doc.location.hostname });
      } catch (ex) {}
      try {
        sendAsyncMessage("Aura:WantRtc", { host: doc.location.hostname });
      } catch (ex) {}
    },
    true
  );

  addMessageListener("Aura:Boost", function (msg) {
    try {
      var css = msg.data && msg.data.css;
      var doc = content.document;
      if (!css || !doc || !doc.documentElement) return;
      if (doc.getElementById("aura-boost")) return;
      var s = doc.createElement("style");
      s.id = "aura-boost";
      s.textContent = String(css);
      doc.documentElement.appendChild(s);
    } catch (ex) {}
  });

  addMessageListener("Aura:RtcBlock", function () {
    try {
      var w = content;
      if (!w || w.__auraRtc) return;
      w.__auraRtc = true;
      w.RTCPeerConnection = undefined;
      w.webkitRTCPeerConnection = undefined;
      w.mozRTCPeerConnection = undefined;
    } catch (ex) {}
  });

  var pendingFill = null;

  function isTopFrame() {
    try {
      if (docShell && typeof docShell.isTopLevel === "boolean") return docShell.isTopLevel;
    } catch (e) {}
    try {
      return content === content.top;
    } catch (e2) {
      return false;
    }
  }

  function findFields(doc, userName, passName) {
    var pass = null;
    var user = null;
    if (passName) pass = doc.querySelector('input[name="' + passName + '"]');
    if (!pass) pass = doc.querySelector("input[type=password]");
    if (!pass) return null;
    var form = pass.form || pass.closest("form");
    if (userName && form) user = form.querySelector('input[name="' + userName + '"]');
    if (!user && form) {
      try {
        user =
          form.querySelector("input[type=email], input[type=text], input[autocomplete=username]") ||
          form.querySelector("input[name*=user i], input[name*=login i]") ||
          null;
      } catch (e) {
        user = form.querySelector("input[type=email], input[type=text]");
      }
    }
    return { form: form, user: user, pass: pass };
  }

  function applyReal() {
    if (!pendingFill || !pendingFill.passEl) return;
    try {
      pendingFill.passEl.value = pendingFill.pass;
    } catch (e) {}
  }

  addMessageListener("Aura:FillLogin", function (msg) {
    var d = msg.data || {};
    pendingFill = null;
    if (!isTopFrame()) {
      sendAsyncMessage("Aura:FillResult", { ok: false, why: "iframe" });
      return;
    }
    var loc;
    try {
      loc = content.location;
    } catch (e) {
      return;
    }
    if (!loc || loc.protocol !== "https:") {
      sendAsyncMessage("Aura:FillResult", { ok: false, why: "http" });
      return;
    }
    if (d.origin && loc.origin !== d.origin) {
      sendAsyncMessage("Aura:FillResult", { ok: false, why: "origin" });
      return;
    }
    var doc = content.document;
    var f = findFields(doc, d.userField, d.passField);
    if (!f || !f.pass) {
      sendAsyncMessage("Aura:FillResult", { ok: false, why: "nofield" });
      return;
    }
    if (d.action) {
      try {
        var action = (f.form && f.form.action) || loc.href;
        var a = new URL(action, loc.href);
        var expect = new URL(d.action, d.origin || loc.origin);
        if (a.origin !== loc.origin || (expect.origin && expect.origin !== a.origin && expect.origin !== loc.origin)) {
          sendAsyncMessage("Aura:FillResult", { ok: false, why: "action" });
          return;
        }
      } catch (ex) {}
    }
    var fake = "\u2022".repeat(Math.max(10, String(d.pass || "").length));
    pendingFill = { pass: d.pass, origin: loc.origin, passEl: f.pass, form: f.form, fake: fake };
    try {
      if (f.user) f.user.value = d.user || "";
      f.pass.value = fake;
    } catch (ex) {}
    function arm(ev) {
      if (!pendingFill) return;
      try {
        if (content.location.origin !== pendingFill.origin) {
          pendingFill = null;
          return;
        }
      } catch (ex) {
        pendingFill = null;
        return;
      }
      applyReal();
    }
    if (f.form) {
      f.form.addEventListener("submit", arm, true);
      f.form.addEventListener("formdata", arm, true);
    }
    doc.addEventListener(
      "click",
      function (e) {
        var t = e.target && e.target.closest ? e.target.closest("button, input[type=submit], input[type=image]") : null;
        if (t) arm(e);
      },
      true
    );
    doc.addEventListener(
      "keydown",
      function (e) {
        if (e.key === "Enter") arm(e);
      },
      true
    );
    sendAsyncMessage("Aura:FillResult", { ok: true });
  });

  addMessageListener("Aura:Lock", function () {
    if (pendingFill && pendingFill.passEl) {
      try {
        pendingFill.passEl.value = "";
      } catch (e) {}
    }
    pendingFill = null;
  });

  addMessageListener("Aura:HarvestForm", function (msg) {
    var want = (msg.data && msg.data.origin) || "";
    if (!isTopFrame()) {
      sendAsyncMessage("Aura:Harvested", { origin: "", pass: "" });
      return;
    }
    var loc;
    try {
      loc = content.location;
    } catch (e) {
      return;
    }
    if (!loc || loc.protocol !== "https:") return;
    if (want && loc.origin !== want) return;
    var f = findFields(content.document, "", "");
    if (!f || !f.pass) return;
    var action = "";
    try {
      action = (f.form && f.form.action) || loc.origin;
      action = new URL(action, loc.href).origin;
    } catch (ex) {
      action = loc.origin;
    }
    sendAsyncMessage("Aura:Harvested", {
      origin: loc.origin,
      action: action,
      user: f.user ? String(f.user.value || "") : "",
      pass: String(f.pass.value || ""),
      userField: f.user ? f.user.name || "" : "",
      passField: f.pass.name || "",
    });
  });
})();
