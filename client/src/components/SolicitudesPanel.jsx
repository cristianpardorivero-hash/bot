import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  doc, 
  updateDoc,
  deleteDoc,
  serverTimestamp 
} from 'firebase/firestore';
import { 
  Clock, 
  User, 
  Stethoscope, 
  MessageSquare, 
  CheckCircle2, 
  Trash2, 
  Phone,
  Calendar,
  AlertCircle,
  Baby,
  Heart,
  Activity,
  Apple,
  Brain,
  ShieldCheck,
  CreditCard
} from 'lucide-react';

const SolicitudesPanel = () => {
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Escuchar solicitudes de Camelia
    const q = query(collection(db, 'solicitudes_camelia'), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setSolicitudes(docs);
      setLoading(false);
    }, (error) => {
      console.error("Error en snapshot solicitudes:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleStatusChange = async (id, newStatus) => {
    try {
      const docRef = doc(db, 'solicitudes_camelia', id);
      await updateDoc(docRef, { 
        status: newStatus,
        atendidoEn: serverTimestamp()
      });
    } catch (error) {
      console.error("Error al actualizar estado:", error);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("¿Está seguro de eliminar esta solicitud de forma permanente?")) return;
    try {
      await deleteDoc(doc(db, 'solicitudes_camelia', id));
    } catch (error) {
      console.error("Error al eliminar:", error);
    }
  };

  // Función para obtener icono por especialidad
  const getEspecialidadIcon = (esp) => {
    const s = String(esp).toLowerCase();
    if (s.includes('pediatría')) return <Baby size={18} className="text-blue-500" />;
    if (s.includes('matrona')) return <Heart size={18} className="text-rose-500" />;
    if (s.includes('kinesiólogo')) return <Activity size={18} className="text-orange-500" />;
    if (s.includes('nutricionista')) return <Apple size={18} className="text-emerald-500" />;
    if (s.includes('psicólogo')) return <Brain size={18} className="text-purple-500" />;
    if (s.includes('odontología')) return <ShieldCheck size={18} className="text-teal-500" />;
    return <Stethoscope size={18} className="text-slate-500" />;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-white rounded-[32px] shadow-sm ring-1 ring-slate-200">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mb-4"></div>
        <p className="text-slate-500 font-medium text-lg">Cargando solicitudes clínicas...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header del Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            Solicitudes Camelia <span className="text-emerald-500">v2.0</span> 🌸
          </h2>
          <p className="text-slate-500 font-medium">Bandeja de entrada de pacientes del Hospital de Curepto.</p>
        </div>
        <div className="flex gap-3">
          <div className="bg-white px-5 py-3 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-slate-600 font-bold text-sm">Monitor Activo</span>
          </div>
          <div className="bg-amber-50 text-amber-700 px-5 py-3 rounded-2xl border border-amber-100 text-sm font-black flex items-center gap-2 shadow-sm">
            <Clock size={16} /> 
            {solicitudes.filter(s => s.status === 'PENDIENTE').length} PENDIENTES
          </div>
        </div>
      </div>

      {solicitudes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 bg-white rounded-[40px] shadow-sm ring-1 ring-slate-100 text-center">
          <div className="h-24 w-24 bg-emerald-50 rounded-full flex items-center justify-center mb-6">
            <MessageSquare size={44} className="text-emerald-300" />
          </div>
          <h3 className="text-xl font-bold text-slate-900">Bandeja Vacía</h3>
          <p className="text-slate-500 max-w-sm mx-auto mt-2">No hay requerimientos nuevos. Camelia está lista para recibir pacientes.</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {solicitudes.map((solicitud) => (
            <div 
              key={solicitud.id}
              className={`group relative rounded-[40px] bg-white p-7 shadow-sm ring-1 transition-all hover:shadow-xl hover:-translate-y-1 ${
                solicitud.status === 'PENDIENTE' ? 'ring-slate-100' : 'ring-emerald-100 bg-emerald-50/10 grayscale-[0.5]'
              }`}
            >
              {/* Encabezado: Paciente y Acciones */}
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h4 className="text-xl font-black text-slate-900 leading-tight">
                    {solicitud.nombre || 'Paciente Nuevo'}
                  </h4>
                  <div className="flex items-center gap-2 mt-1 text-slate-500 font-bold text-xs uppercase tracking-widest">
                    <CreditCard size={12} /> {solicitud.rut || 'RUT no reg.'}
                  </div>
                </div>
                <div className="flex gap-2">
                  {solicitud.status === 'PENDIENTE' ? (
                    <button 
                      onClick={() => handleStatusChange(solicitud.id, 'ATENDIDO')}
                      className="p-3 bg-emerald-500 text-white rounded-2xl hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-200"
                      title="Marcar como atendido"
                    >
                      <CheckCircle2 size={20} />
                    </button>
                  ) : (
                    <button 
                      onClick={() => handleStatusChange(solicitud.id, 'PENDIENTE')}
                      className="p-3 bg-slate-100 text-slate-500 rounded-2xl hover:bg-slate-200 transition-all"
                      title="Volver a pendiente"
                    >
                      <AlertCircle size={20} />
                    </button>
                  )}
                </div>
              </div>

              {/* Grid de Información Detallada */}
              <div className="space-y-5">
                {/* Especialidad Badge */}
                <div className="flex items-center justify-between bg-slate-50 rounded-2xl p-4 border border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="bg-white p-2 rounded-xl shadow-sm border border-slate-100">
                      {getEspecialidadIcon(solicitud.especialidad)}
                    </div>
                    <div>
                      <span className="block text-[10px] font-black text-slate-400 uppercase tracking-tighter">Área de Atención</span>
                      <span className="text-sm font-bold text-slate-700">{solicitud.especialidad || 'General'}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="block text-[10px] font-black text-slate-400 uppercase tracking-tighter">Trámite</span>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${solicitud.tipo === 'Solicitud' ? 'bg-blue-100 text-blue-600' : 'bg-orange-100 text-orange-600'}`}>
                      {String(solicitud.tipo).toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* Contacto y Fecha */}
                <div className="flex items-center justify-between px-2">
                   <div className="flex items-center gap-2 text-slate-600 font-bold text-sm">
                      <div className="p-1.5 bg-slate-100 rounded-lg"><Phone size={14} /></div>
                      {solicitud.telefono.replace('c.us', '')}
                   </div>
                   <div className="flex items-center gap-2 text-slate-400 font-bold text-[11px]">
                      <Calendar size={12} />
                      {solicitud.fecha ? 
                        new Date(solicitud.fecha).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) 
                        : 'Reciente'}
                   </div>
                </div>

                {/* Motivo de Consulta */}
                <div className="relative group/msg">
                  <div className="flex items-center gap-2 mb-2">
                    <MessageSquare size={14} className="text-emerald-500" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Motivo declarado</span>
                  </div>
                  <div className="bg-emerald-50/40 p-4 rounded-3xl border border-emerald-100/50 relative overflow-hidden">
                    <p className="text-sm text-slate-700 font-medium leading-relaxed italic z-10 relative">
                      "{solicitud.motivo || 'Sin descripción.'}"
                    </p>
                    <div className="absolute -right-2 -bottom-2 opacity-5 text-emerald-900 group-hover/msg:scale-110 transition-transform">
                      <MessageSquare size={48} />
                    </div>
                  </div>
                </div>

                <button 
                  onClick={() => handleDelete(solicitud.id)}
                  className="w-full py-3 mt-4 flex items-center justify-center gap-2 text-red-400 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all font-bold text-xs border border-transparent hover:border-red-100"
                >
                  <Trash2 size={14} /> Eliminar Registro
                </button>
              </div>

              {/* Sello de Atendido */}
              {solicitud.status === 'ATENDIDO' && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none rounded-[40px] bg-white/40 backdrop-blur-[2px]">
                  <div className="border-[6px] border-emerald-500/80 text-emerald-500/80 font-black text-4xl px-6 py-2 rotate-[-15deg] tracking-widest uppercase rounded-2xl shadow-xl shadow-emerald-500/20">
                    GESTIONADO
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SolicitudesPanel;
