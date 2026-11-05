import mongoose from 'mongoose';
import config from '../src/config/config';
import Document from '../src/models/document.model';
import Evaluation from '../src/models/evaluation.model';
import CvMatcher from '../src/models/cvMatcher.model';
import AtsPdf from '../src/models/atsPDF.model';

const markUnclaimed = async () => {
  await mongoose.connect(config.database.mongoUri);
  const models = [Document, Evaluation, CvMatcher, AtsPdf];
  const results = await Promise.all(
    models.map((model) =>
      model.updateMany(
        { $or: [{ userId: { $exists: false } }, { userId: null }] },
        { $set: { legacyUnclaimed: true } },
      ),
    ),
  );
  models.forEach((model, index) => {
    console.info(
      `${model.modelName}: marked ${results[index].modifiedCount} legacy records as unclaimed`,
    );
  });
  await mongoose.disconnect();
};

markUnclaimed().catch(async (error) => {
  console.error('Failed to mark legacy records:', error);
  await mongoose.disconnect();
  process.exitCode = 1;
});
