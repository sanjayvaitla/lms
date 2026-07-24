const fs = require('fs');
const path = require('path');
const https = require('https');

const modelsDir = path.join(__dirname, 'public', 'models');
if (!fs.existsSync(modelsDir)) {
  fs.mkdirSync(modelsDir, { recursive: true });
}

const baseUrl = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';

const files = [
  'tiny_face_detector_model-weights_manifest.json',
  'tiny_face_detector_model.bin',
  'ssd_mobilenetv1_model-weights_manifest.json',
  'ssd_mobilenetv1_model-shard1',
  'ssd_mobilenetv1_model-shard2',
];

function downloadFile(file) {
  return new Promise((resolve, reject) => {
    const dest = path.join(modelsDir, file);
    const fileStream = fs.createWriteStream(dest);

    https.get(baseUrl + file, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        fileStream.close();
        fs.unlink(dest, () => {});
        https.get(response.headers.location, (redirectRes) => {
          redirectRes.pipe(fileStream);
          fileStream.on('finish', () => {
            fileStream.close();
            console.log(`Downloaded ${file}`);
            resolve();
          });
        }).on('error', reject);
        return;
      }

      response.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        console.log(`Downloaded ${file}`);
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(new Error(`Error downloading ${file}: ${err.message}`));
    });
  });
}

(async () => {
  for (const file of files) {
    await downloadFile(file);
  }
  console.log('All face detection models downloaded successfully.');
})();
