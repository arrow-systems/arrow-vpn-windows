# Changelog

All notable changes to this project will be documented in this file.

This project follows a structured release format to track improvements, fixes, and architectural changes over time.

---

## [v2.0.14] - 2026-04-11 

This release focuses on desktop security hardening, routing refinements, and startup reliability improvements.

It introduces mitigations for a localhost proxy exposure class affecting clients that unnecessarily expose a local proxy while running in VPN/TUN mode, while also improving error handling and connection validation across both VPN and Proxy modes.

* * *

### ✨ Highlights

* Security hardening for VPN/TUN mode
* Improved separation between full VPN mode and local proxy mode
* Cleaner error reporting in the application UI
* Better diagnostic logging for troubleshooting
* Safer handling of RU-domain direct routing

* * *

### Improvements

* Removed the unnecessary local `mixed` inbound while running in VPN mode, reducing local attack surface
* Improved startup flow separation between Proxy mode and VPN mode
* Added dedicated `app_error.log` logging for detailed diagnostics
* Refined connection validation logic during engine startup
* Improved routing behavior for region-specific direct traffic (`.ru`, `.su`, `.рф`)

* * *

### Fixes

* Fixed false startup errors caused by checking a local proxy port in VPN mode
* Fixed noisy error propagation that dumped full technical logs directly into the app interface
* Fixed startup sequence issues where system proxy handling could be applied too early
* Fixed UI error feedback to display short user-friendly messages instead of raw engine logs

* * *

### ⚠️ Notes

* This release mitigates a localhost proxy exposure class, but should be considered a hardening update rather than a complete solution for every client architecture
* Proxy mode still uses a local inbound by design
* VPN/TUN mode no longer exposes an unnecessary local proxy listener
* Administrator privileges are still required for TUN mode

* * *

### Acknowledgements

Special thanks to @runetfreedom for publicly documenting and drawing attention to this class of proxy exposure issues, which helped inform this hardening work.

* * *

## Русская версия
## [v2.0.14] - 2026-04-11

Этот релиз посвящён усилению безопасности настольного клиента, улучшению маршрутизации и повышению надёжности запуска.

В нём реализованы меры по снижению риска, связанного с классом уязвимостей localhost proxy exposure у клиентов, которые без необходимости поднимают локальный прокси при работе в режиме VPN/TUN. Также улучшены обработка ошибок и проверка состояния соединения в режимах VPN и Proxy.

* * *

### ✨ Основные особенности

* Усиление безопасности режима VPN/TUN
* Улучшено разделение между полным VPN-режимом и локальным прокси-режимом
* Более чистое отображение ошибок в интерфейсе приложения
* Улучшенное диагностическое логирование
* Более безопасная обработка direct-маршрутизации для RU-доменов

* * *

### Улучшения

* Удалён лишний локальный `mixed` inbound в режиме VPN, что уменьшает локальную поверхность атаки
* Улучшен процесс запуска и разделение логики между режимами Proxy и VPN
* Добавлен отдельный журнал `app_error.log` для подробной диагностики
* Улучшена проверка состояния соединения при запуске движка
* Скорректирована маршрутизация для direct-трафика на региональные домены (`.ru`, `.su`, `.рф`)

* * *

### Исправления

* Исправлены ложные ошибки запуска, вызванные проверкой локального proxy-порта в режиме VPN
* Исправлена избыточная передача технических логов прямо в интерфейс приложения
* Исправлены проблемы последовательности запуска, при которых системный прокси мог применяться слишком рано
* Исправлено отображение ошибок: теперь приложение показывает короткие понятные сообщения вместо сырых логов движка

* * *

### ⚠️ Примечания

* Данный релиз снижает риск, связанный с классом localhost proxy exposure, но должен рассматриваться как hardening-обновление, а не как универсальное полное решение для всех архитектур клиентов
* Режим Proxy по-прежнему использует локальный inbound по своей архитектуре
* Режим VPN/TUN больше не поднимает лишний локальный proxy listener
* Для режима TUN по-прежнему требуются права администратора

* * *

### Благодарности

Отдельная благодарность @runetfreedom за публичное описание и освещение данного класса проблем proxy exposure, что помогло сформировать это обновление безопасности.

---

## [v2.0.13] - 2026-04-10

### 🚀 Initial Stable Release (sing-box)

This version marks the first stable release after migrating from Xray-core to sing-box, focusing on stability, IPv6 support, and modern DNS/routing behavior.

---

### Fixed

- Fixed sing-box startup failures caused by deprecated DNS configuration
- Fixed legacy DNS server incompatibility with newer sing-box versions
- Fixed missing `domain_resolver` configuration in routing
- Fixed proxy mode local port mismatch
- Fixed incorrect connection state reporting (false “connected”)
- Fixed TUN initialization issues on Windows systems
- Fixed IPv6 detection problems in VPN mode
- Fixed WebSocket failures in packet loss tests
- Fixed upload failures in speed tests
- Fixed browser-related issues caused by stale DNS and connection cache

---

### Improved

- Improved sing-box startup and process lifecycle handling
- Improved connection readiness validation before marking VPN as active
- Improved DNS handling for dual-stack environments (IPv4 + IPv6)
- Improved routing behavior (reduced aggressive IPv6 forcing)
- Improved TUN stability and compatibility with Windows networking
- Improved performance for WebSocket and upload-heavy traffic
- Improved logging and diagnostics for troubleshooting

---

### Added

- Added runtime logging for sing-box (stdout and stderr)
- Added startup validation checks for connection reliability
- Added dual-stack aware DNS resolution (IPv6 preferred with fallback)
- Added improved error visibility for debugging connection issues

---

### Technical Notes

- MTU tuning may affect stability depending on the network environment
- IPv6 is supported but not strictly forced to avoid unstable routes
- Browsers may require cache clearing after major networking changes

---

### Migration Summary

- Migrated networking core from **Xray** → **sing-box**
- Updated configuration format to match latest sing-box requirements
- Reworked DNS and routing logic for modern compatibility
- Improved overall stability and connection reliability

---

## [v2.0.12] - 2026-04-06

### Initial Public Version

- First public release of Arrow VPN Windows client
- Basic UI and connection system
- Xray-based networking engine
