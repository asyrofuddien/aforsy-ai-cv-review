import mongoose from 'mongoose';
import config from '../src/config/config';
import { ActionCost } from '../src/models/billing.models';

// Add only the new action; never reseed or overwrite existing product prices.
async function main() {
  const apply = process.argv.includes('--apply');
  const databaseName = new URL(config.database.mongoUri).pathname.slice(1);
  if (!apply) { console.log(JSON.stringify({ mode: 'dry-run', databaseName, action: 'job_match_retry', creditsRequired: 1 })); return; }
  if (config.nodeEnv === 'production' && (process.env.BILLING_MIGRATION_TARGET !== 'production' || process.env.BILLING_PRODUCTION_CONFIRM !== databaseName || databaseName !== 'cv-evaluation')) {
    throw new Error('Production action-cost migration requires explicit target and database confirmation.');
  }
  await mongoose.connect(config.database.mongoUri);
  try {
    const cost = await ActionCost.findOneAndUpdate({ action: 'job_match_retry', active: true }, {
      $setOnInsert: { version: 1, creditsRequired: 1 },
    }, { upsert: true, new: true, runValidators: true });
    if (cost.creditsRequired !== 1) throw new Error('Job matching retry cost must be exactly one credit. Existing cost was not changed.');
    console.log(JSON.stringify({ mode: 'applied', action: cost.action, creditsRequired: cost.creditsRequired }));
  } finally { await mongoose.disconnect(); }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : 'Action-cost migration failed'); process.exitCode = 1; });
