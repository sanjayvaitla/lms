import db from '../src/lib/db';
import * as svc from '../src/services/quizzes.service';

async function main() {
  try {
    console.log('dashboard', await svc.getQuizDashboard());
    console.log('datasets', (await svc.listDatasets()).length);
    console.log('questions', (await svc.listQuestions({})).length);
    console.log('quizzes', (await svc.listQuizzes({})).length);
    console.log('attempts', (await svc.listAttempts()).length);
  } catch (e: any) {
    console.error('FAIL:', e.message);
    process.exit(1);
  }
  process.exit(0);
}

main();
