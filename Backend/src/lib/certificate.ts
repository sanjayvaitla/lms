import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';

export interface CertificateData {
  studentName: string;
  programName: string;
  batchType: string;
  duration: string;
  date: string;
  studentId?: string;
}

export async function generateCertificatePDF(data: CertificateData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      // Create a document with landscape orientation for certificates
      const doc = new PDFDocument({
        layout: 'landscape',
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });

      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const templatePath = path.join(process.cwd(), 'src', 'assets', 'certificate_template.png');
      const templateJpgPath = path.join(process.cwd(), 'src', 'assets', 'certificate_template.jpg');

      let hasTemplate = false;
      if (fs.existsSync(templatePath)) {
        doc.image(templatePath, 0, 0, { width: doc.page.width, height: doc.page.height });
        hasTemplate = true;
      } else if (fs.existsSync(templateJpgPath)) {
        doc.image(templateJpgPath, 0, 0, { width: doc.page.width, height: doc.page.height });
        hasTemplate = true;
      }

      if (hasTemplate) {
        // --- Overlay text exactly as per the provided template coordinates ---
        
        // Student Name (centered over the line)
        doc.fontSize(28)
           .fillColor('#000000')
           .text(data.studentName.toUpperCase(), 250, 225, { width: 550, align: 'center' });

        // Course Name
        doc.fontSize(16)
           .text(data.programName.toUpperCase(), 480, 285, { width: 300, align: 'center' });

        // Student ID
        doc.fontSize(14)
           .text(data.studentId || 'N/A', 400, 330, { width: 140, align: 'center' });

        // Duration
        doc.text(data.duration.toUpperCase(), 615, 330, { width: 150, align: 'center' });

        // Batch Checkmarks (Drawn as vector ticks)
        doc.lineWidth(2).strokeColor('#000000');
        if (data.batchType.toLowerCase().includes('weekend')) {
          // Tick over Weekend Batch box (centered around X=531)
          doc.moveTo(527, 365).lineTo(531, 370).lineTo(538, 357).stroke();
        } else {
          // Tick over Regular Batch box (centered around X=391)
          doc.moveTo(387, 365).lineTo(391, 370).lineTo(398, 357).stroke();
        }

        // Date of Issue
        doc.fontSize(16)
           .text(data.date, 590, 425, { width: 200, align: 'center' });

      } else {
        // --- Fallback old design if template image is not found ---
        // Border
        doc.rect(20, 20, doc.page.width - 40, doc.page.height - 40)
           .lineWidth(5)
           .stroke('#0284c7');
        
        doc.rect(25, 25, doc.page.width - 50, doc.page.height - 50)
           .lineWidth(1)
           .stroke('#0284c7');

        // Header
        doc.fontSize(40)
           .fillColor('#ea580c')
           .text('Certificate of Completion', 0, 100, { align: 'center' });

        // Subtitle
        doc.fontSize(20)
           .fillColor('#333333')
           .moveDown(1)
           .text('This is to certify that', { align: 'center' });

        // Student Name
        doc.fontSize(35)
           .fillColor('#0284c7')
           .moveDown(0.5)
           .text(data.studentName, { align: 'center', underline: true });

        // Description
        doc.fontSize(18)
           .fillColor('#333333')
           .moveDown(1)
           .text('has successfully completed the', { align: 'center' });

        // Program Name
        doc.fontSize(25)
           .fillColor('#ea580c')
           .moveDown(0.5)
           .text(data.programName, { align: 'center' });

        // Details
        doc.fontSize(16)
           .fillColor('#555555')
           .moveDown(1.5)
           .text(`Batch Type: ${data.batchType}  |  Duration: ${data.duration}`, { align: 'center' });

        // Date & Signatures
        const ySig = doc.page.height - 120;
        
        doc.fontSize(14)
           .fillColor('#333333')
           .text(`Date: ${data.date}`, 100, ySig);
        
        // Signature line 1
        doc.moveTo(100, ySig - 10).lineTo(250, ySig - 10).stroke('#333');
        doc.text('Date', 150, ySig + 10);

        // Signature line 2 (Authorized Signatory)
        doc.moveTo(doc.page.width - 300, ySig - 10).lineTo(doc.page.width - 100, ySig - 10).stroke('#333');
        doc.text('Authorized Signatory', doc.page.width - 270, ySig + 10);
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
