const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Modbus = require('modbus-tcp');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Initialisation du client Modbus TCP
const client = new Modbus.Client();
let isConnected = false;
const ESP32_IP = '192.168.1.100'; 
const ESP32_PORT = 502;

const connectToModbus = () => {
  console.log(`Tentative de connexion à ${ESP32_IP}...`);
  client.connect(ESP32_PORT, ESP32_IP);
};

// Gestionnaires d'événements de connexion
client.on('connect', () => {
  isConnected = true;
  console.log('Connecté au Modbus TCP (ESP32)');
  io.emit('modbus_status', { connected: true });
});

client.on('error', (err) => {
  isConnected = false;
  console.log('Erreur Modbus:', err.message);
  io.emit('modbus_status', { connected: false });
});

client.on('close', () => {
  isConnected = false;
  console.log('Connexion fermée, tentative de reconnexion dans 5s...');
  setTimeout(connectToModbus, 5000);
});

// Lancement de la première connexion
connectToModbus();

// Boucle de lecture (Polling)
setInterval(() => {
  if (isConnected) {
    // Lecture de 5 registres (Holding Registers) à l'adresse 0
    // Syntaxe : readHoldingRegisters(unitID, address, count, callback)
    client.readHoldingRegisters(1, 0, 5, (err, data) => {
      if (err) {
        console.error('Erreur de lecture:', err);
        return;
      }

      // 'data' est un tableau de valeurs
      io.emit('modbus_data', {
        motorRunning: data[0] === 1,
        sensorEntry: data[1] === 1,
        sensorExit: data[2] === 1,
        cansCount: data[3],
        cansOut: data[4]
      });
    });
  }
}, 500);

// Ecoute des commandes depuis l'IHM
io.on('connection', (socket) => {
  console.log('Nouvelle connexion IHM');
  socket.emit('modbus_status', { connected: isConnected });

  socket.on('simulate_entry', () => {
    if (isConnected) {
      console.log('Envoi commande: Pulse Coil 1');
      // Ecriture Coil : writeCoil(unitID, address, value, callback)
      client.writeCoil(1, 1, true, () => {
        setTimeout(() => client.writeCoil(1, 1, false), 500);
      });
    }
  });

  socket.on('simulate_exit', () => {
    if (isConnected) {
      console.log('Envoi commande: Pulse Coil 2');
      client.writeCoil(1, 2, true, () => {
        setTimeout(() => client.writeCoil(1, 2, false), 500);
      });
    }
  });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`Serveur Gateway RPi démarré sur le port ${PORT}`);
});