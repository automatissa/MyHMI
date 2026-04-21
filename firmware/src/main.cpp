#include <Arduino.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <ModbusIP_ESP8266.h>  // lib: emelianov/modbus-esp8266

// ─── CONFIGURATION RÉSEAU ──────────────────────────────────────────────────
const char* WIFI_SSID     = "Hotspot";
const char* WIFI_PASSWORD = "transformeresp32";

// Port UDP où le serveur RPi écoute les annonces ESP32
const uint16_t UDP_ANNOUNCE_PORT = 5001;

// ─── PINS GPIO ─────────────────────────────────────────────────────────────
const bool PIN_USE_PHYSICAL_SENSORS = false;  // true = capteurs réels en usine

const int PIN_LED_WIFI   = 2;    // LED built-in — indicateur statut Wi-Fi
const int PIN_SENSOR_IN  = 34;   // Entrée — capteur inductif entrée convoyeur
const int PIN_SENSOR_OUT = 35;   // Entrée — capteur inductif sortie convoyeur
const int PIN_MOTOR_OUT  = 4;    // Sortie — contacteur moteur
const int PIN_LAMP       = 15;   // Sortie — lampe
//  ⚠ GPIO 2 réservé à la LED Wi-Fi. En usine, moteur sur GPIO 4.

// ─── MODBUS HOLDING REGISTERS ─────────────────────────────────────────────
//  HR0  → Motor state        (0=STOP, 1=RUN)
//  HR1  → Capteur entrée     (0/1)
//  HR2  → Capteur sortie     (0/1)
//  HR3  → Nb canettes tapis  (0–10)
//  HR4  → Total traité
//  HR5–HR14 → Positions canettes 0–9 (0–100 %)
//  HR15     → État lampe (0/1)
const int HR_MOTOR      = 0;
const int HR_SENSOR_IN  = 1;
const int HR_SENSOR_OUT = 2;
const int HR_CAN_COUNT  = 3;
const int HR_TOTAL      = 4;
const int HR_POS_BASE   = 5; // jusqu'à 14 inclus
const int HR_LAMP       = 15;

// ─── MODBUS COILS (commandes HMI) ─────────────────────────────────────────
//  C0 → Ajouter canette   (pulse depuis IHM)
//  C1 → Récupérer canette (pulse depuis IHM)
//  C2 → Commande lampe    (état direct depuis IHM)
const int COIL_ADD_CAN      = 0;
const int COIL_RETRIEVE_CAN = 1;
const int COIL_LAMP         = 2;

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

// ─── TIMERS (millis — non bloquants) ──────────────────────────────────────
unsigned long lastPlcTick   = 0;   // cycle PLC 100ms
unsigned long lastWifiRetry = 0;   // retry Wi-Fi 5000ms
unsigned long lastLedBlink  = 0;   // clignotement LED 500ms
unsigned long lastAnnounce  = 0;   // ré-annonce UDP 10s
bool          ledState      = false;
bool          modbusStarted = false;

ModbusIP mb;
WiFiUDP  udp;

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

// ─── ANNONCE UDP : envoie "ESP32_IP:<ip>" au serveur RPi ──────────────────
void announceIP() {
  String msg      = "ESP32_IP:" + WiFi.localIP().toString();
  IPAddress gateway = WiFi.gatewayIP();

  udp.beginPacket(gateway, UDP_ANNOUNCE_PORT);
  udp.print(msg);
  udp.endPacket();

  udp.beginPacket(IPAddress(255, 255, 255, 255), UDP_ANNOUNCE_PORT);
  udp.print(msg);
  udp.endPacket();

  Serial.println("[UDP] Annonce : " + msg + " → " + gateway.toString());
}

// ─── SETUP ────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);

  pinMode(PIN_LED_WIFI,  OUTPUT);
  pinMode(PIN_MOTOR_OUT, OUTPUT);
  pinMode(PIN_LAMP,      OUTPUT);
  if (PIN_USE_PHYSICAL_SENSORS) {
    pinMode(PIN_SENSOR_IN,  INPUT_PULLDOWN);
    pinMode(PIN_SENSOR_OUT, INPUT_PULLDOWN);
  }

  digitalWrite(PIN_LED_WIFI,  HIGH);
  digitalWrite(PIN_MOTOR_OUT, LOW);
  digitalWrite(PIN_LAMP,      LOW);

  for (int i = 0; i < MAX_CANS; i++) {
    cans[i].active = false; cans[i].position = 0.0f;
  }

  Serial.println("[WiFi] Connexion à " + String(WIFI_SSID) + "...");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

// ─── LOOP ─────────────────────────────────────────────────────────────────
void loop() {
  unsigned long now   = millis();
  bool          wifiOk = (WiFi.status() == WL_CONNECTED);

  // ══ GESTION WI-FI + LED ═══════════════════════════════════════════════

  if (!wifiOk) {
    digitalWrite(PIN_LED_WIFI, HIGH);
    modbusStarted = false;

    if (now - lastWifiRetry >= 5000) {
      lastWifiRetry = now;
      Serial.println("[WiFi] Tentative reconnexion...");
      WiFi.disconnect();
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    }

    return;
  }

  // ── Connecté : démarrer Modbus une seule fois ──────────────────────────
  if (!modbusStarted) {
    Serial.println("[WiFi] Connecté — IP : " + WiFi.localIP().toString());
    mb.server();
    for (int i = 0; i < HR_POS_BASE + MAX_CANS; i++) mb.addHreg(i, 0);
    mb.addHreg(HR_LAMP, 0);
    mb.addCoil(COIL_ADD_CAN,      false);
    mb.addCoil(COIL_RETRIEVE_CAN, false);
    mb.addCoil(COIL_LAMP,         false);
    modbusStarted = true;
    Serial.println("[Modbus] Serveur TCP prêt sur le port 502");

    udp.begin(0);
    announceIP();
    lastAnnounce = now;
  }

  // ── Ré-annonce UDP toutes les 10 s ────────────────────────────────────
  if (now - lastAnnounce >= 10000) {
    lastAnnounce = now;
    announceIP();
  }

  // ── LED clignote à 500ms = connecté ───────────────────────────────────
  if (now - lastLedBlink >= 500) {
    lastLedBlink = now;
    ledState = !ledState;
    digitalWrite(PIN_LED_WIFI, ledState);
  }

  // ══ MODBUS ════════════════════════════════════════════════════════════
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
  bool coilLamp     = mb.Coil(COIL_LAMP);

  digitalWrite(PIN_LAMP, coilLamp ? HIGH : LOW);

  if ((coilAdd && !prevCoilAdd) || sensorIn)            { addCan();      sensorIn  = false; }
  if ((coilRetrieve && !prevCoilRetrieve) || sensorOut)  { retrieveCan(); sensorOut = false; }

  prevCoilAdd      = coilAdd;
  prevCoilRetrieve = coilRetrieve;

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
  mb.Hreg(HR_LAMP,       coilLamp ? 1 : 0);

  int slot = 0;
  for (int i = 0; i < MAX_CANS; i++) {
    if (cans[i].active)
      mb.Hreg(HR_POS_BASE + slot++, (uint16_t)cans[i].position);
  }
  for (; slot < MAX_CANS; slot++) mb.Hreg(HR_POS_BASE + slot, 0);
}
