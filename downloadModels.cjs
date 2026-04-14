const fs = require('fs');
const path = require('path');
const https = require('https');

const modelsDir = path.join(__dirname, 'public', 'models');

if (!fs.existsSync(modelsDir)) {
  fs.mkdirSync(modelsDir, { recursive: true });
}

const baseUrl = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/';

const files = [
  'tiny_face_detector_model-weights_manifest.json',
  'tiny_face_detector_model-shard1',
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model-shard1',
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model-shard1',
  'face_recognition_model-shard2'
];

async function downloadFile(fileName) {
  const filePath = path.join(modelsDir, fileName);
  if (fs.existsSync(filePath)) {
    console.log(`${fileName} already exists.`);
    return;
  }
  
  return new Promise((resolve, reject) => {
    console.log(`Downloading ${fileName}...`);
    const file = fs.createWriteStream(filePath);
    https.get(baseUrl + fileName, (response) => {
      if (response.statusCode !== 200) {
        reject(`Failed to download ${fileName}. Status: ${response.statusCode}`);
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
        console.log(`Successfully downloaded ${fileName}`);
      });
    }).on('error', (err) => {
      fs.unlink(filePath, () => {});
      reject(err.message);
    });
  });
}

async function start() {
  for (const file of files) {
    try {
      await downloadFile(file);
    } catch (err) {
      console.error(err);
    }
  }
  console.log('All downloads finished.');
}

start();
