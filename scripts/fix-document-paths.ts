import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const DocumentSchema = new mongoose.Schema({
  filename: String,
  originalName: String,
  mimeType: String,
  path: String,
  size: Number,
  content: String,
  code_id: mongoose.Schema.Types.ObjectId,
  type: String,
  uploadedAt: Date,
});

const Document = mongoose.model('Document', DocumentSchema);

async function fixDocumentPaths() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/cv-evaluation');
    console.log('Connected to MongoDB');

    const documents = await Document.find({});
    console.log(`Found ${documents.length} documents to check`);

    let fixed = 0;
    let alreadyAbsolute = 0;
    let notFound = 0;

    for (const doc of documents) {
      const currentPath = doc.path;

      // Skip if path is undefined
      if (!currentPath) {
        console.log(`⚠️  Document ${doc._id} has no path`);
        notFound++;
        continue;
      }

      // Check if path is already absolute
      if (path.isAbsolute(currentPath)) {
        // Check if file exists
        if (fs.existsSync(currentPath)) {
          alreadyAbsolute++;
          continue;
        } else {
          console.log(`⚠️  File not found (absolute path): ${currentPath}`);
          notFound++;
          continue;
        }
      }

      // Try to convert to absolute path
      const absolutePath = path.resolve(process.cwd(), currentPath);

      if (fs.existsSync(absolutePath)) {
        await Document.updateOne(
          { _id: doc._id },
          { $set: { path: absolutePath } }
        );
        console.log(`✅ Fixed: ${currentPath} -> ${absolutePath}`);
        fixed++;
      } else {
        console.log(`❌ File not found: ${currentPath} (tried: ${absolutePath})`);
        notFound++;
      }
    }

    console.log('\n=== Summary ===');
    console.log(`Total documents: ${documents.length}`);
    console.log(`Already absolute: ${alreadyAbsolute}`);
    console.log(`Fixed: ${fixed}`);
    console.log(`Not found: ${notFound}`);

    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixDocumentPaths();
