import db from './src/lib/db';

async function main() {
  try {
    // Find courses that have NO syllabi
    const { rows: orphanedCourses } = await db.query(`
      SELECT DISTINCT cm.course_id
      FROM course_modules cm
      LEFT JOIN course_syllabi cs ON cs.course_id = cm.course_id
      WHERE cs.id IS NULL AND cm.section IS NOT NULL
    `);

    console.log(`Found ${orphanedCourses.length} courses with orphaned modules (no syllabus).`);

    for (const row of orphanedCourses) {
      console.log(`Cleaning up course_modules for course_id: ${row.course_id}`);
      await db.query(
        'DELETE FROM course_modules WHERE course_id = $1 AND section IS NOT NULL',
        [row.course_id]
      );
    }
    
    // Also clean up modules that belong to courses that DO have a syllabus, but the syllabus doesn't contain these modules
    // To do this properly requires syncing, which is already fixed for future actions.
    // We'll leave that part to manual re-sync if needed, as the primary complaint was for fully deleted syllabi.

    console.log('Cleanup complete!');
  } catch (error) {
    console.error('Error during cleanup:', error);
  } finally {
    process.exit(0);
  }
}

main();
