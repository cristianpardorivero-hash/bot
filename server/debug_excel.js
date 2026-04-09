const xlsx = require('xlsx');
const path = require('path');

const filePath = 'C:\\Users\\crist\\OneDrive\\Escritorio\\09-04-2026.xls';
try {
    const workbook = xlsx.readFile(filePath);
    console.log('Total Sheets:', workbook.SheetNames.length);
    
    for (let s = 0; s < Math.min(workbook.SheetNames.length, 10); s++) {
        const sheetName = workbook.SheetNames[s];
        const sheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        console.log(`--- Sheet ${s} (${sheetName}) ---`);
        console.log(`Rows: ${data.length}`);
        if (data.length > 0) {
            data.slice(0, 5).forEach((row, i) => console.log(`  Row ${i}:`, JSON.stringify(row)));
        }
    }

} catch (e) {
    console.error('Error reading Excel:', e.message);
}
