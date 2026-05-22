"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractTextFromFile = extractTextFromFile;
async function extractTextFromFile(file) {
    const name = file.originalname.toLowerCase();
    const mime = file.mimetype;
    if (mime === 'application/pdf' || name.endsWith('.pdf')) {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const pdfParse = require('pdf-parse/lib/pdf-parse');
            const parsed = await pdfParse(file.buffer);
            return { contentText: parsed.text.trim(), fileType: 'PDF' };
        }
        catch {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const pdfParse = require('pdf-parse');
            const parsed = await pdfParse(file.buffer);
            return { contentText: parsed.text.trim(), fileType: 'PDF' };
        }
    }
    if (mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        mime === 'application/vnd.ms-excel' ||
        name.endsWith('.xlsx') ||
        name.endsWith('.xls')) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const XLSX = require('xlsx');
        const workbook = XLSX.read(file.buffer, { type: 'buffer' });
        const lines = [];
        for (const sheetName of workbook.SheetNames) {
            const csvText = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
            if (csvText.trim()) {
                lines.push(`=== Sheet: ${sheetName} ===`);
                lines.push(csvText.trim());
            }
        }
        return { contentText: lines.join('\n\n'), fileType: 'EXCEL' };
    }
    if (mime === 'text/csv' || name.endsWith('.csv')) {
        return { contentText: file.buffer.toString('utf-8').trim(), fileType: 'CSV' };
    }
    if (mime === 'application/json' || name.endsWith('.json')) {
        const raw = file.buffer.toString('utf-8').trim();
        try {
            return { contentText: JSON.stringify(JSON.parse(raw), null, 2), fileType: 'JSON' };
        }
        catch {
            return { contentText: raw, fileType: 'JSON' };
        }
    }
    throw new Error('Unsupported file type. Use PDF, Excel, CSV, or JSON.');
}
//# sourceMappingURL=fileExtract.js.map