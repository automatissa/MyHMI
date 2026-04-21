# MyHMI — IHM Industrie 4.0

Superviseur industriel multi-modules sur ESP32 / Modbus TCP.  
Interface en **sidebar gauche** — navigation webapp classique.

| Module             | Simulation | Mode réel (ESP32) |
|--------------------|:----------:|:-----------------:|
| Convoyeur canettes | ✅         | ✅                |
| Lampe              | ✅         | ✅                |
| Distributeur jus   | ✅         | —                 |
| Trieuse caisses    | ✅         | —                 |
| Emballage canettes | ✅         | —                 |

---

## Architecture

```
MODE SIMULATION
  Navigateur React ──── PLC local (cycle 10 ms, 100 Hz)

MODE RÉEL
  Navigateur ──Socket.IO──▶ Node.js (:3002) ──Modbus TCP──▶ ESP32 (:502)
                                  ▲
                             UDP :5001
                                  │
                        ESP32 annonce son IP au démarrage
```

### Navigation

Sidebar fixe à gauche (icônes seules sur mobile, icônes + labels sur desktop).  
Chaque module indique son mode : `RÉEL+SIM` ou `SIM`.

---

## Temps de cycle

| Couche | Cycle | Fréquence | Temps réel ? |
|---|---|---|---|
| ESP32 firmware (`loop`) | 100 ms | 10 Hz | ✅ Oui — bare metal, gigue < ms |
| Node.js poll Modbus | 100 ms | 10 Hz | ⚠️ Soft — dépend de l'OS |
| React simulation (navigateur) | 10 ms | 100 Hz | ❌ Non — `setInterval` best-effort |

> **Note temps réel** : un navigateur web tourne sur un OS non-temps-réel. `setInterval(fn, 10)` est une demande, pas une garantie — le scheduler OS peut retarder le tick de 2 à 20 ms selon la charge. Pour la **simulation visuelle** c'est largement suffisant. Pour du **vrai contrôle industriel**, seul l'ESP32 (bare metal) est temps réel dans ce projet.
>
> Sur Raspberry Pi, en cas de lag visible, passer à 20 ms (`SCAN_RATE_MS = 20`) est un bon compromis.

---

## Commandes

```bash
make dev      # Développement  — Vite :5173 + Node :3002
make build    # Production     — compile React → dist/
make start    # Production     — compile + démarre le serveur (:3002)
make flash    # ESP32          — compile firmware + flash + moniteur série
make monitor  # ESP32          — moniteur série seul (sans reflasher)
make clean    # Nettoyage      — dist/, cache Vite, artefacts firmware
```

> **Prérequis** : Node.js ≥ 18, PlatformIO (`pio` dans le PATH)

---

## Mode Simulation (sans matériel)

```bash
make dev
```

Ouvrir **http://localhost:5173** — tous les modules fonctionnent sans ESP32.

---

## Mode Réel (RPi + ESP32)

### 1. Flasher l'ESP32

Vérifier les identifiants Wi-Fi dans `firmware/src/main.cpp` :

```cpp
const char* WIFI_SSID     = "Hotspot";
const char* WIFI_PASSWORD = "transformeresp32";
```

Puis flasher :

```bash
make flash
```

La LED GPIO 2 clignote = ESP32 connecté et Modbus prêt.

### 2. Hotspot RPi

```bash
nmcli con up Hotspot   # démarre le hotspot "Hotspot"
```

Pour créer le hotspot la première fois :

```bash
nmcli dev wifi hotspot ifname wlan0 ssid "Hotspot" password "transformeresp32"
```

### 3. Déployer sur la RPi

```bash
make start   # compile React + lance le serveur sur :3002
```

### 4. Ouvrir l'IHM

```
http://<IP_RPi>:3002
```

Sur la page **Convoyeur** ou **Lampe**, cliquer **Mode Réel** — la connexion s'établit automatiquement via UDP.

---

## Connexion automatique

```
ESP32 boot → Wi-Fi → envoie "ESP32_IP:<ip>" UDP → RPi:5001
RPi reçoit → connectModbus(<ip>:502)
Modbus OK  → Socket.IO notifie l'IHM → "MODBUS TCP — <ip>"
Poll 100 ms → données temps réel
```

Si l'UDP est bloqué par le pare-feu : entrer l'IP manuellement dans l'IHM.

---

## Module Emballage Canettes (simulation)

Cellule robotisée d'emballage automatique :

- Convoyeur principal alimente des canettes en continu
- Un **système de vision** détecte le type de pack (6 ou 12 canettes)
- Quand 3 canettes atteignent la sortie, un **bras robotique** les saisit avec des ventouses
- Le bras dépose les canettes dans le pack (rangées de 3) et revient chercher le lot suivant
- Une fois le pack complet, il est évacué sur un **convoyeur de sortie**
- Pendant le dépôt, 3 nouvelles canettes s'acheminent simultanément

| Phase          | Description                                      |
|----------------|--------------------------------------------------|
| `scanning`     | Vision système — détection 6-pack ou 12-pack     |
| `conveying`    | Attente de 3 canettes en bout de convoyeur       |
| `pickup`       | Bras descend, ventouses saisissent les 3 canettes|
| `to_pack`      | Bras se déplace vers la zone pack                |
| `placing`      | Dépôt dans le pack + chargement 3 suivantes      |
| `to_home`      | Retour position initiale                         |
| `pack_exit`    | Pack complet évacué sur convoyeur de sortie      |

---

## Carte Modbus (Slave ID=1, port 502)

| Registre | Nom          | Description                  | Valeurs        |
|----------|--------------|------------------------------|----------------|
| HR0      | MOTOR        | État moteur                  | 0=STOP / 1=RUN |
| HR1      | SENSOR_IN    | Capteur entrée               | 0 / 1          |
| HR2      | SENSOR_OUT   | Capteur sortie               | 0 / 1          |
| HR3      | CAN_COUNT    | Canettes sur le tapis        | 0–10           |
| HR4      | TOTAL        | Total canettes traitées      | 0–65535        |
| HR5–14   | POS_CAN_x    | Positions canettes 0–9       | 0–100 %        |
| HR15     | LAMP         | État lampe                   | 0 / 1          |
| C0       | ADD_CAN      | Ajouter canette (pulse 300ms)   | —           |
| C1       | RETRIEVE_CAN | Récupérer canette (pulse 300ms) | —           |
| C2       | LAMP         | Commande lampe (état direct)    | 0 / 1       |

---

## GPIO ESP32

| Pin | Rôle                    |
|-----|-------------------------|
| 2   | LED statut Wi-Fi        |
| 4   | Contacteur moteur       |
| 15  | Lampe                   |
| 34  | Capteur entrée (option) |
| 35  | Capteur sortie (option) |

`PIN_USE_PHYSICAL_SENSORS = true` dans `firmware/src/main.cpp` pour activer les capteurs physiques.

---

## Physique simulation

Tous les convoyeurs appliquent une contrainte de gap minimum (`MIN_GAP`) entre éléments :
- Traitement **leader → suiveur** à chaque cycle pour éviter l'empilement visuel
- Injection bloquée si la zone d'entrée est déjà occupée
- Sur la Trieuse : gap indépendant par piste (tapis principal / sortie haut / sortie droite)

---

## Structure du projet

```
MyHMI/
├── firmware/                        # ESP32 — PlatformIO
│   ├── platformio.ini
│   └── src/main.cpp                 # Convoyeur + lampe, Modbus TCP, UDP
├── server/
│   └── index.js                     # Socket.IO ↔ Modbus TCP + UDP discovery
├── src/
│   ├── App.jsx                      # Sidebar gauche + routing
│   ├── convoyeur/ConvoyeurCanettes.jsx            # Réel + simulation
│   ├── lampe/Lampe.jsx                            # Réel + simulation
│   ├── distributeur_jus/DistributeurJus.jsx       # Simulation
│   ├── trieuse_caisse/TrieuseCaisse.jsx           # Simulation
│   └── emballage_canettes/EmballageCanettes.jsx   # Simulation
├── Makefile
└── package.json
```
