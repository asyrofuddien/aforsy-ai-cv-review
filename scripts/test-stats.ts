import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Code from '../src/models/code.model';
import Document from '../src/models/document.model';
import Evaluation from '../src/models/evaluation.model';
import CvMatcher from '../src/models/cvMatcher.model';
import AtsPDF from '../src/models/atsPDF.model';
import Template from '../src/models/Template.model';
import JobDescription from '../src/models/jobDescription.model';

dotenv.config();

const testStats = async () => {
  try {
    console.log('🧪 Testing stats calculations...');
    
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log('✅ Connected to MongoDB');

    // Test basic counts
    const counts = await Promise.all([
      Code.countDocuments(),
      Document.countDocuments(),
      Evaluation.countDocuments(),
      CvMatcher.countDocuments(),
      AtsPDF.countDocuments(),
      Template.countDocuments(),
      JobDescription.countDocuments(),
    ]);

    console.log('\n📊 Current Data Counts:');
    console.log(`   - Codes: ${counts[0]}`);
    console.log(`   - Documents: ${counts[1]}`);
    console.log(`   - Evaluations: ${counts[2]}`);
    console.log(`   - CV Matchers: ${counts[3]}`);
    console.log(`   - ATS PDFs: ${counts[4]}`);
    console.log(`   - Templates: ${counts[5]}`);
    console.log(`   - Job Descriptions: ${counts[6]}`);

    // Test evaluation status breakdown
    const evalByStatus = await Evaluation.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    console.log('\n📈 Evaluation Status Breakdown:');
    evalByStatus.forEach(stat => {
      console.log(`   - ${stat._id}: ${stat.count}`);
    });

    // Test CV Matcher status breakdown
    const cvMatcherByStatus = await CvMatcher.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    console.log('\n🤖 CV Matcher Status Breakdown:');
    cvMatcherByStatus.forEach(stat => {
      console.log(`   - ${stat._id}: ${stat.count}`);
    });

    await mongoose.disconnect();
    console.log('\n✅ Stats test completed successfully!');
    console.log('🚀 The enhanced /test/stats endpoint should work with this data.');

  } catch (error) {
    console.error('❌ Stats test failed:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
};

testStats();