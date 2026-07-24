/**
 * file-validation.middleware.ts — Advanced file validation middleware
 * 
 * Provides comprehensive file validation including:
 * - File type validation by magic bytes
 * - Size limits
 * - Security checks
 */

import { Request, Response, NextFunction } from 'express';
import { AppError } from './error.middleware';

// Magic bytes for common file types
const FILE_SIGNATURES: Record<string, Buffer[]> = {
  'image/jpeg': [
    Buffer.from([0xFF, 0xD8, 0xFF]),
  ],
  'image/png': [
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  ],
  'image/webp': [
    Buffer.from([0x52, 0x49, 0x46, 0x46]), // RIFF header
  ],
  'application/pdf': [
    Buffer.from([0x25, 0x50, 0x44, 0x46]), // %PDF
  ],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [
    Buffer.from([0x50, 0x4B, 0x03, 0x04]), // ZIP header (Excel files are ZIP archives)
  ],
  'application/vnd.ms-excel': [
    Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]), // OLE header
  ],
  'text/csv': [
    // CSV files don't have magic bytes, we'll validate content structure instead
  ],
};

/**
 * Validate file type by checking magic bytes
 */
function validateFileSignature(buffer: Buffer, mimeType: string): boolean {
  const signatures = FILE_SIGNATURES[mimeType];
  if (!signatures || signatures.length === 0) {
    // For CSV and other text files, we can't validate by magic bytes
    return mimeType === 'text/csv' || mimeType === 'application/csv';
  }

  return signatures.some(signature => {
    if (buffer.length < signature.length) return false;
    return buffer.subarray(0, signature.length).equals(signature);
  });
}

/**
 * Validate CSV file structure
 */
function validateCSVContent(buffer: Buffer): boolean {
  try {
    const content = buffer.toString('utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) return false; // Must have header + at least one data row
    
    const headerCols = lines[0].split(',').length;
    if (headerCols < 2) return false; // Must have at least 2 columns
    
    // Check that most rows have consistent column count
    let validRows = 0;
    for (let i = 1; i < Math.min(lines.length, 10); i++) { // Check first 10 rows
      const cols = lines[i].split(',').length;
      if (cols === headerCols) validRows++;
    }
    
    return validRows >= Math.min(lines.length - 1, 5); // At least 5 valid rows or all rows
  } catch {
    return false;
  }
}

/**
 * Advanced file validation middleware
 */
export function validateFile(options: {
  allowedTypes: string[];
  maxSize?: number;
  required?: boolean;
}) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const file = req.file;
    
    // Check if file is required
    if (options.required && !file) {
      return next(new AppError('File is required', 400, 'FILE_REQUIRED'));
    }
    
    if (!file) return next(); // File is optional and not provided
    
    // Check file size
    const maxSize = options.maxSize || 50 * 1024 * 1024; // Default 50MB
    if (file.size > maxSize) {
      return next(new AppError(
        `File too large. Maximum size is ${Math.round(maxSize / 1024 / 1024)}MB`,
        400,
        'FILE_TOO_LARGE'
      ));
    }
    
    // Check MIME type
    if (!options.allowedTypes.includes(file.mimetype)) {
      return next(new AppError(
        `Invalid file type. Allowed types: ${options.allowedTypes.join(', ')}`,
        400,
        'INVALID_FILE_TYPE'
      ));
    }
    
    // Validate file signature (magic bytes)
    if (!validateFileSignature(file.buffer, file.mimetype)) {
      // Special handling for CSV files
      if (file.mimetype === 'text/csv' || file.mimetype === 'application/csv') {
        if (!validateCSVContent(file.buffer)) {
          return next(new AppError('Invalid CSV file format', 400, 'INVALID_CSV_FORMAT'));
        }
      } else {
        return next(new AppError(
          'File content does not match the declared file type',
          400,
          'FILE_SIGNATURE_MISMATCH'
        ));
      }
    }
    
    // Check for potentially malicious filenames
    const filename = file.originalname.toLowerCase();
    const dangerousExtensions = ['.exe', '.bat', '.cmd', '.scr', '.pif', '.com', '.js', '.vbs', '.jar'];
    if (dangerousExtensions.some(ext => filename.endsWith(ext))) {
      return next(new AppError('File type not allowed for security reasons', 400, 'DANGEROUS_FILE_TYPE'));
    }
    
    // Check filename length
    if (file.originalname.length > 255) {
      return next(new AppError('Filename too long. Maximum 255 characters.', 400, 'FILENAME_TOO_LONG'));
    }
    
    next();
  };
}

/**
 * Predefined validation configurations
 */
export const fileValidators = {
  avatar: validateFile({
    allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
    maxSize: 5 * 1024 * 1024, // 5MB
    required: true,
  }),
  
  document: validateFile({
    allowedTypes: ['application/pdf'],
    maxSize: 20 * 1024 * 1024, // 20MB
    required: true,
  }),
  
  dataset: validateFile({
    allowedTypes: [
      'text/csv',
      'application/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ],
    maxSize: 25 * 1024 * 1024, // 25MB
    required: true,
  }),
  
  syllabus: validateFile({
    allowedTypes: [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'application/csv',
    ],
    maxSize: 20 * 1024 * 1024, // 20MB
    required: true,
  }),
};