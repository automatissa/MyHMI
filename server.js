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
import ModbusRTU from 'modbus-serial';

const WS_PORT        = 3001;
const MODBUS_PORT    = 502;
const MODBUS_ID      = 1;
const SCAN_RATE_MS   = 40;    // 25 Hz
const CONNECT_TIMEOUT = 3000;
const NUM_REGS       = 15;    // HR0–HR14

// ─── ADRESSES ─────────────────────────────────────────────────────────────
const HR_MOTOR       = 0;
const HR_SENSOR_IN   = 1;
const HR_SENSOR_OUT  = 2;
const HR_CAN_COUNT   = 3;
const HR_TOTAL       = 4;
const HR_POS_BASE    = 5;   // HR5 à HR14 = positions canettes 0–9

const COIL_ADD_CAN      = 0;
const COIL_RETRIEVE_CAN = 1;

// ─── ÉTAT GLOBAL ──────────────────────────────────────────────────────────
const modbusClient = new ModbusRTU();
let isModbusConnected = false;
let espIp        = null;
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
    try { await modbusClient.close(); } catch (_) {}
    isModbusConnected = false;
  }
  try {
    console.log(`[Modbus] Connexion à ${ip}:${MODBUS_PORT}…`);
    await modbusClient.connectTCP(ip, { port: MODBUS_PORT });
    modbusClient.setID(MODBUS_ID);
    modbusClient.setTimeout(CONNECT_TIMEOUT);
    isModbusConnected = true;
    espIp = ip;
    console.log(`[Modbus] ✓ Connecté à ESP32 ${ip}`);
    startScanLoop();
    return { success: true };
  } catch (err) {
    console.error(`[Modbus] ✗ Échec : ${err.message}`);
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
    // Lecture HR0–HR14 (15 Holding Registers)
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

    currentState = {
      motorActive:       d[HR_MOTOR]      === 1,
      entrySensorActive: d[HR_SENSOR_IN]  === 1,
      exitSensorActive:  d[HR_SENSOR_OUT] === 1,
      cansOnConveyor,
      totalCounter:      d[HR_TOTAL],
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
    await modbusClient.writeCoil(addr, true);
    setTimeout(async () => {
      try { await modbusClient.writeCoil(addr, false); } catch (_) {}
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
