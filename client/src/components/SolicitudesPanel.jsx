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
  AlertCircle
} from 'lucide-react';

const SolicitudesPanel = () => {
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'solicitudes_camelia'), orderBy('fecha', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setSolicitudes(docs);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleStatusChange = async (id, newStatus) => {
    try {
      const docRef = doc(db, 'solicitudes_camelia', id);
      await updateDoc(docRef, { 
        estado: newStatus,
        atendidoEn: serverTimestamp()
      });
    } catch (error) {
      console.error("Error al actualizar estado:", error);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("¿Está seguro de eliminar esta solicitud?")) return;
    try {
      await deleteDoc(doc(db, 'solicitudes_camelia', id));
    } catch (error) {
      console.error("Error al eliminar:", error);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-white rounded-[32px] shadow-sm ring-1 ring-slate-200">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mb-4"></div>
        <p className="text-slate-500 font-medium">Cargando solicitudes de Camelia...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Solicitudes de Camelia 🌸</h2>
          <p className="text-slate-500">Gestione las peticiones entrantes de los pacientes en tiempo real.</p>
        </div>
        <div className="bg-emerald-50 text-emerald-700 px-4 py-2 rounded-2xl border border-emerald-100 text-sm font-bold flex items-center gap-2">
          <Clock size={16} /> {solicitudes.filter(s => s.estado === 'PENDIENTE').length} Pendientes
        </div>
      </div>

      {solicitudes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-[32px] shadow-sm ring-1 ring-slate-200 text-center">
          <div className="h-20 w-20 bg-slate-50 rounded-full flex items-center justify-center mb-4">
            <MessageSquare size={40} className="text-slate-300" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Sin solicitudes aún</h3>
          <p className="text-slate-500 max-w-xs mx-auto">Cuando los pacientes hablen con Camelia, sus peticiones aparecerán aquí.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {solicitudes.map((solicitud) => (
            <div 
              key={solicitud.id}
              className={`group relative rounded-[32px] bg-white p-6 shadow-sm ring-1 transition-all hover:shadow-md ${
                solicitud.estado === 'PENDIENTE' ? 'ring-slate-200' : 'ring-emerald-100 bg-emerald-50/10'
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`p-3 rounded-2xl ${solicitud.estado === 'PENDIENTE' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                  <User size={24} />
                </div>
                <div className="flex gap-2">
                  {solicitud.estado === 'PENDIENTE' ? (
                    <button 
                      onClick={() => handleStatusChange(solicitud.id, 'ATENDIDO')}
                      className="p-2 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 transition-colors shadow-sm"
                      title="Marcar como atendido"
                    >
                      <CheckCircle2 size={18} />
                    </button>
                  ) : (
                    <button 
                      onClick={() => handleStatusChange(solicitud.id, 'PENDIENTE')}
                      className="p-2 bg-slate-200 text-slate-600 rounded-xl hover:bg-slate-300 transition-colors"
                      title="Volver a pendiente"
                    >
                      <AlertCircle size={18} />
                    </button>
                  )}
                  <button 
                    onClick={() => handleDelete(solicitud.id)}
                    className="p-2 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Paciente / Teléfono</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-900 font-bold">
                    <Phone size={14} className="text-slate-400" />
                    {solicitud.paciente_telefono}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tipo</span>
                    </div>
                    <div className="text-sm font-semibold text-slate-700 bg-slate-50 px-2.5 py-1 rounded-lg inline-block border border-slate-100">
                      {solicitud.tipo}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Fecha</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Calendar size={12} />
                      {solicitud.fecha?.toDate().toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) || 'Reciente'}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Stethoscope size={14} className="text-emerald-500" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Profesional / Especialidad</span>
                  </div>
                  <p className="text-sm font-semibold text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    {solicitud.profesional}
                  </p>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <MessageSquare size={14} className="text-emerald-500" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Motivo de consulta</span>
                  </div>
                  <p className="text-sm text-slate-600 bg-emerald-50/30 p-2.5 rounded-xl border border-emerald-100/50 italic">
                    "{solicitud.motivo}"
                  </p>
                </div>
              </div>

              {solicitud.estado === 'ATENDIDO' && (
                <div className="absolute top-6 left-1/2 -translate-x-1/2 pointer-events-none opacity-20">
                  <div className="border-[4px] border-emerald-500 text-emerald-500 font-black text-4xl px-4 py-2 rotate-[-12deg] tracking-widest uppercase">
                    ATENDIDO
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
