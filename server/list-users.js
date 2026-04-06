const admin = require('firebase-admin');

try {
  const serviceAccount = require("./serviceAccountKey.json");
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} catch (e) {
  console.error("No se encontró serviceAccountKey.json. Abortando.");
  process.exit(1);
}

const db = admin.firestore();

async function listUsers() {
  console.log(`🔍 Listando todos los usuarios registrados en Firestore...`);
  const snapshot = await db.collection('usuarios').get();
  
  if (snapshot.empty) {
    console.log('🌑 No hay usuarios registrados todavía en Firestore.');
    return;
  }

  snapshot.forEach(doc => {
    const data = doc.data();
    console.log(`- 📧 ${data.email || 'Sin Email'} | 👤 ${data.nombre || 'Sin Nombre'} | 🛡️ Rol: ${data.role || 'Sin Rol'}`);
  });
}

listUsers().then(() => process.exit());
