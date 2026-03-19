import React, { useState, useEffect, useRef } from 'react';
import { Settings, Play, Square, Info, Server, WifiOff, RefreshCw } from 'lucide-react';

const TOTAL_TIME_MS = 5000; // 5 seconds to traverse
const UPDATE_INTERVAL_MS = 50; 
const MAX_CANS = 10;

export default function App() {
  const [mode, setMode] = useState('simulation'); // 'simulation' | 'real'
  const [cans, setCans] = useState([]);
  const [motorRunning, setMotorRunning] = useState(false);
  const [cansOut, setCansOut] = useState(0);
  const [canAtExit, setCanAtExit] = useState(false);
  
  // Real mode status
  const [connected, setConnected] = useState(false);

  // Simulation loop
  useEffect(() => {
    if (mode !== 'simulation') return;

    const interval = setInterval(() => {
      setCans(prevCans => {
        let hasCanAtExit = false;
        
        const nextCans = prevCans.map(c => {
          if (!motorRunning) return c; // Don't move if motor is stopped
          
          let nextProg = c.progress + (UPDATE_INTERVAL_MS / TOTAL_TIME_MS) * 100;
          if (nextProg >= 100) {
            nextProg = 100;
            hasCanAtExit = true;
          }
          return { ...c, progress: nextProg };
        });

        // Motor stops automatically if a can reaches 100%
        if (hasCanAtExit && motorRunning) {
          setCanAtExit(true);
          setMotorRunning(false);
        } else if (!hasCanAtExit && prevCans.length > 0 && !motorRunning && !canAtExit) {
          // Auto restart motor if there are cans and no can is at exit
          setMotorRunning(true);
        }

        return nextCans;
      });
    }, UPDATE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [mode, motorRunning, canAtExit]);

  // Handle empty convoy motor stop
  useEffect(() => {
    if (cans.length === 0 && motorRunning) {
      setMotorRunning(false);
    }
  }, [cans, motorRunning]);

  const handleAddCan = () => {
    if (cans.length < MAX_CANS) {
      setCans(prev => [...prev, { id: Date.now(), progress: 0 }]);
      if (!canAtExit) {
        setMotorRunning(true);
      }
    }
  };

  const handleRetrieveCan = () => {
    // Find can at exit
    const exitCan = cans.find(c => c.progress >= 100);
    if (exitCan) {
      setCans(prev => prev.filter(c => c.id !== exitCan.id));
      setCansOut(prev => prev + 1);
      setCanAtExit(false);
      // Motor restarts automatically via useEffect if there are remaining cans
      if (cans.length > 1) {
        setMotorRunning(true);
      }
    }
  };

  const switchMode = () => {
    setMode(prev => prev === 'simulation' ? 'real' : 'simulation');
  };

  const resetSim = () => {
    setCans([]);
    setMotorRunning(false);
    setCansOut(0);
    setCanAtExit(false);
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 w-full flex flex-col items-center font-sans">
      <div className="max-w-4xl w-full bg-white rounded-xl shadow-lg overflow-hidden">
        
        {/* HEADER */}
        <div className="bg-slate-800 text-white p-4 flex justify-between items-center">
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <Settings className="w-6 h-6" /> IHM Convoyeur de Canettes
          </h1>
          <div className="flex items-center gap-4">
            <button 
              onClick={switchMode}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors flex items-center gap-2 ${
                mode === 'simulation' 
                ? 'bg-blue-500 hover:bg-blue-600' 
                : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {mode === 'simulation' ? <RefreshCw className="w-4 h-4"/> : <Server className="w-4 h-4"/>}
              Mode: {mode === 'simulation' ? 'Simulation' : 'Modbus TCP (Réel)'}
            </button>
          </div>
        </div>

        {/* STATUS BAR */}
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-slate-200 border-b border-slate-200 bg-slate-50">
          <div className="p-4 flex flex-col items-center justify-center">
            <span className="text-sm text-slate-500 mb-1">État du Moteur</span>
            <span className={`font-bold flex items-center gap-2 ${motorRunning ? 'text-green-600' : 'text-red-500'}`}>
              {motorRunning ? <Play className="w-4 h-4"/> : <Square className="w-4 h-4"/>}
              {motorRunning ? 'EN MARCHE' : 'À L\'ARRÊT'}
            </span>
          </div>
          <div className="p-4 flex flex-col items-center justify-center">
            <span className="text-sm text-slate-500 mb-1">Canettes Présentes</span>
            <span className="font-bold text-slate-800 text-xl">{cans.length} / {MAX_CANS}</span>
          </div>
          <div className="p-4 flex flex-col items-center justify-center">
            <span className="text-sm text-slate-500 mb-1">Canettes Sorties</span>
            <span className="font-bold text-blue-600 text-xl">{cansOut}</span>
          </div>
          <div className="p-4 flex flex-col items-center justify-center">
            <span className="text-sm text-slate-500 mb-1">Capteur Sortie</span>
            <span className={`font-bold ${canAtExit ? 'text-orange-500' : 'text-slate-400'}`}>
              {canAtExit ? 'DÉTECTION' : 'VIDE'}
            </span>
          </div>
        </div>

        {/* MODE REAL WARNING */}
        {mode === 'real' && (
          <div className="p-4 bg-orange-50 border-b border-orange-200 flex items-center gap-3 text-orange-800">
            <WifiOff className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm font-medium">Vous êtes en mode réel. L'interface tente de se connecter à l'ESP32 via Modbus TCP (RPi Backend requis). Fonctionnalités non simulées ici.</p>
          </div>
        )}

        <div className="p-6">
          {/* CONVEYOR VISUALIZATION */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <Info className="w-5 h-5"/> Visualisation du Convoyeur
            </h2>
            
            <div className="relative h-32 bg-slate-200 rounded-lg border-4 border-slate-300 overflow-hidden shadow-inner">
              {/* Conveyor Belt Pattern */}
              <div 
                className={`absolute inset-0 opacity-20 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTAgMGwyMCAyME0yMCAwbC0yMCAyMCIgc3Ryb2tlPSIjMDAwIiBzdHJva2Utd2lkdGg9IjIiLz48L3N2Zz4=')] ${motorRunning ? 'animate-[slide_1s_linear_infinite]' : ''}`}
                style={{ backgroundSize: '40px 40px' }}
              />

              {/* Start Line */}
              <div className="absolute top-0 bottom-0 left-0 w-4 bg-green-500/20 border-r-2 border-green-500 z-10 flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
              </div>
              
              {/* End Line */}
              <div className="absolute top-0 bottom-0 right-0 w-4 bg-red-500/20 border-l-2 border-red-500 z-10 flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-red-500"></div>
              </div>

              {/* Cans */}
              {cans.map(can => (
                <div 
                  key={can.id}
                  className="absolute top-1/2 -translate-y-1/2 w-8 h-12 bg-gray-400 rounded-md shadow-md border-2 border-gray-500 flex items-center justify-center z-20 transition-all duration-75 linearity"
                  style={{ left: `calc(${can.progress}% - ${can.progress >= 100 ? '32px' : '0px'})` }}
                >
                  <div className="w-full h-2 bg-red-500 mt-2"></div>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-xs text-slate-500 mt-2 font-medium">
              <span>ENTRÉE (Capteur 1)</span>
              <span>SORTIE (Capteur 2)</span>
            </div>
          </div>

          {/* CONTROLS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={handleAddCan}
              disabled={cans.length >= MAX_CANS || mode === 'real'}
              className="px-6 py-4 bg-blue-100 hover:bg-blue-200 text-blue-800 rounded-xl font-bold flex flex-col items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border-2 border-blue-200"
            >
              <span className="text-xl">Ajouter Canette</span>
              <span className="text-sm font-normal">Capteur Entrée (IHM)</span>
            </button>
            
            <button
              onClick={handleRetrieveCan}
              disabled={!canAtExit || mode === 'real'}
              className="px-6 py-4 bg-orange-100 hover:bg-orange-200 text-orange-800 rounded-xl font-bold flex flex-col items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border-2 border-orange-200"
            >
              <span className="text-xl">Récupérer Canette</span>
              <span className="text-sm font-normal">Capteur Sortie (IHM)</span>
            </button>
          </div>

          {mode === 'simulation' && (
            <div className="mt-8 flex justify-end">
               <button onClick={resetSim} className="text-sm text-slate-500 hover:text-slate-800 underline">Réinitialiser la simulation</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
