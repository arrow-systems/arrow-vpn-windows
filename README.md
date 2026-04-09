# Arrow VPN (Windows)

![Version](https://img.shields.io/badge/version-v2.0.14-blue)
![Platform](https://img.shields.io/badge/platform-Windows-0078D6)
![License](https://img.shields.io/badge/license-MIT-green)
![Status](https://img.shields.io/badge/status-stable-success)
![Engine](https://img.shields.io/badge/engine-sing--box-purple)

---

## Arrow VPN

Privacy-focused VPN client for Windows built by Arrow Systems.

Arrow VPN is designed to provide strong privacy, censorship resistance, and stable connectivity using modern networking technologies powered by **sing-box**.

---

## ✨ Features

- 🔒 No-logs philosophy  
- 🌍 Multi-server global routing  
- ⚡ Real-time latency radar  
- 🧠 Smart connection handling  
- 🛡️ Kill Switch support  
- 🔀 Dual mode:
  - TUN (full system VPN)
  - Proxy mode (local)
- 🧬 IPv4 + IPv6 support (dual stack)  
- 🕵️‍♂️ Advanced censorship evasion (VLESS + Reality / TLS)  
- 🧩 Modern architecture powered by **sing-box**

---

## 🧱 Architecture

Arrow VPN uses:

- Electron (UI & app layer)
- sing-box (network engine)
- VLESS protocol (secure transport)
- TUN interface for system-wide routing

---

## ⚙️ Requirements

- Windows 10 / 11  
- Administrator privileges (required for TUN mode)  
- Internet access  

---

## 🚀 Development

Clone the repository:

git clone https://github.com/arrow-systems/arrow-vpn-windows.git
cd arrow-vpn-windows

Install dependencies:

npm install

Run the app:

npx electron .

---

## 🏗️ Build

To build the Windows installer:

npm run build

Output directory:

/dist

---

## 📦 Releases

Pre-built binaries are available here:

https://github.com/arrow-systems/arrow-vpn-windows/releases

---

## 🧠 Notes

- After major networking changes, browsers (especially Firefox) may require:
  - DNS cache clearing
  - HTTP connection reset
- IPv6 support depends on network environment
- TUN mode requires administrator privileges

---

## ⚖️ License

MIT License

---

## ™ Trademark Notice

The name **Arrow VPN** and **Arrow Systems** are trademarks.

You may use, modify, and distribute the code under MIT License terms,  
but you may not use the name or branding without permission.

---

## 🌐 About

Arrow Systems focuses on privacy tools designed for real-world conditions, including restricted networks and censorship-heavy environments.

---

## ⚠️ Disclaimer

This software is provided "as is", without warranty of any kind.

Use responsibly and in accordance with your local laws.
