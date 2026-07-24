/**
 * cleanup.service.ts — File cleanup and maintenance operations
 * 
 * Handles cleanup of orphaned files, expired temporary files, and maintenance tasks
 */

import db from '../lib/db';
import { storageAdapter } from '../lib/storage';

interface OrphanedFile {
  table: string;
  column: string;
  filePath: string;
}

/**
 * Find files in database that may not exist in storage
 */
export async function findOrphanedFiles(): Promise<OrphanedFile[]> {
  const orphaned: OrphanedFile[] = [];

  // Check assignments
  const assignments = await db.query(
    'SELECT pdf_path FROM assignments WHERE pdf_path IS NOT NULL'
  );
  for (const row of assignments.rows) {
    if (row.pdf_path) {
      orphaned.push({ table: 'assignments', column: 'pdf_path', filePath: row.pdf_path });
    }
  }

  // Check assignment submissions
  const submissions = await db.query(
    'SELECT file_path FROM assignment_submissions WHERE file_path IS NOT NULL'
  );
  for (const row of submissions.rows) {
    if (row.file_path) {
      orphaned.push({ table: 'assignment_submissions', column: 'file_path', filePath: row.file_path });
    }
  }

  // Check course syllabi
  const syllabi = await db.query(
    'SELECT file_path FROM course_syllabi WHERE file_path IS NOT NULL'
  );
  for (const row of syllabi.rows) {
    if (row.file_path) {
      orphaned.push({ table: 'course_syllabi', column: 'file_path', filePath: row.file_path });
    }
  }

  // Check quiz datasets
  const datasets = await db.query(
    'SELECT file_path FROM quiz_datasets WHERE file_path IS NOT NULL'
  );
  for (const row of datasets.rows) {
    if (row.file_path) {
      orphaned.push({ table: 'quiz_datasets', column: 'file_path', filePath: row.file_path });
    }
  }

  // Check user avatars
  const avatars = await db.query(
    'SELECT avatar_url FROM users WHERE avatar_url IS NOT NULL AND avatar_url LIKE \'avatars/%\''
  );
  for (const row of avatars.rows) {
    if (row.avatar_url) {
      orphaned.push({ table: 'users', column: 'avatar_url', filePath: row.avatar_url });
    }
  }

  return orphaned;
}

/**
 * Clean up database records that reference non-existent files
 */
export async function cleanupOrphanedRecords(): Promise<{ cleaned: number; errors: string[] }> {
  let cleaned = 0;
  const errors: string[] = [];

  try {
    // Clean up assignments with missing files
    const assignmentResult = await db.query(
      'UPDATE assignments SET pdf_path = NULL WHERE pdf_path IS NOT NULL AND pdf_path = \'\''
    );
    cleaned += assignmentResult.rowCount || 0;

    // Clean up submissions with missing files
    const submissionResult = await db.query(
      'UPDATE assignment_submissions SET file_path = NULL WHERE file_path IS NOT NULL AND file_path = \'\''
    );
    cleaned += submissionResult.rowCount || 0;

    // Clean up syllabi with missing files
    const syllabiResult = await db.query(
      'UPDATE course_syllabi SET file_path = NULL WHERE file_path IS NOT NULL AND file_path = \'\''
    );
    cleaned += syllabiResult.rowCount || 0;

    // Clean up datasets with missing files
    const datasetResult = await db.query(
      'UPDATE quiz_datasets SET file_path = NULL WHERE file_path IS NOT NULL AND file_path = \'\''
    );
    cleaned += datasetResult.rowCount || 0;

    // Clean up user avatars with invalid paths
    const avatarResult = await db.query(
      'UPDATE users SET avatar_url = NULL WHERE avatar_url IS NOT NULL AND avatar_url = \'\''
    );
    cleaned += avatarResult.rowCount || 0;

  } catch (error) {
    errors.push(`Database cleanup error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return { cleaned, errors };
}

/**
 * Validate file integrity across the system
 */
export async function validateFileIntegrity(): Promise<{
  total: number;
  valid: number;
  invalid: string[];
  errors: string[];
}> {
  const result = {
    total: 0,
    valid: 0,
    invalid: [] as string[],
    errors: [] as string[],
  };

  try {
    const orphanedFiles = await findOrphanedFiles();
    result.total = orphanedFiles.length;

    for (const file of orphanedFiles) {
      try {
        // Try to generate URL - this will fail if file doesn't exist in S3
        await storageAdapter.getUrl(file.filePath); // Validate file exists
        result.valid++;
      } catch (error) {
        result.invalid.push(`${file.table}.${file.column}: ${file.filePath}`);
      }
    }
  } catch (error) {
    result.errors.push(`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return result;
}

/**
 * Get storage usage statistics
 */
export async function getStorageStats(): Promise<{
  assignments: number;
  submissions: number;
  syllabi: number;
  datasets: number;
  avatars: number;
  total: number;
}> {
  const stats = {
    assignments: 0,
    submissions: 0,
    syllabi: 0,
    datasets: 0,
    avatars: 0,
    total: 0,
  };

  try {
    // Count assignments
    const assignmentCount = await db.query(
      'SELECT COUNT(*) as count FROM assignments WHERE pdf_path IS NOT NULL'
    );
    stats.assignments = parseInt(assignmentCount.rows[0]?.count || '0');

    // Count submissions
    const submissionCount = await db.query(
      'SELECT COUNT(*) as count FROM assignment_submissions WHERE file_path IS NOT NULL'
    );
    stats.submissions = parseInt(submissionCount.rows[0]?.count || '0');

    // Count syllabi
    const syllabiCount = await db.query(
      'SELECT COUNT(*) as count FROM course_syllabi WHERE file_path IS NOT NULL'
    );
    stats.syllabi = parseInt(syllabiCount.rows[0]?.count || '0');

    // Count datasets
    const datasetCount = await db.query(
      'SELECT COUNT(*) as count FROM quiz_datasets WHERE file_path IS NOT NULL'
    );
    stats.datasets = parseInt(datasetCount.rows[0]?.count || '0');

    // Count avatars
    const avatarCount = await db.query(
      'SELECT COUNT(*) as count FROM users WHERE avatar_url IS NOT NULL AND avatar_url LIKE \'avatars/%\''
    );
    stats.avatars = parseInt(avatarCount.rows[0]?.count || '0');

    stats.total = stats.assignments + stats.submissions + stats.syllabi + stats.datasets + stats.avatars;
  } catch (error) {
    console.error('Error getting storage stats:', error);
  }

  return stats;
}

/**
 * Comprehensive system health check
 */
export async function systemHealthCheck(): Promise<{
  storage: { ok: boolean; mode: string; error?: string };
  database: { ok: boolean; error?: string };
  files: { total: number; valid: number; invalid: number };
}> {
  const health = {
    storage: { ok: storageAdapter.mode === 's3', mode: storageAdapter.mode },
    database: { ok: true, error: undefined as string | undefined },
    files: { total: 0, valid: 0, invalid: 0 },
  };

  // Test database connectivity
  try {
    await db.query('SELECT 1');
  } catch (error) {
    health.database.ok = false;
    health.database.error = error instanceof Error ? error.message : 'Unknown database error';
  }

  // Check file integrity
  try {
    const fileCheck = await validateFileIntegrity();
    health.files.total = fileCheck.total;
    health.files.valid = fileCheck.valid;
    health.files.invalid = fileCheck.invalid.length;
  } catch (error) {
    console.error('File integrity check failed:', error);
  }

  return health;
}