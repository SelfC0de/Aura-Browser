(function () {
  const Ci = Components.interfaces;
  const Cc = Components.classes;
  const { Services } = ChromeUtils.importESModule("resource://gre/modules/Services.sys.mjs");
  const PREF_LOAD = "aura.plugins.load";
  const PREF_OFF = "aura.plugins.off";

  function root() {
    return Services.dirsvc.get("XREExeF", Ci.nsIFile).parent.parent;
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
    const out = [];
    const dir = root();
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
      return new Set(ids.filter((id) => !off.has(id)));
    } catch (e) {
      return new Set(ids);
    }
  }
  function setLoad(set) {
    const arr = [...set];
    Services.prefs.setStringPref(PREF_LOAD, JSON.stringify(arr));
    const all = scan().map((p) => p.id);
    const off = all.filter((id) => !set.has(id));
    Services.prefs.setStringPref(PREF_OFF, JSON.stringify(off));
  }

  const listEl = document.getElementById("list");
  const emptyEl = document.getElementById("empty");
  const selAll = document.getElementById("sel-all");
  let catalog = [];

  function selectedIds() {
    return [...listEl.querySelectorAll("input.pick:checked")].map((el) => el.dataset.id);
  }
  function render() {
    catalog = scan();
    const ids = catalog.map((p) => p.id);
    const load = getLoad(ids);
    listEl.innerHTML = "";
    emptyEl.hidden = catalog.length > 0;
    for (const p of catalog) {
      const on = load.has(p.id);
      const row = document.createElement("div");
      row.className = "row" + (on ? " on" : "");
      const key = (p.commands && p.commands[0] && p.commands[0].key) || "";
      row.innerHTML =
        '<input class="pick" type="checkbox" data-id="' +
        p.id +
        '">' +
        '<div><div class="name">' +
        (p.name || p.id) +
        '</div><div class="meta">' +
        p.id +
        " · " +
        (p.version || "") +
        (key ? " · " + key : "") +
        "</div></div>" +
        '<button type="button" class="run" data-run="' +
        p.id +
        '">Run</button>' +
        '<button type="button" class="sw" data-sw="' +
        p.id +
        '" aria-pressed="' +
        on +
        '"><i></i></button>';
      listEl.appendChild(row);
    }
    syncSelAll();
  }
  function syncSelAll() {
    const picks = [...listEl.querySelectorAll("input.pick")];
    selAll.checked = picks.length > 0 && picks.every((p) => p.checked);
  }
  listEl.addEventListener("change", function (e) {
    if (e.target.classList.contains("pick")) syncSelAll();
  });
  listEl.addEventListener("click", function (e) {
    const sw = e.target.closest("[data-sw]");
    if (sw) {
      const id = sw.getAttribute("data-sw");
      const ids = catalog.map((p) => p.id);
      const load = getLoad(ids);
      if (load.has(id)) load.delete(id);
      else load.add(id);
      setLoad(load);
      render();
      return;
    }
    const run = e.target.closest("[data-run]");
    if (run) {
      const id = run.getAttribute("data-run");
      const ev = new CustomEvent("aura-plugin-run", { bubbles: true, detail: { id } });
      window.dispatchEvent(ev);
      try {
        const { Services: S } = ChromeUtils.importESModule("resource://gre/modules/Services.sys.mjs");
        S.obs.notifyObservers({ id: id }, "aura-plugin-run", id);
      } catch (err) {}
    }
  });
  selAll.addEventListener("change", function () {
    listEl.querySelectorAll("input.pick").forEach((el) => {
      el.checked = selAll.checked;
    });
  });
  document.getElementById("btn-none").addEventListener("click", function () {
    listEl.querySelectorAll("input.pick").forEach((el) => {
      el.checked = false;
    });
    selAll.checked = false;
  });
  document.getElementById("btn-off").addEventListener("click", function () {
    const drop = new Set(selectedIds());
    if (!drop.size) return;
    const ids = catalog.map((p) => p.id);
    const load = getLoad(ids);
    drop.forEach((id) => load.delete(id));
    setLoad(load);
    render();
  });
  document.getElementById("btn-load").addEventListener("click", function () {
    const pick = selectedIds();
    if (!pick.length) return;
    const ids = catalog.map((p) => p.id);
    const load = getLoad(ids);
    pick.forEach((id) => load.add(id));
    setLoad(load);
    render();
  });
  render();
})();
