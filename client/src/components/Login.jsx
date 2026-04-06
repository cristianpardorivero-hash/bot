import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { auth, db } from "../firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { LogIn, Mail, Lock, ShieldAlert, UserPlus, Fingerprint } from "lucide-react";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    
    try {
      if (isSignUp) {
        // 1. Crear usuario en Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        // 2. Crear perfil en Firestore
        await setDoc(doc(db, "usuarios", user.uid), {
          nombre: nombre,
          email: email,
          role: "USER" // Por defecto es Usuario. El Admin debe promoverlo.
        });
        
        alert("¡Cuenta creada con éxito! Ahora puedes iniciar sesión.");
        setIsSignUp(false);
      } else {
        await login(email, password);
      }
    } catch (err) {
      setError("Error: " + (err.code === 'auth/email-already-in-use' ? "El correo ya está registrado." : "Credenciales inválidas o error de conexión."));
      console.error(err);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-md bg-white rounded-[32px] shadow-sm ring-1 ring-slate-200 p-8">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="Hospital Logo" className="h-20 mx-auto mb-4 object-contain" />
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Hospital de Curepto</h2>
          <p className="text-slate-500 mt-2">
            {isSignUp ? "Registro de Nuevo Funcionario" : "Portal de Gestión de Citas"}
          </p>
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-3 bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-2xl text-sm">
            <ShieldAlert size={18} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {isSignUp && (
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700 ml-1">Nombre Completo</label>
              <div className="relative">
                <Fingerprint className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  placeholder="Juan Pérez"
                  className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  required
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700 ml-1">Correo Institucional</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="email"
                placeholder="ejemplo@curepto.cl"
                className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700 ml-1">Contraseña</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="password"
                placeholder="••••••••"
                className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading} 
            className="w-full bg-slate-900 text-white font-bold py-4 rounded-2xl shadow-lg hover:opacity-90 transition-all active:scale-[0.98] disabled:bg-slate-300"
          >
            {loading ? "Procesando..." : (isSignUp ? "Crear Cuenta" : "Entrar al Sistema")}
          </button>
        </form>
        
        <div className="mt-8 text-center border-t border-slate-100 pt-6">
          <button 
            className="text-emerald-600 font-semibold hover:text-emerald-700 transition-colors" 
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError("");
            }}
          >
            {isSignUp ? "¿Ya tienes cuenta? Inicia sesión" : "¿No tienes cuenta? Regístrate aquí"}
          </button>
          <p className="text-xs text-slate-400 mt-4 tracking-wide uppercase">
            © 2026 Hospital de Curepto - Innovación en Salud
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
