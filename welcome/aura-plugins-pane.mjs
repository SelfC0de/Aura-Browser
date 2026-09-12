import { SettingGroupManager } from "chrome://browser/content/preferences/config/SettingGroupManager.mjs";
import { Preferences } from "chrome://global/content/preferences/Preferences.mjs";

const { Services } = ChromeUtils.importESModule(
  "resource://gre/modules/Services.sys.mjs"
);

const PREF_LOAD = "aura.plugins.load";
const PREF_OFF = "aura.plugins.off";

function installRoot() {
  return Services.dirsvc.get("XREExeF", Ci.nsIFile).parent.parent;
}

function readJSON(file) {
  const is = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(
    Ci.nsIFileInputStream
  );
  is.init(file, 0x01, 0o400, 0);
  const s = Cc[
    "@mozilla.org/scriptableinputstream;1"
  ].createInstance(Ci.nsIScriptableInputStream);
  s.init(is);
  const t = s.read(s.available() || 0);
  s.close();
  is.close();
  return JSON.parse(t);
}

function scan() {
  const out = [];
  const dir = installRoot();
  dir.append("plugins");
  if (!dir.exists() || !dir.isDirectory()) return out;
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
      out.push(m);
    } catch (e) {}
  }
  return out;
}

function getLoad(ids) {
  try {
    if (Services.prefs.prefHasUserValue(PREF_LOAD)) {
      const a = JSON.parse(Services.prefs.getStringPref(PREF_LOAD, "[]"));
      if (Array.isArray(a)) return new Set(a);
    }
  } catch (e) {}
  try {
    const off = new Set(JSON.parse(Services.prefs.getStringPref(PREF_OFF, "[]")));
    return new Set(ids.filter(id => !off.has(id)));
  } catch (e) {
    return new Set(ids);
  }
}

function setLoad(set) {
  const arr = [...set];
  Services.prefs.setStringPref(PREF_LOAD, JSON.stringify(arr));
  const all = scan().map(p => p.id);
  Services.prefs.setStringPref(
    PREF_OFF,
    JSON.stringify(all.filter(id => !set.has(id)))
  );
}

class AuraPluginsEmbed extends HTMLElement {
  connectedCallback() {
    if (this.dataset.ready) return;
    this.dataset.ready = "1";
    this.style.display = "block";
    this.style.width = "100%";
    this.render();
  }

  selectedIds() {
    return [...this.querySelectorAll("input.pick:checked")].map(
      el => el.dataset.id
    );
  }

  render() {
    const catalog = scan();
    const ids = catalog.map(p => p.id);
    const load = getLoad(ids);
    this.innerHTML = `
      <style>
        .ap { font: 14px/1.4 Segoe UI, sans-serif; color: #ececf0; }
        .ap-bar { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin: 8px 0 14px; }
        .ap-bar label { display:flex; gap:8px; align-items:center; color:#c8c8d0; }
        .ap-sp { flex:1; }
        .ap button { height:34px; padding:0 12px; border:0; border-radius:10px; font-weight:650; cursor:pointer; }
        .ap .pri { background:#c43a78; color:#fff; }
        .ap .ghost { background:#1e1e24; color:#ececf0; border:1px solid #3a3a44; }
        .ap-row { display:grid; grid-template-columns:28px 1fr auto auto; gap:12px; align-items:center; padding:14px 16px; margin:0 0 8px; background:#1a1a1f; border:1px solid #2c2c34; border-radius:14px; }
        .ap-row.on { border-color:#6b2230; }
        .ap-name { font-weight:650; }
        .ap-meta { color:#8b8b94; font-size:12px; margin-top:3px; }
        .ap .sw { width:46px; height:26px; border-radius:999px; padding:3px; background:#2c2c34; }
        .ap .sw i { display:block; width:20px; height:20px; border-radius:50%; background:#8b8b94; }
        .ap .sw[aria-pressed="true"] { background:#c43a78; }
        .ap .sw[aria-pressed="true"] i { background:#fff; margin-left:20px; }
        .ap .run { height:30px; background:#141418; color:#ececf0; border:1px solid #3a3a44; border-radius:8px; }
        .ap-empty { color:#8b8b94; padding:20px 0; }
        .ap input[type=checkbox] { accent-color:#c43a78; width:16px; height:16px; }
      </style>
      <div class="ap">
        <div class="ap-bar">
          <label><input type="checkbox" class="sel-all"> Select all</label>
          <span class="ap-sp"></span>
          <button type="button" class="ghost btn-none">Clear</button>
          <button type="button" class="ghost btn-off">Disable selected</button>
          <button type="button" class="pri btn-load">Load selected</button>
        </div>
        <div class="ap-list"></div>
      </div>`;
    const list = this.querySelector(".ap-list");
    if (!catalog.length) {
      list.innerHTML = `<div class="ap-empty">No plugins in plugins\\</div>`;
      return;
    }
    for (const p of catalog) {
      const on = load.has(p.id);
      const key = (p.commands && p.commands[0] && p.commands[0].key) || "";
      const row = document.createElement("div");
      row.className = "ap-row" + (on ? " on" : "");
      row.innerHTML =
        `<input class="pick" type="checkbox" data-id="${p.id}">` +
        `<div><div class="ap-name">${p.name || p.id}</div><div class="ap-meta">${p.id} · ${p.version || ""}${key ? " · " + key : ""}</div></div>` +
        `<button type="button" class="run" data-run="${p.id}">Run</button>` +
        `<button type="button" class="sw" data-sw="${p.id}" aria-pressed="${on}"><i></i></button>`;
      list.appendChild(row);
    }
    const selAll = this.querySelector(".sel-all");
    const picks = () => [...this.querySelectorAll("input.pick")];
    selAll.addEventListener("change", () => {
      picks().forEach(el => (el.checked = selAll.checked));
    });
    this.querySelector(".btn-none").addEventListener("click", () => {
      picks().forEach(el => (el.checked = false));
      selAll.checked = false;
    });
    this.querySelector(".btn-off").addEventListener("click", () => {
      const drop = new Set(this.selectedIds());
      if (!drop.size) return;
      const next = getLoad(ids);
      drop.forEach(id => next.delete(id));
      setLoad(next);
      this.render();
    });
    this.querySelector(".btn-load").addEventListener("click", () => {
      const pick = this.selectedIds();
      if (!pick.length) return;
      const next = getLoad(ids);
      pick.forEach(id => next.add(id));
      setLoad(next);
      this.render();
    });
    this.querySelectorAll("[data-sw]").forEach(sw => {
      sw.addEventListener("click", () => {
        const id = sw.getAttribute("data-sw");
        const next = getLoad(ids);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setLoad(next);
        this.render();
      });
    });
    this.querySelectorAll("[data-run]").forEach(btn => {
      btn.addEventListener("click", () => {
        Services.obs.notifyObservers(null, "aura-plugin-run", btn.getAttribute("data-run"));
      });
    });
  }
}

if (!customElements.get("aura-plugins-embed")) {
  customElements.define("aura-plugins-embed", AuraPluginsEmbed);
}

Preferences.addSetting({ id: "auraPluginsEmbed" });

SettingGroupManager.registerGroups({
  auraPluginsList: {
    l10nId: "aura-plugins-header",
    items: [{ id: "auraPluginsEmbed", control: "aura-plugins-embed" }],
  },
});
