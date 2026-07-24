const { execSync } = require('child_process');
const fs = require('fs');

try {
  const log = execSync('git log -p -n 10 Frontend/src/app/pages/student/MyFees.tsx', { encoding: 'utf-8' });
  fs.writeFileSync('git_history.txt', log);
} catch (e) {
  fs.writeFileSync('git_history.txt', e.toString());
}
