/**
 * HMI Backend — Pont WebSocket <-> Modbus TCP
 *
 * Architecture :
 *   Frontend (React) <--WebSocket--> Ce serveur <--Modbus TCP--> ESP32 WROOM
 *
 * Registres Modbus (ESP32 = Slave, ID=1) :
 *   Input Registers (lecture) :
 *     0  → Motor state (0=STOP, 1=RUN)
 *     1  → Nombre de canettes sur tapis
 *     2  → Total canettes traitées
 *     3  → Capteur sortie actif (0/1)
 *     4  → Capteur entrée actif (0/1)
 *     5-14 → Positions canettes 0-9 (0–100)
 *
 *   Coils (écriture commandes HMI) :
 *     0  → Ajouter canette (pulse 100ms)
 *     1  → Récupérer canette (pulse 100ms)
 */

import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import ModbusRTU from 'modbus-serial';

const WS_PORT = 3001;
const MODBUS_PORT = 502;
const MODBUS_ID = 1;
const SCAN_RATE_MS = 40;     // 25 Hz — cycle synchronisé avec le frontend
const CONNECT_TIMEOUT = 3000;

// Adresses registres
const REG_MOTOR        = 0;
const REG_CAN_COUNT    = 1;
const REG_TOTAL        = 2;
const REG_EXIT_SENSOR  = 3;
const REG_ENTRY_SENSOR = 4;
const REG_CAN_POS_BASE = 5;  // 5 à 14 pour les 10 canettes

const COIL_ADD_CAN      = 0;
const COIL_RETRIEVE_CAN = 1;

// ─── ÉTAT GLOBAL ───────────────────────────────────────────────────────────

const modbusClient = new ModbusRTU();
let isModbusConnected = false;
let espIp = null;
let scanInterval = null;

let currentState = {
  motorActive:       false,
  cansOnConveyor:    [],
  totalCounter:      0,
  entrySensorActive: false,
  exitSensorActive:  false,
  connected:         false,
  espIp:             null,
};

// ─── SERVEUR HTTP + WEBSOCKET ───────────────────────────────────────────────

const httpServer = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('HMI Modbus Backend\n');
});

const wss = new WebSocketServer({ server: httpServer });

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === 1 /* OPEN */) {
      client.send(msg);
    }
  });
}

// ─── MODBUS ────────────────────────────────────────────────────────────────

async function connectToESP(ip) {
  // Fermer connexion existante si besoin
  if (isModbusConnected) {
    stopScanLoop();
    try { await modbusClient.close(); } catch (_) {}
    isModbusConnected = false;
  }

  try {
    console.log(`[Modbus] Tentative connexion à ${ip}:${MODBUS_PORT}…`);
    await modbusClient.connectTCP(ip, { port: MODBUS_PORT });
    modbusClient.setID(MODBUS_ID);
    modbusClient.setTimeout(CONNECT_TIMEOUT);

    isModbusConnected = true;
    espIp = ip;
    console.log(`[Modbus] ✓ Connecté à ESP32 ${ip}`);

    startScanLoop();
    return { success: true };
  } catch (err) {
    console.error(`[Modbus] ✗ Échec connexion : ${err.message}`);
    isModbusConnected = false;
    return { success: false, error: err.message };
  }
}

async function disconnectFromESP() {
  stopScanLoop();
  if (isModbusConnected) {
    try { await modbusClient.close(); } catch (_) {}
    isModbusConnected = false;
  }
  espIp = null;
  currentState = { ...currentState, connected: false, espIp: null };
  broadcast({ type: 'state', data: currentState });
  console.log('[Modbus] Déconnecté');
}

async function readESPState() {
  try {
    // Lecture de 15 registres d'entrée (motor + count + total + sensors + 10 positions)
    const result = await modbusClient.readInputRegisters(0, 15);
    const d = result.data;

    const canCount = d[REG_CAN_COUNT];
    const cansOnConveyor = [];
    for (let i = 0; i < canCount && i < 10; i++) {
      cansOnConveyor.push({
        id:       i,
        position: d[REG_CAN_POS_BASE + i],
        label:    `CAN-${String(i + 1).padStart(3, '0')}`,
      });
    }

    currentState = {
      motorActive:       d[REG_MOTOR]        === 1,
      cansOnConveyor,
      totalCounter:      d[REG_TOTAL],
      exitSensorActive:  d[REG_EXIT_SENSOR]  === 1,
      entrySensorActive: d[REG_ENTRY_SENSOR] === 1,
      connected:         true,
      espIp,
    };

    broadcast({ type: 'state', data: currentState });
  } catch (err) {
    console.error(`[Modbus] Erreur lecture : ${err.message}`);
    isModbusConnected = false;
    stopScanLoop();
    currentState = { ...currentState, connected: false };
    broadcast({ type: 'state', data: currentState });
    broadcast({ type: 'error', message: `Connexion Modbus perdue : ${err.message}` });
  }
}

async function pulseCoil(coilAddress) {
  if (!isModbusConnected) return;
  try {
    await modbusClient.writeCoil(coilAddress, true);
    setTimeout(async () => {
      try { await modbusClient.writeCoil(coilAddress, false); } catch (_) {}
    }, 100);
  } catch (err) {
    console.error(`[Modbus] Erreur écriture coil ${coilAddress} : ${err.message}`);
  }
}

function startScanLoop() {
  if (scanInterval) clearInterval(scanInterval);
  scanInterval = setInterval(async () => {
    if (isModbusConnected) await readESPState();
  }, SCAN_RATE_MS);
}

function stopScanLoop() {
  if (scanInterval) {
    clearInterval(scanInterval);
    scanInterval = null;
  }
}

// ─── GESTION WEBSOCKET ─────────────────────────────────────────────────────

wss.on('connection', (ws) => {
  console.log('[WS] Frontend connecté');

  // Envoyer l'état actuel immédiatement
  ws.send(JSON.stringify({ type: 'state', data: currentState }));

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (msg.type) {
      case 'connect': {
        const result = await connectToESP(msg.ip);
        ws.send(JSON.stringify({ type: 'connect_result', ...result, ip: msg.ip }));
        break;
      }
      case 'disconnect':
        await disconnectFromESP();
        break;

      case 'addCan':
        await pulseCoil(COIL_ADD_CAN);
        break;

      case 'retrieveCan':
        await pulseCoil(COIL_RETRIEVE_CAN);
        break;

      default:
        console.warn(`[WS] Message inconnu : ${msg.type}`);
    }
  });

  ws.on('close', () => {
    console.log('[WS] Frontend déconnecté');
  });

  ws.on('error', (err) => {
    console.error('[WS] Erreur :', err.message);
  });
});

// ─── DÉMARRAGE ─────────────────────────────────────────────────────────────

httpServer.listen(WS_PORT, () => {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║     HMI Modbus Backend — Démarré         ║');
  console.log(`║     WebSocket : ws://localhost:${WS_PORT}      ║`);
  console.log('╚══════════════════════════════════════════╝');
  console.log('En attente de connexion frontend…');
});
