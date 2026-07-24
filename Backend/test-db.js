const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  try {
    const { rows: columns } = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users';
    `);
    console.log("Columns in users table:");
    console.log(columns);
    
    const { rows: users } = await pool.query(`SELECT email, role, account_status FROM users LIMIT 5;`);
    console.log("\nUsers:");
    console.log(users);
  } catch (err) {
    console.error("DB Error:", err);
  } finally {
    pool.end();
  }
}
check();
