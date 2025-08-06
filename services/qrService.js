const QRCode = require('qrcode');
const fs = require('fs-extra');
const path = require('path');

async function ensureQr(route, baseUrl = process.env.HOST_URL || 'http://localhost:3000') {
  // QR code should point to the SHORT URL, which will redirect to target URL with UTM parameters
  const shortUrl = `${baseUrl}/${route.alias}`;
  const routeId = route.id;
  
  const pngOut = path.join(__dirname, '..', 'public', 'qrs', `${routeId}.png`);
  const svgOut = path.join(__dirname, '..', 'public', 'qrs', `${routeId}.svg`);
  
  await fs.ensureDir(path.dirname(pngOut));
  
  // Generate PNG (larger size: 200x200) with SHORT URL
  if (!(await fs.pathExists(pngOut))) {
    await QRCode.toFile(pngOut, shortUrl, {
      width: 200,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
  }
  
  // Generate SVG with SHORT URL
  if (!(await fs.pathExists(svgOut))) {
    const svgString = await QRCode.toString(shortUrl, {
      type: 'svg',
      width: 200,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    await fs.writeFile(svgOut, svgString);
  }
}

module.exports = { ensureQr };
