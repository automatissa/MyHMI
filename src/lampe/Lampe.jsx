import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import { Wifi, WifiOff, Radio, MonitorSpeaker, Loader, AlertCircle } from 'lucide-react';

const WS_URL = `http://${window.location.hostname}:3002`;

export default function Lampe() {
  const [lampState,       setLampState]       = useState(false);
  const [isSimulationMode, setIsSimulationMode] = useState(true);
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

  // ─── SOCKET.IO MODE RÉEL ─────────────────────────────────────────────────

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

    socket.on('connect',       () => { setConnecting(false); setConnectionError(null); });
    socket.on('connect_error', () => { setConnectionError('Serveur backend inaccessible. Lancez : npm run server'); setConnecting(false); });
    socket.on('disconnect',    () => { setModbusConnected(false); setConnectedIp(null); });

    socket.on('esp32_discovered', (data) => setConnectedIp(data.ip));

    socket.on('modbus_data', (data) => {
      setLampState(!!data.lampOn);
      setModbusConnected(true);
    });

    socket.on('modbus_status', (status) => {
      setModbusConnected(status.connected);
      setManualConnecting(false);
      if (status.ip) setConnectedIp(status.ip);
    });

    return () => {
      if (socketRef.current) { socketRef.current.disconnect(); socketRef.current = null; }
    };
  }, [isSimulationMode]);

  // ─── TOGGLE LAMPE ────────────────────────────────────────────────────────

  const toggleLamp = () => {
    if (isSimulationMode) {
      setLampState(s => !s);
    } else {
      socketRef.current?.emit('toggle_lamp', !lampState);
      // Pas de mise à jour optimiste : on attend la confirmation via modbus_data
    }
  };

  const switchToSimulation = () => {
    setIsSimulationMode(true);
    setConnectionError(null);
    setConnecting(false);
    setModbusConnected(false);
    setConnectedIp(null);
    setLampState(false);
  };

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
            onClick={() => { setConnectionError(null); setIsSimulationMode(false); }}
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
          <button onClick={() => { setConnectionError(null); setConnecting(true); socketRef.current?.connect(); }} className="text-[10px] underline opacity-70 hover:opacity-100">Réessayer</button>
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

      {/* LAMPE */}
      <div className="flex flex-col items-center">
        <div className="bg-slate-900 rounded-[3rem] p-12 border border-slate-800 flex flex-col items-center shadow-2xl">
          <div className={`w-40 h-40 rounded-full border-4 shadow-2xl mb-8 transition-all duration-500 flex items-center justify-center ${
            lampState
              ? 'bg-amber-400 border-amber-300 shadow-amber-500/50'
              : 'bg-slate-800 border-slate-700 shadow-none'
          }`}>
            <span className="text-6xl opacity-90">{lampState ? '💡' : '🌑'}</span>
          </div>

          <button
            onClick={toggleLamp}
            disabled={!isSimulationMode && !modbusConnected}
            className={`px-8 py-4 rounded-2xl w-full font-black text-xl tracking-wider transition-all active:scale-95 ${
              lampState
                ? 'bg-rose-500 hover:bg-rose-400 text-white shadow-lg shadow-rose-500/20'
                : 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/20'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {lampState ? 'Éteindre' : 'Allumer'}
          </button>

          <p className="text-slate-500 mt-8 font-mono text-sm max-w-sm text-center bg-slate-950 p-4 rounded-xl border border-slate-800">
            Pilotage : <span className="text-blue-400">Coil 2</span><br/>
            État : <span className="text-blue-400">HR 15</span><br/>
            Sortie ESP32 : <span className="text-blue-400">GPIO 15</span>
          </p>
        </div>
      </div>
    </div>
  );
}
