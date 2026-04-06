import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// TODO: Reemplaza este objeto con tus credenciales de la consola de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDjAiKvvYpRhCIvb-VVsMOEt4Mn0sj9LeM",
  authDomain: "hospital-curepto-bot.firebaseapp.com",
  projectId: "hospital-curepto-bot",
  storageBucket: "hospital-curepto-bot.firebasestorage.app",
  messagingSenderId: "90720202749",
  appId: "1:90720202749:web:fdf5c24975b5a208f13394"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);

// Exportar servicios
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
