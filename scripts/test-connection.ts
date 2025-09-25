import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const testConnection = async () => {
  try {
    console.log('Testing MongoDB Atlas connection...');

    await mongoose.connect(process.env.MONGODB_URI as string);

    console.log('✅ MongoDB Atlas connected successfully!');
    console.log('Database:', mongoose.connection.db?.databaseName);

    // Test creating a simple document
    const TestSchema = new mongoose.Schema({ test: String });
    const TestModel = mongoose.model('Test', TestSchema);

    await TestModel.create({ test: 'Connection test successful' });
    console.log('✅ Write test successful!');

    // Clean up
    await TestModel.deleteMany({});
    await mongoose.disconnect();
    console.log('✅ Disconnected successfully!');
  } catch (error) {
    console.error('❌ Connection failed:', error);
  }
  process.exit(0);
};

testConnection();
