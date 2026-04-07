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
  Power,
  ShieldCheck,
  RotateCcw
} from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './components/Login';
import AdminPanel from './components/AdminPanel';


const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3001`;

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
  const [isCameliaActive, setIsCameliaActive] = useState(true);
  
  // States for manual sending
  const [manualPhone, setManualPhone] = useState('');
  const [manualMessage, setManualMessage] = useState('');
  const [isManualSending, setIsManualSending] = useState(false);
  
  // Instancia de socket memoizada
  const socket = useMemo(() => io(API_URL, {
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  }), []);

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

  const [messageTemplate, setMessageTemplate] = useState('👋 *Hola {{Nombre}}*\n🏥 El *Hospital de Curepto* le recuerda su próxima cita:\n📆 *{{DiaSemana}} {{FechaDisplay}}*  ⏰ *{{HoraCita}}*\n📄 *Motivo:* {{Motivo}}\n\n--------------------------\n🙏 *POR FAVOR RESPONDA:*\n✅ Marque **1** para *CONFIRMAR*\n❌ Marque **2** para *CANCELAR*\n⏳ Marque **3** para *REAGENDAR*\n--------------------------\n\n📞 Consultas: *75 256 5688*\n🌐 *¿No puede asistir? Reagende aquí:* https://telesalud.gob.cl/\n⏳ Llegue con *20 minutos de anticipación*\n\n💙 ¡Muchas gracias por su atención!');
  const [isSending, setIsSending] = useState(false);
  const [delay, setDelay] = useState(3000);

  const previewMessage = useMemo(() => {
    let temp = messageTemplate;
    const sample = (excelData && excelData.length > 0) ? excelData[0] : {
      Nombre: 'Cesar Maldonado',
      FechaDisplay: '18-12-2025',
      HoraCita: '09:24 a. m.',
      DiaSemana: 'Viernes',
      Motivo: 'ESTAMOS CASI LISTOS CON LA NUEVA APLICACIÓN DE MENSAJES'
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
      setActiveView('dashboard');
    });
    socket.on('ready', (isReady) => {
      setReady(isReady);
      if (isReady) {
        setQr(null);
        setActiveView('dashboard');
      }
    });

    socket.on('whatsapp_status', (status) => {
      setWhatsappStatus(status);
      if (status.state === 'READY') {
        setReady(true);
        setQr(null);
      } else if (status.state === 'QR_READY') {
        setReady(false);
      }
    });

    socket.on('log', (log) => {
      setLogs(prev => [
        { 
          time: new Date().toLocaleTimeString(), 
          status: log.includes('Error') || log.includes('❌') ? 'error' : 'success',
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
      setSessions(data || {});
    });

    socket.on('status_update', (data) => {
      setSessions(prev => ({
        ...prev,
        [data.id]: data.data ? data.data : { ...prev[data.id], status: data.status, lastUpdated: new Date().toISOString() }
      }));
    });

    socket.on('camelia_status', (active) => {
      setIsCameliaActive(active);
    });

    return () => {
      socket.off('connect');
      socket.off('qr');
      socket.off('ready');
      socket.off('log');
      socket.off('progress');
      socket.off('finished');
      socket.off('initial_sessions');
      socket.off('status_update');
      socket.off('whatsapp_status');
      socket.off('camelia_status');
    };
  }, [socket]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-[32px] bg-white p-12 text-center shadow-xl ring-1 ring-slate-200">
          <RefreshCw className="mx-auto mb-6 animate-spin text-emerald-500" size={48} />
          <h2 className="text-2xl font-bold tracking-tight">Iniciando Sistema...</h2>
          <p className="mt-2 text-slate-500 font-medium">Conectando con el Hospital de Curepto</p>
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

  const handleManualSend = async () => {
    if (!manualPhone || !manualMessage || !currentUser) return;
    setIsManualSending(true);
    try {
      const token = await currentUser.getIdToken();
      await axios.post(`${API_URL}/send-manual`, {
        phone: manualPhone,
        message: manualMessage
      }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      alert('Mensaje manual enviado correctamente.');
      setManualMessage('');
      setManualPhone('');
    } catch (error) {
      console.error('Error manual send:', error);
      const errorMsg = error.response?.data || error.message;
      if (errorMsg.includes('detached Frame') || error.response?.status === 503) {
        alert('⌛ El canal de WhatsApp se está sincronizando. Por favor, espera 10 segundos e intenta de nuevo.');
      } else {
        alert(errorMsg);
      }
    } finally {
      setIsManualSending(false);
    }
  };

  const handleResetWhatsApp = async () => {
    if (!window.confirm('⚠️ ¿Estás seguro de REINICIAR el motor de WhatsApp? Esto cerrará la sesión actual y forzará un nuevo arranque en el servidor.')) return;
    try {
      const token = await currentUser.getIdToken();
      await axios.post(`${API_URL}/whatsapp/reset`, {}, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      alert('Reinicio solicitado. El servidor tardará unos segundos en volver a generar un QR o reconectar.');
    } catch (error) {
      console.error('Error reset WhatsApp:', error);
      alert('Error al solicitar el reinicio. Verifica tu rol de Administrador.');
    }
  };

  const handleToggleCamelia = () => {
    socket.emit('toggle_camelia', !isCameliaActive);
  };

  const handleResendIndividual = async (id) => {
    if (!id || !ready || !currentUser) return;
    try {
      const token = await currentUser.getIdToken();
      await axios.post(`${API_URL}/resend-individual`, { id }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      alert('Reenvío solicitado con éxito.');
    } catch (error) {
      console.error('Error resending individual:', error);
      alert(error.response?.data || 'Error al reenviar mensaje.');
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
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch (error) {
      console.error('Error sending messages:', error);
      alert('Error al enviar los mensajes.');
      setIsSending(false);
    }
  };

  const clearSessions = async () => {
    if (!window.confirm('¿Estás seguro de limpiar todo el historial?')) return;
    try {
      const token = await currentUser.getIdToken();
      await fetch(`${API_URL}/sessions`, { 
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setSessions({});
    } catch (e) { console.error(e); }
  };

  const deleteIndividualSession = async (id) => {
    try {
      const token = await currentUser.getIdToken();
      await fetch(`${API_URL}/sessions/${id}`, { 
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setSessions(prev => { const n = {...prev}; delete n[id]; return n; });
    } catch (e) { console.error(e); }
  };

  return (
    <div className="min-h-screen bg-slate-100 p-6 text-slate-800 font-sans">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-[32px] bg-white shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-2xl shadow-inner">
                <img src="/logo.png" alt="Logo" className="h-10 w-10 object-contain" />
              </div>
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-600">Hospital de Curepto</p>
                <h1 className="text-3xl font-bold tracking-tight">Curepto Bot</h1>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className={`rounded-full px-4 py-2 text-sm font-semibold border ${ready ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                ● {ready ? 'Conexión Estable' : 'Desconectado'}
              </span>

              {userProfile?.role === 'ADMIN' && (
                <button 
                  onClick={handleToggleCamelia}
                  className={`rounded-2xl border px-4 py-2 text-sm font-semibold shadow-sm transition flex items-center gap-2 ${
                    isCameliaActive 
                      ? 'bg-emerald-600/10 text-emerald-700 border-emerald-200 hover:bg-emerald-600/20' 
                      : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                  }`}
                  title={isCameliaActive ? "Pausar Camelia" : "Activar Camelia"}
                >
                  <div className={`h-2 w-2 rounded-full ${isCameliaActive ? 'bg-emerald-500' : 'bg-slate-400'}`}></div>
                  Bot Camelia: <strong>{isCameliaActive ? 'ACTIVA' : 'PAUSADA'}</strong>
                </button>
              )}

              {userProfile?.role === 'ADMIN' && (
                <div className="flex gap-2">

                  <button 
                    onClick={() => setActiveView(activeView === 'dashboard' ? 'admin' : 'dashboard')}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold shadow-sm transition hover:bg-slate-100 flex items-center gap-2"
                  >
                    {activeView === 'dashboard' ? <Settings size={16} /> : <Layout size={16} />}
                    {activeView === 'dashboard' ? 'Panel Admin' : 'Volver'}
                  </button>
                </div>
              )}
              <button onClick={handleLogout} className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm flex items-center gap-2">
                <LogIn size={16} /> Salir
              </button>
            </div>
          </div>
        </header>

        {activeView === 'dashboard' && (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
               <div className="rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-slate-200">
                  <p className="text-sm text-slate-500">Estado Enlace</p>
                  <h2 className={`text-2xl font-bold mt-1 ${ready ? 'text-emerald-600' : 'text-slate-400'}`}>{ready ? 'Activo' : 'Inactivo'}</h2>
                </div>
                <div className="rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-slate-200">
                  <p className="text-sm text-slate-500">Sesión WhatsApp</p>
                  <h2 className="text-2xl font-bold mt-1">{ready ? 'Sincronizada' : (qr ? 'Pendiente' : 'Iniciando')}</h2>
                </div>
                <div className="rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-slate-200">
                  <p className="text-sm text-slate-500">Contactos</p>
                  <h2 className="text-2xl font-bold mt-1">{excelData.length}</h2>
                </div>
                <div className="rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-slate-200">
                  <p className="text-sm text-slate-500">Radar Confirmaciones</p>
                  <h2 className="text-2xl font-bold mt-1">{Object.keys(sessions).length}</h2>
                </div>
            </section>

            <main className="grid gap-6 xl:grid-cols-[1.4fr_0.95fr]">
              <section className="space-y-6">
                <div className="rounded-[32px] bg-white p-6 shadow-sm ring-1 ring-slate-200">
                  <h2 className="text-2xl font-bold mb-6">Módulo de Campaña</h2>
                  <div className="grid gap-6 lg:grid-cols-2">
                    <div className="space-y-4">
                      <div className="rounded-[28px] bg-white p-6 shadow-sm ring-1 ring-slate-200">
                        <div className="flex items-center justify-between gap-4 mb-6">
                           <h3 className="text-sm font-bold uppercase text-slate-500">Vincular Dispositivo</h3>
                           <div className="flex gap-2">
                             <button 
                                onClick={() => socket.emit('request_status')}
                                title="Refrescar estado de conexión"
                                className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-400 rounded-xl transition-all"
                             >
                                <RefreshCw size={14} />
                             </button>
                             {userProfile?.role === 'ADMIN' && (
                               <button 
                                  onClick={handleResetWhatsApp}
                                  title="Forzar Inicio / Reiniciar Motor"
                                  className="p-2 bg-red-50 hover:bg-red-100 text-red-400 rounded-xl transition-all flex items-center gap-2 text-[10px] font-bold"
                               >
                                  <Power size={14} /> REINICIAR
                               </button>
                             )}
                           </div>
                        </div>
                        {ready ? (
                          <div className="flex flex-col items-center py-6 bg-emerald-50 rounded-2xl border border-emerald-100">
                            <ShieldCheck className="text-emerald-500 mb-3" size={48} />
                            <p className="text-sm font-bold text-emerald-800">Conectado</p>
                          </div>
                        ) : qr ? (
                          <div className="flex flex-col items-center">
                            <img src={qr} alt="QR" className="w-40 h-40 mb-4 border-2 p-2 rounded-2xl" />
                            <p className="text-xs font-bold text-slate-900 animate-pulse">Escanea el código QR</p>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center py-10">
                            <RefreshCw className="animate-spin text-slate-300 mb-4" size={32} />
                            <p className="text-xs text-slate-400 italic">{whatsappStatus.message}</p>
                          </div>
                        )}
                      </div>

                      <div className="rounded-[28px] border-2 border-dashed border-slate-200 bg-slate-50 p-6 text-center">
                        <div {...getRootProps()} className="cursor-pointer">
                          <input {...getInputProps()} />
                          <Upload className="mx-auto mb-4 text-slate-400" size={32} />
                          <h3 className="text-lg font-semibold">Base de Datos</h3>
                          <p className="text-sm text-slate-500 mt-1">{excelData.length > 0 ? `✅ ${excelData.length} contactos.` : 'Sube tu Excel aquí'}</p>
                        </div>
                      </div>

                      {/* ENVÍO MANUAL */}
                      <div className="rounded-[28px] bg-white p-6 shadow-sm ring-1 ring-slate-200">
                         <h3 className="text-sm font-bold uppercase text-slate-500 mb-4">Envío Manual</h3>
                         <div className="space-y-3">
                            <input type="text" placeholder="Teléfono..." value={manualPhone} onChange={e => setManualPhone(e.target.value)} className="w-full rounded-xl bg-slate-50 p-3 text-sm ring-1 ring-slate-200 outline-none" />
                            <textarea placeholder="Mensaje..." value={manualMessage} onChange={e => setManualMessage(e.target.value)} className="w-full rounded-xl bg-slate-50 p-3 text-sm ring-1 ring-slate-200 outline-none" rows={2} />
                            <button onClick={handleManualSend} disabled={isManualSending || !ready} className="w-full rounded-xl py-3 text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-slate-200">Enviar</button>
                         </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {userProfile?.role === 'ADMIN' && (
                        <div className="rounded-[28px] bg-slate-50 p-5 ring-1 ring-slate-200">
                          <h3 className="text-lg font-semibold mb-4">Plantilla</h3>
                          <textarea value={messageTemplate} onChange={e=>setMessageTemplate(e.target.value)} className="w-full rounded-2xl bg-white p-4 font-mono text-xs ring-1 ring-slate-200 outline-none" rows={8} />
                        </div>
                      )}
                      <div className="rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-slate-200">
                        <h3 className="text-lg font-semibold mb-4">Vista Previa</h3>
                        <div className="rounded-2xl bg-slate-900 p-4 text-xs leading-6 text-white border-l-4 border-emerald-500 whitespace-pre-wrap">{previewMessage}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <aside className="space-y-6">
                <div className="rounded-[32px] bg-white p-6 shadow-sm ring-1 ring-slate-200">
                  <h2 className="text-2xl font-bold mb-4">Lanzamiento</h2>
                  <button onClick={handleSendMessages} disabled={isSending || !ready || excelData.length === 0} className={`w-full rounded-2xl py-4 font-bold text-white transition ${isSending || !ready || excelData.length === 0 ? 'bg-slate-300' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
                    {isSending ? "ENVIANDO..." : "LANZAR CAMPAÑA"}
                  </button>
                  {isSending && (
                    <div className="mt-4">
                      <div className="flex justify-between text-[10px] mb-1 text-slate-500"><span>Progreso: {progress.index}/{progress.total}</span><span>{Math.round((progress.index/progress.total)*100)}%</span></div>
                      <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden"><div className="bg-emerald-500 h-full transition-all" style={{width:`${(progress.index/progress.total)*100}%`}}></div></div>
                    </div>
                  )}
                </div>

                <div className="rounded-[32px] bg-slate-950 p-6 text-white shadow-xl">
                  <h2 className="text-lg font-bold mb-3 flex items-center gap-2 mb-4"><Monitor size={16} /> Logs de Envío</h2>
                  <div className="h-64 overflow-y-auto rounded-xl bg-black/40 p-3 font-mono text-[10px] leading-5 text-slate-300">
                    {logs.length > 0 ? logs.map((log, i) => (
                      <p key={i} className="flex gap-2"><span className="text-slate-600">[{log.time}]</span><span className={log.status === 'error' ? 'text-red-400' : 'text-emerald-400'}>{log.text}</span></p>
                    )) : <p className="italic text-slate-600">Sin actividad...</p>}
                  </div>
                </div>
              </aside>
            </main>

            <section className="rounded-[32px] bg-white p-6 shadow-sm ring-1 ring-slate-200">
               <div className="flex items-center justify-between mb-6">
                 <h2 className="text-2xl font-bold">Monitor de Respuestas</h2>
                 <button onClick={clearSessions} className="text-[10px] font-bold text-red-500 border p-2 rounded-lg">Purger Radar</button>
               </div>
               <div className="overflow-x-auto rounded-2xl border border-slate-100">
                 <table className="w-full text-left text-[10px]">
                    <thead className="bg-slate-50 text-slate-500 font-bold uppercase">
                      <tr>
                        <th className="px-4 py-3">Paciente</th>
                        <th className="px-4 py-3">Teléfono</th>
                        <th className="px-4 py-3">Cita</th>
                        <th className="px-4 py-3">Agenda</th>
                        <th className="px-4 py-3">Profesional</th>
                        <th className="px-4 py-3">Estado</th>
                        <th className="px-4 py-3 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {Object.entries(sessions).map(([id, session]) => (
                        <tr key={id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="font-bold text-slate-900">{session.Nombre || session.nombre}</div>
                            <div className="text-[9px] text-slate-400">Actualizado: {session.lastUpdated ? new Date(session.lastUpdated).toLocaleTimeString() : '--'}</div>
                          </td>
                          <td className="px-4 py-3 text-slate-500 font-mono">{id}</td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-indigo-600">{session.fecha || '--'}</div>
                            <div className="text-slate-400">{session.hora || '--'}</div>
                          </td>
                          <td className="px-4 py-3 max-w-[150px] truncate" title={session.motivo}>{session.motivo || 'Sin motivo'}</td>
                          <td className="px-4 py-3 leading-tight">{session.profesional || 'No asignado'}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                              session.status === 'Confirmada' ? 'bg-emerald-100 text-emerald-700' : 
                              session.status === 'Cancelada' ? 'bg-red-100 text-red-700' : 
                              session.status === 'Reagendar' ? 'bg-amber-100 text-amber-700' :
                              session.status === 'Reenviado' ? 'bg-indigo-100 text-indigo-700' :
                              'bg-blue-100 text-blue-700'
                            }`}>
                              {session.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-2">
                              <button 
                                onClick={() => handleResendIndividual(id)} 
                                disabled={!ready}
                                className="p-1.5 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                title="Reenviar mensaje"
                              >
                                <RotateCcw size={14}/>
                              </button>
                              <button 
                                onClick={() => deleteIndividualSession(id)} 
                                className="p-1.5 text-red-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                title="Eliminar de monitor"
                              >
                                <Trash2 size={14}/>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                 </table>
               </div>
            </section>
          </>
        )}

        {activeView === 'admin' && <AdminPanel />}


      </div>

      {viewingSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-6" onClick={() => setViewingSession(null)}>
           <div className="w-full max-w-sm rounded-[32px] bg-white p-8" onClick={e => e.stopPropagation()}>
              <h2 className="text-xl font-bold mb-4">Paciente</h2>
              <div className="space-y-3 bg-slate-50 p-4 rounded-2xl">
                 <p className="text-sm font-semibold">{viewingSession.Nombre || viewingSession.nombre}</p>
                 <p className="text-xs text-slate-500 italic">"{viewingSession.Motivo || viewingSession.motivo}"</p>
              </div>
              <button className="mt-6 w-full rounded-2xl bg-slate-900 py-3 font-semibold text-white" onClick={() => setViewingSession(null)}>Cerrar</button>
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
