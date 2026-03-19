#include <Arduino.h>
#include <WiFi.h>
#include <ModbusIP_ESP8266.h>  // lib: emelianov/modbus-esp8266

// ─── CONFIGURATION RÉSEAU ──────────────────────────────────────────────────
const char* WIFI_SSID     = "VOTRE_WIFI_RPi";
const char* WIFI_PASSWORD = "VOTRE_MOT_DE_PASSE";

// ─── PINS GPIO (stubs — à câbler en usine) ────────────────────────────────
// Mettre PIN_USE_PHYSICAL_SENSORS = true pour lire les vrais capteurs
const bool PIN_USE_PHYSICAL_SENSORS = false;

const int PIN_SENSOR_IN  = 34;   // Entrée digitale — capteur inductif entrée
const int PIN_SENSOR_OUT = 35;   // Entrée digitale — capteur inductif sortie
const int PIN_MOTOR_OUT  = 2;    // Sortie digitale — contacteur moteur (LED built-in)

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
const int HR_POS_BASE   = 5;   // HR5 à HR14

// ─── MODBUS COILS (commandes HMI) ─────────────────────────────────────────
//  C0 → Ajouter canette    (pulse depuis IHM)
//  C1 → Récupérer canette  (pulse depuis IHM)
const int COIL_ADD_CAN      = 0;
const int COIL_RETRIEVE_CAN = 1;

// ─── CONSTANTES PLC ───────────────────────────────────────────────────────
const int   MAX_CANS        = 10;
const int   TRAVEL_TIME_MS  = 5000;   // 5 s pour traverser le tapis
const int   UPDATE_MS       = 100;    // Cycle scan ESP32 = 100ms (10 Hz)
// Incrément de position par cycle : 100 % / (5000ms / 100ms) = 2 %/cycle
const float POS_INCREMENT   = 100.0f / (TRAVEL_TIME_MS / UPDATE_MS);

// ─── ÉTAT PLC ─────────────────────────────────────────────────────────────
struct Can {
  bool  active;
  float position;  // 0.0 à 100.0 %
};

Can       cans[MAX_CANS];
int       canCount     = 0;
int       totalOut     = 0;
bool      motorRunning = false;
bool      sensorIn     = false;
bool      sensorOut    = false;

// Anti-rebond coils HMI
bool      prevCoilAdd      = false;
bool      prevCoilRetrieve = false;

unsigned long lastTick = 0;

ModbusIP mb;

// ─── HELPERS ──────────────────────────────────────────────────────────────

// Ajoute une canette en position 0 si place disponible
bool addCan() {
  if (canCount >= MAX_CANS) return false;
  for (int i = 0; i < MAX_CANS; i++) {
    if (!cans[i].active) {
      cans[i].active   = true;
      cans[i].position = 0.0f;
      canCount++;
      return true;
    }
  }
  return false;
}

// Retire la canette en fin de course (position >= 100 %)
bool retrieveCan() {
  for (int i = 0; i < MAX_CANS; i++) {
    if (cans[i].active && cans[i].position >= 100.0f) {
      cans[i].active   = false;
      cans[i].position = 0.0f;
      canCount--;
      totalOut++;
      return true;
    }
  }
  return false;
}

bool hasCanAtExit() {
  for (int i = 0; i < MAX_CANS; i++) {
    if (cans[i].active && cans[i].position >= 100.0f) return true;
  }
  return false;
}

// ─── SETUP ────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);

  // GPIO
  if (PIN_USE_PHYSICAL_SENSORS) {
    pinMode(PIN_SENSOR_IN,  INPUT_PULLDOWN);
    pinMode(PIN_SENSOR_OUT, INPUT_PULLDOWN);
  }
  pinMode(PIN_MOTOR_OUT, OUTPUT);
  digitalWrite(PIN_MOTOR_OUT, LOW);

  // Init tableau canettes
  for (int i = 0; i < MAX_CANS; i++) {
    cans[i].active   = false;
    cans[i].position = 0.0f;
  }

  // Wi-Fi
  Serial.print("Connexion Wi-Fi");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWi-Fi OK — IP : " + WiFi.localIP().toString());

  // Serveur Modbus TCP
  mb.server();

  // Déclaration Holding Registers HR0–HR14
  for (int i = 0; i < HR_POS_BASE + MAX_CANS; i++) {
    mb.addHreg(i, 0);
  }

  // Déclaration Coils C0–C1
  mb.addCoil(COIL_ADD_CAN,      false);
  mb.addCoil(COIL_RETRIEVE_CAN, false);

  Serial.println("Modbus TCP prêt sur le port 502");
}

// ─── LOOP ─────────────────────────────────────────────────────────────────
void loop() {
  mb.task();   // Traitement requêtes Modbus (à appeler le plus souvent possible)

  unsigned long now = millis();
  if (now - lastTick < UPDATE_MS) return;
  lastTick = now;

  // ── 1. LECTURE CAPTEURS ───────────────────────────────────────────────
  if (PIN_USE_PHYSICAL_SENSORS) {
    // Capteur physique : actif = niveau HAUT
    sensorIn  = digitalRead(PIN_SENSOR_IN)  == HIGH;
    sensorOut = digitalRead(PIN_SENSOR_OUT) == HIGH;
  }

  // ── 2. COMMANDES IHM (détection front montant coil) ───────────────────
  bool coilAdd      = mb.Coil(COIL_ADD_CAN);
  bool coilRetrieve = mb.Coil(COIL_RETRIEVE_CAN);

  // Front montant → Ajouter canette (IHM OU capteur physique entrée)
  if ((coilAdd && !prevCoilAdd) || sensorIn) {
    if (addCan()) {
      sensorIn = false;   // acquittement capteur simulé
    }
  }

  // Front montant → Récupérer canette (IHM OU capteur physique sortie)
  if ((coilRetrieve && !prevCoilRetrieve) || sensorOut) {
    if (retrieveCan()) {
      sensorOut = false;
    }
  }

  prevCoilAdd      = coilAdd;
  prevCoilRetrieve = coilRetrieve;

  // ── 3. LOGIQUE MOTEUR ─────────────────────────────────────────────────
  // Moteur tourne si : canettes présentes ET aucune canette en fin de course
  bool blocked = hasCanAtExit();
  motorRunning = (canCount > 0) && !blocked;
  sensorOut    = blocked;   // le capteur sortie reflète le blocage

  digitalWrite(PIN_MOTOR_OUT, motorRunning ? HIGH : LOW);

  // ── 4. MISE À JOUR POSITIONS ──────────────────────────────────────────
  if (motorRunning) {
    for (int i = 0; i < MAX_CANS; i++) {
      if (cans[i].active) {
        cans[i].position += POS_INCREMENT;
        if (cans[i].position > 100.0f) cans[i].position = 100.0f;
      }
    }
  }

  // ── 5. ÉCRITURE HOLDING REGISTERS MODBUS ─────────────────────────────
  mb.Hreg(HR_MOTOR,      motorRunning ? 1 : 0);
  mb.Hreg(HR_SENSOR_IN,  sensorIn     ? 1 : 0);
  mb.Hreg(HR_SENSOR_OUT, sensorOut    ? 1 : 0);
  mb.Hreg(HR_CAN_COUNT,  canCount);
  mb.Hreg(HR_TOTAL,      totalOut);

  // Positions canettes — slot vide = 0
  int slot = 0;
  for (int i = 0; i < MAX_CANS; i++) {
    if (cans[i].active) {
      mb.Hreg(HR_POS_BASE + slot, (uint16_t)cans[i].position);
      slot++;
    }
  }
  // Remplir les slots vides avec 0
  for (; slot < MAX_CANS; slot++) {
    mb.Hreg(HR_POS_BASE + slot, 0);
  }
}
