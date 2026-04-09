import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import {
  Play, Square, Package, ArrowRight, Wifi, WifiOff,
  AlertCircle, Hand, Activity, Gauge, Radio, MonitorSpeaker, X, Loader
} from 'lucide-react';
import { io } from "socket.io-client";

// ─── CONFIGURATION ─────────────────────────────────────────────────────────
const MAX_CAPACITY = 10;
const SCAN_RATE_MS = 100; 
const TRAVEL_TIME_S = 5;
const POSITION_INCREMENT = 100 / (TRAVEL_TIME_S * 1000 / SCAN_RATE_MS);
<<<<<<< HEAD
const WS_URL = `http://${window.location.hostname}:3001`;
=======

// URL WebSocket backend — fonctionne en dev local ET sur RPi
const WS_URL = `http://${window.location.hostname}:3001`;

// ─── COMPOSANT PRINCIPAL ───────────────────────────────────────────────────
>>>>>>> c9114ad8a3e29878f4baef2116ecd04f7cd27ccc

const App = () => {
  // --- ÉTATS ---
  const [isSimulationMode, setIsSimulationMode] = useState(true);
  const [showIpModal, setShowIpModal] = useState(false);
  const [espIpInput, setEspIpInput] = useState('192.168.1.100');
  
  const [motorActive, setMotorActive] = useState(false);
  const [cansOnConveyor, setCansOnConveyor] = useState([]);
  const [totalCounter, setTotalCounter] = useState(0);
  const [entrySensorActive, setEntrySensorActive] = useState(false);
  const [exitSensorActive, setExitSensorActive] = useState(false);

  const [modbusConnected, setModbusConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState(null);

  const socketRef = useRef(null);

  // ─── COMMUNICATION RÉELLE (SOCKET.IO) ────────────────────────────────────
  useEffect(() => {
    if (isSimulationMode) return;

    const socket = io(WS_URL);
    socketRef.current = socket;

    socket.on("modbus_data", (data) => {
      setMotorActive(data.motorRunning);
      setEntrySensorActive(data.sensorEntry);
      setExitSensorActive(data.sensorExit);
      setTotalCounter(data.cansOut);
      
      // Mapping des positions réelles (HR5+)
      if (data.cansPositions) {
        const remoteCans = data.cansPositions
          .filter(pos => pos > 0 || data.sensorEntry) // On n'affiche que les canettes actives
          .map((pos, index) => ({
            id: `real-${index}`,
            position: pos,
            label: `CAN-${index + 1}`
          }));
        setCansOnConveyor(remoteCans);
      }
    });

    socket.on("modbus_status", (status) => {
      setModbusConnected(status.connected);
      if (status.connected) setConnecting(false);
    });

    return () => socket.disconnect();
  }, [isSimulationMode]);

  // ─── LOGIQUE SIMULATION ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isSimulationMode) return;
    const interval = setInterval(() => {
      setCansOnConveyor(prev => {
        const isBlocked = prev.some(can => can.position >= 100);
        const shouldRun = prev.length > 0 && !isBlocked;
        setMotorActive(shouldRun);
        setExitSensorActive(isBlocked);
        if (shouldRun) {
          return prev.map(can => ({
            ...can,
            position: Math.min(can.position + POSITION_INCREMENT, 100),
          }));
        }
        return prev;
      });
    }, SCAN_RATE_MS);
    return () => clearInterval(interval);
  }, [isSimulationMode]);

<<<<<<< HEAD
  // ─── ACTIONS ─────────────────────────────────────────────────────────────
=======
  // ─── WEBSOCKET (Mode Réel — pont vers ESP32 Modbus TCP) ─────────────────

  const closeWS = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.disconnect();
      wsRef.current = null;
    }
    setModbusConnected(false);
    setConnectedIp(null);
  }, []);

  useEffect(() => {
    if (isSimulationMode) return;

    const socket = io(WS_URL);
    wsRef.current = socket;

    socket.on('connect', () => {
      setConnectionError(null);
    });

    socket.on('modbus_status', (data) => {
      setModbusConnected(data.connected);
      if (data.connected) {
        setConnecting(false);
      }
    });

    socket.on('modbus_data', (data) => {
      setMotorActive(data.motorRunning);
      setEntrySensorActive(data.sensorEntry);
      setExitSensorActive(data.sensorExit);
      
      // Update basic counters directly if they exist in the server data
      if (data.cansCount !== undefined) {
         // Not directly mapping to cansOnConveyor layout unless server formats it
      }
    });

    socket.on('connect_error', (err) => {
      setConnectionError(`Serveur backend inaccessible. Lancez : npm run server. Erreur: ${err.message}`);
    });

    socket.on('disconnect', () => {
      setModbusConnected(false);
    });

    return () => {
      socket.disconnect();
    };
  }, [isSimulationMode]);

  // ─── ACTIONS OPÉRATEUR HMI ───────────────────────────────────────────────

>>>>>>> c9114ad8a3e29878f4baef2116ecd04f7cd27ccc
  const addCan = () => {
    if (isSimulationMode) {
      if (cansOnConveyor.length >= MAX_CAPACITY) return;
      setEntrySensorActive(true);
      setCansOnConveyor(prev => [...prev, { id: Math.random(), position: 0, label: `SIM-${Math.floor(Math.random()*900)}` }]);
      setTimeout(() => setEntrySensorActive(false), 300);
    } else {
<<<<<<< HEAD
      socketRef.current?.emit('simulate_entry');
=======
      wsRef.current?.emit('simulate_entry');
>>>>>>> c9114ad8a3e29878f4baef2116ecd04f7cd27ccc
    }
  };

  const retrieveCan = () => {
    if (isSimulationMode) {
      setCansOnConveyor(prev => {
        const idx = prev.findIndex(c => c.position >= 100);
        if (idx === -1) return prev;
        setTotalCounter(t => t + 1);
        return prev.filter((_, i) => i !== idx);
      });
    } else {
<<<<<<< HEAD
      socketRef.current?.emit('simulate_exit');
    }
  };

=======
      wsRef.current?.emit('simulate_exit');
    }
  };

  // ─── GESTION BASCULE MODE ────────────────────────────────────────────────

  const switchToSimulation = () => {
    closeWS();
    setIsSimulationMode(true);
    setConnectionError(null);
    setConnecting(false);
    setMotorActive(false);
    setCansOnConveyor([]);
    setEntrySensorActive(false);
    setExitSensorActive(false);
  };

  const openIpModal = () => {
    setConnectionError(null);
    setShowIpModal(true);
  };

  const confirmConnect = () => {
    if (!espIpInput.trim()) return;
    setShowIpModal(false);
    setConnecting(true);
    setConnectionError(null);
    setIsSimulationMode(false);
    // Since server.js currently expects a fixed IP, the UI ip input might not 
    // dynamically change the server's ESP IP without a backend route update.
    // We rely on the socket.io auto connect here.
  };

>>>>>>> c9114ad8a3e29878f4baef2116ecd04f7cd27ccc
  const isAtFullStop = exitSensorActive && cansOnConveyor.length > 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-4 md:p-8">
      
      {/* MODAL IP (Full UI) */}
      {showIpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-8 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="bg-emerald-600 p-2 rounded-xl"><Radio size={18} className="text-white" /></div>
                <h3 className="font-bold text-white">Connexion ESP32</h3>
              </div>
              <button onClick={() => setShowIpModal(false)} className="text-slate-500 hover:text-white"><X size={20} /></button>
            </div>
            <input
              type="text"
              value={espIpInput}
              onChange={e => setEspIpInput(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white mb-6"
              placeholder="192.168.1.100"
            />
            <div className="flex gap-3">
              <button onClick={() => setShowIpModal(false)} className="flex-1 py-3 rounded-xl bg-slate-800">Annuler</button>
              <button onClick={() => {setIsSimulationMode(false); setShowIpModal(false); setConnecting(true);}} className="flex-1 py-3 rounded-xl bg-emerald-600 font-bold">Connecter</button>
            </div>
          </div>
        </div>
      )}

      {/* HEADER */}
      <header className="w-full mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 p-3 rounded-2xl shadow-lg shadow-blue-900/20"><Activity size={24} className="text-white" /></div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white uppercase">Système Convoyeur</h1>
            <p className="text-slate-500 text-xs font-mono uppercase tracking-widest">Digital Twin / Modbus TCP</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className={`px-4 py-2 rounded-xl text-[10px] font-bold border ${isSimulationMode ? 'bg-amber-500/10 border-amber-500/30 text-amber-500' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'}`}>
            {isSimulationMode ? "ÉMULATION LOCALE" : modbusConnected ? `MODBUS RÉEL — ${espIpInput}` : "CONNEXION..."}
          </div>
          <button onClick={() => isSimulationMode ? setShowIpModal(true) : setIsSimulationMode(true)} className="px-4 py-2 rounded-xl bg-slate-700 text-xs font-bold">
            {isSimulationMode ? "Passer en Réel" : "Retour Simulation"}
          </button>
        </div>
      </header>

      <main className="w-full grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* DIAGNOSTIC PANEL */}
        <div className="lg:col-span-1 space-y-6">
          <section className="bg-slate-900 rounded-3xl p-6 border border-slate-800 shadow-2xl">
            <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2"><Gauge size={14} /> Diagnostic</h2>
            <div className="space-y-6">
              <div className="flex flex-col gap-2">
                <span className="text-xs text-slate-400">Moteur (HR0)</span>
                <div className={`flex items-center justify-between p-3 rounded-2xl border ${motorActive ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                  <span className="text-sm font-bold">{motorActive ? 'RUNNING' : 'STOPPED'}</span>
                  {motorActive ? <Play size={18} fill="currentColor" /> : <Square size={18} fill="currentColor" />}
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-2xl border border-slate-700/50">
                  <span className="text-xs">Entrée (HR1)</span>
                  <div className={`w-3 h-3 rounded-full ${entrySensorActive ? 'bg-blue-400 shadow-[0_0_12px_rgba(96,165,250,0.6)]' : 'bg-slate-600'}`}></div>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-2xl border border-slate-700/50">
                  <span className="text-xs">Sortie (HR2)</span>
                  <div className={`w-3 h-3 rounded-full ${exitSensorActive ? 'bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.6)]' : 'bg-slate-600'}`}></div>
                </div>
              </div>
            </div>
          </section>

          <section className="bg-slate-900 rounded-3xl p-6 border border-slate-800">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-center">
                <div className="text-2xl font-mono text-cyan-400 font-bold">{cansOnConveyor.length}</div>
                <div className="text-[9px] text-slate-500 uppercase mt-1">Ligne</div>
              </div>
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-center">
                <div className="text-2xl font-mono text-emerald-400 font-bold">{totalCounter}</div>
                <div className="text-[9px] text-slate-500 uppercase mt-1">Total</div>
              </div>
            </div>
          </section>
        </div>

        {/* LIGNE DE PRODUCTION VISUELLE */}
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-slate-900 rounded-3xl p-8 border border-slate-800 shadow-2xl relative min-h-[400px] flex flex-col justify-center">
            <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-16">Moniteur de ligne</h2>
            
            <div className="relative h-28 bg-slate-950 rounded-3xl border-4 border-slate-800 flex items-center px-4 overflow-hidden shadow-inner">
               {/* Animation tapis */}
               <div className="absolute inset-0 opacity-10" style={{ 
                 backgroundImage: 'linear-gradient(90deg, #fff 2px, transparent 2px)', 
                 backgroundSize: '40px 100%',
                 animation: motorActive ? 'scroll 0.8s linear infinite' : 'none' 
               }} />

              {cansOnConveyor.map(can => (
                <div key={can.id} className="absolute transition-all duration-100 ease-linear" style={{ left: `calc(${can.position * 0.90}% + 12px)` }}>
                  <div className={`w-12 h-16 rounded-xl border-2 flex flex-col items-center justify-center transition-colors ${can.position >= 100 ? 'from-rose-500 to-rose-700 border-rose-300 text-white bg-gradient-to-br' : 'from-slate-200 to-slate-400 border-white/50 text-slate-800 bg-gradient-to-br'}`}>
                    <span className="text-[10px] font-black">{can.label}</span>
                  </div>
                </div>
              ))}
            </div>

            {isAtFullStop && (
              <div className="absolute top-8 right-8 flex items-center gap-3 bg-rose-500/10 border border-rose-500/50 p-4 rounded-2xl text-rose-500 animate-pulse">
                <AlertCircle size={20} />
                <span className="text-xs font-bold uppercase">Ligne Bloquée</span>
              </div>
            )}
          </div>

          {/* COMMANDES */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button onClick={addCan} className="group flex items-center justify-between bg-blue-600 hover:bg-blue-500 p-5 rounded-2xl transition-all active:scale-95">
              <div className="flex items-center gap-4">
                <div className="bg-white/10 p-2 rounded-xl"><Package size={24} /></div>
                <div className="text-left">
                  <span className="block text-sm font-bold uppercase">Ajouter</span>
                  <span className="text-[10px] opacity-70">Envoi Coil 0</span>
                </div>
              </div>
              <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </button>

            <button onClick={retrieveCan} disabled={!exitSensorActive} className={`flex items-center justify-between p-5 rounded-2xl transition-all ${exitSensorActive ? 'bg-emerald-600 hover:bg-emerald-500 active:scale-95' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}>
              <div className="flex items-center gap-4">
                <div className="bg-white/10 p-2 rounded-xl"><Hand size={24} /></div>
                <div className="text-left">
                  <span className="block text-sm font-bold uppercase">Libérer</span>
                  <span className="text-[10px] opacity-70">Envoi Coil 1</span>
                </div>
              </div>
            </button>
          </div>
        </div>
      </main>

      <style dangerouslySetInnerHTML={{ __html: `@keyframes scroll { from { background-position: 0 0; } to { background-position: 40px 0; } }`}} />
    </div>
  );
};

export default App;