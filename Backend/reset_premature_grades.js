const { Client } = require('pg');
require('dotenv').config();

async function run() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });
  
  try {
    await client.connect();
    
    // Find task progress where the score was given but the student hasn't really made their own commits yet.
    // If commit_count is <= 1 (just the poller's initial catch of the template commit)
    // we can reset them back to CODING.
    
    const res = await client.query(`
      UPDATE intern_task_progress
      SET ai_score = NULL,
          ai_breakdown = '[]'::jsonb,
          ai_feedback = NULL,
          status = 'CODING'
      WHERE status = 'AI_GRADED'
        AND commit_count <= 1
    `);
    
    console.log(`Reset ${res.rowCount} prematurely graded tasks back to CODING.`);
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

run();
