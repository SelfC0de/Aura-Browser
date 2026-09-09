var { XPCOMUtils } = ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs");
var { NetUtil } = ChromeUtils.importESModule("resource://gre/modules/NetUtil.sys.mjs");
var { Services } = ChromeUtils.importESModule("resource://gre/modules/Services.sys.mjs");
var Ci = Components.interfaces;

const AURA_CID = Components.ID("{b7e4d2a1-0c19-4f8a-9e33-aa1100aa1100}");
const AURA_CONTRACT = "@mozilla.org/network/protocol;1?name=aura";
const AURA_ROOT = "chrome://browser/content/aura-welcome/";
const AURA_ALLOW = {
  "": "index.html",
  home: "index.html",
  "index.html": "index.html",
  start: "start.html",
  "start.html": "start.html",
  "welcome.css": "welcome.css",
  "welcome.js": "welcome.js",
  "start.js": "start.js",
};

function auraMapSpec(spec) {
  spec = String(spec || "").split("?")[0].split("#")[0].replace(/\/+$/, "");
  if (spec === "aura://start" || spec === "aura:start") return AURA_ROOT + "start.html";
  if (spec === "aura://home" || spec === "aura:home" || spec === "aura://" || spec === "aura:") {
    return AURA_ROOT + "index.html";
  }
  try {
    const uri = Services.io.newURI(spec);
    let path = String(uri.pathQueryRef || uri.path || "")
      .split("?")[0]
      .split("#")[0]
      .replace(/^\/*/, "")
      .toLowerCase();
    if (path.indexOf("..") !== -1 || path.indexOf(":") !== -1 || path.indexOf("\\") !== -1) {
      return AURA_ROOT + "index.html";
    }
    return AURA_ROOT + (AURA_ALLOW[path] || "index.html");
  } catch (e) {
    return AURA_ROOT + "index.html";
  }
}

function AuraProtocol() {}
AuraProtocol.prototype = {
  classID: AURA_CID,
  contractID: AURA_CONTRACT,
  classDescription: "Aura protocol",
  scheme: "aura",
  defaultPort: -1,
  protocolFlags:
    Ci.nsIProtocolHandler.URI_STD |
    Ci.nsIProtocolHandler.URI_IS_UI_RESOURCE |
    Ci.nsIProtocolHandler.URI_IS_LOCAL_RESOURCE |
    Ci.nsIProtocolHandler.URI_DANGEROUS_TO_LOAD,
  allowPort() {
    return false;
  },
  newChannel(uri, loadInfo) {
    const realURL = NetUtil.newURI(auraMapSpec(uri.spec));
    const channel = Services.io.newChannelFromURIWithLoadInfo(realURL, loadInfo);
    try {
      channel.originalURI = uri;
    } catch (e) {}
    try {
      loadInfo.resultPrincipalURI = realURL;
    } catch (e) {}
    return channel;
  },
  QueryInterface: ChromeUtils.generateQI(["nsIProtocolHandler"]),
};

function auraRegisterProtocol() {
  const registrar = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);
  const factory = {
    createInstance(outer, iid) {
      if (outer) throw Components.results.NS_ERROR_NO_AGGREGATION;
      return new AuraProtocol().QueryInterface(iid);
    },
    QueryInterface: ChromeUtils.generateQI(["nsIFactory"]),
  };
  try {
    if (!registrar.isCIDRegistered(AURA_CID)) {
      registrar.registerFactory(AURA_CID, "AuraProtocol", AURA_CONTRACT, factory);
    }
  } catch (e) {
    try {
      registrar.unregisterFactory(AURA_CID, factory);
    } catch (e2) {}
    registrar.registerFactory(AURA_CID, "AuraProtocol", AURA_CONTRACT, factory);
  }
  try {
    Services.prefs.setBoolPref("network.protocol-handler.expose.aura", true);
    Services.prefs.setBoolPref("network.protocol-handler.external.aura", false);
  } catch (e) {}
}

try {
  this.NSGetFactory = XPCOMUtils.generateNSGetFactory([AuraProtocol]);
} catch (e) {}
try {
  auraRegisterProtocol();
} catch (e) {}
