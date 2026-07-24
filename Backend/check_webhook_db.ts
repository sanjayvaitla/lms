import db from './src/lib/db';

async function check() {
  console.log('--- webhook events for amstrong-1 ---');
  const { rows: events } = await db.query(`SELECT status, error_message, pusher_login, commit_message FROM intern_webhook_events WHERE repo_name = 'amstrong-1' ORDER BY created_at DESC LIMIT 3`);
  console.table(events);

  console.log('\n--- intern_task_progress matching amstrong-1 ---');
  const { rows: progress } = await db.query(`SELECT id, student_id, task_id, status, fork_url, commit_count FROM intern_task_progress WHERE fork_url ILIKE '%amstrong-1%'`);
  console.table(progress);

  process.exit(0);
}
check().catch(console.error);
