import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import ModbusRTU from 'modbus-serial';
import cors from 'cors';

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: '*' }
});

// Initialisation du client Modbus TCP
const client = new ModbusRTU();
let isConnected = false;
const ESP32_IP = '192.168.1.100'; 
const ESP32_PORT = 502;

const connectToModbus = () => {
  console.log(`Tentative de connexion à ${ESP32_IP}...`);
  client.connectTCP(ESP32_IP, { port: ESP32_PORT })
    .then(() => {
      client.setID(1);
      isConnected = true;
      console.log('Connecté au Modbus TCP (ESP32)');
      io.emit('modbus_status', { connected: true });
    })
    .catch((err) => {
      isConnected = false;
      console.log('Erreur Modbus:', err.message);
      io.emit('modbus_status', { connected: false });
      console.log('Tentative de reconnexion dans 5s...');
      setTimeout(connectToModbus, 5000);
    });
};

// Lancement de la première connexion
connectToModbus();

// Boucle de lecture (Polling)
setInterval(async () => {
  if (isConnected) {
    try {
      // Lecture de 5 registres (Holding Registers) à l'adresse 0
      const data = await client.readHoldingRegisters(0, 5);
      
      // 'data.data' est un tableau de valeurs (les registres)
      io.emit('modbus_data', {
        motorRunning: data.data[0] === 1,
        sensorEntry: data.data[1] === 1,
        sensorExit: data.data[2] === 1,
        cansCount: data.data[3],
        cansOut: data.data[4]
      });
    } catch (err) {
      console.error('Erreur de lecture:', err.message);
      if (isConnected) {
        isConnected = false;
        io.emit('modbus_status', { connected: false });
        client.close();
        setTimeout(connectToModbus, 5000);
      }
    }
  }
}, 500);

// Ecoute des commandes depuis l'IHM
io.on('connection', (socket) => {
  console.log('Nouvelle connexion IHM');
  socket.emit('modbus_status', { connected: isConnected });

  socket.on('simulate_entry', async () => {
    if (isConnected) {
      console.log('Envoi commande: Pulse Coil 1');
      try {
        await client.writeCoil(1, true);
        setTimeout(() => {
          if (isConnected) client.writeCoil(1, false).catch(e => console.error(e));
        }, 500);
      } catch (e) {
        console.error('Erreur écriture:', e.message);
      }
    }
  });

  socket.on('simulate_exit', async () => {
    if (isConnected) {
      console.log('Envoi commande: Pulse Coil 2');
      try {
        await client.writeCoil(2, true);
        setTimeout(() => {
          if (isConnected) client.writeCoil(2, false).catch(e => console.error(e));
        }, 500);
      } catch (e) {
        console.error('Erreur écriture:', e.message);
      }
    }
  });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`Serveur Gateway RPi démarré sur le port ${PORT}`);
});