(function () {
  const PIN_KEY = "aura.pins";
  const SET_KEY = "aura.start";
  const MAX_PINS = 12;
  const DB_NAME = "aura-start";
  const DEFAULTS = { aurora: true, scene: "void", bgMode: "cover" };

  function loadPins() {
    try {
      const { Services } = ChromeUtils.importESModule("resource://gre/modules/Services.sys.mjs");
      const raw = Services.prefs.getStringPref("aura.essentials", "");
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) return arr.filter(function (p) { return p && p.url; }).slice(0, MAX_PINS);
      }
    } catch (e) {}
    try {
      const raw = JSON.parse(localStorage.getItem(PIN_KEY) || "[]");
      if (!Array.isArray(raw)) return [];
      return raw.filter(function (p) { return p && p.url; }).slice(0, MAX_PINS);
    } catch (e) {
      return [];
    }
  }
  function savePins(pins) {
    try { localStorage.setItem(PIN_KEY, JSON.stringify(pins)); } catch (e) {}
    try {
      const { Services } = ChromeUtils.importESModule("resource://gre/modules/Services.sys.mjs");
      Services.prefs.setStringPref("aura.essentials", JSON.stringify(pins));
    } catch (e) {}
  }
  function loadSet() {
    try {
      const raw = JSON.parse(localStorage.getItem(SET_KEY) || "{}");
      const s = {
        aurora: !!raw.aurora,
        scene: raw.scene === "neon" || raw.scene === "ember" ? raw.scene : "void",
        bgMode: raw.bgMode === "repeat" ? "repeat" : "cover",
        rev: raw.rev || 0,
      };
      if (s.rev < 2) {
        s.aurora = true;
        s.rev = 2;
        saveSet(s);
      }
      return s;
    } catch (e) {
      return Object.assign({ rev: 2 }, DEFAULTS);
    }
  }
  function saveSet(s) {
    try { localStorage.setItem(SET_KEY, JSON.stringify(s)); } catch (e) {}
  }

  function openDb() {
    return new Promise(function (resolve, reject) {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains("kv")) req.result.createObjectStore("kv");
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function idbGet(key) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        const q = db.transaction("kv", "readonly").objectStore("kv").get(key);
        q.onsuccess = function () { resolve(q.result || null); };
        q.onerror = function () { reject(q.error); };
      });
    }).catch(function () { return null; });
  }
  function idbSet(key, val) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        const q = db.transaction("kv", "readwrite").objectStore("kv").put(val, key);
        q.onsuccess = function () { resolve(); };
        q.onerror = function () { reject(q.error); };
      });
    }).catch(function () {});
  }
  function idbDel(key) {
    return openDb().then(function (db) {
      return new Promise(function (resolve) {
        const q = db.transaction("kv", "readwrite").objectStore("kv").delete(key);
        q.onsuccess = function () { resolve(); };
        q.onerror = function () { resolve(); };
      });
    }).catch(function () {});
  }

  function normUrl(u) {
    u = String(u || "").trim();
    if (!u) return "";
    if (/^(javascript|data|vbscript|file):/i.test(u)) return "";
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(u)) u = "https://" + u;
    try {
      const x = new URL(u);
      if (x.protocol !== "http:" && x.protocol !== "https:") return "";
      return x.href;
    } catch (e) {
      return "";
    }
  }
  function letter(url, title) {
    const src = (title || "").trim() || url;
    try {
      const h = new URL(url).hostname.replace(/^www\./, "");
      return ((title || h).trim().charAt(0) || "?").toUpperCase();
    } catch (e) {
      return (src.charAt(0) || "?").toUpperCase();
    }
  }
  function faviconSrc(url) {
    try { return new URL(url).origin + "/favicon.ico"; } catch (e) { return ""; }
  }

  function applySet(s) {
    document.body.dataset.scene = s.scene;
    document.body.dataset.aurora = s.aurora ? "1" : "0";
    document.body.dataset.bgMode = s.bgMode;
    document.querySelectorAll("#scenes [data-scene], #opt-scene [data-scene]").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-scene") === s.scene);
    });
    document.querySelectorAll("#opt-bg-mode [data-mode]").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-mode") === s.bgMode);
    });
    const aurora = document.getElementById("opt-aurora");
    if (aurora) aurora.checked = s.aurora;
  }

  function applyBgBlob(blob) {
    const el = document.getElementById("bg-photo");
    if (el.dataset.url) URL.revokeObjectURL(el.dataset.url);
    el.dataset.url = "";
    if (!blob) {
      el.style.backgroundImage = "";
      document.body.dataset.bg = "0";
      return;
    }
    const url = URL.createObjectURL(blob);
    el.dataset.url = url;
    el.style.backgroundImage = 'url("' + url + '")';
    document.body.dataset.bg = "1";
  }

  function render(root, pins, editing) {
    root.textContent = "";
    pins.forEach(function (pin, i) {
      root.appendChild(makeFilled(root, pins, pin, i, editing === i));
    });
    if (pins.length < MAX_PINS) {
      root.appendChild(makeAdd(root, pins, editing === "new"));
    }
  }

  function makeForm(root, pins, index) {
    const slot = document.createElement("div");
    slot.className = "pin-slot editing";
    const box = document.createElement("div");
    box.className = "pin-form";
    const titleIn = document.createElement("input");
    titleIn.type = "text";
    titleIn.placeholder = "Название";
    titleIn.maxLength = 48;
    titleIn.autocomplete = "off";
    titleIn.spellcheck = false;
    const urlIn = document.createElement("input");
    urlIn.type = "text";
    urlIn.placeholder = "https://";
    urlIn.maxLength = 512;
    urlIn.autocomplete = "off";
    urlIn.spellcheck = false;
    urlIn.inputMode = "url";
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "pin-save";
    saveBtn.textContent = "Save";
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "pin-close";
    closeBtn.setAttribute("aria-label", "Закрыть");
    closeBtn.textContent = "×";
    const actions = document.createElement("div");
    actions.className = "pin-actions";
    function commit() {
      const url = normUrl(urlIn.value);
      if (!url) {
        urlIn.focus();
        urlIn.classList.add("bad");
        return;
      }
      let title = titleIn.value.trim();
      if (!title) {
        try { title = new URL(url).hostname.replace(/^www\./, ""); }
        catch (ex) { title = url; }
      }
      const next = pins.slice();
      const item = { title: title, url: url };
      if (index === "new") next.push(item);
      else next[index] = item;
      savePins(next);
      render(root, next, -1);
    }
    saveBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      commit();
    });
    closeBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      render(root, loadPins(), -1);
    });
    box.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
      }
    });
    actions.appendChild(saveBtn);
    actions.appendChild(closeBtn);
    box.appendChild(titleIn);
    box.appendChild(urlIn);
    box.appendChild(actions);
    slot.appendChild(box);
    setTimeout(function () { titleIn.focus(); }, 0);
    return slot;
  }

  function makeFilled(root, pins, pin, i, editing) {
    if (editing) return makeForm(root, pins, i);
    const slot = document.createElement("div");
    slot.className = "pin-slot filled";
    const a = document.createElement("a");
    a.className = "pin-go";
    a.href = pin.url;
    a.rel = "noreferrer noopener";
    const ico = document.createElement("span");
    ico.className = "pin-ico";
    const glyph = document.createElement("span");
    glyph.className = "pin-glyph";
    glyph.textContent = letter(pin.url, pin.title);
    ico.appendChild(glyph);
    const src = faviconSrc(pin.url);
    if (src) {
      const img = document.createElement("img");
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      img.src = src;
      img.addEventListener("load", function () {
        if (img.naturalWidth < 2) {
          img.remove();
          return;
        }
        ico.classList.add("has-img");
      });
      img.addEventListener("error", function () { img.remove(); });
      ico.appendChild(img);
    }
    const t = document.createElement("span");
    t.className = "pin-title";
    t.textContent = pin.title;
    a.appendChild(ico);
    a.appendChild(t);
    const del = document.createElement("button");
    del.type = "button";
    del.className = "pin-del";
    del.setAttribute("aria-label", "Открепить");
    del.innerHTML =
      '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"><path d="M3.2 4h9.6"/><path d="M6.2 4V2.8h3.6V4"/><path d="M5.2 4.2 5.7 13h4.6l.5-8.8"/><path d="M7 6.4v5M9 6.4v5"/></svg>';
    del.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      const next = loadPins();
      next.splice(i, 1);
      savePins(next);
      render(root, next, -1);
    });
    slot.appendChild(a);
    slot.appendChild(del);
    return slot;
  }

  function makeAdd(root, pins, editing) {
    if (editing) return makeForm(root, pins, "new");
    const slot = document.createElement("div");
    slot.className = "pin-slot empty";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pin-add";
    btn.setAttribute("aria-label", "Закрепить сайт");
    btn.textContent = "+";
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      render(root, loadPins(), "new");
    });
    slot.appendChild(btn);
    return slot;
  }

  function emptyTarget(el) {
    if (!el || !el.closest) return true;
    return !el.closest(".search, .pins, .dev, .scenes, .cmd, .sheet, a, button, input");
  }

  function boot() {
    const root = document.getElementById("pins");
    const cmd = document.getElementById("cmd");
    const sheet = document.getElementById("sheet");
    const bgFile = document.getElementById("bg-file");
    if (!root) return;

    let set = loadSet();
    applySet(set);
    render(root, loadPins(), -1);
    idbGet("bg").then(function (blob) {
      if (blob) applyBgBlob(blob);
    });

    function persistSet() {
      saveSet(set);
      applySet(set);
    }
    function openSheet() {
      sheet.hidden = false;
      applySet(set);
    }
    function closeSheet() { sheet.hidden = true; }
    function hideCmd() { cmd.hidden = true; }
    function showCmd(x, y) {
      cmd.hidden = false;
      const w = cmd.offsetWidth || 180;
      const h = cmd.offsetHeight || 120;
      cmd.style.left = Math.min(x, window.innerWidth - w - 8) + "px";
      cmd.style.top = Math.min(y, window.innerHeight - h - 8) + "px";
    }

    document.getElementById("opt-aurora").addEventListener("change", function (e) {
      set.aurora = e.target.checked;
      persistSet();
    });
    document.querySelectorAll("#scenes [data-scene], #opt-scene [data-scene]").forEach(function (b) {
      b.addEventListener("click", function () {
        set.scene = b.getAttribute("data-scene");
        persistSet();
      });
    });
    document.querySelectorAll("#opt-bg-mode [data-mode]").forEach(function (b) {
      b.addEventListener("click", function () {
        set.bgMode = b.getAttribute("data-mode");
        persistSet();
      });
    });
    document.getElementById("opt-bg-pick").addEventListener("click", function () { bgFile.click(); });
    document.getElementById("opt-bg-clear").addEventListener("click", function () {
      applyBgBlob(null);
      idbDel("bg");
    });
    bgFile.addEventListener("change", function () {
      const f = bgFile.files && bgFile.files[0];
      bgFile.value = "";
      if (!f || !/^image\//.test(f.type)) return;
      applyBgBlob(f);
      idbSet("bg", f);
    });
    document.getElementById("sheet-x").addEventListener("click", closeSheet);
    sheet.addEventListener("click", function (e) {
      if (e.target === sheet) closeSheet();
    });

    cmd.addEventListener("click", function (e) {
      const act = e.target.getAttribute && e.target.getAttribute("data-act");
      if (!act) return;
      hideCmd();
      if (act === "pin") render(root, loadPins(), "new");
      if (act === "reset-bg") {
        applyBgBlob(null);
        idbDel("bg");
      }
      if (act === "settings") openSheet();
    });

    document.addEventListener("contextmenu", function (e) {
      if (!emptyTarget(e.target)) return;
      e.preventDefault();
      showCmd(e.clientX, e.clientY);
    });

    let hold = null;
    document.addEventListener("pointerdown", function (e) {
      if (e.button !== 0 || !emptyTarget(e.target)) return;
      hold = setTimeout(function () {
        hold = null;
        showCmd(e.clientX, e.clientY);
      }, 550);
    });
    ["pointerup", "pointercancel", "pointermove"].forEach(function (ev) {
      document.addEventListener(ev, function () {
        if (hold) {
          clearTimeout(hold);
          hold = null;
        }
      });
    });

    document.addEventListener("click", function (e) {
      if (!cmd.hidden && !cmd.contains(e.target)) hideCmd();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      hideCmd();
      closeSheet();
      if (root.querySelector(".pin-slot.editing")) render(root, loadPins(), -1);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
