import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase";
import { collection, getDocs, doc, setDoc, deleteDoc } from "firebase/firestore";
import { Users, UserPlus, Trash2, ShieldCheck, Mail, RefreshCw, QrCode } from "lucide-react";
import axios from "axios";

const API_URL = `http://${window.location.hostname}:3001`;

const AdminPanel = () => {
  const { userProfile } = useAuth();
  const [users, setUsers] = useState([]);
  const [newUser, setNewUser] = useState({ email: "", role: "USER", nombre: "" });
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
    setLoading(true);
    try {
      // Nota: En una app real, aquí llamaríamos a una Cloud Function o al Backend 
      // para crear el usuario en Firebase Auth primero.
      // Por ahora pre-registramos el perfil en Firestore.
      await setDoc(doc(db, "usuarios", newUser.email), {
        nombre: newUser.nombre,
        role: newUser.role,
        email: newUser.email
      });
      fetchUsers();
      setNewUser({ email: "", role: "USER", nombre: "" });
      alert("Usuario pre-registrado. Deberá crear su cuenta con este correo.");
    } catch (err) {
      console.error(err);
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
                <button 
                  className="p-2 text-red-200 hover:text-red-500 transition-colors"
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
            ))}
          </div>
        </div>

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
            className="w-full flex items-center justify-center gap-2 bg-red-600 text-white font-bold py-3.5 rounded-xl shadow-md hover:bg-red-700 transition-all active:scale-[0.98] disabled:bg-red-300 text-sm"
          >
            {loading ? <RefreshCw className="animate-spin" size={18} /> : <RefreshCw size={18} />}
            {loading ? "Reiniciando..." : "Cerrar Sesión de WhatsApp y Forzar Nuevo QR"}
          </button>
        </div>
      </div>
    </section>
  );
};

export default AdminPanel;
