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
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : "*",
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    credentials: true
}));
app.use(express.json());

const server = http.createServer(app);
const ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
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
let sessions = {};
let incomingLogs = []; // CAJA NEGRA: Para ver mensajes reales en /debug

function loadSessions() {
    try {
        if (fs.existsSync(SESSIONS_FILE)) {
            const data = fs.readFileSync(SESSIONS_FILE, 'utf8');
            sessions = JSON.parse(data);
            console.log(`✅ Base de datos cargada: ${Object.keys(sessions).length} registros encontrados.`);
        } else {
            console.log("ℹ️ No se encontró archivo de sesiones previo, iniciando limpio.");
        }
    } catch (e) {
        console.error("❌ Error cargando sesiones:", e.message);
        sessions = {};
    }
}

function saveSessions() {
    try {
        fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf8');
    } catch (e) {
        console.error("❌ Error guardando sesiones:", e.message);
    }
}

loadSessions();

function initializeWhatsApp() {
    // Intentar detectar la ruta de Chrome dinámicamente o usar rutas comunes
    const chromePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        process.env.CHROME_PATH 
    ];
    
    let executablePath = chromePaths.find(p => p && fs.existsSync(p));

    client = new Client({
        authStrategy: new LocalAuth(),
        puppeteer: {
            headless: 'new',
            executablePath: executablePath || undefined,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-extensions',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ]
        }
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
        if (msg.fromMe && !msg.body.match(/^[12]$/)) return; 

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

        if (body !== '1' && body !== '2') return;

        console.log(`📩 Actividad detectada de ${fromRaw}: "${body}"`);

        const match = Object.keys(sessions).find(id => {
            const cleanId = id.replace(/\D/g, '');
            return cleanId.endsWith(numberOnly.slice(-8)) || numberOnly.endsWith(cleanId.slice(-8));
        });

        if (match) {
            console.log(`¡Coincidencia total con paciente: ${sessions[match].nombre}!`);
            let updated = false;

            if (body === '1') {
                sessions[match].status = 'Confirmada';
                await msg.reply('✅ *Gracias!* Su cita ha sido confirmada.');
                io.emit('log', `✅ ${sessions[match].nombre} ha CONFIRMADO su cita.`);
                updated = true;
            } else if (body === '2') {
                sessions[match].status = 'Cancelada';
                await msg.reply('❌ *Entendido.* Cita cancelada.');
                io.emit('log', `❌ ${sessions[match].nombre} ha CANCELADO su cita.`);
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
        }
    });

    io.emit('whatsapp_status', { state: 'INITIALIZING', message: 'Iniciando motor de WhatsApp...' });
    
    const initTimeout = setTimeout(() => {
        if (!clientReady) {
            console.log("⚠️ La inicialización de WhatsApp está tardando... (60s reach)");
            io.emit('whatsapp_status', { state: 'TIMEOUT', message: 'La conexión está tardando más de lo habitual. Verifica tu internet.' });
        }
    }, 60000);

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

app.post('/send-messages', async (req, res) => {
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
        io.emit('log', `🚀 Iniciando envío a ${data.length} pacientes...`);

        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            console.log(`\n🔍 --- PROCESANDO REGISTRO ${i+1} ---`);
            console.log(`Columnas detectadas en este registro: ${Object.keys(row).join(', ')}`);
        
        // Priorizar la columna 'Celular' que genera nuestro nuevo parser
        const actualPhoneColumn = row['Celular'] ? 'Celular' : (row[phoneColumn] ? phoneColumn : null);
        console.log(`Columna de destino: ${actualPhoneColumn || 'NINGUNA'}`);
        
        if (!actualPhoneColumn) {
            console.warn(`⚠️ Saltando registro ${i}: No se encontró columna de teléfono válida.`);
            continue;
        }

        let phone = String(row[actualPhoneColumn]).trim().replace(/\D/g, '');
        console.log(`Número extraído (crudo): ${phone}`);
        
        // Skip if phone is empty or too short
        if (phone.length < 7 || phone.length > 15) {
            console.warn(`⚠️ Saltando número inválido por longitud: ${phone}`);
            continue;
        }

        // Specific logic for Chilean numbers
        if (phone.length === 9 && phone.startsWith('9')) {
            phone = '56' + phone;
            console.log(`Prefijo 56 añadido: ${phone}`);
        }

        // Validate if the number is on WhatsApp
        try {
            console.log(`Consultando registro WhatsApp para: ${phone}...`);
            const numberId = await client.getNumberId(phone);
            
            if (!numberId) {
                console.warn(`❌ El número ${phone} NO está registrado en WhatsApp.`);
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
            console.log(`ID de WhatsApp verificado: ${phone}`);
        } catch (err) {
            console.error(`🔴 Error fatal verificando número ${phone}:`, err.message);
            continue;
        }

        // Use a robust fuzzy matcher for tags
        let message = messageTemplate.replace(/{{([^}]+)}}/g, (match, tag) => {
            const cleanTag = tag.trim().toLowerCase();
            
            // BÚSQUEDA EXACTA: Priorizar las llaves exactas generadas por nuestro parser interno
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

            // Fallback difuso si la plantilla usa algo raro
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

        // Debug: Log the first few messages to see if placeholders are replaced
        if (i < 3) {
            console.log(`--- Message Preview (Record ${i+1}) ---`);
            console.log(`Phone: ${phone}`);
            console.log(`Keys available: ${Object.keys(row).map(k => '"' + k + '"').join(', ')}`);
            console.log(`Message:\n${message}\n------------------------`);
        }

        try {
            await client.sendMessage(phone, message);
            console.log(`✅ Mensaje enviado a: ${phone}`);
            io.emit('log', `✅ Mensaje enviado exitosamente a ${phone}`);
            
            // BUSCADOR ROBUSTO DE VALORES PARA EL DASHBOARD
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
                motivo: getValue(['motivo', 'prestación', 'prestacion']) || 'Sin motivo',
                fecha: getValue(['fecha', 'día', 'dia']) || '',
                hora: getValue(['hora']) || '',
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
            // Update dashboard
            io.emit('status_update', { id: sessionKey, status: 'Enviado', data: sessions[sessionKey] });

        } catch (error) {
            console.error(`❌ Error enviando a ${phone}:`, error.message);
            io.emit('progress', {
                index: i,
                total: data.length,
                status: 'failed',
                phone: row[actualPhoneColumn] || phone,
                error: error.message
            });
            io.emit('log', `❌ Error enviando a ${row[actualPhoneColumn] || phone}: ${error.message}`);
        }

        // Delay between messages
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    io.emit('finished', true);
    } catch (criticalError) {
        console.error('🔥 ERROR CRITICO EN /send-messages:', criticalError);
        io.emit('whatsapp_status', { state: 'ERROR', message: 'Falla crítica del servidor al enviar.' });
        io.emit('finished', true); // Release frontend lock
    }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception thrown:', err);
});
