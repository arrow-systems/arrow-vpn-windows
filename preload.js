const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('apiVPN', {
    enviar: (canal, datos) => {
        const canalesValidos = ['conectar-vpn', 'desconectar-vpn', 'cerrar-ventana', 'minimizar-ventana', 'get-settings', 'save-settings', 'get-app-version', 'login-request', 'logout-request', 'ping-servers'];
        if (canalesValidos.includes(canal)) {
            ipcRenderer.send(canal, datos);
        }
    },
    recibir: (canal, funcion) => {
        const canalesValidos = ['load-settings', 'vpn-conectada-exito', 'error-suscripcion', 'app-version', 'login-success', 'login-error', 'update-status', 'ping-results'];
        if (canalesValidos.includes(canal)) {
            ipcRenderer.on(canal, (event, ...args) => funcion(...args));
        }
    }
});