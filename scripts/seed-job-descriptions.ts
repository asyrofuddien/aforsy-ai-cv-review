import mongoose from 'mongoose';
import dotenv from 'dotenv';
import JobDescription from '../src/models/jobDescription.model';
import logger from '../src/utils/logger';

dotenv.config();

const jobDescriptions = [
  {
    slug: 'default',
    title: 'Senior Backend Engineer',
    company: 'Tech Company',
    description:
      'We are looking for a Senior Backend Engineer with strong experience in Node.js and cloud technologies.',
    requirements: {
      technical: [
        '5+ years of backend development experience',
        'Strong proficiency in Node.js and TypeScript',
        'Experience with databases (MongoDB, PostgreSQL)',
        'Knowledge of cloud platforms (AWS, GCP)',
        'Experience with microservices architecture',
        'Understanding of AI/ML concepts is a plus',
      ],
      soft_skills: [
        'Strong communication skills',
        'Team leadership experience',
        'Problem-solving mindset',
        'Continuous learning attitude',
      ],
    },
    scoringWeights: {
      technicalSkillsMatch: 0.3,
      experienceLevel: 0.25,
      relevantAchievements: 0.2,
      culturalFit: 0.15,
      aiExperience: 0.1,
    },
    isDefault: true,
  },
  {
    slug: 'fullstack-engineer',
    title: 'Full Stack Engineer',
    company: 'Tech Startup',
    description:
      'Looking for a Full Stack Engineer with experience in modern web technologies.',
    requirements: {
      technical: [
        '3+ years of full stack development',
        'React/Vue.js and Node.js experience',
        'Database design and optimization',
        'RESTful API design',
        'Git version control',
      ],
      soft_skills: [
        'Self-motivated',
        'Good communication',
        'Team player',
        'Fast learner',
      ],
    },
    isDefault: false,
  },
];

const seedJobDescriptions = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI!);
    logger.info('Connected to MongoDB');

    // Clear existing job descriptions
    await JobDescription.deleteMany({});
    logger.info('Cleared existing job descriptions');

    // Insert new job descriptions
    const inserted = await JobDescription.insertMany(jobDescriptions);
    logger.info(`Inserted ${inserted.length} job descriptions`);

    // List all job descriptions
    const allJobs = await JobDescription.find({}, 'slug title isDefault');
    logger.info('Available job descriptions:');
    allJobs.forEach((job) => {
      logger.info(
        `- ${job.slug}: ${job.title}${job.isDefault ? ' (DEFAULT)' : ''}`
      );
    });

    await mongoose.disconnect();
    logger.info('Seeding completed');
  } catch (error) {
    logger.error('Seeding failed:', error);
    process.exit(1);
  }
};

seedJobDescriptions();
