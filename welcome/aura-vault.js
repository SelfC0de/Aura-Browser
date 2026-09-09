(function () {
  const Ci = Components.interfaces;
  const Cc = Components.classes;
  const { Services } = ChromeUtils.importESModule("resource://gre/modules/Services.sys.mjs");

  const IDLE_SEC = 30;
  const REVEAL_MS = 4000;
  const FAIL_BASE_MS = 400;
  const WDA_EXCLUDEFROMCAPTURE = 0x11;
  const WDA_NONE = 0;

  let idleObs = null;
  let failN = 0;
  let ctypesLib = null;

  function token() {
    return Cc["@mozilla.org/security/pk11tokendb;1"].getService(Ci.nsIPK11TokenDB).getInternalKeyToken();
  }
  function hasMaster() {
    try {
      const t = token();
      const v = t.hasPassword;
      return typeof v === "function" ? !!v.call(t) : !!v;
    } catch (e) {
      return false;
    }
  }
  function isUnlocked() {
    try {
      const t = token();
      if (!hasMaster()) return false;
      if (typeof t.isLoggedIn === "function") return !!t.isLoggedIn();
      return !t.needsLogin();
    } catch (e) {
      return false;
    }
  }
  function lockNow() {
    try {
      const t = token();
      if (typeof t.logoutAndDropAuthenticatedResources === "function") t.logoutAndDropAuthenticatedResources();
      else t.logout(true);
    } catch (e) {
      try {
        token().logout(true);
      } catch (e2) {}
    }
    failN = 0;
    try {
      Services.mm.broadcastAsyncMessage("Aura:Lock", {});
    } catch (e) {}
    for (const win of Services.wm.getEnumerator("navigator:browser")) {
      try {
        paintVaultBtn(win);
        hideVault(win);
        setCapture(win, false);
        const gate = win.document.getElementById("aura-vault-gate");
        if (gate && hasMaster()) gate.hidden = true;
      } catch (e) {}
    }
  }
  function masterOk(s) {
    const p = String(s || "");
    if (p.length < 12) return "минимум 12 символов, лучше 4 слова";
    if (/^(password|qwerty|123456|12345678|aura|admin|master|letmein|dragon|passw0rd)/i.test(p.trim()))
      return "слишком предсказуемо";
    const words = p.trim().split(/\s+/).filter(Boolean);
    if (words.length >= 4 && p.length >= 15) return "";
    let n = 0;
    if (/[a-zа-яё]/.test(p)) n++;
    if (/[A-ZА-ЯЁ]/.test(p)) n++;
    if (/\d/.test(p)) n++;
    if (/[^A-Za-zА-Яа-яЁё0-9\s]/.test(p)) n++;
    if (p.length >= 14 && n >= 3) return "";
    return "14+ символов трёх классов или четыре несвязанных слова";
  }
  function originOf(win) {
    try {
      const u = win.gBrowser.currentURI;
      if (!u || u.scheme !== "https") return "";
      return u.prePath;
    } catch (e) {
      return "";
    }
  }
  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }
  function loadCtypes() {
    if (ctypesLib) return ctypesLib;
    try {
      ctypesLib = ChromeUtils.importESModule("resource://gre/modules/ctypes.sys.mjs").ctypes;
    } catch (e) {
      try {
        ctypesLib = ChromeUtils.import("resource://gre/modules/ctypes.jsm").ctypes;
      } catch (e2) {
        ctypesLib = null;
      }
    }
    return ctypesLib;
  }
  function setCapture(win, exclude) {
    try {
      const ctypes = loadCtypes();
      if (!ctypes) return;
      const utils = win.windowUtils || win.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindowUtils);
      const handle = utils.nativeHandle;
      if (!handle) return;
      const u32 = ctypes.open("user32.dll");
      try {
        const fn = u32.declare(
          "SetWindowDisplayAffinity",
          ctypes.winapi_abi,
          ctypes.int,
          ctypes.voidptr_t,
          ctypes.uint32_t
        );
        const hwnd = ctypes.voidptr_t(ctypes.UInt64(String(handle)));
        fn(hwnd, exclude ? WDA_EXCLUDEFROMCAPTURE : WDA_NONE);
      } finally {
        u32.close();
      }
    } catch (e) {}
  }

  function ensureIdle() {
    if (idleObs) return;
    idleObs = {
      QueryInterface: ChromeUtils.generateQI(["nsIObserver"]),
      observe: function (sub, topic) {
        if (topic === "idle" || topic === "sleep_notification" || topic === "wake_notification") lockNow();
      },
    };
    try {
      const idle = Cc["@mozilla.org/widget/useridleservice;1"].getService(Ci.nsIUserIdleService);
      idle.addIdleObserver(idleObs, IDLE_SEC);
    } catch (e) {}
    try {
      Services.obs.addObserver(idleObs, "sleep_notification");
      Services.obs.addObserver(idleObs, "wake_notification");
    } catch (e) {}
  }

  function paintVaultBtn(win) {
    const b = win.document.getElementById("aura-vault-btn");
    if (!b) return;
    const on = isUnlocked();
    b.setAttribute("state", !hasMaster() ? "setup" : on ? "open" : "lock");
    b.setAttribute("tooltiptext", !hasMaster() ? "Сейф · задать мастер" : on ? "Сейф · открыт, 30 с простоя" : "Сейф · заперт");
  }

  function hideVault(win) {
    const p = win.document.getElementById("aura-vault");
    if (p) p.hidden = true;
    if (hasMaster()) setCapture(win, false);
  }

  function showGate(win, mode, after) {
    const doc = win.document;
    let gate = doc.getElementById("aura-vault-gate");
    if (!gate) return;
    const setup = mode === "setup";
    gate.hidden = false;
    setCapture(win, true);
    gate.innerHTML =
      '<div class="card">' +
      '<div class="hd">' +
      (setup ? "Мастер-пароль сейфа" : "Сейф заперт") +
      "</div>" +
      '<p class="hint">' +
      (setup
        ? "Обязателен. Пустой NSS — дыра, которую стилер открывает одним вызовом. Четыре несвязанных слова или 14+ символов. Не восстанавливается."
        : "30 секунд без ввода — слот закрыт. Введите мастер, чтобы открыть сейф или подставить пароль.") +
      "</p>" +
      (setup
        ? '<input id="aura-mp-a" type="password" autocomplete="new-password" placeholder="мастер">' +
          '<input id="aura-mp-b" type="password" autocomplete="new-password" placeholder="ещё раз">'
        : '<input id="aura-mp-a" type="password" autocomplete="current-password" placeholder="мастер">') +
      '<div id="aura-mp-err" class="err"></div>' +
      '<div class="row">' +
      '<button type="button" id="aura-mp-go">' +
      (setup ? "Создать сейф" : "Открыть") +
      "</button>" +
      (setup ? "" : '<button type="button" id="aura-mp-cancel">Отмена</button>') +
      "</div></div>";
    const a = doc.getElementById("aura-mp-a");
    const b = doc.getElementById("aura-mp-b");
    const err = doc.getElementById("aura-mp-err");
    const go = doc.getElementById("aura-mp-go");
    const cancel = doc.getElementById("aura-mp-cancel");
    function fail(msg) {
      if (err) err.textContent = msg;
    }
    async function submit() {
      const p1 = a ? a.value : "";
      if (setup) {
        const p2 = b ? b.value : "";
        const why = masterOk(p1);
        if (why) return fail(why);
        if (p1 !== p2) return fail("не совпадает");
        try {
          token().initPassword(p1);
        } catch (e) {
          try {
            token().changePassword("", p1);
          } catch (e2) {
            return fail("NSS не принял пароль");
          }
        }
        if (!hasMaster()) return fail("мастер не зафиксировался");
        if (a) a.value = "";
        if (b) b.value = "";
        gate.hidden = true;
        setCapture(win, false);
        paintVaultBtn(win);
        ensureIdle();
        if (after) after();
        return;
      }
      const wait = FAIL_BASE_MS * Math.pow(2, Math.min(failN, 5));
      await new Promise(function (r) {
        win.setTimeout(r, wait);
      });
      let ok = false;
      try {
        ok = !!token().checkPassword(p1);
      } catch (e) {
        ok = false;
      }
      if (a) a.value = "";
      if (!ok) {
        failN++;
        return fail("неверно");
      }
      failN = 0;
      gate.hidden = true;
      setCapture(win, false);
      paintVaultBtn(win);
      ensureIdle();
      if (after) after();
    }
    if (go) go.addEventListener("click", function () { submit(); });
    if (cancel)
      cancel.addEventListener("click", function () {
        gate.hidden = true;
        setCapture(win, false);
      });
    gate.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        submit();
      }
      if (e.key === "Escape" && !setup) {
        gate.hidden = true;
        setCapture(win, false);
      }
    });
    if (a) a.focus();
  }

  function needAuth(win, after) {
    if (!hasMaster()) {
      showGate(win, "setup", after);
      return false;
    }
    if (!isUnlocked()) {
      showGate(win, "unlock", after);
      return false;
    }
    return true;
  }

  async function listLogins() {
    if (!isUnlocked()) return [];
    try {
      const all = await Services.logins.getAllLogins();
      return Array.isArray(all) ? all : [];
    } catch (e) {
      return [];
    }
  }

  function sameOrigin(a, b) {
    try {
      if (!a || !b) return false;
      return new URL(a).origin === new URL(b).origin;
    } catch (e) {
      return a === b;
    }
  }

  async function fillVault(win) {
    const box = win.document.getElementById("aura-vault");
    if (!box) return;
    const origin = originOf(win);
    const all = await listLogins();
    const here = origin
      ? all.filter(function (l) {
          return l.origin === origin && !l.httpRealm;
        })
      : [];
    const rest = all.filter(function (l) {
      return !here.includes(l);
    });
    function row(l, local) {
      const host = l.origin || "";
      const user = l.username || "";
      const guid = l.guid || host + user;
      return (
        '<div class="vrow" data-guid="' +
        esc(guid) +
        '">' +
        '<div class="vmeta"><b>' +
        esc(host.replace(/^https:\/\//, "")) +
        "</b><span>" +
        esc(user) +
        "</span></div>" +
        '<div class="vact">' +
        (local ? '<button type="button" data-act="fill">Вставить</button>' : "") +
        '<button type="button" data-act="show">Показать</button>' +
        '<button type="button" data-act="del">Удалить</button>' +
        "</div>" +
        '<div class="vsecret" hidden></div></div>'
      );
    }
    box.innerHTML =
      '<div class="hd">Сейф</div>' +
      '<div class="lab">' +
      (isUnlocked() ? "открыт · lock через 30 с простоя" : "заперт") +
      (origin ? " · " + esc(origin.replace(/^https:\/\//, "")) : "") +
      "</div>" +
      '<div class="row">' +
      '<button type="button" id="aura-v-fill">Вставить на страницу</button>' +
      '<button type="button" id="aura-v-save">Сохранить с страницы</button>' +
      '<button type="button" id="aura-v-lock">Запереть</button>' +
      "</div>" +
      (origin && origin.indexOf("https:") !== 0 ? '<p class="err">HTTP не храним и не подставляем.</p>' : "") +
      (here.length ? '<div class="lab">Этот origin</div>' + here.map(function (l) { return row(l, true); }).join("") : '<p class="hint">На этом origin записей нет.</p>') +
      (rest.length ? '<div class="lab">Остальные</div>' + rest.map(function (l) { return row(l, false); }).join("") : "");

    const byGuid = {};
    all.forEach(function (l) {
      byGuid[l.guid || l.origin + l.username] = l;
    });
    box.querySelectorAll(".vrow").forEach(function (el) {
      el.addEventListener("click", function (e) {
        const btn = e.target.closest("button");
        if (!btn) return;
        const login = byGuid[el.getAttribute("data-guid")];
        if (!login) return;
        const act = btn.getAttribute("data-act");
        if (act === "fill") doFill(win, login);
        if (act === "show") {
          const s = el.querySelector(".vsecret");
          s.hidden = false;
          s.textContent = login.password || "";
          win.setTimeout(function () {
            s.textContent = "";
            s.hidden = true;
          }, REVEAL_MS);
        }
        if (act === "del") {
          removeLogin(login).then(function () {
            fillVault(win);
          });
        }
      });
    });
    const fillBtn = box.querySelector("#aura-v-fill");
    const saveBtn = box.querySelector("#aura-v-save");
    const lockBtn = box.querySelector("#aura-v-lock");
    if (fillBtn)
      fillBtn.addEventListener("click", function () {
        if (!here.length) return;
        doFill(win, here[0]);
      });
    if (saveBtn)
      saveBtn.addEventListener("click", function () {
        harvestSave(win);
      });
    if (lockBtn) lockBtn.addEventListener("click", lockNow);
  }

  function doFill(win, login) {
    const origin = originOf(win);
    if (!origin || origin.indexOf("https:") !== 0) return;
    if (login.origin !== origin) return;
    if (login.formActionOrigin && !sameOrigin(login.formActionOrigin, origin) && login.formActionOrigin !== "") return;
    const bc = win.gBrowser.selectedBrowser;
    if (!bc || !bc.browsingContext) return;
    if (bc.browsingContext.isContent === false) return;
    if (bc.browsingContext.parent) return;
    try {
      bc.messageManager.sendAsyncMessage("Aura:FillLogin", {
        origin: origin,
        action: login.formActionOrigin || origin,
        user: login.username,
        pass: login.password,
        userField: login.usernameField || "",
        passField: login.passwordField || "",
      });
    } catch (e) {}
  }

  function harvestSave(win) {
    const origin = originOf(win);
    if (!origin) return;
    const bc = win.gBrowser.selectedBrowser;
    if (!bc || !bc.messageManager) return;
    try {
      bc.messageManager.sendAsyncMessage("Aura:HarvestForm", { origin: origin });
    } catch (e) {}
  }

  async function addHarvest(win, data) {
    if (!data || !data.origin || data.origin.indexOf("https:") !== 0) return;
    if (!data.pass) return;
    if (data.action && !sameOrigin(data.action, data.origin)) return;
    try {
      const { LoginHelper } = ChromeUtils.importESModule("resource://gre/modules/LoginHelper.sys.mjs");
      const login = LoginHelper.buildLogin({
        origin: data.origin,
        formActionOrigin: data.action || data.origin,
        httpRealm: null,
        username: data.user || "",
        password: data.pass,
        usernameField: data.userField || "",
        passwordField: data.passField || "",
      });
      if (Services.logins.addLoginAsync) await Services.logins.addLoginAsync(login);
      else Services.logins.addLogin(login);
    } catch (e) {
      try {
        const li = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Ci.nsILoginInfo);
        li.init(data.origin, data.action || data.origin, null, data.user || "", data.pass, data.userField || "", data.passField || "");
        Services.logins.addLogin(li);
      } catch (e2) {}
    }
    fillVault(win);
  }

  async function removeLogin(login) {
    try {
      if (Services.logins.removeLoginAsync) await Services.logins.removeLoginAsync(login);
      else Services.logins.removeLogin(login);
    } catch (e) {}
  }

  function toggle(win) {
    const box = win.document.getElementById("aura-vault");
    if (!box) return;
    const opening = box.hidden;
    ["aura-shield", "aura-palette"].forEach(function (id) {
      const el = win.document.getElementById(id);
      if (el) el.hidden = true;
    });
    if (!opening) {
      hideVault(win);
      return;
    }
    function open() {
      box.hidden = false;
      setCapture(win, true);
      fillVault(win);
      paintVaultBtn(win);
    }
    if (!needAuth(win, open)) return;
    open();
  }

  function inject(win) {
    const doc = win.document;
    if (!doc || doc.documentElement.getAttribute("windowtype") !== "navigator:browser") return;
    if (doc.getElementById("aura-vault-btn")) return;

    const btn = doc.createXULElement("toolbarbutton");
    btn.id = "aura-vault-btn";
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      toggle(win);
    });
    const shield = doc.getElementById("aura-shield-btn");
    if (shield && shield.parentNode) shield.parentNode.insertBefore(btn, shield.nextSibling);
    else {
      const idBox = doc.getElementById("identity-box");
      if (idBox && idBox.parentNode) idBox.parentNode.insertBefore(btn, idBox.nextSibling);
    }

    const panel = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
    panel.id = "aura-vault";
    panel.hidden = true;
    doc.documentElement.appendChild(panel);

    const gate = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
    gate.id = "aura-vault-gate";
    gate.hidden = true;
    doc.documentElement.appendChild(gate);

    win.AuraVault = {
      toggle: function () { toggle(win); },
      lock: lockNow,
      hide: function () { hideVault(win); },
    };

    win.addEventListener(
      "keydown",
      function (e) {
        if (e.ctrlKey && e.altKey && (e.key === "k" || e.key === "K")) {
          e.preventDefault();
          toggle(win);
        }
        if (e.key === "Escape") {
          const g = doc.getElementById("aura-vault-gate");
          if (g && !g.hidden && hasMaster()) {
            g.hidden = true;
            setCapture(win, false);
          }
          hideVault(win);
        }
        if (e.key === "PrintScreen" || e.key === "Snapshot") {
          const p = doc.getElementById("aura-vault");
          const g2 = doc.getElementById("aura-vault-gate");
          if ((p && !p.hidden) || (g2 && !g2.hidden)) lockNow();
        }
      },
      true
    );

    try {
      win.gBrowser.addTabsProgressListener({
        onLocationChange: function (browser, webProgress, req, loc) {
          if (!webProgress.isTopLevel) return;
          try {
            const spec = (loc && loc.spec) || "";
            if (spec.indexOf("about:logins") === 0 || spec.indexOf("about:loginsimportreport") === 0) {
              try {
                if (req) req.cancel(Components.results.NS_BINDING_ABORTED);
              } catch (e) {}
              browser.stop();
              win.setTimeout(function () {
                toggle(win);
              }, 0);
            }
          } catch (e) {}
        },
      });
    } catch (e) {}

    paintVaultBtn(win);
    ensureIdle();
    if (!hasMaster()) showGate(win, "setup");
  }

  function boot() {
    function attach(win) {
      try {
        inject(win);
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
    try {
      Services.mm.addMessageListener("Aura:Harvested", function (msg) {
        let win = null;
        try {
          win = msg.target.ownerGlobal;
        } catch (e) {}
        if (!win) win = Services.wm.getMostRecentWindow("navigator:browser");
        if (!win) return;
        const data = msg.data;
        if (!needAuth(win, function () { addHarvest(win, data); })) return;
        addHarvest(win, data);
      });
    } catch (e) {}
    Services.obs.addObserver(
      {
        observe: function () {
          lockNow();
        },
      },
      "quit-application"
    );
  }

  if (document.readyState === "complete") boot();
  else addEventListener("load", boot);
})();
