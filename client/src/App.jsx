import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { io } from 'socket.io-client';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import './App.css';

// Inyectar tipografía Premium directamente
const fontLink = document.createElement('link');
fontLink.href = 'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap';
fontLink.rel = 'stylesheet';
document.head.appendChild(fontLink);
import { 
  Send, 
  Upload, 
  CheckCircle, 
  XCircle, 
  MessageSquare, 
  User, 
  Users,
  Settings, 
  QrCode,
  Layout,
  RefreshCw,
  Clock,
  Trash,
  LogIn,
  List,
  Monitor,
  Trash2,
  AlertCircle,
  ShieldCheck
} from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './components/Login';
import AdminPanel from './components/AdminPanel';

const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3001`;
// socket se moverá dentro de AppContent para mejor control del ciclo de vida

const AppContent = () => {
  const { currentUser, userProfile, logout, loading } = useAuth();
  const [activeView, setActiveView] = useState('dashboard'); // 'dashboard' | 'admin'
  const [qr, setQr] = useState(null);
  const [ready, setReady] = useState(false);
  const [excelData, setExcelData] = useState([]);
  const [logs, setLogs] = useState([]);
  const [progress, setProgress] = useState({ index: 0, total: 0 });
  const [sessions, setSessions] = useState({});
  const [viewingSession, setViewingSession] = useState(null);
  const [whatsappStatus, setWhatsappStatus] = useState({ state: 'INITIALIZING', message: 'Iniciando WhatsApp Web...' });
  
  // Instancia de socket memoizada para esta montura del componente
  const socket = useMemo(() => io(API_URL, {
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  }), []);

  // Estos hooks DEBEN ir antes de cualquier return condicional
  const onDrop = useCallback(async (acceptedFiles) => {
    const file = acceptedFiles[0];
    const formData = new FormData();
    formData.append('file', file);
    try {
      const response = await axios.post(`${API_URL}/upload`, formData);
      setExcelData(response.data);
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Error al subir el archivo Excel.');
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']
    }
  });

  const [messageTemplate, setMessageTemplate] = useState('👋 *Hola {{Nombre}}*\n🏥 El *Hospital de Curepto* le recuerda su próxima cita:\n📆 *{{DiaSemana}} {{FechaDisplay}}*  ⏰ *{{HoraCita}}*\n📄 *Motivo:* {{Motivo}}\n\n--------------------------\n🙏 *POR FAVOR RESPONDA:*\n✅ Marque **1** para *CONFIRMAR*\n❌ Marque **2** para *CANCELAR*\n--------------------------\n\n📞 Consultas: *75 256 5688*\n🌐 *¿No puede asistir? Reagende aquí:* https://telesalud.gob.cl/\n⏳ Llegue con *20 minutos de anticipación*\n\n💙 ¡Muchas gracias por su atención!');
  const [isSending, setIsSending] = useState(false);
  const [delay, setDelay] = useState(3000);

  const previewMessage = useMemo(() => {
    let temp = messageTemplate;
    const sample = (excelData && excelData.length > 0) ? excelData[0] : {
      Nombre: 'Cristian Pardo',
      FechaDisplay: '12-07-2026',
      HoraCita: '09:30',
      DiaSemana: 'LUNES',
      Motivo: 'Consulta Médica'
    };
    
    temp = temp.replace(/{{Nombre}}/gi, String(sample.Nombre || ''));
    temp = temp.replace(/{{FechaDisplay}}/gi, String(sample.FechaDisplay || ''));
    temp = temp.replace(/{{HoraCita}}/gi, String(sample.HoraCita || ''));
    temp = temp.replace(/{{DiaSemana}}/gi, String(sample.DiaSemana || ''));
    temp = temp.replace(/{{Motivo}}/gi, String(sample.Motivo || ''));
    return temp;
  }, [messageTemplate, excelData]);

  useEffect(() => {
    if (socket.connected) {
      socket.emit('request_status');
    }
    socket.on('connect', () => {
      socket.emit('request_status');
    });
    socket.on('qr', (url) => {
      setQr(url);
      setReady(false);
      // Al recibir un nuevo QR (especialmente tras reset), volvemos al Dashboard para verlo
      setActiveView('dashboard');
    });
    socket.on('ready', (isReady) => {
      setReady(isReady);
      if (isReady) {
        setQr(null);
        setActiveView('dashboard');
      }
    });
    socket.on('disconnect', () => {
      setReady(false);
      setQr(null);
    });
    socket.on('log', (log) => {
      setLogs(prev => [
        { 
          time: new Date().toLocaleTimeString(), 
          status: log.includes('Error') ? 'error' : 'success',
          text: log 
        }, 
        ...prev.slice(0, 50)
      ]);
    });
    socket.on('progress', (data) => {
      if (data.index !== undefined) {
        setProgress({ index: data.index + 1, total: data.total });
      }
    });
    socket.on('finished', () => {
      setIsSending(false);
      alert('¡Envío finalizado!');
    });
    socket.on('initial_sessions', (data) => {
      console.log("Sesiones recibidas:", Object.keys(data || {}).length);
      setSessions(data || {});
    });
    socket.on('status_update', (data) => {
      setSessions(prev => ({
        ...prev,
        [data.id]: data.data ? data.data : { ...prev[data.id], status: data.status, lastUpdated: new Date().toISOString() }
      }));
    });
    socket.on('whatsapp_status', (status) => {
      console.log("Status update received:", status);
      setWhatsappStatus(status);
    });

    // Cleanup completo al desmontar (logout)
    return () => {
      console.log("Cleanup: Desconectando socket y removiendo listeners");
      socket.off('connect');
      socket.off('qr');
      socket.off('ready');
      socket.off('log');
      socket.off('progress');
      socket.off('finished');
      socket.off('initial_sessions');
      socket.off('status_update');
      socket.off('whatsapp_status');
      socket.disconnect(); 
    };
  }, [socket]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-[32px] bg-white p-12 text-center shadow-xl ring-1 ring-slate-200">
          <RefreshCw className="mx-auto mb-6 animate-spin text-emerald-500" size={48} />
          <h2 className="text-2xl font-bold tracking-tight">Iniciando Sistema...</h2>
          <p className="mt-2 text-slate-500 font-medium">Conectando con el Hospital de Curepto</p>
          <div className="mt-8 h-1 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full w-1/3 animate-[progress_2s_ease-in-out_infinite] bg-emerald-500"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser) return <Login />;

  const handleLogout = async () => {
    try {
      await logout();
      setReady(false);
      setQr(null);
      setExcelData([]);
      setActiveView('dashboard');
    } catch (e) {
      console.error("Error al cerrar sesión:", e);
    }
  };

  const clearSessions = async () => {
    if (!window.confirm('¿Estás seguro de limpiar todo el historial de confirmaciones?')) return;
    try {
      const token = await currentUser.getIdToken();
      await fetch(`${API_URL}/sessions`, { 
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      setSessions({});
    } catch (e) {
      console.error('Error clearing sessions:', e);
    }
  };

  const deleteIndividualSession = async (id) => {
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(`${API_URL}/sessions/${id}`, { 
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        setSessions(prev => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    } catch (e) {
      console.error('Error deleting session:', e);
    }
  };

  const handleSendMessages = async () => {
    if (!excelData || excelData.length === 0 || !currentUser) return;
    setIsSending(true);
    setLogs([]);
    try {
      const token = await currentUser.getIdToken();
      await axios.post(`${API_URL}/send-messages`, {
        data: excelData,
        messageTemplate: messageTemplate,
        delay
      }, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
    } catch (error) {
      console.error('Error sending messages:', error);
      alert('Error al enviar los mensajes. El servidor no pudo autenticar tu sesión.');
      setIsSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 p-6 text-slate-800 font-sans">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* HEADER MODERNO */}
        <header className="rounded-[32px] bg-white shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-2xl shadow-inner">
                <img src="/logo.png" alt="Logo" className="h-10 w-10 object-contain" />
              </div>
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-600">Hospital de Curepto</p>
                <h1 className="text-3xl font-bold tracking-tight">Curepto Bot</h1>
                <p className="mt-1 text-sm text-slate-500">Gestión de campañas masivas y seguimiento de citas vía WhatsApp.</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className={`rounded-full px-4 py-2 text-sm font-semibold border ${ready ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                ● {ready ? 'Conexión Estable' : 'Desconectado'}
              </span>
              {userProfile?.role === 'ADMIN' && (
                <button 
                  onClick={() => setActiveView(activeView === 'dashboard' ? 'admin' : 'dashboard')}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold shadow-sm transition hover:bg-slate-100 flex items-center gap-2"
                >
                  {activeView === 'dashboard' ? <Settings size={16} /> : <Layout size={16} />}
                  {activeView === 'dashboard' ? 'Panel Admin' : 'Volver al Dashboard'}
                </button>
              )}
              <button 
                onClick={handleLogout}
                className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 flex items-center gap-2"
              >
                <LogIn size={16} /> Salir
              </button>
            </div>
          </div>
        </header>

        {activeView === 'dashboard' ? (
          <>
            {/* STATS REAL-TIME */}
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
               <div className="rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-slate-200">
                  <p className="text-sm text-slate-500">Estado Enlace</p>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <h2 className={`text-2xl font-bold ${ready ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {ready ? 'Activo' : 'Inactivo'}
                    </h2>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                      {ready ? 'Online' : 'Esperando...'}
                    </span>
                  </div>
                </div>

                <div className="rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-slate-200">
                  <p className="text-sm text-slate-500">Sesión WhatsApp</p>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <h2 className="text-2xl font-bold">{ready ? 'Sincronizada' : (qr ? 'Pendiente' : 'Iniciando')}</h2>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                      {ready ? 'Enlace OK' : 'QR Requerido'}
                    </span>
                  </div>
                </div>

                <div className="rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-slate-200">
                  <p className="text-sm text-slate-500">Contactos Cargados</p>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <h2 className="text-2xl font-bold">{excelData.length.toLocaleString()}</h2>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">de Excel</span>
                  </div>
                </div>

                <div className="rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-slate-200">
                  <p className="text-sm text-slate-500">Actividad Radar</p>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <h2 className="text-2xl font-bold">{Object.keys(sessions).length}</h2>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">en vivo</span>
                  </div>
                </div>
            </section>

            <main className="grid gap-6 xl:grid-cols-[1.4fr_0.95fr]">
              <section className="space-y-6">
                <div className="rounded-[32px] bg-white p-6 shadow-sm ring-1 ring-slate-200">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h2 className="text-2xl font-bold">Módulo de Campaña</h2>
                      <p className="mt-1 text-sm text-slate-500">Carga archivos, ajusta plantillas y lanza envíos masivos.</p>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
                    {/* COLUMNA IZQUIERDA: CARGA Y QR */}
                    <div className="space-y-4">
                      {/* PASO 1: CONEXIÓN / QR */}
                      <div className="rounded-[28px] bg-white p-6 shadow-sm ring-1 ring-slate-200">
                        <div className="flex items-center justify-between gap-4 mb-6">
                          <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500">Vincular Dispositivo</h3>
                          <button 
                            onClick={() => socket.emit('request_status')}
                            className="p-1 px-2 text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg flex items-center gap-1 transition-all"
                          >
                            <RefreshCw size={10} className="text-slate-400" /> Forzar Sincro
                          </button>
                        </div>
                        
                        {ready ? (
                          <div className="flex flex-col items-center justify-center py-6 bg-emerald-50 rounded-2xl border border-emerald-100">
                            <ShieldCheck className="text-emerald-500 mb-3" size={48} />
                            <p className="text-sm font-bold text-emerald-800">WhatsApp Vinculado</p>
                            <p className="text-[10px] text-emerald-600 mt-1">Listo para recibir respuestas.</p>
                          </div>
                        ) : qr ? (
                          <div className="flex flex-col items-center">
                            <div className="relative group">
                              <img src={qr} alt="QR Code" className="w-48 h-48 mb-4 border-2 border-slate-100 p-2 rounded-2xl bg-white shadow-lg" />
                              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-white/80 transition-opacity rounded-2xl">
                                <button onClick={() => socket.emit('request_status')} className="bg-slate-900 text-white p-2 rounded-full shadow-lg">
                                  <RefreshCw size={24} />
                                </button>
                              </div>
                            </div>
                            <p className="text-xs font-bold text-slate-900 animate-pulse flex items-center gap-2">
                              <QrCode size={14} className="text-emerald-500" /> Escanea con tu celular
                            </p>
                            <p className="text-[10px] text-slate-400 mt-2">Abre WhatsApp &gt; Dispositivos vinculados</p>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center py-10">
                            <RefreshCw className="animate-spin text-slate-300 mb-4" size={32} />
                            <p className="text-xs font-medium text-slate-400 italic">
                              {whatsappStatus.message || "Ubicando motor..."}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* PASO 2: CARGA DE EXCEL */}
                      <div className="rounded-[28px] border-2 border-dashed border-slate-200 bg-slate-50 p-6 text-center">
                        <div {...getRootProps()} className="cursor-pointer">
                          <input {...getInputProps()} />
                          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-2xl shadow-sm">
                            <Upload className={excelData.length > 0 ? 'text-emerald-500' : 'text-slate-400'} />
                          </div>
                          <h3 className="mt-4 text-lg font-semibold">Carga de Base de Datos</h3>
                          <p className="mt-2 text-sm text-slate-500">
                            {excelData.length > 0 ? `✅ ${excelData.length} contactos detectados.` : 'Arrastra tu archivo Excel aquí o haz clic para subir.'}
                          </p>
                          <button className={`mt-5 rounded-2xl px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition ${excelData.length > 0 ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-400 hover:bg-slate-500'}`}>
                            {excelData.length > 0 ? 'Cambiar Archivo' : 'Seleccionar Excel'}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* COLUMNA DERECHA: EDITOR Y PREVIEW */}
                    <div className="space-y-4">
                      <div className="rounded-[28px] bg-slate-50 p-5 ring-1 ring-slate-200">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="text-lg font-semibold">Redacción Técnica</h3>
                          <button 
                            className="rounded-xl bg-white px-3 py-1.5 text-sm font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"
                            onClick={() => setMessageTemplate(prev => prev + " {{Nombre}}")}
                          >
                            + Variable
                          </button>
                        </div>
                        <textarea 
                          value={messageTemplate}
                          onChange={(e) => setMessageTemplate(e.target.value)}
                          className="mt-4 w-full rounded-2xl bg-white p-4 font-mono text-sm leading-6 text-slate-700 shadow-inner ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          rows={6}
                        />
                      </div>

                      <div className="rounded-[28px] bg-white p-5 ring-1 ring-slate-200 shadow-sm">
                        <h3 className="text-lg font-semibold">Vista de Paciente</h3>
                        <div className="mt-4 rounded-[24px] bg-slate-900 p-5 text-sm leading-7 text-white shadow-sm border-l-4 border-emerald-500">
                           <p className="whitespace-pre-wrap">{previewMessage}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* BARRA DE CONTROL LATERAL */}
              <aside className="space-y-6">
                <div className="rounded-[32px] bg-white p-6 shadow-sm ring-1 ring-slate-200">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-2xl font-bold">Lanzamiento</h2>
                      <p className="mt-1 text-sm text-slate-500">Verifica antes de iniciar el envío masivo.</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${ready && excelData.length > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                      {ready && excelData.length > 0 ? 'Listo' : 'Faltan Requisitos'}
                    </span>
                  </div>

                  <div className="mt-5 grid gap-3">
                    <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100">
                      <p className="text-sm text-slate-500">Estado Conexión</p>
                      <div className="mt-1 font-semibold flex items-center gap-2">
                        {ready ? <CheckCircle size={14} className="text-emerald-500"/> : <AlertCircle size={14} className="text-amber-500"/>}
                        {ready ? 'WhatsApp Vinculado' : 'Esperando QR...'}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100">
                      <p className="text-sm text-slate-500">Carga de Datos</p>
                      <p className="mt-1 font-semibold">{excelData.length ? `${excelData.length} registros cargados` : 'Ninguna base cargada'}</p>
                    </div>
                  </div>

                  <div className="mt-5 flex gap-3">
                    <button 
                      className={`flex-1 rounded-2xl py-4 text-sm font-extrabold text-white shadow-md transition-all ${isSending || !ready || excelData.length === 0 ? 'bg-slate-300 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700 hover:scale-[1.02] active:scale-95'}`}
                      disabled={isSending || !ready || excelData.length === 0}
                      onClick={handleSendMessages}
                    >
                      {isSending ? "PROCESANDO ENVÍOS..." : "► LANZAR CAMPAÑA"}
                    </button>
                  </div>
                  {isSending && (
                    <div className="mt-4">
                      <div className="flex justify-between text-xs text-slate-500 mb-1">
                        <span>Progreso: {progress.index} / {progress.total}</span>
                        <span>{Math.round((progress.index / progress.total) * 100)}%</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2">
                        <div className="bg-emerald-500 h-2 rounded-full transition-all duration-500" style={{width: `${(progress.index / progress.total) * 100}%`}}></div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-[32px] bg-slate-950 p-6 text-white shadow-xl">
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                      <Monitor size={18} className="text-emerald-400" /> Terminal Socket
                    </h2>
                    <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400 border border-emerald-500/20 uppercase tracking-widest">Live</span>
                  </div>
                  <div className="h-64 overflow-y-auto rounded-2xl bg-black/40 p-4 font-mono text-[12px] leading-6 text-slate-300 ring-1 ring-white/10 custom-scrollbar">
                    {logs.length > 0 ? logs.map((log, i) => (
                      <p key={i} className="flex gap-2">
                         <span className="text-slate-500">[{log.time}]</span>
                         <span className={log.status === 'error' ? 'text-red-400' : 'text-emerald-400'}>{log.text}</span>
                      </p>
                    )) : (
                      <p className="text-slate-600 italic">Esperando tráfico de red...</p>
                    )}
                  </div>
                </div>
              </aside>
            </main>

            {/* MONITOR DE CONFIRMACIONES (TABLA RESTAURADA) */}
            <section className="rounded-[32px] bg-white p-6 shadow-sm ring-1 ring-slate-200">
               <div className="flex items-center justify-between mb-6">
                 <h2 className="text-2xl font-bold flex items-center gap-3"><List className="text-emerald-500"/> Monitor de Confirmaciones</h2>
                 <button onClick={clearSessions} className="text-xs font-semibold text-red-500 uppercase tracking-widest border border-red-200 px-3 py-1 rounded-lg hover:bg-red-50">Purgar Sesiones</button>
               </div>

               <div className="overflow-hidden rounded-2xl border border-slate-100">
                 <table className="w-full text-left text-sm">
                   <thead className="bg-slate-50 text-slate-500 uppercase text-[11px] font-bold tracking-widest">
                      <tr>
                        <th className="px-6 py-4">Paciente</th>
                        <th className="px-6 py-4">Teléfono</th>
                        <th className="px-6 py-4">Cita</th>
                        <th className="px-6 py-4">Motivo</th>
                        <th className="px-6 py-4">Estado</th>
                        <th className="px-6 py-4">Actualización</th>
                        <th className="px-6 py-4 text-right">Acción</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100">
                      {Object.keys(sessions).length === 0 ? (
                        <tr>
                          <td colSpan="7" className="px-6 py-12 text-center text-slate-400 italic">Sin datos registrados en el radar clínico.</td>
                        </tr>
                      ) : Object.entries(sessions).map(([id, session]) => (
                        <tr key={id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 font-bold">{session.Nombre || session.nombre}</td>
                          <td className="px-6 py-4 text-slate-500">{session.Celular || session.telefonoOriginal || id}</td>
                          <td className="px-6 py-4">
                            <span className="block font-medium">{session.FechaDisplay || session.fecha}</span>
                            <span className="text-[11px] text-slate-400">{session.HoraCita || session.hora}</span>
                          </td>
                          <td className="px-6 py-4">
                            <button onClick={() => setViewingSession(session)} className="text-emerald-600 underline underline-offset-4 decoration-emerald-200">Ver ficha</button>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              session.status === 'Confirmada' ? 'bg-emerald-100 text-emerald-700' : 
                              session.status === 'Cancelada' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                            }`}>
                              {session.status || 'Enviado'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-slate-400 text-xs font-mono">
                            {session.lastUpdated ? new Date(session.lastUpdated).toLocaleTimeString('es-CL') : '--:--:--'}
                          </td>
                          <td className="px-6 py-4 text-right">
                             <button onClick={() => deleteIndividualSession(id)} className="text-red-300 hover:text-red-500"><Trash2 size={16}/></button>
                          </td>
                        </tr>
                      ))}
                   </tbody>
                 </table>
               </div>
            </section>
          </>
        ) : (
          <div className="max-w-4xl mx-auto">
            <AdminPanel />
          </div>
        )}
      </div>

      {/* MODAL DE DETALLE */}
      {viewingSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-6" onClick={() => setViewingSession(null)}>
           <div className="w-full max-w-md rounded-[32px] bg-white p-8 shadow-2xl ring-1 ring-slate-200 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
              <h2 className="text-2xl font-bold mb-4">Detalle del Paciente</h2>
              <div className="space-y-4 rounded-2xl bg-slate-50 p-6 ring-1 ring-slate-200">
                 <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Nombre</p>
                    <p className="text-lg font-semibold">{viewingSession.Nombre || viewingSession.nombre}</p>
                 </div>
                 <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Teléfono</p>
                    <p className="font-semibold text-slate-600">{viewingSession.Celular || viewingSession.telefonoOriginal}</p>
                 </div>
                 <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Motivo Detectado</p>
                    <p className="font-medium text-slate-600 italic bg-white p-3 rounded-xl mt-1 border border-slate-100">"{viewingSession.Motivo || viewingSession.motivo}"</p>
                 </div>
              </div>
              <button 
                className="mt-6 w-full rounded-2xl bg-slate-900 py-3 font-semibold text-white transition hover:opacity-90" 
                onClick={() => setViewingSession(null)}
              >
                Cerrar Ventana
              </button>
           </div>
        </div>
      )}
    </div>
  );
};

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
