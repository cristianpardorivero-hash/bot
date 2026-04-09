import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase";
import { collection, getDocs, doc, setDoc, deleteDoc } from "firebase/firestore";
import { Users, UserPlus, Trash2, ShieldCheck, Mail, RefreshCw, QrCode, Edit2, X } from "lucide-react";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3001`;

const AdminPanel = () => {
  const { userProfile } = useAuth();
  const [users, setUsers] = useState([]);
  const [newUser, setNewUser] = useState({ email: "", role: "USER", nombre: "", password: "" }); // password añadido
  const [editingUser, setEditingUser] = useState(null);
  const [loading, setLoading] = useState(false);

  // Solo cargar si es ADMIN
  const fetchUsers = async () => {
    if (userProfile?.role !== "ADMIN") return;
    const querySnapshot = await getDocs(collection(db, "usuarios"));
    const usersList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    setUsers(usersList);
  };

  useEffect(() => {
    fetchUsers();
  }, [userProfile]);

  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!newUser.password || newUser.password.length < 6) {
      alert("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    setLoading(true);
    try {
      const { auth } = await import("../firebase");
      const token = await auth.currentUser.getIdToken();

      const response = await axios.post(`${API_URL}/admin/create-user`, newUser, {
        headers: { Authorization: `Bearer ${token}` }
      });

      alert(response.data.message || "Usuario creado con éxito.");
      fetchUsers();
      setNewUser({ email: "", role: "USER", nombre: "", password: "" });
    } catch (err) {
      console.error(err);
      alert(err.response?.data || "Error al crear el usuario.");
    }
    setLoading(false);
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    if (!editingUser) return;
    setLoading(true);
    try {
      const { auth } = await import("../firebase");
      const token = await auth.currentUser.getIdToken();

      const response = await axios.post(`${API_URL}/admin/update-user`, editingUser, {
        headers: { Authorization: `Bearer ${token}` }
      });

      alert(response.data.message || "Usuario actualizado.");
      fetchUsers();
      setEditingUser(null);
    } catch (err) {
      console.error(err);
      alert(err.response?.data || "Error al actualizar.");
    }
    setLoading(false);
  };

  const handleResetWhatsApp = async () => {
    if (!window.confirm("⚠️ ATENCIÓN: Esta acción cerrará la sesión de WhatsApp actual y borrará las credenciales. ¿Estás seguro de que quieres forzar un nuevo escaneo de QR?")) {
      return;
    }

    setLoading(true);
    try {
      const { auth } = await import("../firebase");
      const token = await auth.currentUser.getIdToken();
      
      const response = await axios.post(`${API_URL}/whatsapp/reset`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success) {
        alert("✅ Reinicio iniciado. El sistema generará un nuevo QR en unos segundos. Ve al Dashboard para escanearlo.");
      }
    } catch (err) {
      console.error("Error reseteando WhatsApp:", err);
      alert("❌ Error: No se pudo reiniciar el motor de WhatsApp.");
    }
    setLoading(false);
  };

  const handleHardResetWhatsApp = async () => {
    if (!window.confirm("🚨 ALERTA DE LIMPIEZA PROFUNDA: Esta acción borrará FÍSICAMENTE los archivos de sesión del servidor. Úsala SOLO si recibes el error 'No se pudo vincular el dispositivo'. El servidor se reiniciará automáticamente. ¿Proceder?")) {
      return;
    }

    setLoading(true);
    try {
      const { auth } = await import("../firebase");
      const token = await auth.currentUser.getIdToken();
      
      const response = await axios.post(`${API_URL}/whatsapp/hard-reset`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });

      alert(`✅ ${response.data.message}`);
      window.location.reload(); // Recargar para esperar el reinicio del servidor
    } catch (err) {
      console.error("Error en limpieza profunda:", err);
      alert("❌ Error: No se pudo realizar la limpieza profunda.");
    }
    setLoading(false);
  };

  if (userProfile?.role !== "ADMIN") {
    return <div className="p-8 text-center">Acceso Denegado. Solo administradores.</div>;
  }

  return (
    <section className="bg-white rounded-[32px] shadow-sm ring-1 ring-slate-200 p-8">
      <div className="flex items-center gap-3 mb-8">
        <Users className="text-emerald-500" size={24} />
        <h2 className="text-2xl font-bold tracking-tight">Gestión de Personal</h2>
      </div>

      <div className="grid gap-8">
        {/* Formulario Nuevo Usuario */}
        <div className="bg-slate-50 border border-slate-200 p-6 rounded-2xl">
          <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
            <UserPlus size={16} /> Registrar Nuevo Funcionario
          </h3>
          <form onSubmit={handleAddUser} className="flex flex-col gap-4">
            <input 
              type="text" 
              placeholder="Nombre Completo" 
              className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm"
              value={newUser.nombre}
              onChange={e => setNewUser({...newUser, nombre: e.target.value})}
              required 
            />
            <input 
              type="email" 
              placeholder="Email Institucional" 
              className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm"
              value={newUser.email}
              onChange={e => setNewUser({...newUser, email: e.target.value})}
              required 
            />
            <input 
              type="password" 
              placeholder="Contraseña Inicial (mínimo 6 chars)" 
              className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm"
              value={newUser.password}
              onChange={e => setNewUser({...newUser, password: e.target.value})}
              minLength={6}
              required 
            />
            <select 
              className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm appearance-none"
              value={newUser.role}
              onChange={e => setNewUser({...newUser, role: e.target.value})}
            >
              <option value="USER">Funcionario (Sólo Envíos)</option>
              <option value="ADMIN">Administrador (Control Total)</option>
            </select>
            <button 
              type="submit" 
              disabled={loading} 
              className="bg-slate-900 text-white font-bold py-3.5 rounded-xl shadow-md hover:opacity-90 transition-all active:scale-[0.98] disabled:bg-slate-300 text-sm"
            >
              {loading ? "Registrando..." : "Añadir al Sistema"}
            </button>
          </form>
        </div>

        {/* Lista de Usuarios */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2 px-2">
            <ShieldCheck size={16} /> Usuarios Activos
          </h3>
          <div className="grid gap-3">
            {users.length === 0 ? (
               <p className="text-center py-6 text-slate-400 italic text-sm">No hay perfiles registrados.</p>
            ) : users.map(u => (
              <div key={u.id} className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-[20px] shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start gap-3">
                   <div className="h-10 w-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 font-bold">
                      {u.nombre.charAt(0).toUpperCase()}
                   </div>
                   <div>
                      <p className="font-bold text-slate-900 leading-none mb-1">{u.nombre}</p>
                      <p className="text-xs text-slate-500 flex items-center gap-1"><Mail size={10}/> {u.email}</p>
                      <span className={`inline-block mt-2 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                        u.role === 'ADMIN' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {u.role}
                      </span>
                   </div>
                </div>
                <div className="flex items-center gap-1">
                  <button 
                    className="p-2 text-slate-300 hover:text-indigo-500 transition-colors"
                    title="Editar Funcionario"
                    onClick={() => setEditingUser({...u})}
                  >
                    <Edit2 size={18} />
                  </button>
                  <button 
                    className="p-2 text-red-200 hover:text-red-500 transition-colors"
                    title="Eliminar Funcionario"
                    onClick={async () => {
                      if(window.confirm(`¿Eliminar a ${u.nombre}?`)) {
                        await deleteDoc(doc(db, "usuarios", u.id));
                        fetchUsers();
                      }
                    }}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Modal de Edición */}
        {editingUser && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                 <h3 className="font-bold text-slate-900 flex items-center gap-2">
                   <Edit2 size={18} className="text-indigo-500"/> Editar Funcionario
                 </h3>
                 <button onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-slate-600">
                   <X size={20}/>
                 </button>
              </div>
              <form onSubmit={handleUpdateUser} className="p-8 space-y-5">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Nombre Completo</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={editingUser.nombre}
                    onChange={e => setEditingUser({...editingUser, nombre: e.target.value})}
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Rol en el Sistema</label>
                  <select 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none"
                    value={editingUser.role}
                    onChange={e => setEditingUser({...editingUser, role: e.target.value})}
                  >
                    <option value="USER">Funcionario (Sólo Envíos)</option>
                    <option value="ADMIN">Administrador (Control Total)</option>
                  </select>
                </div>
                <div className="pt-4 flex gap-3">
                  <button 
                    type="button" 
                    onClick={() => setEditingUser(null)}
                    className="flex-1 px-4 py-3.5 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit" 
                    disabled={loading}
                    className="flex-[2] px-4 py-3.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 disabled:bg-slate-300"
                  >
                    {loading ? "Guardando..." : "Guardar Cambios"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Sección de Gestión de Conectividad */}
        <div className="bg-red-50 border border-red-100 p-6 rounded-2xl">
          <h3 className="text-sm font-bold uppercase tracking-widest text-red-600 mb-4 flex items-center gap-2">
            <QrCode size={16} /> Mantenimiento de Conexión
          </h3>
          <p className="text-xs text-red-600/70 mb-4 font-medium italic">
            Usa esta opción si el bot de WhatsApp no conecta, si quieres cambiar de teléfono o si el QR no se genera correctamente.
          </p>
          <button 
            type="button" 
            disabled={loading} 
            onClick={handleResetWhatsApp}
            className="w-full flex items-center justify-center gap-2 bg-slate-100 text-slate-700 font-bold py-3.5 rounded-xl hover:bg-slate-200 transition-all active:scale-[0.98] disabled:bg-slate-50 text-sm mb-3"
          >
            {loading ? <RefreshCw className="animate-spin" size={18} /> : <RefreshCw size={18} />}
            {loading ? "Reiniciando..." : "Reiniciar Motor de WhatsApp"}
          </button>

          <button 
            type="button" 
            disabled={loading} 
            onClick={handleHardResetWhatsApp}
            className="w-full flex items-center justify-center gap-2 bg-red-600 text-white font-bold py-3.5 rounded-xl shadow-md hover:bg-red-700 transition-all active:scale-[0.98] disabled:bg-red-300 text-sm"
          >
            {loading ? <RefreshCw className="animate-spin" size={18} /> : <Trash2 size={18} />}
            {loading ? "Borrando..." : "Limpieza Profunda (Wipe Session)"}
          </button>
        </div>
      </div>
    </section>
  );
};

export default AdminPanel;
