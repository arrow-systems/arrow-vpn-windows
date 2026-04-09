const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog, session } = require('electron');
const Store = require('electron-store');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const os = require('os');
const net = require('net');

// ==========================================
// SISTEMA ACTUALIZADOR OTA (PRODUCCIÓN)
// ==========================================
const { autoUpdater } = require('electron-updater');

// Evitar problemas de caché al descargar el latest.yml
autoUpdater.requestHeaders = { "Cache-Control": "no-cache" };
// Descarga silenciosa en segundo plano y autoinstalación al cerrar
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

const dns = require('dns').promises;
const dnsSync = require('dns');
dnsSync.setServers(['1.1.1.1', '2606:4700:4700::1111']);

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const store = new Store({ name: 'arrow_credenciales' });
let tray = null;
let mainWindow = null;
let proxyProcess = null;
let desconexionManual = false;
let isVpnConnected = false;
let monitorInterval = null;
let singboxStdErr = '';
let singboxStdOut = '';

const configEnMemoriaInicial = {
    tray: true,
    autoConnect: false,
    killSwitch: false,
    connectionMode: 'vpn',
    uuid: '',
    password: '',
    servidores: {},
    ultimoServidor: ''
};

let configEnMemoria = { ...configEnMemoriaInicial };

const rutaBinarios = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'bin')
    : path.join(__dirname, 'bin');

// APUNTAMOS AL NUEVO MOTOR (SING-BOX)
const singboxPath = path.join(rutaBinarios, 'sing-box.exe');
const configJsonPath = path.join(app.getPath('userData'), 'config.json');
const singboxLogPath = path.join(app.getPath('userData'), 'singbox_error.log');

const API_BASE_URL = 'https://arrow-x.org:5000';

function getLocalIP() {
    try {
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            const lowerName = name.toLowerCase();
            if (
                lowerName.includes('tun') ||
                lowerName.includes('tap') ||
                lowerName.includes('virtual') ||
                lowerName.includes('vethernet') ||
                lowerName.includes('npcap')
            ) continue;

            for (const iface of interfaces[name]) {
                if (
                    iface.family === 'IPv4' &&
                    !iface.internal &&
                    iface.address !== '172.19.0.2' &&
                    !iface.address.startsWith('169.254')
                ) {
                    return iface.address;
                }
            }
        }
    } catch (e) {}
    return null;
}

function getSettings() {
    const saved = store.get('userSettings') || {};
    return {
        uuid: saved.uuid || '',
        password: saved.password || '',
        servidores: saved.servidores || {},
        ultimoServidor: saved.ultimoServidor || '',
        tray: (saved.tray === false || saved.tray === 'false') ? false : true,
        autoConnect: (saved.autoConnect === true || saved.autoConnect === 'true'),
        killSwitch: (saved.killSwitch === true || saved.killSwitch === 'true'),
        connectionMode: saved.connectionMode || 'vpn'
    };
}

configEnMemoria = getSettings();

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 380,
        height: 600,
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
        icon: path.join(__dirname, 'icon.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow.loadFile('index.html');

    mainWindow.on('close', (event) => {
        if (app.isQuitting) return;

        event.preventDefault();

        if (configEnMemoria.tray) {
            mainWindow.hide();
        } else {
            if (isVpnConnected) {
                mostrarAlertaDesconexion();
            } else {
                app.isQuitting = true;
                mainWindow.destroy();
                app.quit();
            }
        }
    });
}

function mostrarAlertaDesconexion() {
    dialog.showMessageBoxSync(mainWindow, {
        type: 'warning',
        title: 'Arrow VPN',
        message: 'Aún estás conectado a la VPN.',
        detail: 'Por favor, desconéctate antes de salir para restaurar tu red.',
        buttons: ['Entendido']
    });
}

function refrescarProxyWindows() {
    try {
        const scriptPath = path.join(app.getPath('userData'), 'refresh_proxy.ps1');
        const psCode = `
        $signature = @'
        [DllImport("wininet.dll", SetLastError = true, CharSet=CharSet.Auto)]
        public static extern bool InternetSetOption(IntPtr hInternet, int dwOption, IntPtr lpBuffer, int dwBufferLength);
        '@
        $interopHelper = Add-Type -MemberDefinition $signature -Name "WinInetHelper" -Namespace "WinInet" -PassThru
        $interopHelper::InternetSetOption(0, 39, 0, 0) | Out-Null
        $interopHelper::InternetSetOption(0, 37, 0, 0) | Out-Null
        `;
        fs.writeFileSync(scriptPath, psCode);
        spawn('powershell.exe', ['-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], { windowsHide: true });
    } catch (e) {}
}

function limpiarProxySistema() {
    try {
        const p = session.defaultSession.setProxy({ proxyRules: 'direct://' });
        if (p && p.catch) p.catch(() => {});
    } catch (e) {}

    try {
        spawn('reg', [
            'add',
            'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
            '/v',
            'ProxyEnable',
            '/t',
            'REG_DWORD',
            '/d',
            '0',
            '/f'
        ], { windowsHide: true });
    } catch (e) {}

    refrescarProxyWindows();
}

function activarProxySistema() {
    try {
        const p = session.defaultSession.setProxy({
            proxyRules: 'http=127.0.0.1:10808;https=127.0.0.1:10808'
        });
        if (p && p.catch) p.catch(() => {});
    } catch (e) {}

    try {
        session.defaultSession.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
    } catch (e) {}

    try {
        spawn('reg', [
            'add',
            'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
            '/v',
            'ProxyEnable',
            '/t',
            'REG_DWORD',
            '/d',
            '1',
            '/f'
        ], { windowsHide: true });

        spawn('reg', [
            'add',
            'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
            '/v',
            'ProxyServer',
            '/t',
            'REG_SZ',
            '/d',
            '127.0.0.1:10808',
            '/f'
        ], { windowsHide: true });
    } catch (e) {}

    refrescarProxyWindows();
}

function limpiarReglasFirewall() {
    try {
        spawn('netsh', ['advfirewall', 'firewall', 'delete', 'rule', 'name=Arrow_KS_Block'], { windowsHide: true });
    } catch (e) {}

    try {
        const psCleanupScriptPath = path.join(app.getPath('userData'), 'cleanup_dns.ps1');
        const psCleanupCommands = `
            Get-DnsClientNrptRule -ErrorAction SilentlyContinue | Where-Object {$_.Comment -eq 'ArrowVPN'} | Remove-DnsClientNrptRule -Force -ErrorAction SilentlyContinue
            Clear-DnsClientCache
            ipconfig /flushdns
        `;
        fs.writeFileSync(psCleanupScriptPath, psCleanupCommands);
        spawn('powershell.exe', ['-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', psCleanupScriptPath], { windowsHide: true });
    } catch (e) {}
}

async function resolverIP(host) {
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return host;
    if (host.includes(':')) return host;

    try {
        let timeoutId;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('timeout')), 5000);
        });

        const ipv4Promise = dns.resolve4(host).catch(() => []);
        const ipv6Promise = dns.resolve6(host).catch(() => []);

        const [ipv4, ipv6] = await Promise.race([
            Promise.all([ipv4Promise, ipv6Promise]),
            timeoutPromise
        ]);

        clearTimeout(timeoutId);

        if (Array.isArray(ipv6) && ipv6.length > 0) return ipv6[0];
        if (Array.isArray(ipv4) && ipv4.length > 0) return ipv4[0];

        return null;
    } catch (err) {
        return null;
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function leerLogSingbox() {
    try {
        if (fs.existsSync(singboxLogPath)) {
            return fs.readFileSync(singboxLogPath, 'utf8').trim();
        }
    } catch (e) {}
    return '';
}

function limpiarBuffersSingbox() {
    singboxStdErr = '';
    singboxStdOut = '';
}

function detenerSingbox() {
    return new Promise((resolve) => {
        try {
            if (proxyProcess && !proxyProcess.killed) {
                const p = proxyProcess;
                proxyProcess = null;

                p.once('exit', () => resolve());
                try { p.kill(); } catch (e) { resolve(); }

                setTimeout(() => {
                    resolve();
                }, 1500);
                return;
            }
        } catch (e) {}

        try {
            spawn('taskkill', ['/IM', 'sing-box.exe', '/F', '/T'], { windowsHide: true });
        } catch (e) {}

        proxyProcess = null;
        setTimeout(resolve, 800);
    });
}

function esperarPuerto(host, port, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
        const start = Date.now();

        const intentar = () => {
            const socket = new net.Socket();
            let terminado = false;

            const cerrar = () => {
                try { socket.destroy(); } catch (e) {}
            };

            socket.setTimeout(1000);

            socket.connect(port, host, () => {
                if (terminado) return;
                terminado = true;
                cerrar();
                resolve(true);
            });

            socket.on('error', () => {
                if (terminado) return;
                terminado = true;
                cerrar();

                if (Date.now() - start >= timeoutMs) {
                    reject(new Error(`Timeout esperando puerto ${host}:${port}`));
                } else {
                    setTimeout(intentar, 250);
                }
            });

            socket.on('timeout', () => {
                if (terminado) return;
                terminado = true;
                cerrar();

                if (Date.now() - start >= timeoutMs) {
                    reject(new Error(`Timeout esperando puerto ${host}:${port}`));
                } else {
                    setTimeout(intentar, 250);
                }
            });
        };

        intentar();
    });
}

async function esperarInterfazTun(nombreInterfaz, timeoutMs = 12000) {
    const inicio = Date.now();

    while (Date.now() - inicio < timeoutMs) {
        try {
            const resultado = await ejecutarComandoCapturando('netsh', ['interface', 'show', 'interface']);
            if ((resultado.stdout || '').toLowerCase().includes(nombreInterfaz.toLowerCase())) {
                return true;
            }
        } catch (e) {}

        await sleep(500);
    }

    return false;
}

function ejecutarComandoCapturando(cmd, args = [], options = {}) {
    return new Promise((resolve, reject) => {
        try {
            const child = spawn(cmd, args, { windowsHide: true, ...options });
            let stdout = '';
            let stderr = '';

            child.stdout?.on('data', (data) => {
                stdout += data.toString();
            });

            child.stderr?.on('data', (data) => {
                stderr += data.toString();
            });

            child.on('error', (err) => {
                reject(err);
            });

            child.on('close', (code) => {
                resolve({ code, stdout, stderr });
            });
        } catch (err) {
            reject(err);
        }
    });
}

async function iniciarSingbox(configPath) {
    await detenerSingbox();
    limpiarBuffersSingbox();

    try {
        if (fs.existsSync(singboxLogPath)) {
            fs.writeFileSync(singboxLogPath, '');
        }
    } catch (e) {}

    return new Promise((resolve, reject) => {
        let resuelto = false;

        try {
            proxyProcess = spawn(singboxPath, ['run', '-c', configPath], {
                cwd: rutaBinarios,
                windowsHide: true,
                env: {
                    ...process.env,
                    ENABLE_DEPRECATED_LEGACY_DNS_SERVERS: 'true',
                    ENABLE_DEPRECATED_MISSING_DOMAIN_RESOLVER: 'true'
                }
            });
        } catch (err) {
            proxyProcess = null;
            reject(new Error(`No se pudo lanzar sing-box: ${err.message}`));
            return;
        }

        proxyProcess.stdout?.on('data', (data) => {
            const txt = data.toString();
            singboxStdOut += txt;
            console.log('[sing-box stdout]', txt);
        });

        proxyProcess.stderr?.on('data', (data) => {
            const txt = data.toString();
            singboxStdErr += txt;
            console.log('[sing-box stderr]', txt);
        });

        proxyProcess.once('error', (err) => {
            if (resuelto) return;
            resuelto = true;
            proxyProcess = null;
            reject(new Error(`Error iniciando sing-box: ${err.message}`));
        });

        proxyProcess.once('exit', (code, signal) => {
            if (resuelto) return;
            resuelto = true;
            proxyProcess = null;

            const logTxt = leerLogSingbox();
            const detalle = [
                singboxStdErr.trim(),
                logTxt.trim()
            ].filter(Boolean).join('\n');

            reject(new Error(
                `sing-box terminó inmediatamente (code=${code}, signal=${signal || 'null'})` +
                (detalle ? `\n${detalle}` : '')
            ));
        });

        setTimeout(() => {
            if (resuelto) return;
            resuelto = true;
            resolve(true);
        }, 1200);
    });
}

function iniciarMonitorSingbox() {
    if (monitorInterval) {
        clearInterval(monitorInterval);
        monitorInterval = null;
    }

    monitorInterval = setInterval(() => {
        if (!isVpnConnected || desconexionManual) return;

        try {
            if (!proxyProcess || proxyProcess.killed || proxyProcess.exitCode !== null) {
                isVpnConnected = false;

                if (monitorInterval) {
                    clearInterval(monitorInterval);
                    monitorInterval = null;
                }

                const detalle = leerLogSingbox() || singboxStdErr || 'El motor VPN se detuvo.';
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send(
                        'error-suscripcion',
                        configEnMemoria.killSwitch
                            ? `Conexión perdida. Red bloqueada.\n${detalle}`
                            : detalle
                    );
                }
            }
        } catch (e) {}
    }, 3000);
}

// ==========================================
// MOTOR DE PING LOCAL (TCP)
// ==========================================
ipcMain.on('ping-servers', async (event, servidores) => {
    const resultados = {};

    const promesas = Object.keys(servidores).map(idPais => {
        return new Promise((resolve) => {
            const vlessUrl = servidores[idPais].vless;
            let host, port;

            try {
                const urlObj = new URL(vlessUrl);
                host = urlObj.hostname;
                port = parseInt(urlObj.port || '443', 10);
            } catch (e) {
                resultados[idPais] = { estado: "Error URL", ping: -1 };
                resolve();
                return;
            }

            const startTime = Date.now();
            const socket = new net.Socket();
            socket.setTimeout(2000);

            socket.connect(port, host, () => {
                const ping = Date.now() - startTime;
                let estado = "Óptimo";
                if (ping >= 200 && ping <= 800) estado = "Latencia Alta";
                if (ping > 800) estado = "Sobrecargado";

                resultados[idPais] = { estado, ping };
                socket.destroy();
                resolve();
            });

            socket.on('error', () => {
                resultados[idPais] = { estado: "Caído", ping: -1 };
                socket.destroy();
                resolve();
            });

            socket.on('timeout', () => {
                resultados[idPais] = { estado: "Timeout", ping: -1 };
                socket.destroy();
                resolve();
            });
        });
    });

    await Promise.all(promesas);
    event.reply('ping-results', resultados);
});

ipcMain.on('login-request', async (event, creds) => {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(`${API_BASE_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uuid: creds.uuid, password: creds.password }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        const data = await response.json();

        if (response.ok && data.valido) {
            configEnMemoria.uuid = creds.uuid;
            configEnMemoria.password = creds.password;
            configEnMemoria.servidores = data.servidores;
            store.set('userSettings', configEnMemoria);
            event.reply('login-success', configEnMemoria);
        } else {
            event.reply('login-error', data.msg || "Credenciales incorrectas");
        }
    } catch (e) {
        if (
            configEnMemoria.uuid &&
            creds.uuid === configEnMemoria.uuid &&
            creds.password === configEnMemoria.password
        ) {
            console.log("Activando Login en Caché por falta de red...");
            event.reply('login-success', configEnMemoria);
        } else {
            event.reply('login-error', "Error de conexión con el servidor maestro.");
        }
    }
});

ipcMain.on('logout-request', () => {
    configEnMemoria.uuid = '';
    configEnMemoria.password = '';
    configEnMemoria.servidores = {};
    store.set('userSettings', configEnMemoria);
});

async function verificarSuscripcionReal(uuid) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const response = await fetch(`${API_BASE_URL}/validar/${uuid}`, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
            return { valido: false, msg: "Suscripción inactiva" };
        }

        return await response.json();
    } catch (e) {
        return { valido: false, msg: "Timeout al validar" };
    }
}

function generarConfigSingbox(vlessUrl, nodeIP) {
    try {
        const url = new URL(vlessUrl);
        const params = new URLSearchParams(url.search);
        const hostOriginal = url.hostname;
        const sni = params.get("sni") || hostOriginal;
        const security = (params.get("security") || "").toLowerCase();
        const transportType = (params.get("type") || "tcp").toLowerCase();

        try {
            fs.writeFileSync(singboxLogPath, '');
        } catch (err) {}

        const proxyOutbound = {
            type: "vless",
            tag: "proxy",
            server: nodeIP,
            server_port: parseInt(url.port || '443', 10),
            uuid: url.username
        };

        const flow = params.get("flow");
        if (flow) {
            proxyOutbound.flow = flow;
        }

        if (security === "tls" || security === "reality") {
            proxyOutbound.tls = {
                enabled: true,
                server_name: sni,
                utls: {
                    enabled: true,
                    fingerprint: params.get("fp") || "chrome"
                }
            };

            const alpn = params.get("alpn");
            if (alpn) {
                proxyOutbound.tls.alpn = alpn
                    .split(',')
                    .map(v => v.trim())
                    .filter(Boolean);
            }

            if (security === "reality") {
                proxyOutbound.tls.reality = {
                    enabled: true,
                    public_key: params.get("pbk"),
                    short_id: params.get("sid") || ""
                };
            }
        }

        if (transportType === "ws") {
            proxyOutbound.transport = {
                type: "ws",
                path: params.get("path") || "/",
                headers: {
                    Host: params.get("host") || sni
                }
            };
        } else if (transportType === "grpc") {
            proxyOutbound.transport = {
                type: "grpc",
                service_name: params.get("serviceName") || params.get("service_name") || ""
            };
        } else if (transportType === "httpupgrade") {
            proxyOutbound.transport = {
                type: "httpupgrade",
                host: params.get("host") || sni,
                path: params.get("path") || "/"
            };
        }

        const nodeCIDR = nodeIP.includes(':') ? `${nodeIP}/128` : `${nodeIP}/32`;

        const config = {
            log: {
                level: "info",
                output: singboxLogPath
            },
            dns: {
                reverse_mapping: true,
                servers: [
                    {
                        type: "local",
                        tag: "dns-local"
                    },
                    {
                        type: "https",
                        tag: "dns-remote-v4",
                        server: "1.1.1.1",
                        server_port: 443,
                        path: "/dns-query",
                        detour: "proxy",
                        domain_resolver: "dns-local"
                    },
                    {
                        type: "https",
                        tag: "dns-remote-v6",
                        server: "2606:4700:4700::1111",
                        server_port: 443,
                        path: "/dns-query",
                        detour: "proxy",
                        domain_resolver: "dns-local"
                    }
                ],
                final: "dns-remote-v4"
            },
            inbounds: [],
            outbounds: [
                proxyOutbound,
                { type: "direct", tag: "direct" }
            ],
            route: {
                auto_detect_interface: true,
                final: "proxy",
                default_domain_resolver: {
                    server: "dns-local"
                },
                rules: [
                    {
                        ip_cidr: [
                            "127.0.0.0/8",
                            "::1/128",
                            "10.0.0.0/8",
                            "172.16.0.0/12",
                            "192.168.0.0/16",
                            "169.254.0.0/16",
                            "224.0.0.0/4",
                            "255.255.255.255/32",
                            "fc00::/7",
                            "fe80::/10",
                            "ff00::/8"
                        ],
                        action: "route",
                        outbound: "direct"
                    },
                    {
                        ip_cidr: [nodeCIDR],
                        action: "route",
                        outbound: "direct"
                    }
                ]
            }
        };

        if (configEnMemoria.connectionMode === 'proxy') {
            config.inbounds = [
                {
                    type: "mixed",
                    tag: "mixed-in",
                    listen: "127.0.0.1",
                    listen_port: 10808
                }
            ];
        } else {
            config.inbounds = [
                {
                    type: "mixed",
                    tag: "mixed-in",
                    listen: "127.0.0.1",
                    listen_port: 10808
                },
                {
                    type: "tun",
                    tag: "tun-in",
                    interface_name: "ArrowTUN",
                    mtu: 1500,
                    address: [
                        "172.19.0.2/24",
                        "fdfe:dcba:9876::2/64"
                    ],
                    auto_route: true,
                    strict_route: false,
                    stack: "system"
                }
            ];
        }

        fs.writeFileSync(configJsonPath, JSON.stringify(config, null, 4));
        return true;
    } catch (e) {
        console.log('Error generando config sing-box:', e.message);
        return false;
    }
}

ipcMain.on('conectar-vpn', async (event, payload) => {
    try {
        desconexionManual = false;
        const { vlessKey, serverId } = payload;

        configEnMemoria.ultimoServidor = serverId;
        store.set('userSettings', configEnMemoria);

        let vlessUrlObj;
        try {
            vlessUrlObj = new URL(vlessKey);
        } catch (e) {
            return event.reply('error-suscripcion', "Formato de llave inválido en el nodo");
        }

        const nodeIP = await resolverIP(vlessUrlObj.hostname);
        if (!nodeIP) {
            return event.reply('error-suscripcion', "Servidor inaccesible (Falló DNS)");
        }

        const status = await verificarSuscripcionReal(configEnMemoria.uuid);
        if (!status.valido) {
            return event.reply('error-suscripcion', status.msg);
        }

        if (!generarConfigSingbox(vlessKey, nodeIP)) {
            return event.reply('error-suscripcion', "Error en la configuración local");
        }

        if (configEnMemoria.connectionMode === 'proxy') {
            activarProxySistema();
        } else {
            limpiarProxySistema();
            try { spawn('ipconfig', ['/flushdns'], { windowsHide: true }); } catch (e) {}
        }

        await iniciarSingbox(configJsonPath);
        await esperarPuerto('127.0.0.1', 10808, 8000);

        isVpnConnected = true;

        if (configEnMemoria.connectionMode === 'vpn') {
            const interfazLista = await esperarInterfazTun('ArrowTUN', 12000);

            if (interfazLista) {
                try {
                    const psNetworkScriptPath = path.join(app.getPath('userData'), 'network_setup.ps1');
                    const psNetworkCommands = `
                        netsh interface ip set address "ArrowTUN" static 172.19.0.2 255.255.255.0 172.19.0.1
                        netsh interface ip set dns "ArrowTUN" static 1.1.1.1 validate=no
                        netsh interface ipv6 set dnsservers "ArrowTUN" static 2606:4700:4700::1111 validate=no
                        netsh interface ipv4 set interface "ArrowTUN" metric=1
                        netsh interface ipv6 set interface "ArrowTUN" metric=1
                        Get-DnsClientNrptRule -ErrorAction SilentlyContinue | Where-Object {$_.Comment -eq 'ArrowVPN'} | Remove-DnsClientNrptRule -Force -ErrorAction SilentlyContinue
                        Add-DnsClientNrptRule -Namespace '.' -NameServers '1.1.1.1','2606:4700:4700::1111' -Comment 'ArrowVPN' -ErrorAction SilentlyContinue
                        Clear-DnsClientCache
                        ipconfig /flushdns
                    `;
                    fs.writeFileSync(psNetworkScriptPath, psNetworkCommands);
                    spawn('powershell.exe', ['-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', psNetworkScriptPath], { windowsHide: true });
                } catch (e) {}
            } else {
                console.log('ArrowTUN no apareció a tiempo.');
            }
        }

        iniciarMonitorSingbox();
        event.reply('vpn-conectada-exito');

    } catch (e) {
        console.log('Error al iniciar VPN:', e.message);

        isVpnConnected = false;
        await detenerSingbox();

        if (configEnMemoria.connectionMode === 'proxy') {
            limpiarProxySistema();
        }

        const detalle = [
            e.message,
            singboxStdErr.trim(),
            leerLogSingbox()
        ].filter(Boolean).join('\n');

        event.reply(
            'error-suscripcion',
            detalle || "Error interno al iniciar proxy."
        );
    }
});

ipcMain.on('desconectar-vpn', async () => {
    desconexionManual = true;
    isVpnConnected = false;

    if (monitorInterval) {
        clearInterval(monitorInterval);
        monitorInterval = null;
    }

    await detenerSingbox();
    limpiarProxySistema();

    if (configEnMemoria.connectionMode === 'vpn') {
        limpiarReglasFirewall();
    }
});

ipcMain.on('cerrar-ventana', () => {
    mainWindow.close();
});

app.on('will-quit', async () => {
    try {
        await detenerSingbox();
    } catch (e) {}

    limpiarProxySistema();
    limpiarReglasFirewall();
});

ipcMain.on('get-settings', (event) => {
    event.reply('load-settings', configEnMemoria);
});

ipcMain.on('save-settings', (event, data) => {
    configEnMemoria = { ...configEnMemoria, ...data };
    store.set('userSettings', configEnMemoria);

    if (!data.killSwitch) {
        try {
            spawn('netsh', ['advfirewall', 'firewall', 'delete', 'rule', 'name=Arrow_KS_Block'], { windowsHide: true });
        } catch (e) {}
    }
});

ipcMain.on('get-app-version', (event) => {
    event.reply('app-version', app.getVersion());
});

ipcMain.on('minimizar-ventana', () => {
    mainWindow.minimize();
});

function createTray() {
    tray = new Tray(
        nativeImage.createFromPath(path.join(__dirname, 'icon.png')).resize({ width: 24 })
    );

    tray.setContextMenu(Menu.buildFromTemplate([
        { label: 'Mostrar Arrow VPN', click: () => mainWindow.show() },
        { type: 'separator' },
        {
            label: 'Salir por completo',
            click: () => {
                app.isQuitting = true;
                app.quit();
            }
        }
    ]));

    tray.on('double-click', () => mainWindow.show());
}

// ==========================================
// RECEPTORES DEL SISTEMA OTA (CON INTERACCIÓN DEL USUARIO)
// ==========================================
autoUpdater.on('update-available', () => {
    if (mainWindow) {
        mainWindow.webContents.send('update-status', 'Descargando actualización en 2do plano...');
    }
});

autoUpdater.on('update-downloaded', () => {
    if (mainWindow) {
        mainWindow.webContents.send('update-status', 'Actualización lista.');
    }

    const dialogOpts = {
        type: 'info',
        buttons: ['Instalar y Reiniciar', 'Más tarde'],
        title: 'Actualización Disponible',
        message: 'Se ha descargado una nueva versión de Arrow VPN.',
        detail: '¿Deseas instalarla y reiniciar la aplicación ahora?\n\nSi eliges "Más tarde", se instalará automáticamente cuando cierres la aplicación o apagues el equipo.',
        defaultId: 0,
        cancelId: 1
    };

    dialog.showMessageBox(mainWindow, dialogOpts).then(async (returnValue) => {
        if (returnValue.response === 0) {
            try {
                await detenerSingbox();
            } catch (e) {}
            autoUpdater.quitAndInstall(false, true);
        }
    });
});

autoUpdater.on('error', (err) => {
    console.log('Error silencioso en OTA:', err.message);
});

function limpiarAccesosDirectosFantasma() {
    try {
        const userStartMenu = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Arrow VPN.lnk');
        const userMenuFolder = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Arrow VPN');

        if (fs.existsSync(userStartMenu)) {
            fs.unlinkSync(userStartMenu);
        }

        if (fs.existsSync(userMenuFolder)) {
            fs.rmSync(userMenuFolder, { recursive: true, force: true });
        }
    } catch (e) {
        console.log("Error limpiando accesos directos:", e.message);
    }
}

app.whenReady().then(async () => {
    limpiarAccesosDirectosFantasma();

    try {
        await detenerSingbox();
    } catch (e) {}

    limpiarProxySistema();
    limpiarReglasFirewall();

    createWindow();
    createTray();

    setTimeout(async () => {
        try {
            await autoUpdater.checkForUpdatesAndNotify();
        } catch (err) {
            console.log('Fallo al iniciar el servicio OTA:', err.message);
        }
    }, 3000);
});