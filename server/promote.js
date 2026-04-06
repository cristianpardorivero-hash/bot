const admin = require('firebase-admin');

// Inicializar Firebase Admin
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
const email = process.argv[2];

if (!email) {
  console.log("❌ Uso: node promote.js <email>");
  process.exit(1);
}

async function promote() {
  console.log(`🔍 Buscando usuario con email: ${email}...`);
  const usersRef = db.collection('usuarios');
  const snapshot = await usersRef.where('email', '==', email).get();
  
  if (snapshot.empty) {
    console.log('❌ No se encontró ningún registro en Firestore con ese email. ¿Ya te registraste en la app?');
    return;
  }

  const doc = snapshot.docs[0];
  await doc.ref.update({ role: 'ADMIN' });
  console.log(`✅ ¡Éxito! El usuario ${email} ha sido promovido a ADMINISTRADOR. 👑`);
  console.log(`🔄 Reinicia la página en tu navegador para ver el Panel de Gestión.`);
}

promote().then(() => process.exit());
