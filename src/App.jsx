import React, { useState, useEffect } from 'react';
import { Play, Square, Package, ArrowRight, Settings, Wifi, WifiOff, AlertCircle, Database, Hand, Activity, Gauge } from 'lucide-react';

const App = () => {
  // --- ÉTATS SYSTÈME (REPRÉSENTANT LES REGISTRES MODBUS) ---
  const [isSimulationMode] = useState(true);
  const [motorActive, setMotorActive] = useState(false);
  const [cansOnConveyor, setCansOnConveyor] = useState([]);
  const [totalCounter, setTotalCounter] = useState(0);
  const [entrySensorActive, setEntrySensorActive] = useState(false);
  const [exitSensorActive, setExitSensorActive] = useState(false);
  
  // Paramètres de l'automate
  const MAX_CAPACITY = 10;
  const SCAN_RATE_MS = 40; // Cycle de scan de 40ms (25Hz)
  const TRAVEL_TIME_S = 5; 
  const POSITION_INCREMENT = 100 / (TRAVEL_TIME_S * 1000 / SCAN_RATE_MS);

  useEffect(() => {
    // --- LOGIQUE PLC (BOUCLE DE CONTRÔLE) ---
    const processPLCCycle = () => {
    setCansOnConveyor(prevCans => {
      // 1. DÉTECTION DE BLOCAGE (Interlock)
      // On vérifie si une canette a atteint la limite physique (100%)
      const isBlockedByExit = prevCans.some(can => can.position >= 100);
      
      // 2. LOGIQUE MOTEUR
      // Le moteur ne peut tourner que si :
      // - Il y a des canettes sur le tapis
      // - ET Aucune canette ne bloque la fin de course
      const shouldMotorRun = prevCans.length > 0 && !isBlockedByExit;
      
      // Mise à jour des sorties (Coils Modbus)
      if (motorActive !== shouldMotorRun) setMotorActive(shouldMotorRun);
      if (exitSensorActive !== isBlockedByExit) setExitSensorActive(isBlockedByExit);

      // 3. MISE À JOUR DES POSITIONS (Uniquement si moteur tourne)
      if (shouldMotorRun) {
        return prevCans.map(can => ({
          ...can,
          position: Math.min(can.position + POSITION_INCREMENT, 100)
        }));
      }
      
      // Si moteur arrêté, on retourne les positions figées (Statu Quo)
      return prevCans;
    });
  };
  
    const interval = setInterval(() => {
      processPLCCycle();
    }, SCAN_RATE_MS);
    return () => clearInterval(interval);
  }, [POSITION_INCREMENT, exitSensorActive, motorActive]);

  // --- ACTIONS OPÉRATEUR (HMI) ---
  const addCan = () => {
    if (cansOnConveyor.length < MAX_CAPACITY) {
      setEntrySensorActive(true);
      const newCan = {
        id: Math.random(),
        position: 0,
        label: `CAN-${Math.floor(Math.random() * 900) + 100}`
      };
      setCansOnConveyor(prev => [...prev, newCan]);
      setTimeout(() => setEntrySensorActive(false), 300);
    }
  };

  const retrieveCan = () => {
    setCansOnConveyor(prev => {
      const index = prev.findIndex(c => c.position >= 100);
      if (index !== -1) {
        setExitSensorActive(false);
        const newCans = [...prev];
        newCans.splice(index, 1);
        setTotalCounter(t => t + 1);
        return newCans;
      }
      return prev;
    });
  };

  const isAtFullStop = exitSensorActive && cansOnConveyor.length > 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-4 md:p-8">
      {/* HEADER HMI */}
      <header className="w-full mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 p-3 rounded-2xl shadow-lg shadow-blue-900/20">
            <Activity size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white uppercase">
              Système Convoyeur Synchrone
            </h1>
            <p className="text-slate-500 text-xs font-mono uppercase tracking-widest">
              Digital Twin : ESP32/Modbus Simulation
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3 bg-slate-900/50 p-2 rounded-2xl border border-slate-800">
          <div className={`px-4 py-2 rounded-xl text-[10px] font-bold flex items-center gap-2 border ${isSimulationMode ? 'bg-amber-500/10 border-amber-500/30 text-amber-500' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'}`}>
            <Wifi size={14} className={isSimulationMode ? 'opacity-30' : 'animate-pulse'} />
            {isSimulationMode ? "ÉMULATION LOCALE" : "MODBUS TCP CONNECTÉ"}
          </div>
        </div>
      </header>

      <main className="w-full grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* STATUTS PLC */}
        <div className="lg:col-span-1 space-y-6">
          <section className="bg-slate-900 rounded-3xl p-6 border border-slate-800 shadow-2xl">
            <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2">
              <Gauge size={14} /> Diagnostic Automate
            </h2>
            
            <div className="space-y-6">
              <div className="flex flex-col gap-2">
                <span className="text-xs text-slate-400">État Moteur (Q0.0)</span>
                <div className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${motorActive ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`}>
                  <span className="text-sm font-bold font-mono">{motorActive ? 'RUNNING' : 'IDLE'}</span>
                  {motorActive ? <Play size={18} fill="currentColor" /> : <Square size={18} fill="currentColor" />}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-2xl border border-slate-700/50">
                  <span className="text-xs">Capteur Entrée (I0.0)</span>
                  <div className={`w-3 h-3 rounded-full ${entrySensorActive ? 'bg-blue-400 shadow-[0_0_12px_rgba(96,165,250,0.6)]' : 'bg-slate-600'}`}></div>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-2xl border border-slate-700/50">
                  <span className="text-xs">Capteur Sortie (I0.1)</span>
                  <div className={`w-3 h-3 rounded-full ${exitSensorActive ? 'bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.6)]' : 'bg-slate-600'}`}></div>
                </div>
              </div>
            </div>
          </section>

          <section className="bg-slate-900 rounded-3xl p-6 border border-slate-800">
             <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Stockage Registres</h2>
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

        {/* VUE PROCESSUS ET CONTRÔLE */}
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-slate-900 rounded-3xl p-8 border border-slate-800 shadow-2xl relative overflow-hidden min-h-[400px] flex flex-col justify-center">
            {/* Background pattern */}
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:20px_20px]"></div>

            <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-16">Moniteur de ligne</h2>
            
            {/* CONVOYEUR */}
            <div className="relative h-28 bg-slate-950 rounded-3xl border-4 border-slate-800 flex items-center px-4 shadow-inner">
              
              {/* Animation Tapis */}
              <div className="absolute inset-0 opacity-10 pointer-events-none" 
                   style={{ 
                     backgroundImage: 'linear-gradient(90deg, #fff 2px, transparent 2px)', 
                     backgroundSize: '40px 100%',
                     animation: motorActive ? 'scroll 0.8s linear infinite' : 'none'
                   }}>
              </div>

              {/* Les Canettes */}
              {cansOnConveyor.map((can) => (
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
                       <div className={`w-6 h-1 mt-2 rounded-full ${can.position >= 100 ? 'bg-white/40' : 'bg-slate-500/30'}`}></div>
                    </div>
                    {/* Tooltip position */}
                    <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 px-2 py-1 rounded text-[9px] font-mono whitespace-nowrap border border-slate-700">
                      Pos: {can.position.toFixed(1)}%
                    </div>
                  </div>
                </div>
              ))}

              {cansOnConveyor.length === 0 && (
                <div className="w-full text-center text-slate-700 font-mono text-sm tracking-[0.3em] uppercase">Attente Alimentation</div>
              )}
            </div>

            {/* Légende Positions */}
            <div className="flex justify-between mt-8 px-6">
              <div className="flex flex-col items-center gap-2">
                <div className={`h-1.5 w-12 rounded-full transition-colors ${entrySensorActive ? 'bg-blue-500 shadow-[0_0_10px_#3b82f6]' : 'bg-slate-800'}`}></div>
                <span className="text-[9px] text-slate-500 font-bold tracking-tighter uppercase">Point d'Entrée</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className={`h-1.5 w-12 rounded-full transition-colors ${exitSensorActive ? 'bg-rose-500 shadow-[0_0_10px_#f43f5e]' : 'bg-slate-800'}`}></div>
                <span className="text-[9px] text-rose-500 font-bold tracking-tighter uppercase">Arrêt Critique</span>
              </div>
            </div>

            {/* Alert Message */}
            {isAtFullStop && (
              <div className="absolute top-8 right-8 animate-in fade-in slide-in-from-right-4">
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
                disabled={cansOnConveyor.length >= MAX_CAPACITY}
                className="group relative flex items-center justify-between bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:cursor-not-allowed disabled:text-slate-600 p-5 rounded-2xl transition-all active:scale-[0.98] overflow-hidden"
              >
                <div className="flex items-center gap-4 z-10">
                  <div className="bg-white/10 p-2 rounded-xl">
                    <Package size={24} />
                  </div>
                  <div className="text-left">
                    <span className="block text-sm font-bold">AJOUTER</span>
                    <span className="text-[10px] opacity-70 font-normal uppercase tracking-wide">Alimentation Capteur</span>
                  </div>
                </div>
                <ArrowRight size={20} className="opacity-40 group-hover:translate-x-1 transition-transform" />
              </button>

              <button 
                onClick={retrieveCan}
                disabled={!exitSensorActive}
                className={`group relative flex items-center justify-between p-5 rounded-2xl transition-all active:scale-[0.98] overflow-hidden ${
                  exitSensorActive 
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/20' 
                  : 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-700'
                }`}
              >
                <div className="flex items-center gap-4 z-10">
                  <div className={`${exitSensorActive ? 'bg-white/10' : 'bg-slate-700'} p-2 rounded-xl`}>
                    <Hand size={24} />
                  </div>
                  <div className="text-left">
                    <span className="block text-sm font-bold uppercase tracking-tight">Récupérer / Acquitter</span>
                    <span className="text-[10px] opacity-70 font-normal uppercase tracking-wide">Libérer le moteur</span>
                  </div>
                </div>
                {exitSensorActive && <div className="absolute inset-0 bg-white/10 animate-pulse pointer-events-none"></div>}
              </button>
            </div>
            
            <div className="mt-6 flex items-center gap-3 p-4 bg-slate-950 rounded-2xl border border-slate-800">
               <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div>
               <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">
                 Logique : Blocage instantané de l'ensemble du tapis sur détection I0.1. Reprise automatique après acquittement.
               </p>
            </div>
          </div>
        </div>
      </main>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes scroll {
          from { background-position: 0 0; }
          to { background-position: 40px 0; }
        }
      `}} />
    </div>
  );
};

export default App;