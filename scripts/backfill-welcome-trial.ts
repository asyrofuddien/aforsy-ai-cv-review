import mongoose from 'mongoose';
import config from '../src/config/config';
import User from '../src/models/user.model';
import { CreditLot } from '../src/models/billing.models';
import { billingService } from '../src/features/billing/billing.service';

const checkpointKey = 'welcome.v1_trial_backfill_v1';
const pageSize = 100;
const apply = process.argv.includes('--apply');
const databaseName = new URL(config.database.mongoUri).pathname.slice(1);

async function main(): Promise<void> {
  const filter = { isActive: true, isEmailVerified: true };
  await mongoose.connect(config.database.mongoUri);
  try {
    if (!apply) {
      const [eligibleAccounts, totalAccounts, grantedLots] = await Promise.all([
        User.countDocuments(filter),
        User.countDocuments(),
        CreditLot.aggregate([
          { $match: { sourceType: 'trial', sourceId: 'welcome.v1' } },
          { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
          { $match: { 'user.isActive': true, 'user.isEmailVerified': true } },
          { $count: 'alreadyGranted' },
        ]),
      ]);
      const alreadyGranted = grantedLots[0]?.alreadyGranted || 0;
      console.log(
        JSON.stringify({
          mode: 'dry-run',
          databaseName,
          eligibleAccounts,
          alreadyGranted,
          pending: Math.max(0, eligibleAccounts - alreadyGranted),
          inactiveOrUnverified: Math.max(0, totalAccounts - eligibleAccounts),
          checkpointKey,
        }),
      );
      return;
    }
    if (
      config.nodeEnv === 'production' ||
      process.env.BILLING_MIGRATION_TARGET !== 'staging' ||
      !/(?:^|[-_])staging(?:$|[-_])/i.test(databaseName)
    ) {
      throw new Error(
        'Trial backfill apply is restricted to an explicitly selected staging MongoDB database.',
      );
    }
    if (!config.billing.trialEnabled) {
      throw new Error('CREDIT_TRIAL_ENABLED must be true before applying the trial backfill.');
    }

    const checkpoints = mongoose.connection.db!.collection('billing_backfill_checkpoints');
    const checkpoint = await checkpoints.findOne({ checkpointKey });
    let lastUserId = checkpoint?.lastUserId as mongoose.Types.ObjectId | undefined;
    let processed = 0;
    let granted = 0;
    let alreadyGranted = 0;
    let users = await User.find({
      ...filter,
      ...(lastUserId ? { _id: { $gt: lastUserId } } : {}),
    })
      .select('_id')
      .sort({ _id: 1 })
      .limit(pageSize)
      .lean();
    while (users.length) {
      for (const user of users) {
        const result = await billingService.grantWelcomeTrial(user._id.toString());
        if (result.granted) granted += 1;
        else alreadyGranted += 1;
        processed += 1;
      }

      lastUserId = users[users.length - 1]._id;
      await checkpoints.updateOne(
        { checkpointKey },
        { $set: { lastUserId, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
        { upsert: true },
      );
      if (users.length < pageSize) break;
      users = await User.find({
        ...filter,
        _id: { $gt: lastUserId },
      })
        .select('_id')
        .sort({ _id: 1 })
        .limit(pageSize)
        .lean();
    }
    console.log(
      JSON.stringify({
        mode: 'applied',
        databaseName,
        processed,
        granted,
        alreadyGranted,
        checkpointKey,
      }),
    );
  } finally {
    await mongoose.disconnect();
  }
}

void main().catch((error) => {
  console.error(
    'Welcome trial backfill failed:',
    error instanceof Error ? error.message : 'unknown error',
  );
  process.exitCode = 1;
});
