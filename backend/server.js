const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const ModbusRTU = require('modbus-serial');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const client = new ModbusRTU();
let isConnected = false;
const ESP32_IP = '192.168.1.100'; // Modifier l'IP selon la config du routeur RPi
const ESP32_PORT = 502; // Port Modbus TCP standard

// Fonction pour se connecter au Modbus ESP32
const connectToModbus = () => {
  client.connectTCP(ESP32_IP, { port: ESP32_PORT })
    .then(() => {
      client.setID(1); // ID d'esclave Modbus
      isConnected = true;
      console.log('Connecté au Modbus TCP (ESP32) sur ' + ESP32_IP);
      io.emit('modbus_status', { connected: true });
    })
    .catch((e) => {
      isConnected = false;
      console.log('Erreur de connexion Modbus, nouvelle tentative dans 5s...');
      io.emit('modbus_status', { connected: false });
      setTimeout(connectToModbus, 5000);
    });
};

connectToModbus();

// Boucle de lecture Modbus toutes les 500ms
setInterval(async () => {
  if (isConnected) {
    try {
      // Lecture de 10 registres à partir de 0 (exemple d'adresse)
      // Mappage : 
      // 0: Etat moteur (0 ou 1)
      // 1: Capteur Entrée (0 ou 1)
      // 2: Capteur Sortie (0 ou 1)
      // 3: Nombre de canettes sur le tapis
      // 4: Total sorti
      const data = await client.readHoldingRegisters(0, 5);
      
      io.emit('modbus_data', {
        motorRunning: data.data[0] === 1,
        sensorEntry: data.data[1] === 1,
        sensorExit: data.data[2] === 1,
        cansCount: data.data[3],
        cansOut: data.data[4]
      });
    } catch (e) {
      console.log('Erreur lecture Modbus:', e.message);
      client.close();
      isConnected = false;
      setTimeout(connectToModbus, 1000);
    }
  }
}, 500);

// Ecoute des commandes depuis l'IHM
io.on('connection', (socket) => {
  console.log('Nouvelle connexion IHM');
  socket.emit('modbus_status', { connected: isConnected });

  socket.on('simulate_entry', async () => {
    if (isConnected) {
      console.log('Envoi commande: Ajouter Canette (Capteur Entrée)');
      try {
        await client.writeCoil(1, true); // Ex : Coil 1 = déclenchement capteur entrée
        setTimeout(() => client.writeCoil(1, false), 500); // Impulsion
      } catch(e) { console.error('Erreur writeCoil entry', e) }
    }
  });

  socket.on('simulate_exit', async () => {
    if (isConnected) {
      console.log('Envoi commande: Récupérer Canette (Capteur Sortie)');
      try {
        await client.writeCoil(2, true); // Ex : Coil 2 = déclenchement capteur sortie
        setTimeout(() => client.writeCoil(2, false), 500); // Impulsion
      } catch(e) { console.error('Erreur writeCoil exit', e) }
    }
  });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`Serveur Gateway RPi démarré sur le port ${PORT}`);
});

