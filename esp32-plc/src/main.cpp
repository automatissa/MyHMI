#include <Arduino.h>
#include <WiFi.h>
#include <ModbusIP_ESP8266.h>

const char* ssid = "VOTRE_WIFI_RPi";
const char* password = "VOTRE_MOT_DE_PASSE";

ModbusIP mb;

// Modbus Registers
const int MOTOR_REG = 0;
const int SENSOR_IN_REG = 1;
const int SENSOR_OUT_REG = 2;
const int CANS_COUNT_REG = 3;
const int TOTAL_OUT_REG = 4;

// Modbus Coils (from HMI logic)
const int SIMULATE_IN_COIL = 1;
const int SIMULATE_OUT_COIL = 2;

// Variables PLC
bool motorRunning = false;
int cansCount = 0;
int totalOut = 0;
unsigned long lastTick = 0;
const unsigned long UPDATE_MS = 100;

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("WiFi connected");
  Serial.println("IP address: ");
  Serial.println(WiFi.localIP());

  // Init Modbus server
  mb.server();
  
  // Setup registers (Holding)
  mb.addHreg(MOTOR_REG, 0);
  mb.addHreg(SENSOR_IN_REG, 0);
  mb.addHreg(SENSOR_OUT_REG, 0);
  mb.addHreg(CANS_COUNT_REG, 0);
  mb.addHreg(TOTAL_OUT_REG, 0);

  // Setup coils
  mb.addCoil(SIMULATE_IN_COIL, false);
  mb.addCoil(SIMULATE_OUT_COIL, false);
}

void loop() {
  // Call once inside loop()
  mb.task();

  unsigned long currentMillis = millis();
  if (currentMillis - lastTick >= UPDATE_MS) {
    lastTick = currentMillis;

    // Simulation capteur via IHM (Coils 1 & 2)
    bool btnIn = mb.Coil(SIMULATE_IN_COIL);
    bool btnOut = mb.Coil(SIMULATE_OUT_COIL);

    // TODO: Implémenter la logique interne du convoyeur (comme en JS)
    // Ici on simulerait le mouvement physique ou on lirait de VRAIS capteurs
    // sur les broches GPIO si applicable.
    
    // Write state back to Modbus
    mb.Hreg(MOTOR_REG, motorRunning ? 1 : 0);
    mb.Hreg(CANS_COUNT_REG, cansCount);
    mb.Hreg(TOTAL_OUT_REG, totalOut);
  }
}

