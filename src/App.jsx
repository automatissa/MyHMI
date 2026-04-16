import { useState } from 'react';
import ConvoyeurCanettes from './convoyeur/ConvoyeurCanettes.jsx';
import DistributeurJus from './distributeur_jus/DistributeurJus.jsx';
import TrieuseCaisses from './trieuse_caisse/TrieuseCaisse.jsx';
import Lampe from './lampe/Lampe.jsx';
import { Package, Droplets, MonitorSpeaker, Zap, Lightbulb } from 'lucide-react';

const SCREENS = {
  convoyeur: 'convoyeur',
  jus: 'jus',
  tri: 'tri',
  lampe: 'lampe',
};
export default function App() {
  const [screen, setScreen] = useState(SCREENS.convoyeur);
  const [lampState, setLampState] = useState(false);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* NAVIGATION */}
      <nav className="bg-slate-900 border-b border-slate-800">
        <div className="flex items-center justify-between p-4 md:p-6 max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <div className="bg-blue-600 p-3 rounded-2xl shadow-lg shadow-blue-900/20">
              <MonitorSpeaker size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-white uppercase">HMI Industrie 4.0</h1>
              <p className="text-slate-500 text-xs font-mono uppercase tracking-widest">Digital Twin : ESP32 Modbus TCP</p>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setScreen(SCREENS.convoyeur)}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl transition-all font-medium text-sm ${
                screen === SCREENS.convoyeur
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              }`}
            >
              <Package size={18} />
              Convoyeur Canettes
            </button>

            <button
              onClick={() => setScreen(SCREENS.jus)}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl transition-all font-medium text-sm ${
                screen === SCREENS.jus
                  ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/30'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              }`}
            >
              <Droplets size={18} />
              Distributeur Jus
            </button>

            <button
              onClick={() => setScreen(SCREENS.tri)}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl transition-all font-medium text-sm ${
                screen === SCREENS.tri
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/30'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              }`}
            >
            
              <Zap size={18} />
              Tri Caisses
            </button>

            <button
              onClick={() => setScreen(SCREENS.lampe)}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl transition-all font-medium text-sm ${
                screen === SCREENS.lampe
                  ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/30'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              }`}
            >
              <Lightbulb size={18} />
              Lampe
            </button>

          </div>
        </div>
      </nav>

            {/* CONTENU */}
      <main className="p-4 md:p-8">
        {screen === SCREENS.convoyeur && <ConvoyeurCanettes />}
        {screen === SCREENS.jus && <DistributeurJus />}
        {screen === SCREENS.tri && <TrieuseCaisses />}
        {screen === SCREENS.lampe && (
          <Lampe 
            lampState={lampState} 
            onToggleLamp={() => setLampState(!lampState)}
            isSimulationMode={true}
            modbusConnected={false}
          />
        )}
      </main>
    </div>
  );
}
