<p align="center">
  <img src="docs/banner.svg" alt="Aura" width="100%">
</p>

<p align="center">
  <a href="#english">English</a> · <a href="#русский">Русский</a>
</p>

---

<a id="english"></a>

## English

Portable privacy browser for Windows. No telemetry. No Mozilla services.

### Protection

Mozilla outbound is cut: no telemetry, no accounts, no AMO, no Safe Browsing.

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

### Install

Download the latest **Release**. Run `AuraLauncher.exe`.

Files unpack **next to** `AuraBrowser.exe`:

```
AuraLauncher.exe
AuraBrowser.exe
version.txt
engine\
data\          ← profile, never overwritten
```

### Updates

Releases of this repo. The browser checks GitHub and shows a toast; apply in the launcher.

| tag | |
| --- | --- |
| `v0.0.0.1r` | release |
| `v0.0.0.1p` | mandatory patch |

Version on disk: `version.txt` (`0.0.0.0` now).

SelfCode · [VK](https://vk.com/selfcode_dev) · [Telegram](https://t.me/selfcode_dev)

---

<a id="русский"></a>

## Русский

Портативный приватный браузер для Windows. Без телеметрии. Без сервисов Mozilla.

### Защита

Исходящие Mozilla срезаны: нет телеметрии, аккаунтов, AMO, Safe Browsing.

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

### Установка

Скачай последний **Release**. Запусти `AuraLauncher.exe`.

Файлы распакуются **рядом** с `AuraBrowser.exe`:

```
AuraLauncher.exe
AuraBrowser.exe
version.txt
engine\
data\          ← профиль, zip его не трогает
```

### Обновления

Релизы этого репозитория. Браузер сам проверяет GitHub и показывает тост; ставится через лаунчер.

| тег | |
| --- | --- |
| `v0.0.0.1r` | релиз |
| `v0.0.0.1p` | обязательный патч |

Версия на диске: `version.txt` (сейчас `0.0.0.0`).

SelfCode · [VK](https://vk.com/selfcode_dev) · [Telegram](https://t.me/selfcode_dev)

---

MIT © 2026 SelfCode
