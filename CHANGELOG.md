# Changelog

All notable changes to this project will be documented in this file.

This project follows a structured release format to track improvements, fixes, and architectural changes over time.

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
