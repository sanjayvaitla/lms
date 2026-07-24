import 'dotenv/config';
import db from './src/lib/db';
import { runMigrations } from './src/db/migrations';
import sequelize from './src/lib/sequelize';
import './src/models';
async function fixConstraint() {
  try {
    console.log('Fixing session_references_type_check constraint...');
    await db.query(`
      ALTER TABLE session_references DROP CONSTRAINT IF EXISTS session_references_type_check;
      ALTER TABLE session_references ADD CONSTRAINT session_references_type_check
        CHECK (type IN ('LINK','PDF','VIDEO','DOCUMENT','OTHER','SLM','PPT'));
    `);
    console.log('Successfully fixed database constraint for PPT!');
  } catch (error) {
    console.error('Failed to fix constraint:', error);
  }
}

async function main() {
  await fixConstraint();
  console.log('Running idempotent schema migrations…');
  await runMigrations();
  console.log('Running Sequelize sync to create missing tables…');
  await sequelize.sync();
  console.log('Database setup complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Database setup failed:', err);
  process.exit(1);
});
