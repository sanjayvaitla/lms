import db from './src/lib/db';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  try {
    const res = await db.query('SELECT email FROM users LIMIT 5');
    console.log('Users in DB:', res.rows);
    process.exit(0);
  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  }
}
run();
