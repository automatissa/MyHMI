import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import ModbusRTU from 'modbus-serial';
import cors from 'cors';
import dgram from 'dgram';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());

// ─── FRONTEND STATIQUE (production) ─────────────────────────────────────────
const distPath = join(__dirname, '../dist');
app.use(express.static(distPath));
// Fallback SPA : toute route inconnue renvoie index.html
app.get('/{*path}', (_req, res) => {
  res.sendFile(join(distPath, 'index.html'));
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  allowEIO3: true,
});

// ─── ÉTAT MODBUS ────────────────────────────────────────────────────────────
const client   = new ModbusRTU();
let isConnected = false;
let isReading   = false;
let esp32IP     = null;
let connecting  = false;
let retryTimer  = null;
const ESP32_PORT = 502;

// ─── CONNEXION MODBUS PERSISTANTE ───────────────────────────────────────────
async function connectModbus(ip) {
  if (connecting) return;
  connecting = true;
  esp32IP    = ip;

  try {
    if (client.isOpen) {
      try { client.close(); } catch (_) {}
      await new Promise(r => setTimeout(r, 500));
    }

    await client.connectTCP(ip, { port: ESP32_PORT });
    client.setID(1);
    client.setTimeout(1000);

    isConnected = true;
    connecting  = false;
    console.log(`[Modbus] Connecté à ESP32 @ ${ip}:${ESP32_PORT}`);
    io.emit('modbus_status', { connected: true, ip });
    io.emit('esp32_discovered', { ip });

  } catch (e) {
    connecting  = false;
    isConnected = false;
    console.log(`[Modbus] Echec connexion à ${ip}: ${e.message} — retry dans 3s`);
    io.emit('modbus_status', { connected: false, ip });
    if (!retryTimer) {
      retryTimer = setTimeout(() => { retryTimer = null; connectModbus(ip); }, 3000);
    }
  }
}

// ─── DÉCOUVERTE UDP — ESP32 annonce son IP au démarrage ─────────────────────
const udpServer = dgram.createSocket({ type: 'udp4', reuseAddr: true });

udpServer.on('message', (msg, rinfo) => {
  const str = msg.toString().trim();
  console.log(`[UDP] Reçu de ${rinfo.address}: ${str}`);

  if (str.startsWith('ESP32_IP:')) {
    const ip = str.replace('ESP32_IP:', '').trim();
    console.log(`[UDP] ESP32 découvert → ${ip}`);

    const ipChanged = ip !== esp32IP;
    if (ipChanged || !isConnected) {
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      if (ipChanged) connecting = false;
      connectModbus(ip);
    }
  }
});

udpServer.on('error', err => {
  console.error('[UDP] Erreur socket:', err.message);
  udpServer.close();
});

udpServer.bind(5001, '0.0.0.0', () => {
  console.log('[UDP] Écoute port 5001 — attente annonce ESP32...');
});

// ─── BOUCLE LECTURE MODBUS (100 ms) ─────────────────────────────────────────
setInterval(async () => {
  if (!isConnected || !esp32IP || isReading) return;
  isReading = true;

  try {
    const data = await client.readHoldingRegisters(0, 15);
    const r    = data.data;

    const canCount     = r[3];
    const canPositions = [];
    for (let i = 0; i < canCount && i < 10; i++) {
      canPositions.push(r[5 + i]);
    }

    io.emit('modbus_data', {
      motorRunning: r[0] === 1,
      sensorEntry:  r[1] === 1,
      sensorExit:   r[2] === 1,
      cansCount:    canCount,
      cansOut:      r[4],
      canPositions,
    });

  } catch (e) {
    console.log('[Modbus] Erreur lecture:', e.message);
    isConnected = false;
    io.emit('modbus_status', { connected: false, ip: esp32IP });
    try { client.close(); } catch (_) {}
    if (esp32IP && !retryTimer) {
      retryTimer = setTimeout(() => { retryTimer = null; connectModbus(esp32IP); }, 2000);
    }
  } finally {
    isReading = false;
  }
}, 100);

// ─── SOCKET.IO — COMMANDES OPÉRATEUR ────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('[WS] Nouvelle connexion IHM');

  socket.emit('modbus_status', { connected: isConnected, ip: esp32IP });
  if (esp32IP) socket.emit('esp32_discovered', { ip: esp32IP });

  // Connexion manuelle si UDP bloqué (pare-feu Windows, etc.)
  socket.on('connect_esp32', ({ ip }) => {
    if (!ip) return;
    if (connecting || (isConnected && ip === esp32IP)) return;
    console.log(`[WS] Connexion manuelle demandée → ${ip}`);
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    connectModbus(ip);
  });

  socket.on('simulate_entry', async () => {
    if (!isConnected) return;
    console.log('[Coil] Ajouter canette → Coil 0 (COIL_ADD_CAN)');
    try {
      await client.writeCoil(0, true);
      setTimeout(() => { if (isConnected) client.writeCoil(0, false).catch(() => {}); }, 300);
    } catch (e) { console.error('[Coil] Erreur entry:', e.message); }
  });

  socket.on('simulate_exit', async () => {
    if (!isConnected) return;
    console.log('[Coil] Récupérer canette → Coil 1 (COIL_RETRIEVE_CAN)');
    try {
      await client.writeCoil(1, true);
      setTimeout(() => { if (isConnected) client.writeCoil(1, false).catch(() => {}); }, 300);
    } catch (e) { console.error('[Coil] Erreur exit:', e.message); }
  });
});

// ─── DÉMARRAGE ───────────────────────────────────────────────────────────────
const PORT = 3002;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[HTTP/WS] Serveur démarré sur 0.0.0.0:${PORT}`);
  console.log('[Info] En attente de l\'annonce UDP ESP32 sur le port 5001...');
});
