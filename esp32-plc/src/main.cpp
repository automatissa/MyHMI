#include <Arduino.h>
#include <WiFi.h>
#include <ModbusIP_ESP8266.h>  // lib: emelianov/modbus-esp8266

// ─── CONFIGURATION RÉSEAU ──────────────────────────────────────────────────
const char* WIFI_SSID     = "Hotspot";
const char* WIFI_PASSWORD = "transformeresp32";


// ─── PINS GPIO ─────────────────────────────────────────────────────────────
const bool PIN_USE_PHYSICAL_SENSORS = false;  // true = capteurs réels en usine

const int PIN_LED_WIFI   = 2;    // LED built-in — indicateur statut Wi-Fi
const int PIN_SENSOR_IN  = 34;   // Entrée — capteur inductif entrée convoyeur
const int PIN_SENSOR_OUT = 35;   // Entrée — capteur inductif sortie convoyeur
const int PIN_MOTOR_OUT  = 4;    // Sortie — contacteur moteur (GPIO 4 en usine)
//  ⚠ GPIO 2 réservé à la LED Wi-Fi. En usine, moteur sur GPIO 4.

// ─── MODBUS HOLDING REGISTERS ─────────────────────────────────────────────
//  HR0  → Motor state        (0=STOP, 1=RUN)
//  HR1  → Capteur entrée     (0/1)
//  HR2  → Capteur sortie     (0/1)
//  HR3  → Nb canettes tapis  (0–10)
//  HR4  → Total traité
//  HR5–HR14 → Positions canettes 0–9 (0–100 %)
const int HR_MOTOR      = 0;
const int HR_SENSOR_IN  = 1;
const int HR_SENSOR_OUT = 2;
const int HR_CAN_COUNT  = 3;
const int HR_TOTAL      = 4;
const int HR_POS_BASE   = 5;

// ─── MODBUS COILS (commandes HMI) ─────────────────────────────────────────
//  C0 → Ajouter canette   (pulse depuis IHM)
//  C1 → Récupérer canette (pulse depuis IHM)
const int COIL_ADD_CAN      = 0;
const int COIL_RETRIEVE_CAN = 1;

// ─── DISTRIBUTEUR DE JUS (N) — MAP MODBUS ──────────────────────────────────
//  HR15  → NB_JUS (N)
//  HR16  → CAPACITE_VERRE_ML
//  HR17  → DOSE_VERSEMENT_ML
//  HR18  → TOTAL_VERRE_ML
//
//  HR20..HR(20+N-1) → STOCK (unités) par jus
//  HR40..HR(40+N-1) → ML dans le verre par jus
//
//  Coils (front montant, pulse depuis IHM) :
//   C10..C(10+N-1) → +1 stock jus i
//   C30..C(30+N-1) → -1 stock jus i
//   C50..C(50+N-1) → verser jus i (consomme 1 stock, ajoute DOSE ml si capacité dispo)
//   C70            → reset verre
const int HR_JUICE_N       = 15;
const int HR_GLASS_CAP_ML  = 16;
const int HR_POUR_ML       = 17;
const int HR_GLASS_TOTAL_ML= 18;
const int HR_STOCK_BASE    = 20;
const int HR_GLASS_BASE    = 40;

const int COIL_STOCK_ADD_BASE = 10;
const int COIL_STOCK_SUB_BASE = 30;
const int COIL_POUR_BASE      = 50;
const int COIL_RESET_GLASS    = 70;

const int N_JUICES = 6;           // <-- "exactement N jus" côté PLC
const int GLASS_CAPACITY_ML = 300;
const int POUR_ML = 25;
const int MAX_STOCK_PER_JUICE = 20;

// ─── CONSTANTES PLC ───────────────────────────────────────────────────────
const int   MAX_CANS       = 10;
const int   TRAVEL_TIME_MS = 5000;  // 5 s pour traverser le tapis
const int   UPDATE_MS      = 100;   // Cycle scan = 100ms (10 Hz)
const float POS_INCREMENT  = 100.0f / (TRAVEL_TIME_MS / UPDATE_MS);  // 2%/cycle

// ─── ÉTAT PLC ─────────────────────────────────────────────────────────────
struct Can { bool active; float position; };

Can   cans[MAX_CANS];
int   canCount     = 0;
int   totalOut     = 0;
bool  motorRunning = false;
bool  sensorIn     = false;
bool  sensorOut    = false;
bool  prevCoilAdd      = false;
bool  prevCoilRetrieve = false;

// Distributeur jus
uint16_t juiceStock[N_JUICES];
uint16_t glassMl[N_JUICES];
bool prevCoilStockAdd[N_JUICES];
bool prevCoilStockSub[N_JUICES];
bool prevCoilPour[N_JUICES];
bool prevCoilResetGlass = false;

// ─── TIMERS (millis — non bloquants) ──────────────────────────────────────
unsigned long lastPlcTick   = 0;   // cycle PLC 100ms
unsigned long lastWifiRetry = 0;   // retry Wi-Fi 5000ms
unsigned long lastLedBlink  = 0;   // clignotement LED 500ms
bool          ledState      = false;
bool          modbusStarted = false;

ModbusIP mb;

// ─── HELPERS PLC ──────────────────────────────────────────────────────────
bool addCan() {
  if (canCount >= MAX_CANS) return false;
  for (int i = 0; i < MAX_CANS; i++) {
    if (!cans[i].active) {
      cans[i].active = true; cans[i].position = 0.0f; canCount++;
      return true;
    }
  }
  return false;
}

bool retrieveCan() {
  for (int i = 0; i < MAX_CANS; i++) {
    if (cans[i].active && cans[i].position >= 100.0f) {
      cans[i].active = false; cans[i].position = 0.0f;
      canCount--; totalOut++;
      return true;
    }
  }
  return false;
}

bool hasCanAtExit() {
  for (int i = 0; i < MAX_CANS; i++)
    if (cans[i].active && cans[i].position >= 100.0f) return true;
  return false;
}

// ─── SETUP ────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);

  pinMode(PIN_LED_WIFI,  OUTPUT);
  pinMode(PIN_MOTOR_OUT, OUTPUT);
  if (PIN_USE_PHYSICAL_SENSORS) {
    pinMode(PIN_SENSOR_IN,  INPUT_PULLDOWN);
    pinMode(PIN_SENSOR_OUT, INPUT_PULLDOWN);
  }

  // LED ON pendant la connexion
  digitalWrite(PIN_LED_WIFI,  HIGH);
  digitalWrite(PIN_MOTOR_OUT, LOW);

  // Init tableau canettes
  for (int i = 0; i < MAX_CANS; i++) {
    cans[i].active = false; cans[i].position = 0.0f;
  }

  // Init jus
  for (int i = 0; i < N_JUICES; i++) {
    juiceStock[i] = 0;
    glassMl[i] = 0;
    prevCoilStockAdd[i] = false;
    prevCoilStockSub[i] = false;
    prevCoilPour[i] = false;
  }

  // Lancer Wi-Fi sans bloquer — loop() gérera le reste
  Serial.println("[WiFi] Connexion à " + String(WIFI_SSID) + "...");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

// ─── LOOP ─────────────────────────────────────────────────────────────────
void loop() {
  unsigned long now = millis();
  bool wifiOk = (WiFi.status() == WL_CONNECTED);

  // ══ GESTION WI-FI + LED ═══════════════════════════════════════════════

  if (!wifiOk) {
    // LED allumée en permanence = pas connecté
    digitalWrite(PIN_LED_WIFI, HIGH);

    // Retry toutes les 5 secondes
    if (now - lastWifiRetry >= 5000) {
      lastWifiRetry = now;
      Serial.println("[WiFi] Tentative reconnexion...");
      WiFi.disconnect();
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    }

    return;  // PLC et Modbus suspendus tant que pas de réseau
  }

  // ── Connecté : démarrer Modbus une seule fois ──────────────────────────
  if (!modbusStarted) {
    Serial.println("[WiFi] Connecté — IP : " + WiFi.localIP().toString());
    mb.server();
    // Holding registers : on réserve large pour les 2 systèmes (convoyeur + jus)
    for (int i = 0; i < 80; i++) mb.addHreg(i, 0);
    mb.addCoil(COIL_ADD_CAN,      false);
    mb.addCoil(COIL_RETRIEVE_CAN, false);
    // Coils jus
    for (int i = 0; i < N_JUICES; i++) {
      mb.addCoil(COIL_STOCK_ADD_BASE + i, false);
      mb.addCoil(COIL_STOCK_SUB_BASE + i, false);
      mb.addCoil(COIL_POUR_BASE + i, false);
    }
    mb.addCoil(COIL_RESET_GLASS, false);
    modbusStarted = true;
    Serial.println("[Modbus] Serveur TCP prêt sur le port 502");
  }

  // ── LED clignote à 500ms = connecté ───────────────────────────────────
  if (now - lastLedBlink >= 500) {
    lastLedBlink = now;
    ledState = !ledState;
    digitalWrite(PIN_LED_WIFI, ledState);
  }

  // ══ MODBUS (traitement paquets réseau — le plus souvent possible) ══════
  mb.task();

  // ══ CYCLE PLC 100ms ═══════════════════════════════════════════════════
  if (now - lastPlcTick < UPDATE_MS) return;
  lastPlcTick = now;

  // ── 1. LECTURE CAPTEURS PHYSIQUES ────────────────────────────────────
  if (PIN_USE_PHYSICAL_SENSORS) {
    sensorIn  = digitalRead(PIN_SENSOR_IN)  == HIGH;
    sensorOut = digitalRead(PIN_SENSOR_OUT) == HIGH;
  }

  // ── 2. COMMANDES IHM (front montant coils) ───────────────────────────
  bool coilAdd      = mb.Coil(COIL_ADD_CAN);
  bool coilRetrieve = mb.Coil(COIL_RETRIEVE_CAN);

  if ((coilAdd && !prevCoilAdd) || sensorIn)           { addCan();      sensorIn  = false; }
  if ((coilRetrieve && !prevCoilRetrieve) || sensorOut) { retrieveCan(); sensorOut = false; }

  prevCoilAdd      = coilAdd;
  prevCoilRetrieve = coilRetrieve;

  // ── 2b. COMMANDES JUS (front montant) ─────────────────────────────────
  bool coilReset = mb.Coil(COIL_RESET_GLASS);
  if (coilReset && !prevCoilResetGlass) {
    for (int i = 0; i < N_JUICES; i++) glassMl[i] = 0;
  }
  prevCoilResetGlass = coilReset;

  for (int i = 0; i < N_JUICES; i++) {
    bool cAdd = mb.Coil(COIL_STOCK_ADD_BASE + i);
    bool cSub = mb.Coil(COIL_STOCK_SUB_BASE + i);
    bool cPour = mb.Coil(COIL_POUR_BASE + i);

    if (cAdd && !prevCoilStockAdd[i]) {
      if (juiceStock[i] < MAX_STOCK_PER_JUICE) juiceStock[i]++;
    }
    if (cSub && !prevCoilStockSub[i]) {
      if (juiceStock[i] > 0) juiceStock[i]--;
    }

    // Versement : consomme 1 stock et ajoute POUR_ML si capacité dispo
    if (cPour && !prevCoilPour[i]) {
      uint32_t total = 0;
      for (int k = 0; k < N_JUICES; k++) total += glassMl[k];
      if (juiceStock[i] > 0 && total < (uint32_t)GLASS_CAPACITY_ML) {
        uint16_t addMl = POUR_ML;
        if (total + addMl > (uint32_t)GLASS_CAPACITY_ML) addMl = (uint16_t)(GLASS_CAPACITY_ML - total);
        juiceStock[i]--;
        glassMl[i] = (uint16_t)min((uint32_t)65535, (uint32_t)glassMl[i] + addMl);
      }
    }

    prevCoilStockAdd[i] = cAdd;
    prevCoilStockSub[i] = cSub;
    prevCoilPour[i] = cPour;
  }

  // ── 3. LOGIQUE MOTEUR ────────────────────────────────────────────────
  bool blocked = hasCanAtExit();
  motorRunning = (canCount > 0) && !blocked;
  sensorOut    = blocked;

  digitalWrite(PIN_MOTOR_OUT, motorRunning ? HIGH : LOW);

  // ── 4. MISE À JOUR POSITIONS ─────────────────────────────────────────
  if (motorRunning) {
    for (int i = 0; i < MAX_CANS; i++) {
      if (cans[i].active) {
        cans[i].position += POS_INCREMENT;
        if (cans[i].position > 100.0f) cans[i].position = 100.0f;
      }
    }
  }

  // ── 5. ÉCRITURE HOLDING REGISTERS MODBUS ────────────────────────────
  mb.Hreg(HR_MOTOR,      motorRunning ? 1 : 0);
  mb.Hreg(HR_SENSOR_IN,  sensorIn     ? 1 : 0);
  mb.Hreg(HR_SENSOR_OUT, sensorOut    ? 1 : 0);
  mb.Hreg(HR_CAN_COUNT,  canCount);
  mb.Hreg(HR_TOTAL,      totalOut);

  int slot = 0;
  for (int i = 0; i < MAX_CANS; i++) {
    if (cans[i].active)
      mb.Hreg(HR_POS_BASE + slot++, (uint16_t)cans[i].position);
  }
  for (; slot < MAX_CANS; slot++) mb.Hreg(HR_POS_BASE + slot, 0);

  // Distributeur jus : config + état
  mb.Hreg(HR_JUICE_N, N_JUICES);
  mb.Hreg(HR_GLASS_CAP_ML, GLASS_CAPACITY_ML);
  mb.Hreg(HR_POUR_ML, POUR_ML);

  uint32_t totalGlass = 0;
  for (int i = 0; i < N_JUICES; i++) totalGlass += glassMl[i];
  mb.Hreg(HR_GLASS_TOTAL_ML, (uint16_t)min((uint32_t)65535, totalGlass));

  for (int i = 0; i < N_JUICES; i++) {
    mb.Hreg(HR_STOCK_BASE + i, juiceStock[i]);
    mb.Hreg(HR_GLASS_BASE + i, glassMl[i]);
  }
}
