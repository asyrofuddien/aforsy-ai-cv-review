import mongoose from 'mongoose';
import config from '../src/config/config';
import { billingModelIndexPlan } from '../src/models/billing.models';

const migrationKey = '20261103_billing_indexes_v1';
const apply = process.argv.includes('--apply');
const databaseName = new URL(config.database.mongoUri).pathname.slice(1);
type MongoIndexDirection = 1 | -1 | '2d' | '2dsphere' | 'geoHaystack' | 'hashed' | 'text';

function normalizeIndexKeys(keys: Record<string, string | number>): Record<string, MongoIndexDirection> {
  const normalized: Record<string, MongoIndexDirection> = {};
  for (const [field, direction] of Object.entries(keys)) {
    if (direction === 'asc' || direction === 'ascending') normalized[field] = 1;
    else if (direction === 'desc' || direction === 'descending') normalized[field] = -1;
    else if (direction === 1 || direction === -1 || direction === '2d' || direction === '2dsphere' ||
      direction === 'geoHaystack' || direction === 'hashed' || direction === 'text') normalized[field] = direction;
    else throw new Error(`Unsupported MongoDB index direction for ${field}.`);
  }
  return normalized;
}

async function main(): Promise<void> {
  const plan = billingModelIndexPlan.flatMap(model =>
    model.indexes.map(([keys, options]) => ({
      collection: model.collection,
      keys: normalizeIndexKeys(keys),
      options,
    })),
  );

  if (!apply) {
    console.log(JSON.stringify({ mode: 'dry-run', migrationKey, databaseName, indexes: plan }, null, 2));
    return;
  }

  if (
    config.nodeEnv === 'production' ||
    process.env.BILLING_MIGRATION_TARGET !== 'staging' ||
    !/(?:^|[-_])staging(?:$|[-_])/i.test(databaseName)
  ) {
    throw new Error('Apply is restricted to an explicitly selected staging MongoDB database.');
  }

  await mongoose.connect(config.database.mongoUri);
  try {
    const db = mongoose.connection.db;
    if (!db) throw new Error('MongoDB connection has no selected database.');

    const checkpoints = db.collection('billing_schema_migrations');
    await checkpoints.createIndex({ migrationKey: 1 }, { unique: true, name: 'migration_key_unique' });
    if (await checkpoints.findOne({ migrationKey })) {
      console.log(JSON.stringify({ mode: 'already-applied', migrationKey, databaseName }));
      return;
    }

    for (const index of plan) {
      await db.collection(index.collection).createIndex(index.keys, index.options);
    }
    await checkpoints.insertOne({ migrationKey, appliedAt: new Date(), indexCount: plan.length });
    console.log(JSON.stringify({ mode: 'applied', migrationKey, databaseName, indexCount: plan.length }));
  } finally {
    await mongoose.disconnect();
  }
}

void main().catch(error => {
  console.error('Billing index migration failed:', error instanceof Error ? error.message : 'unknown error');
  process.exitCode = 1;
});
