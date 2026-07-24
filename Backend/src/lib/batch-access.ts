import db from './db';
import { AppError } from '../middleware/error.middleware';

/**
 * A trainer can access a batch when they are the assigned batch trainer
 * or when they teach at least one course linked to that batch.
 */
export function trainerBatchAccessSql(batchAlias: string, trainerParam: string): string {
  return `(
    ${batchAlias}.trainer_id = ${trainerParam}
    OR EXISTS (
      SELECT 1 FROM batch_courses bc
      JOIN courses c ON c.id = bc.course_id
      WHERE bc.batch_id = ${batchAlias}.id AND c.trainer_id = ${trainerParam}
    )
  )`;
}

export function trainerBatchCheckSql(batchAlias = 'b'): string {
  return `SELECT ${batchAlias}.id FROM batches ${batchAlias}
          WHERE ${batchAlias}.id = $1 AND ${trainerBatchAccessSql(batchAlias, '$2')}`;
}

export async function assertTrainerBatchAccess(batchId: string, trainerId: string): Promise<void> {
  const { rows } = await db.query(
    `SELECT b.id FROM batches b
     WHERE b.id = $1 AND ${trainerBatchAccessSql('b', '$2')}`,
    [batchId, trainerId],
  );
  if (!rows.length) throw new AppError('Batch not found', 404, 'NOT_FOUND');
}
