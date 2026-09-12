# Aura Plugin (`.aura.json`)

Not WebExtensions. No background page. No content scripts. No AMO.

A plugin is a folder in `plugins/<id>/`:

```
plugins/copy-link/
  aura.json
  index.js
```

## aura.json

```json
{
  "format": "aura-plugin",
  "api": 1,
  "id": "aura.copy-link",
  "name": "Copy link",
  "version": "0.1.0",
  "startup": false,
  "budget_ms": 12,
  "permissions": ["clipboard", "tab"],
  "commands": [
    { "id": "copy", "title": "Copy page URL", "key": "Ctrl+Shift+L" }
  ]
}
```

- `startup: false` — default. Code is not loaded with the browser.
- `budget_ms` — if a command runs longer, the sandbox is killed.
- No host injection field. Pages are never patched.

## Runtime

On command (shortcut or panel): create a sandbox → load `index.js` → run the handler → destroy the sandbox. Nothing stays resident.

## API (`index.js`)

```js
aura.on("copy", function () {
  aura.clipboard.write(aura.tab.url);
  aura.notify("Copied", aura.tab.url);
});
```

| | |
|---|---|
| `aura.on(id, fn)` | handle a command |
| `aura.tab.url` | active tab URL (needs `tab`) |
| `aura.clipboard.write(text)` | needs `clipboard` |
| `aura.notify(title, body)` | toast |
| `aura.storage.get/set` | string store, namespaced |

No `webRequest`, no page DOM, no file system, no network helper.

Ctrl+Alt+P opens the plugin panel.
