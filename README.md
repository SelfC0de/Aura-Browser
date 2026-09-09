<p align="center">
  <img src="docs/banner.svg" alt="Aura" width="100%">
</p>

<p align="center">
  <a href="#english">English</a> · <a href="#русский">Русский</a>
</p>

---

<a id="english"></a>

## English

Chrome, Yandex and VK browsers report home. Stock Firefox talks to Mozilla. Hardened forks that fake the UA or turn on RFP break Gosuslugi, Sber and VK.

**Aura** is a portable Windows daily driver on Gecko ESR 153: real Firefox 153 UA, Mozilla outbound cut, tracking and fingerprinting on, passwords behind a master key.

Source of the Aura layer is in this repo. Gecko binaries ship in **Releases**, not in git.

### Protection

| | |
|:---|:---|
| Transport | HTTPS-Only, Encrypted Client Hello, DNS over HTTPS (Mullvad, TRR 3) |
| Tracking | ETP Strict, Total Cookie Protection, bounce-tracking, UTM/click-id strip |
| Fingerprint | FPP (canvas / WebGL). UA stays Firefox 153 |
| Filters | uBlock Origin + extra tracker lists |
| WebRTC | no host ICE, page STUN ignored |
| Schemes | `javascript:` `data:` `file:` `ms-msdt` blocked |
| Process | content sandbox 9, web add-on install off |
| Vault | master password required, autolock 30s |

Aura is not Tor and not a VPN. It does not spoof the UA. It does not send telemetry to SelfCode. The only extra request is a GitHub Releases check for updates.

### Verify

| claim | file |
| --- | --- |
| telemetry / Mozilla URLs off | [`config/aura.cfg`](config/aura.cfg) |
| FPP, TRR, cookies, ETP | [`config/user.js`](config/user.js) |
| enterprise policy | [`config/policies.json`](config/policies.json) |
| tracker filters | [`config/filters/aura-2026.txt`](config/filters/aura-2026.txt) |
| vault + 30s lock | [`welcome/aura-vault.js`](welcome/aura-vault.js) |
| scheme / chrome hardening | [`welcome/aura-ui.js`](welcome/aura-ui.js) |
| installer / updater | [`src/AuraLauncher.cpp`](src/AuraLauncher.cpp) |
| portable stub | [`src/AuraBrowser.cpp`](src/AuraBrowser.cpp) |

### Install

Download the latest **Release**. Run `AuraLauncher.exe`. Files unpack next to `AuraBrowser.exe`. `data\` is the profile and is never overwritten.

### Updates

| tag | |
| --- | --- |
| `v0.0.0.1r` | release |
| `v0.0.0.1p` | mandatory patch |

Installed copies download **`Aura-<ver>-files.zip`** (Aura layer only). Full **`Aura-<ver>-win64.zip`** is first install, or a Gecko bump.

On-disk version: `version.txt`. Latest: **[v0.0.0.1r](https://github.com/SelfC0de/Aura-Browser/releases/tag/v0.0.0.1r)**. The browser toasts; apply in the launcher.

SelfCode · [VK](https://vk.com/selfcode_dev) · [Telegram](https://t.me/selfcode_dev)

---

<a id="русский"></a>

## Русский

Chrome, Яндекс и VK-браузеры стучат вендору. Обычный Firefox — Mozilla. Жёсткие форки с поддельным UA или RFP ломают Госуслуги, Сбер и VK.

**Aura** — портативный ежедневный браузер на Gecko ESR 153: живой UA Firefox 153, без исходящих Mozilla, с трекингом и отпечатком под контролем, пароли за мастер-ключом.

Исходники слоя Aura — в этом репозитории. Бинарники Gecko — в **Releases**, не в git.

### Защита

| | |
|:---|:---|
| Транспорт | HTTPS-Only, Encrypted Client Hello, DNS over HTTPS (Mullvad, TRR 3) |
| Трекинг | ETP Strict, Total Cookie Protection, bounce-tracking, срез UTM/click-id |
| Отпечаток | FPP (canvas / WebGL). UA остаётся Firefox 153 |
| Фильтры | uBlock Origin + дополнительные списки трекеров |
| WebRTC | без host ICE, STUN со страницы игнорируется |
| Схемы | `javascript:` `data:` `file:` `ms-msdt` закрыты |
| Процесс | sandbox контента 9, установка аддонов с веба выключена |
| Хранилище | мастер-пароль обязателен, автолок 30 с |

Это не Tor и не VPN. UA не подменяется. Телеметрии на SelfCode нет. Единственный лишний запрос — проверка релизов на GitHub.

### Проверка

| утверждение | файл |
| --- | --- |
| телеметрия / URL Mozilla выключены | [`config/aura.cfg`](config/aura.cfg) |
| FPP, TRR, cookies, ETP | [`config/user.js`](config/user.js) |
| политика | [`config/policies.json`](config/policies.json) |
| фильтры трекеров | [`config/filters/aura-2026.txt`](config/filters/aura-2026.txt) |
| хранилище + лок 30 с | [`welcome/aura-vault.js`](welcome/aura-vault.js) |
| схемы / chrome | [`welcome/aura-ui.js`](welcome/aura-ui.js) |
| установщик | [`src/AuraLauncher.cpp`](src/AuraLauncher.cpp) |
| portable stub | [`src/AuraBrowser.cpp`](src/AuraBrowser.cpp) |

### Установка

Скачай последний **Release**. Запусти `AuraLauncher.exe`. Файлы рядом с `AuraBrowser.exe`. `data\` — профиль, zip его не трогает.

### Обновления

| тег | |
| --- | --- |
| `v0.0.0.1r` | релиз |
| `v0.0.0.1p` | обязательный патч |

Уже установленный браузер качает **`Aura-<ver>-files.zip`** (только слой Aura). Полный **`Aura-<ver>-win64.zip`** — первая установка или смена Gecko.

Версия на диске: `version.txt`. Актуальный релиз: **[v0.0.0.1r](https://github.com/SelfC0de/Aura-Browser/releases/tag/v0.0.0.1r)**. Тост в браузере, установка через лаунчер.

SelfCode · [VK](https://vk.com/selfcode_dev) · [Telegram](https://t.me/selfcode_dev)

---

MIT © 2026 SelfCode
