const fs = require('fs');
const sharp = require('sharp');
const toIco = require('to-ico');

async function convertToIco() {
  console.log('Converting AoXBlue.png to ICO format...');
  
  try {
    // Generate multiple sizes for ICO
    const sizes = [16, 24, 32, 48, 64, 128, 256];
    const buffers = [];

    for (const size of sizes) {
      const buffer = await sharp('AoXBlue.png')
        .resize(size, size)
        .png()
        .toBuffer();
      buffers.push(buffer);
    }

    const icoBuffer = await toIco(buffers);
    
    fs.writeFileSync('icon.ico', icoBuffer);
    fs.writeFileSync('AoX.ico', icoBuffer);
    
    console.log('✅ Successfully created icon.ico and AoX.ico!');
    console.log('   Contains sizes: 16x16, 24x24, 32x32, 48x48, 64x64, 128x128, 256x256');
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.log('\n💡 Alternative: Use an online converter like https://icoconvert.com/');
    console.log('   Upload AoXBlue.png and download as icon.ico');
  }
}

convertToIco();
