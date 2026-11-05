import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Template from '../src/models/Template.model';

dotenv.config();

const seedCvTemplate = async () => {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGODB_URI must be configured before seeding the CV template');

  const templatePath = path.resolve(process.cwd(), 'public/templates/template.html');
  const content = fs.readFileSync(templatePath, 'utf8');
  if (!content.trim()) throw new Error(`CV template is empty: ${templatePath}`);

  await mongoose.connect(mongoUri);
  const result = await Template.updateOne(
    { name: 'new_template' },
    { $set: { name: 'new_template', content } },
    { upsert: true },
  );
  console.info(
    `CV template stored from ${templatePath}; matched=${result.matchedCount}, modified=${result.modifiedCount}, upserted=${result.upsertedCount}`,
  );
};

seedCvTemplate()
  .catch((error) => {
    console.error('Failed to seed CV template:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });
