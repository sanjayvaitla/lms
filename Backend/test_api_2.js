const http = require('http');
const fs = require('fs');

// Query DB for a student ID
const { Pool } = require('pg');
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'lms_v2', // assuming this is the DB name
  password: 'password', // might need the correct password or use dotenv
  port: 5432,
});

async function run() {
  try {
    require('dotenv').config({ path: 'c:/Users/sanja/Desktop/LMS_NEW/Backend/.env' });
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const res = await pool.query("SELECT student_id FROM student_fees LIMIT 1");
    const studentId = res.rows[0].student_id;
    
    http.get(`http://localhost:6000/api/v1/invoices/debug/student/${studentId}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        fs.writeFileSync('c:/Users/sanja/Desktop/LMS_NEW/Backend/test_output.json', JSON.stringify({ status: res.statusCode, data: JSON.parse(data) }, null, 2));
      });
    });
  } catch(e) {
    fs.writeFileSync('c:/Users/sanja/Desktop/LMS_NEW/Backend/test_output.json', JSON.stringify({ error: e.toString() }));
  }
}
run();
