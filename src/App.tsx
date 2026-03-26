import React, { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import { AlertCircle, Download, RefreshCw, LogOut, Lock, User, Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx-js-style';

interface Glycemia {
  id: number;
  glucose_level: number;
  meal_type: string;
  timestamp: number;
  note: string | null;
}

const API_BASE = import.meta.env.VITE_API_URL || '';
const TOKEN_KEY = import.meta.env.VITE_TOKEN_KEY || 'glucose_token';

const formatDate = (unix: number) => {
  const d = new Date(unix * 1000);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${month}/${day}/${year}`;
};

const formatHour = (unix: number) => {
  const d = new Date(unix * 1000);
  const isAm = d.getHours() < 12;
  const hours = d.getHours() % 12;
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes} ${isAm ? 'AM' : 'PM'}`;
};

const mealTypeLabels: Record<string, string> = {
  BREAKFAST: 'Desayuno',
  LUNCH: 'Almuerzo',
  DINNER: 'Cena',
  OTHER: 'Otro',
};

const getGlucoseColor = (level: number) => {
  if (level < 70) return 'text-blue-600 bg-blue-50 border-blue-200';
  if (level <= 140) return 'text-emerald-600 bg-emerald-50 border-emerald-200';
  if (level <= 200) return 'text-amber-600 bg-amber-50 border-amber-200';
  return 'text-rose-600 bg-rose-50 border-rose-200';
};

// ─── Login Screen ────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }: { onLogin: (token: string) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        const { token } = await res.json();
        localStorage.setItem(TOKEN_KEY, token);
        onLogin(token);
      } else {
        setError('Usuario o contraseña incorrectos.');
      }
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#E4E3E0] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 32, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm"
      >
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-[#141414] mb-6 shadow-[4px_4px_0px_0px_rgba(20,20,20,0.3)]">
            <Lock size={24} className="text-[#E4E3E0]" />
          </div>
          <h1 className="text-3xl font-serif italic tracking-tight text-[#141414]">Glucose Tracker</h1>
          <p className="text-xs uppercase tracking-widest opacity-40 mt-2">Registro de Glucosa — Acceso Restringido</p>
        </div>

        <div className="bg-white border border-[#141414] shadow-[6px_6px_0px_0px_rgba(20,20,20,1)] p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-[10px] uppercase tracking-widest opacity-50 mb-2">Usuario</label>
              <div className="relative">
                <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-30" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full border border-[#141414] pl-9 pr-4 py-3 text-sm font-mono bg-[#F8F8F7] focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#141414] transition-all"
                  placeholder="admin"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest opacity-50 mb-2">Contraseña</label>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-30" />
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-[#141414] pl-9 pr-10 py-3 text-sm font-mono bg-[#F8F8F7] focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#141414] transition-all"
                  placeholder="••••••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 opacity-30 hover:opacity-70 transition-opacity"
                >
                  {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-2 text-rose-600 text-xs bg-rose-50 border border-rose-200 px-3 py-2"
                >
                  <AlertCircle size={14} />
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#141414] text-[#E4E3E0] py-3 text-xs uppercase font-bold tracking-widest hover:bg-gray-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <RefreshCw size={14} className="animate-spin" /> : 'Iniciar Sesión'}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
function Dashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [status, setStatus] = useState<{ status: string; botStarted: boolean } | null>(null);
  const [glycemias, setGlycemias] = useState<Glycemia[]>([]);
  const [loading, setLoading] = useState(true);

  const authFetch = useCallback((url: string) =>
    fetch(`${API_BASE}${url}`, { headers: { Authorization: `Bearer ${token}` } }), [token]);

  const fetchData = useCallback(async () => {
    try {
      const [healthRes, glycemiasRes] = await Promise.all([
        authFetch('/api/health'),
        authFetch('/api/glycemias?days=30'),
      ]);
      if (healthRes.status === 401) { onLogout(); return; }
      setStatus(await healthRes.json());
      setGlycemias(await glycemiasRes.json());
    } catch (err) {
      console.error('Error al cargar datos:', err);
    } finally {
      setLoading(false);
    }
  }, [authFetch, onLogout]);

  useEffect(() => {
    const socket = io(API_BASE);

    socket.on("glycemia_updated", () => {
      console.log("New glycemia detected! Refreshing...");
      fetchData();
    });

    return () => {
      socket.disconnect();
    };
  }, [fetchData]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const exportToXlsx = () => {
    const wb = XLSX.utils.book_new();
    const data = glycemias.map((g) => ({
      ID: g.id,
      'Nivel de Glucosa': g.glucose_level,
      'Tipo de Comida': mealTypeLabels[g.meal_type] || g.meal_type,
      Fecha: formatDate(g.timestamp),
      Hora: formatHour(g.timestamp),
      Nota: g.note || '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);

    ws['!cols'] = [{ wch: 6 }, { wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 30 }];

    const headerStyle = {
      font: { bold: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "141414" } },
      alignment: { horizontal: "center" }
    };

    ['A1', 'B1', 'C1', 'D1', 'E1', 'F1'].forEach(cell => {
      if (ws[cell]) ws[cell].s = headerStyle;
    });

    XLSX.utils.book_append_sheet(wb, ws, 'glucosa');
    XLSX.writeFile(wb, `glucosa_${new Date().toLocaleDateString('es-CR').replace(/\//g, '-')}.xlsx`);
  };

  // glycemias are sorted oldest→newest from API, display with newest at top
  const displayGlycemias = [...glycemias].reverse();

  const now = Math.floor(Date.now() / 1000);
  const periods = [
    { label: '24h', seconds: 24 * 60 * 60 },
    { label: '3d', seconds: 3 * 24 * 60 * 60 },
    { label: '7d', seconds: 7 * 24 * 60 * 60 },
    { label: '30d', seconds: 30 * 24 * 60 * 60 },
  ];

  const getStats = (seconds: number) => {
    const filtered = glycemias.filter(g => g.timestamp >= now - seconds);
    if (filtered.length === 0) return null;
    const avg = Math.round(filtered.reduce((s, g) => s + g.glucose_level, 0) / filtered.length);
    const inRange = filtered.filter(g => g.glucose_level >= 70 && g.glucose_level <= 140).length;
    const low = filtered.filter(g => g.glucose_level < 70).length;
    const high = filtered.filter(g => g.glucose_level > 180).length;
    return { avg, inRange, low, high, count: filtered.length };
  };

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] font-sans p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8 md:mb-12 border-b border-[#141414] pb-6 flex justify-between items-end">
          <div>
            <h1 className="text-3xl md:text-4xl font-serif italic tracking-tight">Glucose Tracker</h1>
          </div>
          <button onClick={onLogout} className="flex items-center gap-1.5 border border-[#141414] px-3 py-1.5 text-[10px] md:text-xs uppercase font-bold hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors">
            <LogOut size={13} /> Salir
          </button>
        </header>

        {/* Status and Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white border border-[#141414] p-6 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]">
            <h2 className="font-serif italic text-xl mb-4">Estado del Sistema</h2>
            <div className="space-y-2 text-sm font-mono">
              <div className="flex justify-between"><span>Bot:</span> <span>{status?.botStarted ? 'ACTIVO' : 'OFFLINE'}</span></div>
              <div className="flex justify-between"><span>Registros (30 días):</span> <span>{glycemias.length}</span></div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-[#141414] text-[#E4E3E0] p-6 shadow-[4px_4px_0px_0px_rgba(228,227,224,1)]">
            <h2 className="font-serif italic text-xl mb-6 border-b border-[#333] pb-2 text-white/90">Promedios por Período</h2>
            <div className="grid grid-cols-2 gap-4">
              {periods.map(p => {
                const stats = getStats(p.seconds);
                return (
                  <div key={p.label} className="flex flex-col">
                    <span className="text-[10px] uppercase tracking-widest opacity-60">{p.label}</span>
                    {stats ? (
                      <span className={`font-mono text-xl font-bold ${stats.avg < 70 || stats.avg > 180 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {stats.avg} <span className="text-[10px] opacity-60">mg/dL</span>
                      </span>
                    ) : (
                      <span className="font-mono text-xl opacity-30">—</span>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        </div>

        {/* Glycemias List */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="border border-[#141414] p-4 md:p-6 bg-white shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] mb-6"
        >
          <div className="flex flex-row justify-between items-center mb-6 gap-2">
            <h2 className="font-serif italic text-xl md:text-2xl">Últimos 7 días</h2>
            <div className="flex gap-2">
              <button onClick={fetchData} className="p-2 border border-[#141414] hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors">
                <RefreshCw size={14} />
              </button>
              <button onClick={exportToXlsx} className="flex items-center gap-2 bg-[#141414] text-[#E4E3E0] px-3 py-2 text-[10px] uppercase font-bold hover:bg-gray-800 transition-colors">
                <Download size={14} /> <span className="hidden sm:inline">Exportar</span>
              </button>
            </div>
          </div>

          {loading ? (
            <div className="py-12 text-center animate-pulse text-xs uppercase opacity-50">Cargando...</div>
          ) : displayGlycemias.length === 0 ? (
            <p className="text-center opacity-40 py-12 text-xs uppercase">No hay registros de glucosa</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[10px] sm:text-xs md:text-sm">
                <thead>
                  <tr className="border-b-2 border-[#141414]">
                    <th className="text-left py-3 px-1 w-6 opacity-40 font-normal uppercase">ID</th>
                    <th className="text-left py-3 px-1 md:px-2 opacity-40 font-normal uppercase">Glucosa</th>
                    <th className="text-left py-3 px-1 md:px-2 opacity-40 font-normal uppercase">Comida</th>
                    <th className="text-center py-3 px-1 md:px-2 opacity-40 font-normal uppercase">Fecha</th>
                    <th className="hidden md:table-cell text-center py-3 px-2 opacity-40 font-normal uppercase">Hora</th>
                    <th className="text-left py-3 px-1 md:px-2 opacity-40 font-normal uppercase">Nota</th>
                  </tr>
                </thead>
                <tbody>
                  {displayGlycemias.map((g, i) => (
                    <tr key={g.id} className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                      <td className="py-3 px-1 font-mono opacity-30 text-[9px]">#{g.id}</td>
                      <td className={`py-3 px-1 md:px-2 font-mono font-bold ${getGlucoseColor(g.glucose_level)}`}>
                        {g.glucose_level} <span className="text-[8px] opacity-60">mg/dL</span>
                      </td>
                      <td className="py-3 px-1 md:px-2">
                        <span className="inline-block px-1.5 py-0.5 md:px-2 md:py-1 text-[8px] md:text-[10px] font-bold uppercase rounded bg-gray-100 text-gray-700">
                          {mealTypeLabels[g.meal_type] || g.meal_type}
                        </span>
                      </td>
                      <td className="py-3 px-1 md:px-2 text-center font-mono">
                        {formatDate(g.timestamp)}
                      </td>
                      <td className="hidden md:table-cell py-3 px-2 text-center font-mono">
                        {formatHour(g.timestamp)}
                      </td>
                      <td className="py-3 px-1 md:px-2 italic opacity-70 text-[9px] md:text-xs leading-tight max-w-[80px] md:max-w-[200px] truncate">
                        {g.note || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const handleLogin = (t: string) => setToken(t);
  const handleLogout = () => { localStorage.removeItem(TOKEN_KEY); setToken(null); };

  return (
    <AnimatePresence mode="wait">
      {token ? (
        <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <Dashboard token={token} onLogout={handleLogout} />
        </motion.div>
      ) : (
        <motion.div key="login" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <LoginScreen onLogin={handleLogin} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
