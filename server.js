/**
 * HMI Backend — Pont WebSocket <-> Modbus TCP
 *
 * ─── MAP MODBUS UNIFIÉE (ESP32 = Slave ID=1, port 502) ───────────────────
 *
 *  Holding Registers — lecture (readHoldingRegisters) :
 *    HR0  → Motor state        (0=STOP, 1=RUN)
 *    HR1  → Capteur entrée     (0/1)
 *    HR2  → Capteur sortie     (0/1)
 *    HR3  → Nb canettes tapis  (0–10)
 *    HR4  → Total traité       (0–65535)
 *    HR5  → Position canette 0 (0–100 %)
 *    ...
 *    HR14 → Position canette 9 (0–100 %)
 *
 *  Coils — écriture commandes HMI (writeCoil) :
 *    C0  → Ajouter canette    (pulse 100ms)
 *    C1  → Récupérer canette  (pulse 100ms)
 */

import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import pkg from 'jsmodbus';
const { Modbus } = pkg;
import net from 'net';

const WS_PORT        = 3001;
const MODBUS_PORT    = 502;
const MODBUS_ID      = 1;
const SCAN_RATE_MS   = 40;    // 25 Hz
const CONNECT_TIMEOUT = 3000;
const NUM_REGS       = 80;    // HR0–HR79 (convoyeur + jus)

// ─── ADRESSES ─────────────────────────────────────────────────────────────
const HR_MOTOR       = 0;
const HR_SENSOR_IN   = 1;
const HR_SENSOR_OUT  = 2;
const HR_CAN_COUNT   = 3;
const HR_TOTAL       = 4;
const HR_POS_BASE    = 5;   // HR5 à HR14 = positions canettes 0–9

const COIL_ADD_CAN      = 0;
const COIL_RETRIEVE_CAN = 1;

// ─── DISTRIBUTEUR DE JUS (N) ───────────────────────────────────────────────
const HR_JUICE_N         = 15;
const HR_GLASS_CAP_ML    = 16;
const HR_POUR_ML         = 17;
const HR_GLASS_TOTAL_ML  = 18;
const HR_STOCK_BASE      = 20;
const HR_GLASS_BASE      = 40;

const COIL_STOCK_ADD_BASE = 10;
const COIL_STOCK_SUB_BASE = 30;
const COIL_POUR_BASE      = 50;
const COIL_RESET_GLASS    = 70;

// ─── ÉTAT GLOBAL ──────────────────────────────────────────────────────────
let modbusClient = null;
let socket = null;
let isModbusConnected = false;
let espIp        = null;
let scanInterval = null;

let currentState = {
  motorActive:       false,
  cansOnConveyor:    [],
  totalCounter:      0,
  entrySensorActive: false,
  exitSensorActive:  false,
  juice: {
    n: 0,
    capacityMl: 0,
    pourMl: 0,
    totalMl: 0,
    stock: [],
    glass: [],
  },
  connected:         false,
  espIp:             null,
};

// ─── WEBSOCKET ─────────────────────────────────────────────────────────────
const httpServer = createServer();
const wss = new WebSocketServer({ server: httpServer });

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(ws => { if (ws.readyState === 1) ws.send(msg); });
}

// ─── MODBUS ────────────────────────────────────────────────────────────────
async function connectToESP(ip) {
  if (isModbusConnected) {
    stopScanLoop();
    if (socket) {
      socket.destroy();
    }
    modbusClient = null;
    socket = null;
    isModbusConnected = false;
  }
  return new Promise((resolve) => {
    try {
      console.log(`[Modbus] Connexion à ${ip}:${MODBUS_PORT}…`);
      socket = new net.Socket();
      modbusClient = new Modbus.client.TCP(socket, MODBUS_ID);
      socket.connect({ host: ip, port: MODBUS_PORT });
      socket.on('connect', () => {
        isModbusConnected = true;
        espIp = ip;
        console.log(`[Modbus] ✓ Connecté à ESP32 ${ip}`);
        startScanLoop();
        resolve({ success: true });
      });
      socket.on('error', (err) => {
        console.error(`[Modbus] ✗ Échec : ${err.message}`);
        isModbusConnected = false;
        resolve({ success: false, error: err.message });
      });
      socket.setTimeout(CONNECT_TIMEOUT);
    } catch (err) {
      console.error(`[Modbus] ✗ Échec : ${err.message}`);
      isModbusConnected = false;
      resolve({ success: false, error: err.message });
    }
  });
}

async function disconnectFromESP() {
  stopScanLoop();
  if (isModbusConnected) {
    if (socket) {
      socket.destroy();
    }
    modbusClient = null;
    socket = null;
    isModbusConnected = false;
  }
  espIp = null;
  currentState = { ...currentState, connected: false, espIp: null };
  broadcast({ type: 'state', data: currentState });
  console.log('[Modbus] Déconnecté');
}

async function readESPState() {
  try {
    // Lecture HR0–HR79 (convoyeur + jus)
    const result = await modbusClient.readHoldingRegisters(0, NUM_REGS);
    const d = result.data;

    const canCount = d[HR_CAN_COUNT];

    // Reconstitue le tableau de canettes avec leurs positions ESP32
    const cansOnConveyor = [];
    for (let i = 0; i < canCount && i < 10; i++) {
      cansOnConveyor.push({
        id:       i,
        position: d[HR_POS_BASE + i],
        label:    `CAN-${String(i + 1).padStart(3, '0')}`,
      });
    }

    const nJuices = Math.max(0, Math.min(12, d[HR_JUICE_N] ?? 0));
    const stock = [];
    const glass = [];
    for (let i = 0; i < nJuices; i++) {
      stock.push(d[HR_STOCK_BASE + i] ?? 0);
      glass.push(d[HR_GLASS_BASE + i] ?? 0);
    }

    currentState = {
      motorActive:       d[HR_MOTOR]      === 1,
      entrySensorActive: d[HR_SENSOR_IN]  === 1,
      exitSensorActive:  d[HR_SENSOR_OUT] === 1,
      cansOnConveyor,
      totalCounter:      d[HR_TOTAL],
      juice: {
        n: nJuices,
        capacityMl: d[HR_GLASS_CAP_ML] ?? 0,
        pourMl: d[HR_POUR_ML] ?? 0,
        totalMl: d[HR_GLASS_TOTAL_ML] ?? 0,
        stock,
        glass,
      },
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

async function pulseCoil(addr) {
  if (!isModbusConnected) return;
  try {
    await modbusClient.writeSingleCoil(addr, true);
    setTimeout(async () => {
      try { await modbusClient.writeSingleCoil(addr, false); } catch (_) {}
    }, 100);
  } catch (err) {
    console.error(`[Modbus] Erreur coil ${addr} : ${err.message}`);
  }
}

function startScanLoop() {
  if (scanInterval) clearInterval(scanInterval);
  scanInterval = setInterval(async () => {
    if (isModbusConnected) await readESPState();
  }, SCAN_RATE_MS);
}

function stopScanLoop() {
  if (scanInterval) { clearInterval(scanInterval); scanInterval = null; }
}

// ─── GESTION MESSAGES WEBSOCKET ────────────────────────────────────────────
wss.on('connection', (ws) => {
  console.log('[WS] Frontend connecté');
  ws.send(JSON.stringify({ type: 'state', data: currentState }));

  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    switch (msg.type) {
      case 'connect': {
        const result = await connectToESP(msg.ip);
        ws.send(JSON.stringify({ type: 'connect_result', ...result, ip: msg.ip }));
        break;
      }
      case 'disconnect':    await disconnectFromESP(); break;
      case 'addCan':        await pulseCoil(COIL_ADD_CAN); break;
      case 'retrieveCan':   await pulseCoil(COIL_RETRIEVE_CAN); break;
      case 'juiceStockAdd': {
        const i = Number(msg.index);
        if (Number.isInteger(i) && i >= 0 && i < 32) await pulseCoil(COIL_STOCK_ADD_BASE + i);
        break;
      }
      case 'juiceStockSub': {
        const i = Number(msg.index);
        if (Number.isInteger(i) && i >= 0 && i < 32) await pulseCoil(COIL_STOCK_SUB_BASE + i);
        break;
      }
      case 'juicePour': {
        const i = Number(msg.index);
        if (Number.isInteger(i) && i >= 0 && i < 32) await pulseCoil(COIL_POUR_BASE + i);
        break;
      }
      case 'juiceResetGlass': {
        await pulseCoil(COIL_RESET_GLASS);
        break;
      }
      default: console.warn(`[WS] Message inconnu : ${msg.type}`);
    }
  });

  ws.on('close', () => console.log('[WS] Frontend déconnecté'));
  ws.on('error', err => console.error('[WS] Erreur :', err.message));
});

// ─── DÉMARRAGE ─────────────────────────────────────────────────────────────
httpServer.listen(WS_PORT, () => {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║     HMI Modbus Backend — Démarré         ║');
  console.log(`║     WebSocket : ws://localhost:${WS_PORT}      ║`);
  console.log('╚══════════════════════════════════════════╝');
});
