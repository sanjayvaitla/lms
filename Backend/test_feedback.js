require('dotenv').config();
const db = require('./dist/lib/db').default;

async function run() {
  try {
    const res = await db.query('SELECT * FROM program_feedbacks;');
    console.log("Feedbacks count:", res.rows.length);
    if(res.rows.length > 0) {
      console.log(res.rows);
    }
  } catch (err) {
    console.error(err);
  }
  process.exit();
}
run();
