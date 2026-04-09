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
  AlertTriangle,
  Info,
  LifeBuoy,
  Power,
  ShieldCheck,
  RotateCcw,
  Save,
  Plus,
  FileText,
  X
} from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './components/Login';
import AdminPanel from './components/AdminPanel';


const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3001`;

const AppContent = () => {
  const [userRole, setUserRole] = useState(null);
  const { currentUser, userProfile, logout, loading } = useAuth();
  
  // --- SISTEMA DE PLANTILLAS ---
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [newTemplateName, setNewTemplateName] = useState('');
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [activeView, setActiveView] = useState('dashboard'); // 'dashboard' | 'admin'
  const [qr, setQr] = useState(null);
  const [ready, setReady] = useState(false);
  const [excelData, setExcelData] = useState([]);
  const [logs, setLogs] = useState([]);
  const [progress, setProgress] = useState({ index: 0, total: 0 });
  const [sessions, setSessions] = useState({});
  const [viewingSession, setViewingSession] = useState(null);
  const [whatsappStatus, setWhatsappStatus] = useState({ state: 'INITIALIZING', message: 'Iniciando WhatsApp Web...' });

  
  // States for manual sending
  const [manualPhone, setManualPhone] = useState('');
  const [manualMessage, setManualMessage] = useState('');
  const [isManualSending, setIsManualSending] = useState(false);
  
  // --- SISTEMA DE IMPORTACIÓN RÁPIDA ---
  const [importMode, setImportMode] = useState('excel'); // 'excel' | 'paste'
  const [pastedText, setPastedText] = useState('');
  const [isImportingText, setIsImportingText] = useState(false);
  
  // Instancia de socket memoizada
  const socket = useMemo(() => io(API_URL, {
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  }), []);

  const fetchTemplates = async () => {
    try {
      const token = await currentUser.getIdToken();
      const response = await axios.get(`${API_URL}/templates`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setTemplates(response.data);
    } catch (error) {
      console.error('Error fetching templates:', error);
    }
  };

  const saveTemplate = async () => {
    if (!newTemplateName || !messageTemplate) return;
    setIsSavingTemplate(true);
    try {
      const token = await currentUser.getIdToken();
      await axios.post(`${API_URL}/templates`, {
        name: newTemplateName,
        content: messageTemplate
      }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setNewTemplateName('');
      fetchTemplates();
      alert('Plantilla guardada correctamente.');
    } catch (error) {
      console.error('Error saving template:', error);
      alert('Error al guardar la plantilla.');
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const deleteTemplate = async (id) => {
    if (!window.confirm("¿Seguro que quieres eliminar esta plantilla?")) return;
    try {
      const token = await currentUser.getIdToken();
      await axios.delete(`${API_URL}/templates/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchTemplates();
      if (selectedTemplateId === id) setSelectedTemplateId('');
    } catch (error) {
      console.error('Error deleting template:', error);
      alert('Error al eliminar la plantilla.');
    }
  };

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

  const handleTextImport = async () => {
    if (!pastedText.trim()) return;
    setIsImportingText(true);
    try {
      const token = await currentUser.getIdToken();
      const response = await axios.post(`${API_URL}/upload-text`, { text: pastedText }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setExcelData(response.data);
      alert(`✅ Se extrajeron ${response.data.length} pacientes del texto.`);
      setImportMode('excel'); // Volver a la vista de tabla para previsualizar
    } catch (error) {
      console.error('Error importing text:', error);
      alert('Error al procesar el texto. Asegúrate de que el formato sea similar al ejemplo.');
    } finally {
      setIsImportingText(false);
    }
  };

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

    if (currentUser) {
      fetchTemplates();
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
    if (excelData.length === 0) return;
    setIsSending(true);
    try {
      const token = await currentUser.getIdToken();
      await axios.post(`${API_URL}/send-messages`, {
        data: excelData,
        phoneColumn: 'Celular',
        messageTemplate: messageTemplate,
        delay: 3000
      }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch (error) {
      console.error('Error sending messages:', error);
      alert('Error al enviar los mensajes.');
      setIsSending(false);
    }
  };

  const handleStopCampaign = async () => {
    if (!window.confirm('🚨 ¿Estás seguro de que deseas CANCELAR el envío actual? Se detendrá después del mensaje en curso.')) return;
    try {
      const token = await currentUser.getIdToken();
      await axios.post(`${API_URL}/stop-campaign`, {}, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch (error) {
      console.error('Error stopping campaign:', error);
      alert('No se pudo detener la campaña.');
    }
  };

  const clearSessions = async () => {
    if (!window.confirm('⚠️ ¿Estás seguro de LIMPIAR TODO el radar? Esta acción no se puede deshacer.')) return;
    try {
      const token = await currentUser.getIdToken();
      await fetch(`${API_URL}/sessions`, { 
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setSessions({});
    } catch (e) { console.error(e); }
  };

  const clearConfirmedSessions = async () => {
    if (!window.confirm('¿Deseas limpiar solo los pacientes ya CONFIRMADOS del monitor?')) return;
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(`${API_URL}/sessions/confirmed`, { 
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        // Refrescar localmente filtrando confirmados
        setSessions(prev => {
          const updated = {};
          Object.entries(prev).forEach(([id, s]) => {
            if (s.status !== 'Confirmada') updated[id] = s;
          });
          return updated;
        });
      }
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
          <div className="space-y-6">
            {/* FASE 0: ESTADÍSTICAS RÁPIDAS */}
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

            {/* FASE 1: PREPARACIÓN (ENLACE Y DATOS) */}
            <div className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-[32px] bg-white p-6 shadow-sm ring-1 ring-slate-200">
                    <div className="flex items-center justify-between gap-4 mb-6">
                        <h3 className="text-sm font-bold uppercase text-slate-500">1. Vincular Dispositivo</h3>
                        <div className="flex gap-2">
                            <button onClick={() => socket.emit('request_status')} title="Refrescar estado" className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-400 rounded-xl transition-all">
                                <RefreshCw size={14} />
                            </button>
                            {userProfile?.role === 'ADMIN' && (
                                <button onClick={handleResetWhatsApp} title="Reiniciar Motor" className="p-2 bg-red-50 hover:bg-red-100 text-red-500 rounded-xl transition-all flex items-center gap-2 text-[10px] font-bold">
                                    <Power size={14} /> REINICIAR
                                </button>
                            )}
                        </div>
                    </div>
                    {ready ? (
                        <div className="flex flex-col items-center py-6 bg-emerald-50 rounded-2xl border border-emerald-100">
                            <ShieldCheck className="text-emerald-500 mb-3" size={48} />
                            <p className="text-sm font-bold text-emerald-800">WhatsApp Conectado</p>
                        </div>
                    ) : qr ? (
                        <div className="flex flex-col items-center py-2">
                            <img src={qr} alt="QR" className="w-40 h-40 mb-4 border-2 p-2 rounded-2xl bg-white shadow-inner" />
                            <p className="text-xs font-bold text-slate-900 animate-pulse">Escanea el código QR para iniciar</p>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center py-10">
                            <RefreshCw className="animate-spin text-slate-300 mb-4" size={32} />
                            <p className="text-xs text-slate-400 italic">Iniciando motor...</p>
                        </div>
                    )}
                </div>

                <div className="rounded-[32px] bg-white p-6 shadow-sm ring-1 ring-slate-200 flex flex-col">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-4">
                            <h3 className="text-sm font-bold uppercase text-slate-500">2. Carga de Destinatarios</h3>
                            {excelData.length > 0 && (
                                <button 
                                    onClick={() => {
                                        setExcelData([]);
                                        setPastedText('');
                                        setProgress({ index: 0, total: 0 });
                                    }}
                                    className="flex items-center gap-1.5 px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg text-[10px] font-bold transition-all border border-red-100"
                                >
                                    <Trash2 size={12} /> LIMPIAR
                                </button>
                            )}
                        </div>
                        <div className="flex bg-slate-100 p-1 rounded-xl">
                            <button 
                                onClick={() => setImportMode('excel')}
                                className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all ${importMode === 'excel' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}
                            >
                                ARCHIVO EXCEL
                            </button>
                            <button 
                                onClick={() => setImportMode('paste')}
                                className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all ${importMode === 'paste' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}
                            >
                                PEGAR TEXTO
                            </button>
                        </div>
                    </div>

                    {importMode === 'excel' ? (
                        <div {...getRootProps()} className="flex-1 min-h-[140px] rounded-[28px] border-2 border-dashed border-slate-200 bg-slate-50 p-6 text-center flex flex-col items-center justify-center cursor-pointer hover:bg-slate-100 transition-all">
                            <input {...getInputProps()} />
                            <Upload className="mb-3 text-emerald-500" size={32} />
                            <h3 className="text-base font-bold text-slate-700">Importar Excel</h3>
                            <p className="text-xs text-slate-500 mt-2">
                                {excelData.length > 0 ? (
                                    <span className="text-emerald-600 font-bold">✅ {excelData.length} contactos cargados exitosamente.</span>
                                ) : 'Arrastra tu archivo aquí o haz clic'}
                            </p>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col gap-3">
                            <textarea 
                                value={pastedText}
                                onChange={(e) => setPastedText(e.target.value)}
                                placeholder="Pega aquí la lista de la agenda (Ej: 10:30 | JUAN PEREZ | ...) "
                                className="flex-1 min-h-[120px] rounded-2xl bg-slate-50 border border-slate-200 p-4 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all resize-none"
                            />
                            <button 
                                onClick={handleTextImport}
                                disabled={isImportingText || !pastedText.trim()}
                                className="w-full bg-slate-900 text-white font-bold py-3 rounded-xl hover:opacity-90 disabled:bg-slate-300 transition-all text-sm flex items-center justify-center gap-2"
                            >
                                {isImportingText ? <RefreshCw className="animate-spin" size={16} /> : <Plus size={16} />}
                                {isImportingText ? 'Procesando...' : 'Procesar Lista Pegada'}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* FASE 2: CONFIGURACIÓN Y ACCIÓN */}
            <div className={`grid gap-6 ${userProfile?.role === 'ADMIN' ? 'lg:grid-cols-2' : 'grid-cols-1'}`}>
                {/* LADO IZQUIERDO: CONFIGURACIÓN (Solo Admin) */}
                {userProfile?.role === 'ADMIN' && (
                    <div className="rounded-[32px] bg-white p-6 shadow-sm ring-1 ring-slate-200 space-y-6">
                        <h3 className="text-sm font-bold uppercase text-slate-500 flex items-center gap-2">
                            <Settings size={16} /> 3. Configuración de Mensaje
                        </h3>
                        
                        {/* GESTIÓN DE PLANTILLAS */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-bold text-slate-400 uppercase">Campañas Guardadas</label>
                                <button 
                                    onClick={() => {
                                        setSelectedTemplateId('');
                                        setNewTemplateName('');
                                    }}
                                    className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1 rounded-md transition-all flex items-center gap-1"
                                >
                                    <Plus size={10} /> Nueva
                                </button>
                            </div>
                            
                            <div className="flex flex-wrap gap-2">
                                {templates.length === 0 ? (
                                    <p className="text-[10px] text-slate-400 italic">No hay plantillas guardadas.</p>
                                ) : (
                                    templates.map(t => (
                                        <div 
                                            key={t.id} 
                                            className={`group relative flex items-center gap-2 px-3 py-2 rounded-xl text-xs border transition-all cursor-pointer ${
                                                selectedTemplateId === t.id 
                                                ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-medium ring-1 ring-emerald-100' 
                                                : 'bg-white border-slate-100 text-slate-600 hover:border-slate-300'
                                            }`}
                                            onClick={() => {
                                                setSelectedTemplateId(t.id);
                                                setMessageTemplate(t.content);
                                                setNewTemplateName(t.name);
                                            }}
                                        >
                                            <FileText size={12} className={selectedTemplateId === t.id ? 'text-emerald-500' : 'text-slate-400'} />
                                            {t.name}
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    deleteTemplate(t.id);
                                                }}
                                                className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 transition-opacity"
                                            >
                                                <X size={10} />
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>

                            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200 space-y-3">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Nombre de la Campaña</label>
                                    <div className="flex gap-2">
                                        <input 
                                            type="text" 
                                            placeholder="Ej: Control Diabéticos..."
                                            value={newTemplateName}
                                            onChange={(e) => setNewTemplateName(e.target.value)}
                                            className="flex-1 rounded-lg bg-white px-3 py-2 text-xs ring-1 ring-slate-100 focus:ring-emerald-500 outline-none transition-all"
                                        />
                                        <button 
                                            onClick={saveTemplate}
                                            disabled={isSavingTemplate || !newTemplateName || !messageTemplate}
                                            className="px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold flex items-center gap-2 disabled:opacity-50 disabled:grayscale transition-all shadow-sm shadow-emerald-100"
                                        >
                                            <Save size={14} /> {isSavingTemplate ? 'Guardando...' : (selectedTemplateId ? 'Actualizar' : 'Guardar')}
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Cuerpo del Mensaje</label>
                                    <textarea 
                                        value={messageTemplate} 
                                        onChange={e=>setMessageTemplate(e.target.value)} 
                                        className="w-full rounded-xl bg-white p-4 font-mono text-xs ring-1 ring-slate-100 outline-none focus:ring-emerald-500 transition-all" 
                                        rows={6} 
                                    />
                                </div>
                            </div>
                            <div className="rounded-2xl bg-slate-900 p-5 ring-1 ring-slate-800">
                                <label className="text-xs font-bold text-slate-500 uppercase mb-3 block">Vista Previa Real</label>
                                <div className="text-xs leading-6 text-white border-l-4 border-emerald-500 pl-4 whitespace-pre-wrap">{previewMessage}</div>
                            </div>
                        </div>
                    </div>
                )}

                {/* LADO DERECHO: LANZAMIENTO Y LOGS */}
                <div className="space-y-6">
                    <div className="rounded-[32px] bg-white p-8 shadow-md ring-1 ring-slate-200 border-b-4 border-emerald-500">
                        <h3 className="text-sm font-bold uppercase text-slate-500 mb-6">4. Ejecución de Campaña</h3>
                        {isSending ? (
                            <button 
                                onClick={handleStopCampaign} 
                                className="w-full rounded-2xl py-5 font-black text-xl tracking-tight transition-all shadow-lg flex items-center justify-center gap-3 bg-red-600 text-white hover:bg-red-700 hover:scale-[1.02] active:scale-95 shadow-red-200"
                            >
                                <XCircle size={24} /> CANCELAR ENVÍO
                            </button>
                        ) : (
                            <button 
                                onClick={handleSendMessages} 
                                disabled={!ready || excelData.length === 0} 
                                className={`w-full rounded-2xl py-5 font-black text-xl tracking-tight transition-all shadow-lg flex items-center justify-center gap-3 ${
                                    !ready || excelData.length === 0 
                                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none' 
                                    : 'bg-gradient-to-r from-emerald-600 to-teal-700 text-white hover:scale-[1.02] hover:shadow-emerald-200 active:scale-95'
                                }`}
                            >
                                <Send size={24} /> LANZAR CAMPAÑA AHORA
                            </button>
                        )}
                        
                        {isSending && (
                            <div className="mt-8 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                <div className="flex justify-between text-xs font-bold mb-2 text-slate-600">
                                    <span>Progreso General</span>
                                    <span className="text-emerald-600">{Math.round((progress.index/progress.total)*100)}%</span>
                                </div>
                                <div className="w-full bg-slate-200 h-3 rounded-full overflow-hidden shadow-inner">
                                    <div className="bg-gradient-to-r from-emerald-400 to-emerald-600 h-full transition-all duration-500" style={{width:`${(progress.index/progress.total)*100}%`}}></div>
                                </div>
                                <p className="text-[10px] text-center mt-3 text-slate-400 font-medium">Procesando {progress.index} de {progress.total} contactos</p>
                            </div>
                        )}

                        {!ready && (
                            <div className="mt-4 p-3 bg-amber-50 rounded-xl border border-amber-100 flex items-center gap-3 text-amber-700">
                                <AlertTriangle size={18} />
                                <p className="text-xs font-bold">Debes vincular WhatsApp antes de lanzar.</p>
                            </div>
                        )}
                        {ready && excelData.length === 0 && (
                            <div className="mt-4 p-3 bg-blue-50 rounded-xl border border-blue-100 flex items-center gap-3 text-blue-700">
                                <Info size={18} />
                                <p className="text-xs font-bold">Sube un archivo Excel para habilitar el botón.</p>
                            </div>
                        )}
                    </div>

                    {userProfile?.role === 'ADMIN' && (
                        <div className="rounded-[32px] bg-slate-950 p-6 text-white shadow-2xl overflow-hidden relative">
                            <div className="absolute top-0 right-0 p-4 opacity-10"><Monitor size={80} /></div>
                            <h3 className="text-sm font-bold uppercase text-slate-500 mb-4 flex items-center gap-2">
                                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                Monitor de Tráfico (Logs)
                            </h3>
                            <div className="h-48 overflow-y-auto font-mono text-[10px] space-y-2 scrollbar-hide">
                                {logs.length > 0 ? logs.map((log, i) => (
                                    <div key={i} className="flex gap-3 border-l border-slate-800 pl-3">
                                        <span className="text-slate-600 shrink-0">{log.time}</span>
                                        <span className={log.status === 'error' ? 'text-red-400' : 'text-emerald-400'}>{log.text}</span>
                                    </div>
                                )) : <p className="italic text-slate-700">Esperando actividad...</p>}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* FASE 3: MONITOREO DE RESPUESTAS */}
            <section className="rounded-[32px] bg-white p-6 shadow-sm ring-1 ring-slate-200">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-800">Monitor de Respuestas en Tiempo Real</h2>
                    <p className="text-sm text-slate-500 mt-1">Sigue el estado de las confirmaciones del Hospital de Curepto</p>
                  </div>
                  <div className="flex gap-2 bg-slate-50 p-1.5 rounded-2xl ring-1 ring-slate-200">
                    <button 
                      onClick={clearConfirmedSessions} 
                      className="px-4 py-2 text-xs font-bold text-emerald-700 bg-white shadow-sm rounded-xl hover:bg-emerald-50 transition-all border border-emerald-100"
                    >
                      Limpiar Confirmados
                    </button>
                    {userProfile?.role === 'ADMIN' && (
                      <button 
                        onClick={clearSessions} 
                        className="px-4 py-2 text-xs font-bold text-red-600 hover:text-red-700 rounded-xl transition-all"
                      >
                        Vaciar Todo
                      </button>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-slate-100">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50/50 text-slate-400 font-bold uppercase text-[10px] tracking-wider">
                      <tr>
                        <th className="px-6 py-4">Paciente</th>
                        <th className="px-6 py-4">Teléfono</th>
                        <th className="px-6 py-4">Cita</th>
                        <th className="px-6 py-4">Agenda / Profesional</th>
                        <th className="px-6 py-4">Estado</th>
                        <th className="px-6 py-4 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {Object.entries(sessions).length > 0 ? Object.entries(sessions).map(([id, session]) => (
                        <tr key={id} className="hover:bg-slate-50/80 transition-all group">
                          <td className="px-6 py-4">
                            <div className="font-bold text-slate-700 text-base">{session.Nombre || session.nombre}</div>
                            <div className="text-[10px] text-slate-400 font-medium">✨ Último contacto: {session.lastUpdated ? new Date(session.lastUpdated).toLocaleTimeString() : '--'}</div>
                          </td>
                          <td className="px-6 py-4 text-slate-500 font-mono text-xs">{id}</td>
                          <td className="px-6 py-4">
                            <div className="font-bold text-indigo-600">{session.fecha || '--'}</div>
                            <div className="text-slate-400 text-xs">{session.hora || '--'}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-slate-700 font-medium truncate max-w-[180px]" title={session.motivo}>{session.motivo || 'Sin motivo'}</div>
                            <div className="text-slate-400 text-xs">{session.profesional || 'No asignado'}</div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-3 py-1 rounded-full font-bold text-[10px] uppercase tracking-wide border-2 ${
                              session.status === 'Confirmada' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 
                              session.status === 'Cancelada' ? 'bg-red-50 text-red-700 border-red-100' : 
                              session.status === 'Reagendar' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                              session.status === 'Reenviado' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' :
                              'bg-blue-50 text-blue-700 border-blue-100'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full mr-2 ${
                                session.status === 'Confirmada' ? 'bg-emerald-500' : 
                                session.status === 'Cancelada' ? 'bg-red-500' : 
                                'bg-current'
                              }`} />
                              {session.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-1 transition-all">
                              <button onClick={() => handleResendIndividual(id)} disabled={!ready} className="p-2 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl" title="Reenviar">
                                <RotateCcw size={16}/>
                              </button>
                              <button onClick={() => deleteIndividualSession(id)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl" title="Eliminar">
                                <Trash2 size={16}/>
                              </button>
                            </div>
                          </td>
                        </tr>
                      )) : (
                        <tr>
                            <td colSpan="6" className="px-6 py-12 text-center text-slate-300 italic font-medium">Nadie ha respondido aún. Las respuestas aparecerán aquí automáticamente.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
            </section>

            {/* FASE EXTRAS: ACCIONES SECUNDARIAS */}
            <div className="flex flex-col md:flex-row gap-6">
                <div className="md:w-1/3 rounded-[32px] bg-white p-6 shadow-sm ring-1 ring-slate-200">
                    <h3 className="text-sm font-bold uppercase text-slate-500 mb-4">Envío Manual Rápido</h3>
                    <div className="space-y-3">
                        <input type="text" placeholder="Teléfono (+569...)" value={manualPhone} onChange={e => setManualPhone(e.target.value)} className="w-full rounded-xl bg-slate-50 p-3 text-sm ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-emerald-500" />
                        <textarea placeholder="Mensaje personalizado..." value={manualMessage} onChange={e => setManualMessage(e.target.value)} className="w-full rounded-xl bg-slate-50 p-3 text-sm ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-emerald-500" rows={2} />
                        <button onClick={handleManualSend} disabled={isManualSending || !ready} className="w-full rounded-xl py-3 text-sm font-bold bg-slate-900 text-white hover:bg-black disabled:bg-slate-200 transition-all">
                            {isManualSending ? 'Enviando...' : 'Enviar Individual'}
                        </button>
                    </div>
                </div>
                
                <div className="md:flex-1 rounded-[32px] bg-emerald-900 p-8 text-white flex items-center justify-between overflow-hidden relative">
                    <div className="relative z-10">
                        <h3 className="text-xl font-bold mb-2">¿Necesitas ayuda técnica?</h3>
                        <p className="text-emerald-200 text-sm max-w-md">El motor de WhatsApp utiliza inteligencia artificial para detectar las respuestas de los pacientes. Si notas algo extraño, prueba reiniciar el motor desde el panel superior.</p>
                    </div>
                    <LifeBuoy className="opacity-10 absolute -right-4 -bottom-4" size={120} />
                </div>
            </div>
          </div>
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
