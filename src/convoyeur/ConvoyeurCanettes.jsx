import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import {
  Play, Square, Package, ArrowRight, Wifi, WifiOff,
  AlertCircle, Hand, Gauge, Radio, MonitorSpeaker, Loader
} from 'lucide-react';

// ─── CONSTANTES PLC ────────────────────────────────────────────────────────

const MAX_CAPACITY       = 10;
const SCAN_RATE_MS       = 40;       // 25 Hz — cycle scan navigateur
const TRAVEL_TIME_S      = 5;
const POSITION_INCREMENT = 100 / (TRAVEL_TIME_S * 1000 / SCAN_RATE_MS);
const MIN_GAP            = 10;       // distance minimale entre canettes (unités de position)

const WS_URL = `http://${window.location.hostname}:3002`;

// ─── COMPOSANT ─────────────────────────────────────────────────────────────

export default function ConvoyeurCanettes() {

  // --- MODE ---
  const [isSimulationMode, setIsSimulationMode] = useState(true);

  // --- ÉTAT SYSTÈME ---
  const [motorActive,       setMotorActive]       = useState(false);
  const [cansOnConveyor,    setCansOnConveyor]     = useState([]);
  const [totalCounter,      setTotalCounter]       = useState(0);
  const [entrySensorActive, setEntrySensorActive]  = useState(false);
  const [exitSensorActive,  setExitSensorActive]   = useState(false);

  // --- ÉTAT CONNEXION ---
  const [modbusConnected,  setModbusConnected]  = useState(false);
  const [connectedIp,      setConnectedIp]      = useState(null);
  const [connecting,       setConnecting]       = useState(false);
  const [connectionError,  setConnectionError]  = useState(null);
  const [manualIp,         setManualIp]         = useState('192.168.137.179');
  const [manualConnecting, setManualConnecting] = useState(false);

  const socketRef = useRef(null);

  const connectManual = () => {
    if (!manualIp.trim() || !socketRef.current || manualConnecting) return;
    setManualConnecting(true);
    socketRef.current.emit('connect_esp32', { ip: manualIp.trim() });
    setTimeout(() => setManualConnecting(false), 5000);
  };

  // ─── LOGIQUE PLC SIMULATION ──────────────────────────────────────────────

  useEffect(() => {
    if (!isSimulationMode) return;

    const processPLCCycle = () => {
      setCansOnConveyor(prevCans => {
        const isBlockedByExit = prevCans.some(can => can.position >= 100);
        const shouldMotorRun  = prevCans.length > 0 && !isBlockedByExit;

        setMotorActive(shouldMotorRun);
        setExitSensorActive(isBlockedByExit);

        if (!shouldMotorRun) return prevCans;

        // Trier par position décroissante : traiter le leader en premier
        // pour que chaque suiveur connaisse la nouvelle position de celui devant lui.
        const sorted = [...prevCans].sort((a, b) => b.position - a.position);
        const result = [];

        for (let i = 0; i < sorted.length; i++) {
          const can      = sorted[i];
          const canAhead = result[i - 1]; // position déjà mise à jour du can devant
          const limit    = canAhead ? canAhead.position - MIN_GAP : 100;

          // Ne jamais reculer : si déjà trop proche du leader, on attend
          const newPos = limit <= can.position
            ? can.position
            : Math.min(can.position + POSITION_INCREMENT, limit);

          result.push({ ...can, position: newPos });
        }

        return result;
      });
    };

    const interval = setInterval(processPLCCycle, SCAN_RATE_MS);
    return () => clearInterval(interval);
  }, [isSimulationMode]);

  // ─── SOCKET.IO — MODE RÉEL ───────────────────────────────────────────────

  useEffect(() => {
    if (isSimulationMode) return;

    setConnecting(true);
    setConnectionError(null);

    const socket = io(WS_URL, {
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnecting(false);
      setConnectionError(null);
    });

    socket.on('disconnect', () => {
      setModbusConnected(false);
      setConnectedIp(null);
      setCansOnConveyor([]);
      setMotorActive(false);
    });

    socket.on('connect_error', () => {
      setConnectionError('Serveur backend inaccessible. Lancez : npm run server');
      setConnecting(false);
    });

    socket.on('esp32_discovered', (data) => {
      setConnectedIp(data.ip);
    });

    socket.on('modbus_data', (data) => {
      setMotorActive(data.motorRunning);
      setEntrySensorActive(data.sensorEntry);
      setExitSensorActive(data.sensorExit);
      setTotalCounter(data.cansOut);
      setModbusConnected(true);

      if (Array.isArray(data.canPositions)) {
        setCansOnConveyor(data.canPositions.map((pos, i) => ({
          id: i,
          position: pos,
          label: `CAN-${i + 1}`,
        })));
      }
    });

    socket.on('modbus_status', (status) => {
      setModbusConnected(status.connected);
      setManualConnecting(false);
      if (status.ip) setConnectedIp(status.ip);
      if (!status.connected) {
        setCansOnConveyor([]);
        setMotorActive(false);
      }
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [isSimulationMode]);

  // ─── ACTIONS OPÉRATEUR ───────────────────────────────────────────────────

  const addCan = () => {
    if (isSimulationMode) {
      if (cansOnConveyor.length >= MAX_CAPACITY) return;
      // Bloquer l'injection si une canette est encore dans la zone d'entrée
      if (cansOnConveyor.some(c => c.position < MIN_GAP)) return;
      setEntrySensorActive(true);
      setCansOnConveyor(prev => [
        ...prev,
        { id: Math.random(), position: 0, label: `CAN-${Math.floor(Math.random() * 900) + 100}` },
      ]);
      setTimeout(() => setEntrySensorActive(false), 300);
    } else {
      socketRef.current?.emit('simulate_entry');
    }
  };

  const retrieveCan = () => {
    if (isSimulationMode) {
      setCansOnConveyor(prev => {
        const index = prev.findIndex(c => c.position >= 100);
        if (index === -1) return prev;
        setExitSensorActive(false);
        setTotalCounter(t => t + 1);
        const next = [...prev];
        next.splice(index, 1);
        return next;
      });
    } else {
      socketRef.current?.emit('simulate_exit');
    }
  };

  // ─── BASCULE MODE ────────────────────────────────────────────────────────

  const switchToSimulation = () => {
    setIsSimulationMode(true);
    setConnectionError(null);
    setConnecting(false);
    setModbusConnected(false);
    setConnectedIp(null);
    setMotorActive(false);
    setCansOnConveyor([]);
    setTotalCounter(0);
    setEntrySensorActive(false);
    setExitSensorActive(false);
  };

  const switchToRealMode = () => {
    setConnectionError(null);
    setIsSimulationMode(false);
  };

  const isAtFullStop = exitSensorActive && cansOnConveyor.length > 0;

  // ─── RENDU ───────────────────────────────────────────────────────────────

  return (
    <div className="text-slate-100 font-sans">

      {/* HEADER MODE */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 p-4 bg-slate-900 rounded-2xl border border-slate-800">
        <div className={`px-4 py-2 rounded-xl text-[10px] font-bold flex items-center gap-2 border transition-all ${
          isSimulationMode
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-500'
            : modbusConnected
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : connecting
                ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
        }`}>
          {isSimulationMode ? (
            <><MonitorSpeaker size={13} /> ÉMULATION LOCALE</>
          ) : modbusConnected ? (
            <><Wifi size={13} className="animate-pulse" /> MODBUS TCP — {connectedIp}</>
          ) : connecting ? (
            <><Loader size={13} className="animate-spin" /> CONNEXION…</>
          ) : (
            <><WifiOff size={13} /> DÉCONNECTÉ</>
          )}
        </div>

        {isSimulationMode ? (
          <button
            onClick={switchToRealMode}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all active:scale-95"
          >
            <Radio size={13} /> Mode Réel (ESP32)
          </button>
        ) : (
          <button
            onClick={switchToSimulation}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold transition-all active:scale-95"
          >
            <MonitorSpeaker size={13} /> Mode Simulation
          </button>
        )}
      </div>

      {/* ERREUR CONNEXION */}
      {connectionError && !isSimulationMode && (
        <div className="mb-6 flex items-center gap-3 bg-rose-500/10 border border-rose-500/30 p-4 rounded-2xl text-rose-400">
          <AlertCircle size={18} />
          <div className="flex-1">
            <p className="text-xs font-bold">Erreur de connexion</p>
            <p className="text-[11px] opacity-80">{connectionError}</p>
          </div>
          <button
            onClick={() => { setConnectionError(null); setConnecting(true); socketRef.current?.connect(); }}
            className="text-[10px] underline opacity-70 hover:opacity-100"
          >
            Réessayer
          </button>
        </div>
      )}

      {/* CONNEXION MANUELLE */}
      {!isSimulationMode && !modbusConnected && !connectionError && (
        <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center gap-3 bg-blue-500/10 border border-blue-500/30 p-4 rounded-2xl text-blue-300">
          <Wifi size={18} className="shrink-0" />
          <div className="flex-1">
            <p className="text-xs font-bold">En attente d'annonce UDP de l'ESP32</p>
            <p className="text-[11px] opacity-70">Si le pare-feu bloque le port 5001, entrez l'IP manuellement :</p>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <input
              type="text"
              value={manualIp}
              onChange={e => setManualIp(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && connectManual()}
              placeholder="192.168.x.x"
              className="bg-slate-800 border border-slate-600 text-slate-100 text-xs font-mono px-3 py-2 rounded-xl w-40 focus:outline-none focus:border-blue-400"
            />
            <button
              onClick={connectManual}
              disabled={manualConnecting}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition-all active:scale-95 flex items-center gap-1.5"
            >
              {manualConnecting ? <><Loader size={11} className="animate-spin" /> Tentative…</> : 'Connecter'}
            </button>
          </div>
        </div>
      )}

      {/* GRILLE PRINCIPALE */}
      <div className="w-full grid grid-cols-1 lg:grid-cols-4 gap-6">

        {/* STATUTS PLC */}
        <div className="lg:col-span-1 space-y-6">
          <section className="bg-slate-900 rounded-3xl p-6 border border-slate-800 shadow-2xl">
            <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2">
              <Gauge size={14} /> Diagnostic Automate
            </h2>

            <div className="space-y-6">
              <div className="flex flex-col gap-2">
                <span className="text-xs text-slate-400">État Moteur (HR0 / Q0.0)</span>
                <div className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${
                  motorActive
                    ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400'
                    : 'bg-slate-800 border-slate-700 text-slate-500'
                }`}>
                  <span className="text-sm font-bold font-mono">{motorActive ? 'RUNNING' : 'IDLE'}</span>
                  {motorActive ? <Play size={18} fill="currentColor" /> : <Square size={18} fill="currentColor" />}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-2xl border border-slate-700/50">
                  <span className="text-xs">Capteur Entrée (HR1)</span>
                  <div className={`w-3 h-3 rounded-full transition-all ${entrySensorActive ? 'bg-blue-400 shadow-[0_0_12px_rgba(96,165,250,0.6)]' : 'bg-slate-600'}`} />
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-2xl border border-slate-700/50">
                  <span className="text-xs">Capteur Sortie (HR2)</span>
                  <div className={`w-3 h-3 rounded-full transition-all ${exitSensorActive ? 'bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.6)]' : 'bg-slate-600'}`} />
                </div>
              </div>

              <div className={`text-[9px] flex items-center gap-1.5 px-3 py-2 rounded-xl border ${
                isSimulationMode
                  ? 'text-amber-500 border-amber-500/20 bg-amber-500/5'
                  : 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5'
              }`}>
                <div className={`w-1.5 h-1.5 rounded-full ${isSimulationMode ? 'bg-amber-500' : 'bg-emerald-400 animate-pulse'}`} />
                {isSimulationMode ? 'Source : Simulation locale' : 'Source : ESP32 Modbus TCP'}
              </div>
            </div>
          </section>

          <section className="bg-slate-900 rounded-3xl p-6 border border-slate-800">
            <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Registres HR3 / HR4</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                <div className="text-2xl font-mono text-cyan-400 font-bold">{cansOnConveyor.length}</div>
                <div className="text-[9px] text-slate-500 uppercase mt-1">En cours</div>
              </div>
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                <div className="text-2xl font-mono text-emerald-400 font-bold">{totalCounter}</div>
                <div className="text-[9px] text-slate-500 uppercase mt-1">Total</div>
              </div>
            </div>
          </section>
        </div>

        {/* VUE PROCESSUS + COMMANDES */}
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-slate-900 rounded-3xl p-8 border border-slate-800 shadow-2xl relative overflow-hidden min-h-[400px] flex flex-col justify-center">
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:20px_20px]" />

            <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-16">Moniteur de ligne</h2>

            {/* CONVOYEUR */}
            <div className="relative h-28 bg-slate-950 rounded-3xl border-4 border-slate-800 flex items-center px-4 shadow-inner">
              <div
                className="absolute inset-0 opacity-10 pointer-events-none"
                style={{
                  backgroundImage: 'linear-gradient(90deg, #fff 2px, transparent 2px)',
                  backgroundSize:  '40px 100%',
                  animation:       motorActive ? 'scroll 0.8s linear infinite' : 'none',
                }}
              />

              {cansOnConveyor.map(can => (
                <div
                  key={can.id}
                  className="absolute transition-all duration-75 ease-linear"
                  style={{ left: `calc(${can.position * 0.90}% + 12px)` }}
                >
                  <div className="relative group">
                    <div className={`w-12 h-16 bg-gradient-to-br rounded-xl shadow-2xl flex flex-col items-center justify-center border-2 transition-colors duration-300 ${
                      can.position >= 100
                        ? 'from-rose-500 to-rose-700 border-rose-300 text-white'
                        : 'from-slate-200 to-slate-400 border-white/50 text-slate-800'
                    }`}>
                      <span className="text-[10px] font-black leading-none">{can.label}</span>
                      <div className={`w-6 h-1 mt-2 rounded-full ${can.position >= 100 ? 'bg-white/40' : 'bg-slate-500/30'}`} />
                    </div>
                    <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 px-2 py-1 rounded text-[9px] font-mono whitespace-nowrap border border-slate-700">
                      {isSimulationMode ? `Pos: ${can.position.toFixed(1)}%` : `HR${5 + can.id}`}
                    </div>
                  </div>
                </div>
              ))}

              {cansOnConveyor.length === 0 && (
                <div className="w-full text-center text-slate-700 font-mono text-sm tracking-[0.3em] uppercase">Attente Alimentation</div>
              )}
            </div>

            {/* Légende */}
            <div className="flex justify-between mt-8 px-6">
              <div className="flex flex-col items-center gap-2">
                <div className={`h-1.5 w-12 rounded-full transition-colors ${entrySensorActive ? 'bg-blue-500 shadow-[0_0_10px_#3b82f6]' : 'bg-slate-800'}`} />
                <span className="text-[9px] text-slate-500 font-bold tracking-tighter uppercase">Point d'Entrée</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className={`h-1.5 w-12 rounded-full transition-colors ${exitSensorActive ? 'bg-rose-500 shadow-[0_0_10px_#f43f5e]' : 'bg-slate-800'}`} />
                <span className="text-[9px] text-rose-500 font-bold tracking-tighter uppercase">Arrêt Critique</span>
              </div>
            </div>

            {/* Alerte blocage */}
            {isAtFullStop && (
              <div className="absolute top-8 right-8">
                <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/50 p-4 rounded-2xl text-rose-500 shadow-xl backdrop-blur-md">
                  <AlertCircle size={20} className="animate-bounce" />
                  <div>
                    <p className="text-xs font-bold uppercase">Ligne Interrompue</p>
                    <p className="text-[10px] opacity-70">Libérez la canette en fin de course</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* COMMANDES HMI */}
          <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800 shadow-xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={addCan}
                disabled={isSimulationMode ? cansOnConveyor.length >= MAX_CAPACITY : !modbusConnected}
                className="group relative flex items-center justify-between bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:cursor-not-allowed disabled:text-slate-600 p-5 rounded-2xl transition-all active:scale-[0.98] overflow-hidden"
              >
                <div className="flex items-center gap-4 z-10">
                  <div className="bg-white/10 p-2 rounded-xl"><Package size={24} /></div>
                  <div className="text-left">
                    <span className="block text-sm font-bold">AJOUTER</span>
                    <span className="text-[10px] opacity-70 font-normal uppercase tracking-wide">
                      {isSimulationMode ? 'Simulation locale' : 'Pulse Coil C0 → ESP32'}
                    </span>
                  </div>
                </div>
                <ArrowRight size={20} className="opacity-40 group-hover:translate-x-1 transition-transform" />
              </button>

              <button
                onClick={retrieveCan}
                disabled={isSimulationMode ? !exitSensorActive : !modbusConnected}
                className={`group relative flex items-center justify-between p-5 rounded-2xl transition-all active:scale-[0.98] overflow-hidden ${
                  (isSimulationMode ? exitSensorActive : modbusConnected)
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/20'
                    : 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-700'
                }`}
              >
                <div className="flex items-center gap-4 z-10">
                  <div className={`${(isSimulationMode ? exitSensorActive : modbusConnected) ? 'bg-white/10' : 'bg-slate-700'} p-2 rounded-xl`}>
                    <Hand size={24} />
                  </div>
                  <div className="text-left">
                    <span className="block text-sm font-bold uppercase tracking-tight">Récupérer / Acquitter</span>
                    <span className="text-[10px] opacity-70 font-normal uppercase tracking-wide">
                      {isSimulationMode ? 'Libérer le moteur' : 'Pulse Coil C1 → ESP32'}
                    </span>
                  </div>
                </div>
                {(isSimulationMode ? exitSensorActive : modbusConnected) && (
                  <div className="absolute inset-0 bg-white/10 animate-pulse pointer-events-none" />
                )}
              </button>
            </div>

            <div className="mt-6 flex items-center gap-3 p-4 bg-slate-950 rounded-2xl border border-slate-800">
              <div className={`w-1.5 h-1.5 rounded-full ${isSimulationMode ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500 animate-pulse'}`} />
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">
                {isSimulationMode
                  ? 'Mode Simulation — Logique PLC exécutée localement dans le navigateur'
                  : `Mode Réel — Données Modbus HR0–HR14 depuis ESP32 @ ${connectedIp ?? '…'} · Poll 100ms`
                }
              </p>
            </div>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes scroll {
          from { background-position: 0 0; }
          to   { background-position: 40px 0; }
        }
      `}} />
    </div>
  );
}
