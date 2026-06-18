// icon.svg から各サイズの PNG を生成する（開発用スクリプト）
const sharp = require('sharp');
const fs = require('fs');

const svg = fs.readFileSync('icon.svg');

const jobs = [
  { out: 'icon-192.png', size: 192 },
  { out: 'icon-512.png', size: 512 },
  { out: 'icon-512-maskable.png', size: 512 },
  { out: 'apple-touch-icon.png', size: 180, bg: '#1d4ed8' },
];

(async () => {
  for (const j of jobs) {
    let img = sharp(svg, { density: 384 }).resize(j.size, j.size);
    if (j.bg) img = img.flatten({ background: j.bg });
    await img.png().toFile(j.out);
    console.log('wrote', j.out);
  }
})();
