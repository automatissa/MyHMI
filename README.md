# IHM Convoyeur de Canettes — ESP32 / Modbus TCP

Simulateur industriel d'un convoyeur de canettes avec deux modes de fonctionnement :
- **Mode Simulation** : logique PLC complète dans le navigateur (démo sans matériel)
- **Mode Réel** : l'ESP32 WROOM exécute la logique PLC, la RPi héberge l'IHM, communication via Modbus TCP Wi-Fi

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  MODE SIMULATION (PC de dev)                            │
│                                                         │
│   Navigateur React ──── Logique PLC locale (40ms)       │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  MODE RÉEL                                              │
│                                                         │
│  Navigateur ──WebSocket──▶ Node.js (RPi) ──Modbus TCP──▶ ESP32 WROOM │
│   (React)       :3001      server.js        port 502    │  (Slave ID=1) │
└─────────────────────────────────────────────────────────┘
```

---

## Carte Modbus — ESP32 (Slave ID=1, port 502)

### Holding Registers — lecture par le backend Node.js

| Adresse | Nom         | Description                      | Valeurs     |
|---------|-------------|----------------------------------|-------------|
| HR0     | MOTOR       | État moteur                      | 0=STOP / 1=RUN |
| HR1     | SENSOR_IN   | Capteur entrée (I0.0)            | 0 / 1       |
| HR2     | SENSOR_OUT  | Capteur sortie (I0.1)            | 0 / 1       |
| HR3     | CAN_COUNT   | Nb canettes sur le tapis         | 0–10        |
| HR4     | TOTAL       | Total canettes traitées          | 0–65535     |
| HR5     | POS_CAN_0   | Position canette 0               | 0–100 %     |
| HR6     | POS_CAN_1   | Position canette 1               | 0–100 %     |
| …       | …           | …                                | …           |
| HR14    | POS_CAN_9   | Position canette 9               | 0–100 %     |

### Coils — écriture par le backend Node.js (pulse 100ms)

| Adresse | Nom              | Description            |
|---------|------------------|------------------------|
| C0      | COIL_ADD_CAN     | Ajouter une canette    |
| C1      | COIL_RETRIEVE_CAN| Récupérer une canette  |

---

## Structure du projet

```
MyHMI/
├── server.js              # Backend Node.js — pont WebSocket ↔ Modbus TCP
├── index.html             # Point d'entrée HTML (Tailwind via CDN)
├── vite.config.js         # Vite + proxy WebSocket /ws → :3001
├── package.json
│
├── src/
│   ├── App.jsx            # IHM React — simulation + mode réel WebSocket
│   ├── main.jsx
│   └── index.css
│
├── esp32-plc/
│   ├── platformio.ini     # PlatformIO — board esp32dev
│   └── src/
│       └── main.cpp       # Firmware ESP32 — PLC + Modbus TCP slave
│
└── backend/               # Ancienne version (socket.io — non utilisée)
    └── server.js
```

---

## Démarrage rapide

### Prérequis
- Node.js ≥ 18
- npm

### 1. Installer les dépendances

```bash
cd MyHMI
npm install --ignore-scripts
```

> `--ignore-scripts` est nécessaire pour ignorer la compilation native de `modbus-serial`
> (les bindings série ne sont pas requis pour Modbus TCP).

### 2. Lancer en mode développement complet

```bash
# Sous PowerShell (Node.js doit être dans le PATH)
$env:PATH = "C:\Program Files\nodejs;$env:PATH"
npm run dev:full
```

Cela démarre en parallèle :
- **Vite** → http://localhost:5173 (IHM React)
- **Backend Node.js** → ws://localhost:3001 (pont Modbus)

> Pour ajouter Node.js au PATH de façon permanente, redémarre PowerShell après :
> ```powershell
> # (déjà exécuté — relancer PowerShell suffit)
> ```

### 3. Utiliser le Mode Réel

1. Flasher l'ESP32 avec le firmware PlatformIO (`esp32-plc/`)
2. Configurer le Wi-Fi dans `main.cpp` (`WIFI_SSID` / `WIFI_PASSWORD`)
3. Cliquer **"Mode Réel"** dans l'IHM
4. Saisir l'IP de l'ESP32 (visible dans le moniteur série)
5. Cliquer **Connecter**

---

## Firmware ESP32 (PlatformIO)

### Configuration `platformio.ini`

```ini
[env:esp32dev]
platform  = espressif32
board     = esp32dev
framework = arduino
lib_deps  = emelianov/modbus-esp8266@^4.1.0
```

### Variables importantes `main.cpp`

```cpp
const char* WIFI_SSID     = "VOTRE_WIFI_RPi";
const char* WIFI_PASSWORD = "VOTRE_MOT_DE_PASSE";

// Mettre true pour lire les capteurs physiques GPIO en usine
const bool PIN_USE_PHYSICAL_SENSORS = false;

const int PIN_SENSOR_IN  = 34;   // Capteur inductif entrée
const int PIN_SENSOR_OUT = 35;   // Capteur inductif sortie
const int PIN_MOTOR_OUT  = 2;    // LED / contacteur moteur
```

### Logique PLC embarquée (100ms / 10Hz)

- Moteur actif si canettes présentes **ET** aucun blocage en sortie
- Incrément position : **2 %/cycle** (100 % en 5 s)
- Coil IHM OU capteur physique déclenche ajout/récupération
- Toutes les positions écrites en Holding Registers HR5–HR14

---

## Déploiement sur Raspberry Pi

```bash
# Sur la RPi
git clone <repo>
cd MyHMI
npm install --ignore-scripts
npm run build          # Génère dist/

# Servir le build + backend en production
node server.js         # Backend WebSocket + Modbus sur :3001
# + serveur statique (nginx ou express) pour dist/
```

Le frontend se connecte automatiquement à `ws://<hostname>:3001`,
donc l'IHM fonctionne sur n'importe quelle IP sans modification.

---

## Logique convoyeur

| Condition                              | Moteur | Canettes |
|----------------------------------------|--------|----------|
| Tapis vide                             | STOP   | —        |
| Canettes présentes, aucune en sortie   | RUN    | avancent |
| Canette atteint 100 % (fin de course)  | STOP   | figées   |
| Opérateur récupère la canette          | RUN    | reprennent |
| Tapis plein (10 canettes)              | RUN    | bouton désactivé |

---

## Dépendances

| Package         | Usage                              |
|-----------------|------------------------------------|
| `react`         | Framework UI                       |
| `react-dom`     | Rendu DOM                          |
| `lucide-react`  | Icônes                             |
| `ws`            | WebSocket server (backend Node.js) |
| `modbus-serial` | Client Modbus TCP (backend)        |
| `concurrently`  | Lancer Vite + Node.js en parallèle |
