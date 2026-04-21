import { useState } from 'react';
import ConvoyeurCanettes  from './convoyeur/ConvoyeurCanettes.jsx';
import DistributeurJus    from './distributeur_jus/DistributeurJus.jsx';
import TrieuseCaisses     from './trieuse_caisse/TrieuseCaisse.jsx';
import Lampe              from './lampe/Lampe.jsx';
import EmballageCanettes  from './emballage_canettes/EmballageCanettes.jsx';
import { Package, Package2, Droplets, MonitorSpeaker, Zap, Lightbulb } from 'lucide-react';

const NAV_ITEMS = [
  { key: 'convoyeur', label: 'Convoyeur',        icon: Package,    color: 'blue',   badge: 'RÉEL+SIM' },
  { key: 'jus',       label: 'Distributeur Jus', icon: Droplets,   color: 'amber',  badge: 'SIM'      },
  { key: 'tri',       label: 'Tri Caisses',       icon: Zap,        color: 'purple', badge: 'SIM'      },
  { key: 'emballage', label: 'Emballage',         icon: Package2,   color: 'rose',   badge: 'SIM'      },
  { key: 'lampe',     label: 'Lampe',             icon: Lightbulb,  color: 'yellow', badge: 'RÉEL+SIM' },
];

const COLOR_MAP = {
  blue:   { active: 'bg-blue-600 text-white',   badge: 'bg-blue-500/20 text-blue-300'    },
  yellow: { active: 'bg-yellow-500 text-slate-900', badge: 'bg-yellow-500/20 text-yellow-300' },
  amber:  { active: 'bg-amber-600 text-white',  badge: 'bg-amber-500/20 text-amber-300'  },
  purple: { active: 'bg-purple-600 text-white', badge: 'bg-purple-500/20 text-purple-300'},
  rose:   { active: 'bg-rose-600 text-white',   badge: 'bg-rose-500/20 text-rose-300'    },
};

export default function App() {
  const [screen, setScreen] = useState('convoyeur');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">

      {/* ── SIDEBAR ── */}
      <aside className="w-14 md:w-56 bg-slate-900 border-r border-slate-800 flex flex-col sticky top-0 h-screen z-40 shrink-0">

        {/* Logo */}
        <div className="flex items-center gap-3 px-3 py-4 border-b border-slate-800 h-16">
          <div className="bg-blue-600 p-2 rounded-xl shrink-0 shadow-lg shadow-blue-900/30">
            <MonitorSpeaker size={18} className="text-white" />
          </div>
          <div className="hidden md:block min-w-0">
            <p className="text-white font-black text-xs uppercase tracking-tight leading-none truncate">HMI Industrie 4.0</p>
            <p className="text-slate-500 text-[9px] font-mono uppercase tracking-widest mt-0.5">ESP32 · Modbus TCP</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(({ key, label, icon: Icon, color, badge }) => {
            const isActive = screen === key;
            const c = COLOR_MAP[color];
            return (
              <button
                key={key}
                onClick={() => setScreen(key)}
                title={label}
                className={`w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl transition-all text-sm font-medium ${
                  isActive
                    ? c.active + ' shadow-lg'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                }`}
              >
                <Icon size={17} className="shrink-0" />
                <span className="hidden md:block flex-1 text-left truncate">{label}</span>
                <span className={`hidden md:block text-[8px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                  isActive ? 'bg-white/20 text-white' : c.badge
                }`}>{badge}</span>
              </button>
            );
          })}
        </nav>

        {/* Footer version */}
        <div className="hidden md:block px-4 py-3 border-t border-slate-800">
          <p className="text-[9px] text-slate-600 font-mono">GPL-3.0 · MyHMI</p>
        </div>
      </aside>

      {/* ── CONTENU PRINCIPAL ── */}
      <main className="flex-1 min-w-0 overflow-auto p-4 md:p-6">
        {screen === 'convoyeur' && <ConvoyeurCanettes />}
        {screen === 'jus'       && <DistributeurJus />}
        {screen === 'tri'       && <TrieuseCaisses />}
        {screen === 'lampe'     && <Lampe />}
        {screen === 'emballage' && <EmballageCanettes />}
      </main>
    </div>
  );
}
