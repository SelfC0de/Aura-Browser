(function () {
  const Ci = Components.interfaces;
  const Cc = Components.classes;
  const Cu = Components.utils;
  const { Services } = ChromeUtils.importESModule("resource://gre/modules/Services.sys.mjs");

  const PREF_OFF = "aura.plugins.off";
  let catalog = [];
  let scanned = false;

  function installRoot() {
    return Services.dirsvc.get("XREExeF", Ci.nsIFile).parent.parent;
  }
  function pluginsDir() {
    const d = installRoot();
    d.append("plugins");
    return d;
  }
  function offSet() {
    try {
      const s = Services.prefs.getStringPref(PREF_OFF, "[]");
      return new Set(JSON.parse(s));
    } catch (e) {
      return new Set();
    }
  }
  function setOff(id, disabled) {
    const s = offSet();
    if (disabled) s.add(id);
    else s.delete(id);
    Services.prefs.setStringPref(PREF_OFF, JSON.stringify([...s]));
  }
  function readJSON(file) {
    const is = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(Ci.nsIFileInputStream);
    is.init(file, 0x01, 0o400, 0);
    const s = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(Ci.nsIScriptableInputStream);
    s.init(is);
    const t = s.read(s.available() || 0);
    s.close();
    is.close();
    return JSON.parse(t);
  }
  function scan() {
    catalog = [];
    const dir = pluginsDir();
    if (!dir.exists() || !dir.isDirectory()) return catalog;
    const entries = dir.directoryEntries;
    while (entries.hasMoreElements()) {
      const d = entries.nextFile;
      if (!d.isDirectory()) continue;
      const man = d.clone();
      man.append("aura.json");
      if (!man.exists()) continue;
      try {
        const m = readJSON(man);
        if (m.format !== "aura-plugin" || m.api !== 1 || !m.id) continue;
        m._dir = d;
        catalog.push(m);
      } catch (e) {}
    }
    scanned = true;
    return catalog;
  }
  function storeKey(id) {
    return "aura.plugin." + id + ".store";
  }
  function activeURL() {
    try {
      const w = Services.wm.getMostRecentWindow("navigator:browser");
      return w.gBrowser.currentURI.spec;
    } catch (e) {
      return "";
    }
  }
  function notify(title, body) {
    try {
      Cc["@mozilla.org/alerts-service;1"]
        .getService(Ci.nsIAlertsService)
        .showAlertNotification("", title || "Aura", body || "", false, "", null, "aura-plugin");
    } catch (e) {}
  }
  function runCommand(plugin, cmdId) {
    if (offSet().has(plugin.id)) return;
    const js = plugin._dir.clone();
    js.append("index.js");
    if (!js.exists()) return;
    const perms = new Set(plugin.permissions || []);
    const budget = Math.max(4, Math.min(50, plugin.budget_ms || 12));
    let sb;
    try {
      sb = Cu.Sandbox(Services.scriptSecurityManager.getSystemPrincipal(), {
        wantComponents: false,
        wantXrays: true,
        sandboxName: "aura-plugin:" + plugin.id,
      });
      const store = {};
      try {
        Object.assign(store, JSON.parse(Services.prefs.getStringPref(storeKey(plugin.id), "{}")));
      } catch (e) {}
      sb.aura = {
        id: plugin.id,
        on: function (name, fn) {
          if (name === cmdId && typeof fn === "function") fn();
        },
        tab: {
          get url() {
            if (!perms.has("tab")) return "";
            return activeURL();
          },
        },
        clipboard: {
          write: function (text) {
            if (!perms.has("clipboard")) return;
            Cc["@mozilla.org/widget/clipboardhelper;1"]
              .getService(Ci.nsIClipboardHelper)
              .copyString(String(text || ""));
          },
        },
        notify: function (title, body) {
          notify(String(title || ""), String(body || ""));
        },
        storage: {
          get: function (k) {
            return store[k];
          },
          set: function (k, v) {
            store[k] = v;
            try {
              Services.prefs.setStringPref(storeKey(plugin.id), JSON.stringify(store));
            } catch (e) {}
          },
        },
      };
      const t0 = Date.now();
      Services.scriptloader.loadSubScript(Services.io.newFileURI(js).spec, sb);
      if (Date.now() - t0 > budget) {
        notify(plugin.name, "Killed: over budget");
      }
    } catch (e) {
      notify(plugin.name || "Plugin", String(e));
    } finally {
      try {
        if (sb) Cu.nukeSandbox(sb);
      } catch (e2) {}
    }
  }
  function parseKey(s) {
    if (!s) return null;
    const parts = String(s).toLowerCase().split("+");
    return {
      ctrl: parts.includes("ctrl"),
      shift: parts.includes("shift"),
      alt: parts.includes("alt"),
      key: parts[parts.length - 1],
    };
  }
  function bindKeys(win) {
    if (win.document.documentElement.getAttribute("data-aura-plug-keys") === "1") return;
    win.document.documentElement.setAttribute("data-aura-plug-keys", "1");
    win.addEventListener(
      "keydown",
      function (e) {
        if (!catalog.length) scan();
        const off = offSet();
        for (const p of catalog) {
          if (off.has(p.id) || !p.commands) continue;
          for (const c of p.commands) {
            const k = parseKey(c.key);
            if (!k) continue;
            if (!!e.ctrlKey !== k.ctrl || !!e.shiftKey !== k.shift || !!e.altKey !== k.alt) continue;
            if (String(e.key).toLowerCase() !== k.key) continue;
            e.preventDefault();
            runCommand(p, c.id);
            return;
          }
        }
        if (e.ctrlKey && e.altKey && !e.shiftKey && String(e.key).toLowerCase() === "p") {
          e.preventDefault();
          togglePanel(win);
        }
      },
      true
    );
  }
  function hidePanel(win) {
    const el = win.document.getElementById("aura-plugin-panel");
    if (el) el.remove();
  }
  function togglePanel(win) {
    if (win.document.getElementById("aura-plugin-panel")) {
      hidePanel(win);
      return;
    }
    scan();
    const doc = win.document;
    const NS = "http://www.w3.org/1999/xhtml";
    const box = doc.createElementNS(NS, "div");
    box.id = "aura-plugin-panel";
    box.style.cssText =
      "position:fixed;top:56px;right:18px;z-index:2147483645;width:340px;max-height:420px;overflow:auto;padding:16px 16px 12px;border-radius:16px;color:#f4e9ec;background:#141418;border:1px solid #3a3a44;box-shadow:0 18px 40px rgba(0,0,0,.45);font:400 13px/1.4 Segoe UI,sans-serif";
    const h = doc.createElementNS(NS, "div");
    h.textContent = "Aura plugins";
    h.style.cssText = "font-weight:700;font-size:15px;margin-bottom:10px";
    box.appendChild(h);
    const sub = doc.createElementNS(NS, "div");
    sub.textContent = "Ephemeral. No page injection. Ctrl+Alt+P";
    sub.style.cssText = "color:#8b8b94;font-size:12px;margin-bottom:12px";
    box.appendChild(sub);
    const off = offSet();
    if (!catalog.length) {
      const empty = doc.createElementNS(NS, "div");
      empty.textContent = "No plugins in plugins\\";
      empty.style.color = "#8b8b94";
      box.appendChild(empty);
    }
    for (const p of catalog) {
      const row = doc.createElementNS(NS, "div");
      row.style.cssText =
        "display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 0;border-top:1px solid #2c2c34";
      const left = doc.createElementNS(NS, "div");
      left.innerHTML = "";
      const name = doc.createElementNS(NS, "div");
      name.textContent = p.name || p.id;
      name.style.fontWeight = "650";
      const meta = doc.createElementNS(NS, "div");
      meta.textContent = (p.commands && p.commands[0] && p.commands[0].key) || p.id;
      meta.style.cssText = "color:#8b8b94;font-size:11px;margin-top:2px";
      left.appendChild(name);
      left.appendChild(meta);
      const btn = doc.createElementNS(NS, "button");
      const disabled = off.has(p.id);
      btn.textContent = disabled ? "Off" : "On";
      btn.style.cssText =
        "height:28px;padding:0 12px;border:0;border-radius:8px;cursor:pointer;font-weight:650;background:" +
        (disabled ? "#1e1e24" : "#c43a78") +
        ";color:#fff";
      btn.addEventListener("click", function () {
        setOff(p.id, !offSet().has(p.id));
        hidePanel(win);
        togglePanel(win);
      });
      const run = doc.createElementNS(NS, "button");
      run.textContent = "Run";
      run.style.cssText =
        "height:28px;padding:0 12px;border:1px solid #3a3a44;border-radius:8px;cursor:pointer;background:#1e1e24;color:#ececf0";
      run.addEventListener("click", function () {
        if (p.commands && p.commands[0]) runCommand(p, p.commands[0].id);
      });
      const actions = doc.createElementNS(NS, "div");
      actions.style.cssText = "display:flex;gap:6px";
      actions.appendChild(run);
      actions.appendChild(btn);
      row.appendChild(left);
      row.appendChild(actions);
      box.appendChild(row);
    }
    (doc.documentElement || doc.body).appendChild(box);
  }
  function attach(win) {
    try {
      if (!scanned) scan();
      bindKeys(win);
    } catch (e) {}
  }
  function boot() {
    for (const win of Services.wm.getEnumerator("navigator:browser")) attach(win);
    const obs = {
      observe: function (s, t) {
        if (t === "domwindowopened") {
          s.addEventListener(
            "load",
            function () {
              try {
                if (s.document.documentElement.getAttribute("windowtype") === "navigator:browser")
                  attach(s);
              } catch (e) {}
            },
            { once: true }
          );
        }
      },
    };
    Services.obs.addObserver(obs, "domwindowopened");
  }
  boot();
})();
