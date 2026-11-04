import mongoose from 'mongoose';
import config from '../src/config/config';
import { ActionCost, BillingPackage } from '../src/models/billing.models';

const migrationTarget = 'staging';
const termsVersion = '2026-11-03-v1';
const packages = [
  { sku: 'welcome.v1', nameId: 'Trial', nameEn: 'Welcome', currency: 'IDR', amountIdr: 0, credits: 4 },
  { sku: 'credits_start_12_v1', nameId: 'Mulai', nameEn: 'Start', currency: 'IDR', amountIdr: 14000, credits: 12, lynkProductId: '6ad1db0038a13ff53eff8515-4775-5027640958-1792137984148', lynkCheckoutUrl: 'https://lynk.id/aforsy/z7yj7o2zwwpe' },
  { sku: 'credits_focus_30_v1', nameId: 'Fokus', nameEn: 'Focus', currency: 'IDR', amountIdr: 30000, credits: 30, lynkProductId: '6ad1e2dabc6badce20ed87fc-4292-4743620738-1792139994332', lynkCheckoutUrl: 'https://lynk.id/aforsy/r9wz9xv8mkz7' },
  { sku: 'credits_intensive_75_v1', nameId: 'Intensif', nameEn: 'Intensive', currency: 'IDR', amountIdr: 69000, credits: 75, lynkProductId: '6ad1e32b66c09012c4c00426-8245-4241599588-1792140075691', lynkCheckoutUrl: 'https://lynk.id/aforsy/y10x1n6j3r57' },
] as const;
const actionCosts = [
  { action: 'cv_review_bundle', version: 1, creditsRequired: 3 },
  { action: 'ai_draft', version: 1, creditsRequired: 1 },
] as const;

const apply = process.argv.includes('--apply');
const databaseName = new URL(config.database.mongoUri).pathname.slice(1);

async function main(): Promise<void> {
  const report = { mode: apply ? 'apply' : 'dry-run', databaseName, packages, actionCosts, termsVersion };
  if (!apply) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  if (
    config.nodeEnv === 'production' ||
    process.env.BILLING_MIGRATION_TARGET !== migrationTarget ||
    !/(?:^|[-_])staging(?:$|[-_])/i.test(databaseName)
  ) {
    throw new Error('Catalog apply is restricted to an explicitly selected staging MongoDB database.');
  }

  await mongoose.connect(config.database.mongoUri);
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      for (const item of packages) {
        const existing = await BillingPackage.findOne({ sku: item.sku, version: 1 }).session(session);
        if (existing && (
          existing.nameId !== item.nameId ||
          existing.nameEn !== item.nameEn ||
          existing.currency !== item.currency ||
          existing.amountIdr !== item.amountIdr ||
          existing.credits !== item.credits ||
          existing.termsVersion !== termsVersion
        )) {
          throw new Error(`Catalog item ${item.sku} version 1 differs from the approved snapshot.`);
        }
        if (existing) {
          if (item.sku !== 'welcome.v1') {
            if ((existing.lynkProductId && existing.lynkProductId !== (item as any).lynkProductId) || (existing.lynkCheckoutUrl && existing.lynkCheckoutUrl !== (item as any).lynkCheckoutUrl)) {
              throw new Error(`Catalog item ${item.sku} already has a different Lynk mapping.`);
            }
            if (!existing.lynkProductId || !existing.lynkCheckoutUrl) {
              existing.lynkProductId = (item as any).lynkProductId;
              existing.lynkCheckoutUrl = (item as any).lynkCheckoutUrl;
              await existing.save({ session });
            }
          }
          continue;
        }
        const activeVersion = await BillingPackage.findOne({ sku: item.sku, active: true }).session(session);
        if (activeVersion) throw new Error(`Catalog item ${item.sku} already has an active version.`);
        await BillingPackage.create([{
          ...item,
          version: 1,
          active: true,
          effectiveFrom: new Date(),
          termsVersion,
        }], { session });
      }

      for (const item of actionCosts) {
        const existing = await ActionCost.findOne({ action: item.action, version: item.version }).session(session);
        if (existing && existing.creditsRequired !== item.creditsRequired) {
          throw new Error(`Action cost ${item.action} version ${item.version} differs from the approved snapshot.`);
        }
        if (existing) continue;
        const activeVersion = await ActionCost.findOne({ action: item.action, active: true }).session(session);
        if (activeVersion) throw new Error(`Action cost ${item.action} already has an active version.`);
        await ActionCost.create([{ ...item, active: true }], { session });
      }
    });
    console.log(JSON.stringify({ ...report, mode: 'applied' }));
  } finally {
    await session.endSession();
    await mongoose.disconnect();
  }
}

void main().catch(error => {
  console.error('Billing catalog seed failed:', error instanceof Error ? error.message : 'unknown error');
  process.exitCode = 1;
});
