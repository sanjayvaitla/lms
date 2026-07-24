const { execSync } = require('child_process');
const fs = require('fs');

try {
  const log = execSync('powershell "Get-Content -Tail 200 ../../../.gemini/antigravity-ide/brain/7c6d5496-2e59-40ce-9a76-f6beaee7beb8/.system_generated/logs/transcript.jsonl | Select-String -Pattern \\"error\\""', { encoding: 'utf-8' });
  fs.writeFileSync('backend_errors.txt', log);
} catch (e) {
  fs.writeFileSync('backend_errors.txt', e.toString());
}
