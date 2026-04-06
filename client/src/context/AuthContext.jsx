import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Función para Login
  const login = (email, password) => {
    return signInWithEmailAndPassword(auth, email, password);
  };

  // Función para Logout
  const logout = () => {
    return signOut(auth);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      
      if (user) {
        // 1. Intentar buscar por UID (Estándar)
        let userDoc = await getDoc(doc(db, "usuarios", user.uid));
        
        if (userDoc.exists()) {
          setUserProfile(userDoc.data());
        } else {
          // 2. Fallback: Buscar por Email (Pre-registrados desde AdminPanel)
          const emailDoc = await getDoc(doc(db, "usuarios", user.email));
          if (emailDoc.exists()) {
            const data = emailDoc.data();
            setUserProfile(data);
            // Opcional: Podríamos migrar el documento a UID aquí para futuras consultas más rápidas
          } else {
            // 3. Perfil por defecto
            setUserProfile({ role: "USER", email: user.email });
          }
        }
      } else {
        setUserProfile(null);
      }
      
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    userProfile,
    login,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
