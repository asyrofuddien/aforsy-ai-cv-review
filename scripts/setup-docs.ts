import fs from 'fs';
import path from 'path';

function setupDocsAssets(): void {
  try {
    console.log('📦 Setting up Swagger UI assets...');

    const assetsDir = path.join(__dirname, '../public/docs/assets');
    const swaggerUiPath = path.join(__dirname, '../node_modules/swagger-ui-dist');

    // Ensure assets directory exists
    if (!fs.existsSync(assetsDir)) {
      fs.mkdirSync(assetsDir, { recursive: true });
    }

    // Copy required assets
    const assetsToCopy = ['swagger-ui-bundle.js', 'swagger-ui.css', 'favicon-32x32.png'];

    assetsToCopy.forEach((asset) => {
      const srcPath = path.join(swaggerUiPath, asset);
      const destPath = path.join(assetsDir, asset);

      if (fs.existsSync(srcPath)) {
        fs.copyFileSync(srcPath, destPath);
        console.log(`✅ Copied ${asset}`);
      } else {
        console.warn(`⚠️  ${asset} not found in swagger-ui-dist`);
      }
    });

    console.log('📦 Assets setup complete!');
  } catch (error) {
    console.error('❌ Error setting up assets:', error);
  }
}

setupDocsAssets();
