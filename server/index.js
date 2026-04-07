const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const xlsx = require('xlsx');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const admin = require('firebase-admin');

// Inicialización de Firebase Admin (Soporta archivo local o variable de entorno para Cloud)
let serviceAccount;
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    let rawConfig = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
    // Eliminar comillas externas si el usuario pegó el JSON entre comillas
    if (rawConfig.startsWith("'") && rawConfig.endsWith("'")) rawConfig = rawConfig.slice(1, -1);
    if (rawConfig.startsWith('"') && rawConfig.endsWith('"')) rawConfig = rawConfig.slice(1, -1);
    
    serviceAccount = JSON.parse(rawConfig);
    
    // Normalización ROBUSTA de la clave privada PEM
    if (serviceAccount.private_key && typeof serviceAccount.private_key === 'string') {
      // 1. Reemplazar saltos de línea literales \n por caracteres reales
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
      
      // 2. Asegurar que empiece y termine con los encabezados correctos
      if (!serviceAccount.private_key.includes('-----BEGIN PRIVATE KEY-----')) {
        console.warn("⚠️ Advertencia: La clave privada no parece tener el encabezado PEM estándar.");
      }
    }
    
    console.log("✅ Configuración de Firebase cargada (Longitud de clave:", serviceAccount.private_key?.length, ")");
    console.log("🔍 Inicio de clave:", serviceAccount.private_key?.substring(0, 40).replace(/\n/g, '[NL]'), "...");
  } else {
    serviceAccount = require("./serviceAccountKey.json");
    console.log("✅ Usando Firebase Config desde archivo local.");
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log("🔥 Firebase Admin conectado correctamente.");
} catch (error) {
  console.error("❌ Error FATAL al inicializar Firebase:", error.message);
  process.exit(1);
}

// Middleware de Autenticación
const authenticate = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).send('No autorizado: Token faltante');
    }

    const token = authHeader.split(' ')[1];
    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.user = decodedToken;
        next();
    } catch (error) {
        res.status(401).send('No autorizado: Token inválido');
    }
};

const app = express();
app.use(cors({
    origin: (origin, callback) => {
        const whiteList = [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "https://botsome.up.railway.app",
            "https://bot-production-d6f9.up.railway.app"
        ];
        if (!origin || whiteList.indexOf(origin) !== -1 || process.env.ALLOWED_ORIGINS) {
            callback(null, true);
        } else {
            callback(new Error('No permitido por CORS'));
        }
    },
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());

const server = http.createServer(app);
const ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://botsome.up.railway.app",
    "https://bot-production-d6f9.up.railway.app",
    `http://${require('os').hostname()}:5173`
];

const io = new Server(server, {
    cors: {
        origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ALLOWED_ORIGINS,
        methods: ["GET", "POST"]
    }
});

// Diagnóstico de errores globales
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
});

const upload = multer({ dest: 'uploads/' });

let client;
let clientReady = false;
let currentQr = null;

// Peristent sessions management (Using absolute path for reliability)
const SESSIONS_FILE = path.resolve(__dirname, 'sessions.json');
const CAMELIA_FILE = path.resolve(__dirname, 'camelia_sessions.json');
let sessions = {};
let conversacionesActivas = { 
    _config: { activa: true } // Configuración persistente de Camelia
};
let incomingLogs = []; // CAJA NEGRA: Para ver mensajes reales en /debug

function loadSessions() {
    try {
        if (fs.existsSync(SESSIONS_FILE)) {
            const data = fs.readFileSync(SESSIONS_FILE, 'utf8');
            sessions = JSON.parse(data);
            console.log(`✅ Base de datos (Campañas) cargada: ${Object.keys(sessions).length} registros.`);
        }
        if (fs.existsSync(CAMELIA_FILE)) {
            const cameliaData = fs.readFileSync(CAMELIA_FILE, 'utf8');
            const parsedCamelia = JSON.parse(cameliaData);
            // Asegurar que _config siempre exista
            conversacionesActivas = { 
                _config: { activa: true }, 
                ...parsedCamelia 
            };
            console.log(`🌸 Camelia: ${Object.keys(conversacionesActivas).length - 1} conversaciones. Estado: ${conversacionesActivas._config.activa ? 'ACTIVA' : 'INACTIVA'}`);
        }
    } catch (e) {
        console.error("❌ Error cargando sesiones:", e.message);
    }
}

function saveSessions() {
    try {
        fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf8');
        fs.writeFileSync(CAMELIA_FILE, JSON.stringify(conversacionesActivas, null, 2), 'utf8');
    } catch (e) {
        console.error("❌ Error guardando sesiones:", e.message);
    }
}

loadSessions();

// NUEVO: Ayudante para registro histórico en Firestore (Imborrable)
async function logMessageToFirestore(data) {
    try {
        const { paciente, telefono, mensaje, responsable, tipo } = data;
        await admin.firestore().collection('historial_envios').add({
            paciente,
            telefono,
            mensaje,
            responsable: responsable || 'Sistema',
            tipo, // 'masivo', 'manual', 'reenvio'
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
    } catch (e) {
        console.error("❌ Error guardando en historial Firestore:", e.message);
    }
}

function initializeWhatsApp() {
    // Detección mejorada para Railway/Linux y Windows
    const chromePaths = [
        process.env.PUPPETEER_EXECUTABLE_PATH, 
        process.env.CHROME_PATH,
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
    ];
    
    let executablePath = chromePaths.find(p => p && fs.existsSync(p));

    client = new Client({
        authStrategy: new LocalAuth(),
        webVersionCache: {
            type: 'remote',
            remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
        },
        puppeteer: {
            headless: 'new',
            executablePath: executablePath || undefined,
            protocolTimeout: 120000, 
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-extensions',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--disable-software-rasterizer'
            ]
        }
    });

    // Detectar si el navegador o la página se cierran solos
    client.on('change_state', (state) => {
        console.log("🔄 WhatsApp changed state:", state);
    });

    client.on('qr', (qr) => {
        console.log('--- QR Code Generado ---');
        qrcode.toDataURL(qr, (err, url) => {
            if (err) {
                console.error("❌ Error generando Base64 del QR:", err);
                return;
            }
            currentQr = url;
            console.log(`📡 Emitiendo QR a todos los clientes (${url.length} bytes)`);
            io.emit('qr', url);
            io.emit('whatsapp_status', { 
                state: 'QR_READY', 
                message: 'Código QR generado. Listo para escanear.' 
            });
        });
    });

    client.on('ready', () => {
        console.log('Client is ready!');
        clientReady = true;
        currentQr = null;
        io.emit('ready', true);
        io.emit('whatsapp_status', { state: 'READY', message: 'Sesión activa y lista.' });
    });

    client.on('authenticated', () => {
        console.log('Authenticated');
        io.emit('authenticated', true);
    });

    client.on('error', (err) => {
        console.error('❌ WhatsApp Client Error:', err);
        io.emit('whatsapp_status', { state: 'ERROR', message: 'Error en el motor de WhatsApp: ' + err.message });
    });

    client.on('auth_failure', (msg) => {
        console.error('❌ WhatsApp Auth Failure:', msg);
        io.emit('whatsapp_status', { state: 'AUTH_FAILURE', message: 'Error de autenticación. Escanea el QR de nuevo.' });
    });

    client.on('disconnected', (reason) => {
        console.log('Disconnected', reason);
        clientReady = false;
        io.emit('ready', false);
        io.emit('whatsapp_status', { state: 'DISCONNECTED', message: 'WhatsApp desconectado. Reintentando...' });
    });

    client.on('message_create', async (msg) => {
        // Ignorar mis propios mensajes salientes largos (solo escuchar mis respuestas cortas 1,2,3 para debug)
        if (msg.fromMe && msg.body.length > 5) return; 

        const fromRaw = msg.from; 
        const numberOnly = fromRaw.replace(/\D/g, ''); 
        const body = msg.body.trim();
        
        incomingLogs.push({
            time: new Date().toISOString(),
            from: fromRaw,
            body: body,
            type: msg.type
        });
        if (incomingLogs.length > 50) incomingLogs.shift();
        
        // NORMALIZACIÓN AGRESIVA: Extraer solo los números (ej: "3️⃣" -> "3", "3 reagendar" -> "3")
        let cleanBody = body.replace(/\D/g, '');
        if (cleanBody.length > 1) cleanBody = cleanBody.substring(0, 1);

        if (cleanBody !== '1' && cleanBody !== '2' && cleanBody !== '3') return;

        console.log(`📩 Actividad detectada de ${fromRaw}: "${cleanBody}"`);
        io.emit('log', `📩 Bot escuchó: "${cleanBody}" de ${numberOnly}`);
        io.emit('log', `🔍 Paso 1: Normalizado a "${cleanBody}". Buscando paciente...`);

        const match = Object.keys(sessions).find(id => {
            const cleanId = id.replace(/\D/g, '');
            // Coincidencia por últimos 8 dígitos (más robusto para variaciones de +569 / 9 / 56)
            return cleanId.slice(-8) === numberOnly.slice(-8);
        });

        if (!match) {
            io.emit('log', `❌ No se encontró una cita activa (Radar) para el número terminando en ${numberOnly.slice(-4)}.`);
        }

        if (match) {
            io.emit('log', `✅ Paso 2: Coincidencia con "${sessions[match].nombre}". Procesando respuesta ${cleanBody}...`);
            console.log(`¡Coincidencia total con paciente: ${sessions[match].nombre}!`);
            let updated = false;

            if (cleanBody === '1') {
                sessions[match].status = 'Confirmada';
                await msg.reply('✅ *Gracias!* Su cita ha sido confirmada.');
                io.emit('log', `✅ ${sessions[match].nombre} ha CONFIRMADO su cita.`);
                updated = true;
            } else if (cleanBody === '2') {
                sessions[match].status = 'Cancelada';
                await msg.reply('❌ *Entendido.* Cita cancelada.');
                io.emit('log', `❌ ${sessions[match].nombre} ha CANCELADO su cita.`);
                updated = true;
            } else if (cleanBody === '3') {
                sessions[match].status = 'Reagendar';
                await msg.reply('🕒 *Entendido.* Un/a Funcionario/a se pondrá en contacto con usted a la brevedad para coordinar su nueva hora. Si lo prefiere, puede llamar al *75 256 5688* o realice una solicitud por https://telesalud.gob.cl/');
                io.emit('log', `🕒 ${sessions[match].nombre} ha solicitado REAGENDAR su cita.`);
                updated = true;
            }

            if (updated) {
                sessions[match].lastUpdated = new Date().toISOString();
                saveSessions();
                io.emit('status_update', { id: match, status: sessions[match].status, data: sessions[match] });
                io.emit('progress', {
                    status: 'success',
                    phone: sessions[match].telefonoOriginal || match.split('@')[0],
                    message: `Respuesta procesada: ${sessions[match].status} (${sessions[match].nombre})`
                });
            }
        } else {
            // --- LOGICA DE CAMELIA ---
            // Solo procesamos si Camelia está ACTIVA o si el usuario ya tiene una charla iniciada
            const estaActiva = conversacionesActivas._config?.activa !== false;
            const tieneCharlaActiva = conversacionesActivas[numberOnly];

            if (estaActiva || tieneCharlaActiva) {
                await handleCameliaFlow(msg, numberOnly);
            } else {
                console.log(`⏸️ Camelia está en silencio para ${numberOnly}`);
            }
        }
    });

    // Función principal para el flujo conversacional de Camelia
    async function handleCameliaFlow(msg, phone) {
        const estado = conversacionesActivas[phone] || { step: 'INICIO' };
        const body = msg.body.trim();

        try {
            switch(estado.step) {
                case 'INICIO':
                    conversacionesActivas[phone] = { step: 'MENU_PRINCIPAL' };
                    await msg.reply('🌸 *Hola, soy Camelia*, su asistente virtual del Hospital de Curepto.\n\n¿En qué puedo ayudarle hoy?\n\n*1.* Solicitar una hora médica.\n*2.* Cambiar o reagendar una hora existente.\n*3.* Consultar horarios.');
                    saveSessions();
                    break;

                case 'MENU_PRINCIPAL':
                    if (body === '1' || body === '2') {
                        conversacionesActivas[phone] = { 
                            step: 'ESPERANDO_PROFESIONAL', 
                            tipo: body === '1' ? 'Solicitud' : 'Cambio' 
                        };
                        await msg.reply('Entendido. Por favor, escriba el nombre o la especialidad del *Profesional* con quien desea atenderse.');
                    } else if (body === '3') {
                        await msg.reply('Nuestro horario de atención general es de lunes a viernes, de 08:00 a 17:00 horas. Para consultas específicas, puede llamar al 75 256 5688.');
                        // Mantenemos el paso o reseteamos
                    } else {
                        await msg.reply('Por favor, seleccione una opción válida (1, 2 o 3).');
                    }
                    saveSessions();
                    break;

                case 'ESPERANDO_PROFESIONAL':
                    conversacionesActivas[phone].profesional = body;
                    conversacionesActivas[phone].step = 'ESPERANDO_MOTIVO';
                    await msg.reply(`Perfecto. Ahora, indique brevemente el *Motivo* de su consulta para el profesional ${body}.`);
                    saveSessions();
                    break;

                case 'ESPERANDO_MOTIVO':
                    const motivo = body;
                    const tipo = conversacionesActivas[phone].tipo;
                    const profesional = conversacionesActivas[phone].profesional;

                    // GUARDAR EN FIRESTORE
                    await admin.firestore().collection('solicitudes_camelia').add({
                        paciente_telefono: phone,
                        tipo: tipo,
                        profesional: profesional,
                        motivo: motivo,
                        estado: 'PENDIENTE',
                        fecha: admin.firestore.FieldValue.serverTimestamp()
                    });

                    await msg.reply(`✅ *Muchas gracias.* Su solicitud para ${profesional} ha sido recibida y está siendo procesada.\n\nUn funcionario se pondrá en contacto con usted a la brevedad para confirmar la fecha y hora final. ¡Que tenga un buen día!`);
                    
                    io.emit('log', `🌸 Nueva solicitud de ${phone} para ${profesional} (Pendiente en Dashboard).`);
                    io.emit('nueva_solicitud', { phone, profesional, tipo });
                    
                    // Finalizar flujo
                    delete conversacionesActivas[phone];
                    saveSessions();
                    break;

                default:
                    delete conversacionesActivas[phone];
                    saveSessions();
                    break;
            }
        } catch (error) {
            console.error("❌ Error en flujo Camelia:", error.message);
        }
    }

    io.emit('whatsapp_status', { state: 'INITIALIZING', message: 'Iniciando motor de WhatsApp...' });
    
    const initTimeout = setTimeout(() => {
        if (!clientReady) {
            console.log("⚠️ La inicialización de WhatsApp está tardando... (120s reach)");
            io.emit('whatsapp_status', { state: 'TIMEOUT', message: 'La conexión está tardando más de lo habitual. Verifica tu internet.' });
        }
    }, 120000);

    console.log('--- Intentando inicializar WhatsApp Client... ---');
    client.initialize().catch(err => {
        console.error('❌ Falló el arranque de WhatsApp:', err.message);
        clearTimeout(initTimeout);
        io.emit('whatsapp_status', { state: 'ERROR', message: 'Falla crítica del navegador. Reintentando...' });
        setTimeout(() => initializeWhatsApp(), 10000);
    });
    
    client.on('ready', () => {
        clearTimeout(initTimeout);
    });
}

initializeWhatsApp();

io.on('connection', (socket) => {
    console.log(`🔌 Usuario conectado: ${socket.id}`);
    if (clientReady) {
        console.log(`📡 Enviando estado READY a: ${socket.id}`);
        socket.emit('ready', true);
        socket.emit('whatsapp_status', { state: 'READY', message: 'Sesión activa y lista.' });
    } else if (currentQr) {
        console.log(`📡 Enviando QR a: ${socket.id}`);
        socket.emit('qr', currentQr);
        socket.emit('whatsapp_status', { state: 'QR_READY', message: 'Código QR generado. Listo para escanear.' });
    } else {
        console.log(`📡 Enviando estado INITIALIZING a: ${socket.id}`);
        socket.emit('whatsapp_status', { state: 'INITIALIZING', message: 'Iniciando motor de WhatsApp...' });
    }
    // Send current sessions on connect
    socket.emit('initial_sessions', sessions);
    socket.emit('camelia_status', conversacionesActivas._config?.activa !== false);

    // Toggle para Camelia
    socket.on('toggle_camelia', (newState) => {
        if (!conversacionesActivas._config) conversacionesActivas._config = {};
        conversacionesActivas._config.activa = newState;
        saveSessions();
        io.emit('camelia_status', newState);
        io.emit('log', `🌸 Camelia ha sido ${newState ? 'ACTIVADA' : 'DESACTIVADA (Silencio)'} por un administrador.`);
    });

    // Permite al frontend solicitar el estado si sufre una carrera (race condition) al recargar la página
    socket.on('request_status', () => {
        console.log(`⚡ Solicitud de estado recibida de: ${socket.id} (clientReady: ${clientReady})`);
        if (clientReady) {
            socket.emit('ready', true);
            socket.emit('whatsapp_status', { state: 'READY', message: 'Sesión activa y lista.' });
        } else if (currentQr) {
            socket.emit('qr', currentQr);
            socket.emit('whatsapp_status', { state: 'QR_READY', message: 'Código QR generado. Listo para escanear.' });
        } else {
            socket.emit('whatsapp_status', { state: 'INITIALIZING', message: 'Iniciando motor de WhatsApp...' });
        }
        socket.emit('initial_sessions', sessions);
    });
});

app.get('/sessions', (req, res) => {
    res.json(sessions);
});

app.delete('/sessions', (req, res) => {
    sessions = {};
    saveSessions();
    res.send('Sessions cleared');
});

app.delete('/sessions/:id', (req, res) => {
    const { id } = req.params;
    if (sessions[id]) {
        delete sessions[id];
        saveSessions();
        res.send('Session deleted');
    } else {
        res.status(404).send('Session not found');
    }
});

// CAJA NEGRA: Ruta de diagnóstico de mensajes
app.get('/debug', (req, res) => {
    res.json({
        time: new Date().toISOString(),
        clientReady,
        activeSessions: Object.keys(sessions),
        logs: incomingLogs
    });
});

// NUEVO: Reinicio de Sesión WhatsApp (Solo para Administradores)
app.post('/whatsapp/reset', authenticate, async (req, res) => {
    try {
        console.log(`⚠️ Solicitud de REINICIO de WhatsApp recibida de: ${req.user.email}`);
        
        // 1. Notificar a todos los clientes del inicio del reset
        io.emit('whatsapp_status', { state: 'DISCONNECTED', message: 'Reiniciando motor de WhatsApp...' });
        io.emit('ready', false);

        // 2. Destruir cliente actual si existe
        if (client) {
            try {
                await client.destroy();
                console.log("🛑 Cliente WhatsApp destruido.");
            } catch (destroyError) {
                console.warn("⚠️ Error al destruir cliente (ya podría estar cerrado):", destroyError.message);
            }
        }

        // 3. Limpiar variables de estado
        clientReady = false;
        currentQr = null;

        // 4. Eliminar carpeta de autenticación para forzar nuevo QR
        const authPath = path.resolve(__dirname, '.wwebjs_auth');
        if (fs.existsSync(authPath)) {
            try {
                fs.rmSync(authPath, { recursive: true, force: true });
                console.log("🗑️ Carpeta de autenticación eliminada con éxito.");
            } catch (rmError) {
                console.error("❌ Error eliminando carpeta de auth:", rmError.message);
            }
        }

        // 5. Pequeño retardo para asegurar que el sistema de archivos libere los recursos
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 6. Re-inicializar el motor
        console.log("🔄 Re-inicializando motor de WhatsApp...");
        initializeWhatsApp();

        res.json({ success: true, message: "Reinicio iniciado correctamente." });
    } catch (error) {
        console.error("🔥 Error crítico en reset de WhatsApp:", error);
        res.status(500).json({ error: "Error interno al reiniciar la sesión." });
    }
});

// Shorten URLs using TinyURL
async function shortenURL(url) {
    try {
        const response = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`);
        if (!response.ok) throw new Error('TinyURL failed');
        return await response.text();
    } catch (e) {
        console.error("Error al acortar con TinyURL:", e.message);
        return url;
    }
}

// Generate pre-filled links for Google Forms
function generarLinkPrellenado(nombre, telefono, fecha, hora, motivo) {
    const baseUrl = "https://docs.google.com/forms/d/e/1FAIpQLSfTUp1yJMB469Ndiq_dlHbvN-BFNv9ceV00eJwvVTV15lueKw/viewform?usp=pp_url";
    const entries = {
        fecha: "entry.101752776",
        hora: "entry.514957011",
        motivo: "entry.1799750654",
        nombre: "entry.1670770379",
        telefono: "entry.1660214980",
        asistencia: "entry.1454955877"
    };

    const buildUrl = (asistencia) => {
        return `${baseUrl}&${entries.fecha}=${encodeURIComponent(fecha)}&${entries.hora}=${encodeURIComponent(hora)}&${entries.motivo}=${encodeURIComponent(motivo)}&${entries.nombre}=${encodeURIComponent(nombre)}&${entries.telefono}=${encodeURIComponent(telefono)}&${entries.asistencia}=${encodeURIComponent(asistencia)}`;
    };

    return {
        confirmar: buildUrl("Si"),
        rechazar: buildUrl("No")
    };
}

function getSpanishDay(date) {
    const diasSemana = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
    return diasSemana[date.getDay()] || "cita";
}

function cleanInternalCode(str) {
    return String(str || '').replace(/^\d+\s+/, '').trim();
}

app.post('/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }

    try {
        console.log('--- Iniciando Parseo de Excel (Hospital Curepto) ---');
        const workbook = xlsx.readFile(req.file.path, { cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rawRows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        
        const data = [];
        let headerRowIndex = -1;
        let colIndices = { celular: -1, nombre: -1, fecha: -1, hora: -1, motivo: -1 };

        let currentUnidad = 'Consulta - Médico';
        let currentProfesional = 'Médico';
        
        for (let i = 0; i < rawRows.length; i++) {
            const row = rawRows[i];
            if (!row || !Array.isArray(row) || row.length < 1) continue;

            const firstCol = String(row[0] || '').toLowerCase();
            const secondCol = String(row[1] || '').toLowerCase();

            // 1. DETECTOR DE METADATOS (Context Aware)
            if (firstCol.includes('unidad atención')) {
                currentUnidad = cleanInternalCode(String(row[1] || row[0]).replace(/unidad atención/gi, '').replace(/^[:\s-]+/, '').trim());
                console.log(`📂 Bloque detectado: ${currentUnidad}`);
                continue;
            }
            if (firstCol.includes('recurso')) {
                currentProfesional = cleanInternalCode(String(row[1] || row[0]).replace(/recurso/gi, '').replace(/^[:\s-]+/, '').trim());
                continue;
            }

            // 2. BUSCADOR DE CABECERAS DINÁMICO (Si no están detectadas o si cambian)
            const celIdx = row.findIndex(h => String(h||'').toLowerCase().includes('celular') || String(h||'').toLowerCase().includes('telefono'));
            const nomIdx = row.findIndex(h => String(h||'').toLowerCase().includes('nombre') || String(h||'').toLowerCase().includes('paciente'));
            
            if (celIdx !== -1 && nomIdx !== -1) {
                headerRowIndex = i;
                colIndices.celular = celIdx;
                colIndices.nombre = nomIdx;
                colIndices.fecha = row.findIndex(h => String(h||'').toLowerCase().includes('fecha') || String(h||'').toLowerCase().includes('cita'));
                colIndices.hora = row.findIndex(h => String(h||'').toLowerCase().includes('hora') && !String(h||'').toLowerCase().includes('fecha'));
                colIndices.motivo = row.findIndex(h => String(h||'').toLowerCase().includes('motivo') || String(h||'').toLowerCase().includes('agenda') || String(h||'').toLowerCase().includes('prestación'));
                continue;
            }

            // 3. PROCESAMIENTO DE PACIENTE (Solo si ya pasamos la cabecera actual)
            if (headerRowIndex === -1 || i <= headerRowIndex) continue;

            const celRaw = String(row[colIndices.celular] || '');
            const nomRaw = String(row[colIndices.nombre] || '');
            
            // Priorizar motivo de la propia fila, sino de la cabecera de bloque
            const motivoRaw = colIndices.motivo !== -1 && row[colIndices.motivo] ? String(row[colIndices.motivo]).trim() : currentUnidad;
            
            let fetchRaw = '';
            let horaRaw = '';

            // HYBRID PARSER: Detectar si la fila contiene un objeto Fecha nativo
            const maybeDate = row[0];
            const isExcelDate = typeof maybeDate === 'number' && maybeDate > 40000;
            const isJSDate = maybeDate instanceof Date;

            if (isExcelDate || isJSDate) {
                let dateObj = isJSDate ? maybeDate : new Date((maybeDate - 25569) * 86400 * 1000);
                fetchRaw = dateObj.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
                horaRaw = dateObj.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
            } else {
                if (colIndices.fecha !== -1 && row[colIndices.fecha]) {
                    const fVal = row[colIndices.fecha];
                    if (fVal instanceof Date) {
                        fetchRaw = fVal.toLocaleDateString('es-CL');
                    } else if (typeof fVal === 'number' && fVal > 40000) {
                        const dateObj = new Date((fVal - 25569) * 86400 * 1000);
                        fetchRaw = dateObj.toLocaleDateString('es-CL');
                    } else {
                        fetchRaw = String(fVal);
                    }
                }

                if (colIndices.hora !== -1 && row[colIndices.hora]) {
                    const hVal = row[colIndices.hora];
                    if (hVal instanceof Date || (typeof hVal === 'number' && hVal > 40000)) {
                        const dateObj = hVal instanceof Date ? hVal : new Date((hVal - 25569) * 86400 * 1000);
                        horaRaw = dateObj.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
                    } else if (typeof hVal === 'number' && hVal < 1) {
                        const totalSeconds = Math.round(hVal * 86400);
                        const hours = Math.floor(totalSeconds / 3600);
                        const minutes = Math.floor((totalSeconds % 3600) / 60);
                        horaRaw = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
                    } else {
                        horaRaw = String(hVal);
                    }
                }
            }

            let phoneRaw = celRaw.replace(/\D/g, '');
            if (phoneRaw.length >= 8) {
                if (phoneRaw.length === 9 && phoneRaw.startsWith('9')) {
                    phoneRaw = '56' + phoneRaw;
                } else if (phoneRaw.length === 8) {
                    phoneRaw = '569' + phoneRaw;
                }

                if (phoneRaw.startsWith('569') && phoneRaw.length === 11) {
                    const nombre = nomRaw.trim() || 'Paciente';
                    
                    data.push({
                        Nombre: nombre,
                        Celular: phoneRaw,
                        Motivo: motivoRaw,
                        FechaDisplay: fetchRaw || 'Próxima',
                        HoraCita: horaRaw || 'Por definir',
                        DiaSemana: 'Su Cita',
                        Agenda: currentUnidad,
                        Profesional: currentProfesional,
                        Ficha: row[1] || ''
                    });
                }
            }
        }

        fs.unlinkSync(req.file.path);

        if (data.length === 0) {
            return res.status(400).send('No se detectaron pacientes válidos. Revisa que el Excel tenga la columna "Celular".');
        }

        console.log(`✅ Procesados ${data.length} pacientes con éxito.`);
        res.json(data);
    } catch (error) {
        console.error('Error en el servidor:', error);
        res.status(500).send('Error interno al procesar el Excel.');
    }
});

app.post('/send-messages', authenticate, async (req, res) => {
    try {
        const { data, phoneColumn, messageTemplate, delay = 2000 } = req.body;

        if (!clientReady) {
            return res.status(400).send('WhatsApp client is not ready.');
        }

        if (!Array.isArray(data)) {
            console.error('Crash prevention: data is not an array!', data);
            return res.status(400).send('Invalid data format.');
        }

        res.send('Processing started');
        const responsableEmail = req.user.email; // Captura segura antes del bucle
        
        io.emit('log', `🚀 Iniciando envío a ${data.length} pacientes...`);
        io.emit('progress', { index: -1, total: data.length });

        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            console.log(`\n🔍 --- PROCESANDO REGISTRO ${i+1} ---`);
            
            const actualPhoneColumn = row['Celular'] ? 'Celular' : (row[phoneColumn] ? phoneColumn : null);
            
            if (!actualPhoneColumn) {
                const errorMsg = `⚠️ Saltando registro ${i+1}: No se encontró columna de teléfono válida.`;
                console.warn(errorMsg);
                io.emit('log', errorMsg);
                io.emit('progress', { index: i, total: data.length, status: 'failed', error: 'Sin columna de teléfono' });
                continue;
            }

            let phone = String(row[actualPhoneColumn]).trim().replace(/\D/g, '');
            
            if (phone.length < 7 || phone.length > 15) {
                const errorMsg = `⚠️ Saltando número inválido (${phone}) por longitud.`;
                console.warn(errorMsg);
                io.emit('log', errorMsg);
                io.emit('progress', { index: i, total: data.length, status: 'failed', error: 'Longitud inválida' });
                continue;
            }

            if (phone.length === 9 && phone.startsWith('9')) {
                phone = '56' + phone;
            }

            try {
                io.emit('log', `🔍 Verificando WhatsApp para: ${phone}...`);
                
                // Promesa con TIMEOUT para evitar que se cuelgue el bucle
                const numberIdPromise = client.getNumberId(phone);
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('TIMEOUT_BROWSER')), 15000)
                );

                const numberId = await Promise.race([numberIdPromise, timeoutPromise]).catch(e => {
                    console.error(`⚠️ Error/Timeout en getNumberId para ${phone}:`, e.message);
                    io.emit('log', `⚠️ Timeout o error verificando ${phone}.`);
                    return null;
                });
                
                if (!numberId) {
                    const errorMsg = `❌ El número ${phone} NO está registrado en WhatsApp.`;
                    console.warn(errorMsg);
                    io.emit('log', errorMsg);
                    io.emit('progress', {
                        index: i,
                        total: data.length,
                        status: 'failed',
                        phone: phone,
                        error: 'El número no está registrado en WhatsApp.'
                    });
                    continue;
                }
                phone = numberId._serialized;
            } catch (err) {
                console.error(`🔴 Error fatal verificando número ${phone}:`, err.message);
                continue;
            }

            let message = messageTemplate.replace(/{{([^}]+)}}/g, (match, tag) => {
                const cleanTag = tag.trim().toLowerCase();
                const exactKeys = {
                    'nombre': 'Nombre',
                    'fechadisplay': 'FechaDisplay',
                    'horacita': 'HoraCita',
                    'diasemana': 'DiaSemana',
                    'motivo': 'Motivo'
                };
                const targetKey = exactKeys[cleanTag];
                if (targetKey && row[targetKey] !== undefined && row[targetKey] !== null) {
                    return String(row[targetKey]);
                }
                const searchKeys = [];
                if (cleanTag.includes('nombre')) searchKeys.push('nombre', 'paciente');
                if (cleanTag.includes('fecha')) searchKeys.push('fecha');
                if (cleanTag.includes('dia')) searchKeys.push('día', 'dia');
                if (cleanTag.includes('hora')) searchKeys.push('hora', 'cita', 'h.');
                if (cleanTag.includes('motivo')) searchKeys.push('motivo', 'prestación');
                if (searchKeys.length === 0) searchKeys.push(cleanTag);
                const fuzzyKey = Object.keys(row).find(k => {
                    const kLow = k.trim().toLowerCase();
                    return searchKeys.some(s => kLow.includes(s));
                });
                if (fuzzyKey !== undefined) {
                    return (row[fuzzyKey] !== undefined && row[fuzzyKey] !== null) ? String(row[fuzzyKey]) : '';
                }
                return match;
            });

            try {
                io.emit('log', `📤 Enviando a ${phone}...`);
                await client.sendMessage(phone, message);
                console.log(`✅ Mensaje enviado a: ${phone}`);
                io.emit('log', `✅ Mensaje enviado exitosamente a ${phone}`);
                
                const getValue = (keys) => {
                    const foundKey = Object.keys(row).find(k => 
                        keys.some(search => k.trim().toLowerCase().includes(search.toLowerCase()))
                    );
                    return foundKey ? row[foundKey] : '';
                };

                const sessionKey = String(row[actualPhoneColumn]).replace(/\D/g, ''); 
                sessions[sessionKey] = {
                    nombre: getValue(['nombre', 'paciente']) || 'Paciente',
                    telefonoOriginal: row[actualPhoneColumn] || phone,
                    whatsapp_id: phone,
                    motivo: getValue(['motivo', 'prestación', 'prestacion', 'agenda']) || 'Sin motivo',
                    fecha: getValue(['fecha', 'día', 'dia']) || '',
                    hora: getValue(['hora']) || '',
                    profesional: getValue(['profesional', 'médico', 'medico', 'especialista']) || 'No asignado',
                    originalMessage: message, // Guardamos el mensaje para poder reenviarlo idéntico
                    status: 'Enviado',
                    lastUpdated: new Date().toISOString()
                };
                saveSessions();

                io.emit('progress', {
                    index: i,
                    total: data.length,
                    status: 'success',
                    phone: sessionKey
                });
                io.emit('status_update', { id: sessionKey, status: 'Enviado', data: sessions[sessionKey] });

                // Registro histórico en Firestore
                logMessageToFirestore({
                    paciente: sessions[sessionKey].nombre,
                    telefono: sessionKey,
                    mensaje: message,
                    responsable: responsableEmail,
                    tipo: 'masivo'
                });

            } catch (error) {
                const errorMsg = `❌ Error enviando a ${phone}: ${error.message}`;
                console.error(errorMsg);
                io.emit('log', errorMsg);
                io.emit('progress', {
                    index: i,
                    total: data.length,
                    status: 'failed',
                    phone: phone,
                    error: error.message
                });
            }

            // Delay between messages
            if (i < data.length - 1) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        io.emit('finished', true);
    } catch (criticalError) {
        console.error('🔥 ERROR CRITICO EN /send-messages:', criticalError);
        const isDetached = criticalError.message.includes('detached Frame');
        const userMsg = isDetached ? 'El navegador se desconectó inesperadamente. Reiniciando...' : `Error crítico: ${criticalError.message}`;
        
        io.emit('whatsapp_status', { state: 'ERROR', message: userMsg });
        io.emit('log', `❌ ${userMsg}`);
        io.emit('finished', true); 

        if (isDetached) {
            console.log("🔄 Detached Frame detectado, activando auto-reinicio...");
            clientReady = false;
            io.emit('ready', false);
            // Intentamos reinicio suave o pedimos al usuario usar el botón de reiniciar
        }
    }
});

// Endpoint para envío MANUAL (Sin plantilla)
app.post('/send-manual', authenticate, async (req, res) => {
    try {
        const { phone: rawPhone, message } = req.body;

        if (!clientReady) return res.status(400).send('WhatsApp no está listo.');
        if (!rawPhone || !message) return res.status(400).send('Datos incompletos.');

        // Normalización inteligente de número chileno
        let phone = String(rawPhone).trim().replace(/\D/g, '');
        
        // 8 dígitos (ej: 92150337) -> Añadir 569 (Total: 56992150337)
        if (phone.length === 8) phone = '569' + phone;
        // 9 dígitos (ej: 992150337) -> Añadir 56 (Total: 56992150337)
        else if (phone.length === 9 && phone.startsWith('9')) phone = '56' + phone;

        try {
            const numberId = await client.getNumberId(phone);
            if (!numberId) {
                const errorMsg = `❌ Número manual ${phone} no registrado en WhatsApp.`;
                io.emit('log', errorMsg);
                return res.status(404).send(errorMsg);
            }

            await client.sendMessage(numberId._serialized, message);
            io.emit('log', `✅ Envío manual exitoso a ${phone}`);

            // Registro histórico en Firestore
            logMessageToFirestore({
                paciente: 'Envío Manual',
                telefono: phone,
                mensaje: message,
                responsable: req.user.email,
                tipo: 'manual'
            });

            res.send('Mensaje manual enviado.');
        } catch (pupError) {
            console.error('❌ Puppeteer Error en envío:', pupError.message);
            if (pupError.message.includes('detached Frame') || pupError.message.includes('Session closed')) {
                clientReady = false;
                io.emit('ready', false);
                io.emit('whatsapp_status', { state: 'DISCONNECTED', message: 'Detectado fallo del canal. Re-conectando...' });
                return res.status(503).send('El canal de WhatsApp se reinició. Por favor intenta en 5 segundos.');
            }
            throw pupError; 
        }
    } catch (error) {
        console.error('Error en envío manual:', error.message);
        res.status(500).send(`Error: ${error.message}`);
    }
});

// NUEVO: Endpoint para reenviar un mensaje individual desde el monitor
app.post('/resend-individual', authenticate, async (req, res) => {
    try {
        const { id } = req.body;
        if (!id || !sessions[id]) return res.status(404).send('Sesión no encontrada.');
        if (!clientReady) return res.status(503).send('WhatsApp no está listo.');

        const session = sessions[id];
        const target = session.whatsapp_id || id; // Priorizar el ID serializado si existe

        io.emit('log', `🔄 Reenviando mensaje a ${session.nombre} (${id})...`);
        
        await client.sendMessage(target, session.originalMessage);
        
        session.status = 'Reenviado';
        session.lastUpdated = new Date().toISOString();
        saveSessions();

        // Registro histórico en Firestore
        logMessageToFirestore({
            paciente: session.nombre,
            telefono: id,
            mensaje: session.originalMessage,
            responsable: req.user.email,
            tipo: 'reenvio'
        });

        io.emit('log', `✅ Reenvío exitoso a ${session.nombre}`);
        io.emit('status_update', { id, status: 'Reenviado', data: session });
        
        res.send('Mensaje reenviado correctamente.');
    } catch (error) {
        console.error('Error en reenvío individual:', error.message);
        res.status(500).send(`Error al reenviar: ${error.message}`);
    }
});

// NUEVO: Endpoint para que el Admin cree usuarios con contraseña
app.post('/admin/create-user', authenticate, async (req, res) => {
    try {
        // 1. Verificar que el solicitante sea ADMIN
        const callerUid = req.user.uid;
        // Buscamos por UID o por Email (por la inconsistencia detectada)
        let callerDoc = await admin.firestore().collection('usuarios').doc(callerUid).get();
        if (!callerDoc.exists) {
            callerDoc = await admin.firestore().collection('usuarios').doc(req.user.email).get();
        }

        if (!callerDoc.exists || callerDoc.data().role !== 'ADMIN') {
            return res.status(403).send('Acceso denegado: Se requieren permisos de Administrador.');
        }

        const { email, password, nombre, role } = req.body;
        if (!email || !password || !nombre) {
            return res.status(400).send('Faltan datos obligatorios (email, password, nombre).');
        }

        // 2. Crear usuario en Firebase Authentication
        const userRecord = await admin.auth().createUser({
            email,
            password,
            displayName: nombre
        });

        // 3. Crear el perfil en Firestore (usando el UID oficial)
        await admin.firestore().collection('usuarios').doc(userRecord.uid).set({
            nombre,
            email,
            role: role || 'USER',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        res.status(201).json({ 
            success: true, 
            message: `Usuario ${nombre} creado correctamente.`,
            uid: userRecord.uid 
        });
    } catch (error) {
        console.error('Error creando usuario administrativo:', error);
        res.status(500).send(`Error al crear usuario: ${error.message}`);
    }
});

// NUEVO: Endpoint para que el Admin actualice usuarios
app.post('/admin/update-user', authenticate, async (req, res) => {
    try {
        // 1. Verificar que el solicitante sea ADMIN
        const callerUid = req.user.uid;
        let callerDoc = await admin.firestore().collection('usuarios').doc(callerUid).get();
        if (!callerDoc.exists) {
            callerDoc = await admin.firestore().collection('usuarios').doc(req.user.email).get();
        }

        if (!callerDoc.exists || callerDoc.data().role !== 'ADMIN') {
            return res.status(403).send('Acceso denegado: Se requieren permisos de Administrador.');
        }

        const { id, nombre, role } = req.body;
        if (!id || !nombre || !role) {
            return res.status(400).send('Faltan datos obligatorios (id, nombre, role).');
        }

        // 2. Actualizar el perfil en Firestore
        await admin.firestore().collection('usuarios').doc(id).update({
            nombre,
            role,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        res.json({ success: true, message: `Usuario ${nombre} actualizado correctamente.` });
    } catch (error) {
        console.error('Error actualizando usuario administrativo:', error);
        res.status(500).send(`Error al actualizar usuario: ${error.message}`);
    }
});

// NUEVO: Reinicio completo de WhatsApp (Borra sesión y pide nuevo QR)
app.post('/whatsapp/reset', authenticate, async (req, res) => {
    try {
        // Verificar ADMIN
        const user = req.user;
        const callerUid = user.uid;
        const callerEmail = user.email;
        
        let callerDoc = await admin.firestore().collection('usuarios').doc(callerUid).get();
        if (!callerDoc.exists && callerEmail) {
            callerDoc = await admin.firestore().collection('usuarios').doc(callerEmail).get();
        }

        const role = callerDoc.exists ? String(callerDoc.data().role || '').toUpperCase() : 'NONE';

        if (role !== 'ADMIN') {
            console.warn(`🚫 Intento de reinicio fallido. Usuario: ${callerEmail}, Rol detectado: ${role}`);
            return res.status(403).send(`No autorizado. Tu rol es ${role}.`);
        }

        console.log("♻️ Reinicio total solicitado...");
        io.emit('log', "♻️ Iniciando reinicio del motor de WhatsApp...");
        
        clientReady = false;
        io.emit('ready', false);

        if (client) {
            try {
                await client.destroy();
                console.log("✅ Cliente destruido.");
            } catch (e) {
                console.error("⚠️ Error destruyendo cliente:", e.message);
            }
        }

        // Borrar carpeta de sesión para forzar nuevo QR
        const authPath = path.resolve(__dirname, '.wwebjs_auth');
        if (fs.existsSync(authPath)) {
            try {
                fs.rmSync(authPath, { recursive: true, force: true });
                console.log("🗑️ Carpeta de sesión eliminada.");
            } catch (e) {
                console.error("❌ Error borrando carpeta de sesión:", e.message);
            }
        }

        res.json({ success: true, message: "Reinicio en progreso..." });

        // Dar un pequeño tiempo para que los archivos se liberen y re-inicializar
        setTimeout(() => {
            console.log("🚀 Re-inicializando WhatsApp...");
            initializeWhatsApp();
        }, 3000);

    } catch (error) {
        console.error('Error en reset:', error);
        res.status(500).send('Error interno en el reinicio.');
    }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});

process.on('SIGINT', async () => {
    console.log('--- Cerrando servidor y cliente de WhatsApp... ---');
    if (client) await client.destroy();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('--- Cerrando servidor y cliente de WhatsApp... ---');
    if (client) await client.destroy();
    process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception thrown:', err);
});
