app.post('/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }

    try {
        console.log('--- Iniciando Parseo de Excel Multi-Hoja (Hospital Curepto) ---');
        const workbook = xlsx.readFile(req.file.path, { cellDates: true });
        
        const data = [];
        let currentUnidad = 'Consulta - Médico';
        let currentProfesional = 'Médico';

        // Iterar por TODAS las hojas del archivo (Soporte para exportaciones SSMAULE)
        workbook.SheetNames.forEach((sheetName) => {
            const sheet = workbook.Sheets[sheetName];
            const rawRows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
            
            let headerRowIndex = -1;
            let colIndices = { celular: -1, nombre: -1, fecha: -1, hora: -1, motivo: -1 };
            let patientsInSheet = 0;

            for (let i = 0; i < rawRows.length; i++) {
                const row = rawRows[i].map(cell => unescapeHTML(cell)); // Limpiar cada celda de HTML
                if (!row || row.length < 1) continue;

                const firstCol = String(row[0] || '').toLowerCase();

                // 1. DETECTOR DE METADATOS (Context Aware entre hojas)
                if (firstCol.includes('unidad atención')) {
                    currentUnidad = cleanInternalCode(String(row[1] || row[0]).replace(/unidad atención/gi, '').replace(/^[:\s-]+/, '').trim());
                    continue;
                }
                if (firstCol.includes('recurso')) {
                    currentProfesional = cleanInternalCode(String(row[1] || row[0]).replace(/recurso/gi, '').replace(/^[:\s-]+/, '').trim());
                    continue;
                }

                // 2. BUSCADOR DE CABECERAS DINÁMICO
                const celIdx = row.findIndex(h => {
                    const s = String(h||'').toLowerCase();
                    return s.includes('celular') || s.includes('teléfono') || s.includes('telefono');
                });
                const nomIdx = row.findIndex(h => {
                    const s = String(h||'').toLowerCase();
                    return s.includes('nombre') || s.includes('paciente');
                });
                
                if (celIdx !== -1 && nomIdx !== -1) {
                    headerRowIndex = i;
                    colIndices.celular = celIdx;
                    colIndices.nombre = nomIdx;
                    colIndices.fecha = row.findIndex(h => {
                        const s = String(h||'').toLowerCase();
                        return s.includes('fecha') || s.includes('cita') || s.includes('aten.');
                    });
                    colIndices.hora = row.findIndex(h => {
                        const s = String(h||'').toLowerCase();
                        return s.includes('hora') && !s.includes('fecha');
                    });
                    colIndices.motivo = row.findIndex(h => {
                        const s = String(h||'').toLowerCase();
                        return s.includes('motivo') || s.includes('agenda') || s.includes('prestación') || s.includes('prestacion');
                    });
                    continue;
                }

                // 3. PROCESAMIENTO DE PACIENTE
                if (headerRowIndex === -1 || i <= headerRowIndex) continue;

                const celRaw = String(row[colIndices.celular] || '');
                const nomRaw = String(row[colIndices.nombre] || '');
                
                if (!celRaw || !nomRaw) continue;

                const motivoRaw = colIndices.motivo !== -1 && row[colIndices.motivo] ? String(row[colIndices.motivo]).trim() : currentUnidad;
                
                let fetchRaw = '';
                let horaRaw = '';

                // HYBRID PARSER: Fecha/Hora
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
                        fetchRaw = (fVal instanceof Date) ? fVal.toLocaleDateString('es-CL') : String(fVal);
                    }
                    if (colIndices.hora !== -1 && row[colIndices.hora]) {
                        const hVal = row[colIndices.hora];
                        if (typeof hVal === 'number' && hVal < 1) {
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
                        patientsInSheet++;
                        data.push({
                            Nombre: nomRaw || 'Paciente',
                            Celular: phoneRaw,
                            FechaDisplay: fetchRaw,
                            HoraCita: horaRaw || 'Por definir',
                            DiaSemana: getSpanishDay(new Date()), 
                            Motivo: motivoRaw,
                            Profesional: currentProfesional,
                            Unidad: currentUnidad,
                            Ficha: row[1] || ''
                        });
                    }
                }
            }
            if (patientsInSheet > 0) {
                console.log(`✅ Hoja "${sheetName}" procesada: ${patientsInSheet} pacientes encontrados.`);
            }
        });

        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        console.log(`🏁 Carga finalizada: ${data.length} pacientes totales.`);

        if (data.length === 0) {
            return res.status(400).send('No se detectaron pacientes válidos. Revisa que el Excel tenga la columna "Celular".');
        }

        res.json(data);
    } catch (error) {
        console.error('Error procesando Excel:', error);
        res.status(500).send('Error interno procesando el archivo.');
    }
});
