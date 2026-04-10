# IHM Convoyeur de Canettes — ESP32 / Modbus TCP

Superviseur industriel d'un convoyeur de canettes avec deux modes :

- **Mode Simulation** — logique PLC complète dans le navigateur, aucun matériel requis
- **Mode Réel** — l'ESP32 WROOM exécute la logique PLC, la RPi héberge l'IHM, communication Modbus TCP Wi-Fi avec découverte automatique

---

## Architecture

```
MODE SIMULATION
  Navigateur React ──── PLC local (cycle 40 ms)

MODE RÉEL
  Navigateur ──WebSocket──▶ Node.js (RPi :3002) ──Modbus TCP──▶ ESP32 (port 502)
     React          socket.io        index.js          Slave ID=1
                                         ▲
                                    UDP :5001
                                         │
                               ESP32 annonce son IP
                               au démarrage (auto)
```

---

## Quick Start

### Prérequis

- Node.js ≥ 18
- PlatformIO (pour flasher l'ESP32)

---

### Mode Simulation (sans matériel)

```bash
cd MyHMI
npm install
npm run dev:full
```

Ouvrir **http://localhost:5173** — le mode simulation est actif par défaut.

---

### Mode Réel (RPi + ESP32)

#### 1. Flasher l'ESP32

Ouvrir `firmware/` dans VS Code + PlatformIO et flasher.

Les seuls paramètres à vérifier dans `firmware/src/main.cpp` :

```cpp
const char* WIFI_SSID     = "Hotspot";          // SSID du hotspot RPi
const char* WIFI_PASSWORD = "transformeresp32";  // Mot de passe
```

Après le flash, la LED GPIO 2 clignote = ESP32 connecté et Modbus prêt.

#### 2. Activer le hotspot sur la RPi

```bash
# Créer le hotspot (une seule fois)
nmcli dev wifi hotspot ifname wlan0 ssid "Hotspot" password "transformeresp32"

# Les fois suivantes
nmcli con up Hotspot
```

#### 3. Déployer et démarrer sur la RPi

```bash
cd MyHMI
npm install
npm run build       # Compile le frontend React → dist/
npm start           # Sert le frontend + WebSocket sur le port 3002
```

Le serveur écoute le port UDP 5001. Dès que l'ESP32 se connecte au hotspot, il annonce son IP automatiquement → le serveur se connecte en Modbus TCP sans intervention.

#### 4. Ouvrir l'IHM

Depuis n'importe quel navigateur sur le réseau hotspot :

```
http://<IP_RPi>:3002
```

Cliquer **Mode Réel** — la connexion s'établit automatiquement.

---

## Flux de connexion automatique

```
RPi active hotspot "Hotspot"
       │
ESP32 se connecte au Wi-Fi
       │
ESP32 envoie UDP "ESP32_IP:<ip>" → RPi:5001  (immédiat + toutes les 10 s)
       │
RPi reçoit UDP → connectModbus(<ip>:502)
       │
Modbus établi → socket.io notifie l'IHM → "MODBUS TCP — <ip>"
       │
Poll Modbus 100 ms → HMI temps réel
```

Si la connexion est perdue (coupure réseau, redémarrage) : reconnexion automatique des deux côtés.

---

## Carte Modbus (Slave ID=1, port 502)

### Holding Registers (lecture backend)

| Adresse | Nom        | Description               | Valeurs        |
|---------|------------|---------------------------|----------------|
| HR0     | MOTOR      | État moteur               | 0=STOP / 1=RUN |
| HR1     | SENSOR_IN  | Capteur entrée (I0.0)     | 0 / 1          |
| HR2     | SENSOR_OUT | Capteur sortie (I0.1)     | 0 / 1          |
| HR3     | CAN_COUNT  | Canettes sur le tapis     | 0–10           |
| HR4     | TOTAL      | Total canettes traitées   | 0–65535        |
| HR5–14  | POS_CAN_x  | Positions canettes (0–9)  | 0–100 %        |

### Coils (écriture backend — pulse 300 ms)

| Adresse | Nom               | Description           |
|---------|-------------------|-----------------------|
| C0      | COIL_ADD_CAN      | Ajouter une canette   |
| C1      | COIL_RETRIEVE_CAN | Récupérer une canette |

---

## Structure du projet

```
MyHMI/
├── firmware/              # Code embarqué ESP32 (PlatformIO)
│   ├── platformio.ini
│   └── src/
│       └── main.cpp       # PLC + Modbus TCP slave + annonce UDP
├── server/                # Backend Node.js
│   └── index.js           # Gateway WebSocket ↔ Modbus TCP + découverte UDP
│                          # + serveur statique (dist/) en production
├── src/                   # Frontend React
│   ├── App.jsx            # IHM principale (simulation + mode réel)
│   ├── App.css
│   ├── main.jsx
│   └── index.css
├── index.html
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── eslint.config.js
└── package.json
```

---

## Logique convoyeur (ESP32 — cycle 100 ms)

| Condition                            | Moteur | Canettes        |
|--------------------------------------|--------|-----------------|
| Tapis vide                           | STOP   | —               |
| Canettes présentes, sortie libre     | RUN    | avancent        |
| Canette à 100 % (fin de course)      | STOP   | figées          |
| Opérateur récupère via IHM           | RUN    | reprennent      |
| Tapis plein (10 canettes)            | RUN    | bouton désactivé |

Incrément position : **2 %/cycle** → traversée complète en **5 s**.

---

## GPIO ESP32

| Pin | Rôle                        | Config              |
|-----|-----------------------------|---------------------|
| 2   | LED statut Wi-Fi            | OUTPUT (built-in)   |
| 4   | Contacteur moteur           | OUTPUT              |
| 34  | Capteur inductif entrée     | INPUT (si physique) |
| 35  | Capteur inductif sortie     | INPUT (si physique) |

Mettre `PIN_USE_PHYSICAL_SENSORS = true` dans `firmware/src/main.cpp` pour activer les capteurs réels.
