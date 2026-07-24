import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '.env') });

import db from './src/lib/db';

async function main() {
  try {
    const { rows } = await db.query(`
      SELECT id, student_id, pusher_login, repo_name, status, error_message, created_at 
      FROM intern_webhook_events 
      ORDER BY created_at DESC 
      LIMIT 10
    `);
    console.log('--- RECENT WEBHOOK EVENTS ---');
    console.dir(rows, { depth: null });
    db.pool.end();
  } catch (err) {
    console.error('Error fetching webhook events:', err);
    db.pool.end();
  }
}

main();
