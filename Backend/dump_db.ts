import db from './src/lib/db';
import * as fs from 'fs';

async function main() {
  try {
    // Find Python course
    const { rows: courses } = await db.query(`SELECT id, title FROM courses WHERE title ILIKE '%Python%'`);
    
    let report = 'Courses found:\\n' + JSON.stringify(courses, null, 2) + '\\n\\n';

    for (const c of courses) {
      const { rows: syllabi } = await db.query(`SELECT id, filename, created_at FROM course_syllabi WHERE course_id = $1`, [c.id]);
      report += `Course ${c.id} (${c.title}) - Syllabi: ${syllabi.length}\\n` + JSON.stringify(syllabi, null, 2) + '\\n';

      const { rows: modules } = await db.query(`SELECT id, title, section, session_number FROM course_modules WHERE course_id = $1 AND section IS NOT NULL LIMIT 10`, [c.id]);
      const { rows: total } = await db.query(`SELECT COUNT(*) FROM course_modules WHERE course_id = $1 AND section IS NOT NULL`, [c.id]);
      
      report += `Course ${c.id} (${c.title}) - Modules (Total: ${total[0].count}):\\n` + JSON.stringify(modules, null, 2) + '\\n\\n';
    }

    fs.writeFileSync('db_dump.txt', report);
    console.log('Dumped to db_dump.txt');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

main();
