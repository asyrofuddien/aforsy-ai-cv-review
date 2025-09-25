import dotenv from 'dotenv';
import { connectDB, disconnectDB } from '../src/config/database';
import { initializeVectorDB } from '../src/config/vectordb';
import vectordbService from '../src/services/vectordb/vectordb.service';
import JobDescription from '../src/models/jobDescription.model';
import logger from '../src/utils/logger';

dotenv.config();

const seedVectorDB = async () => {
  try {
    await connectDB();
    await initializeVectorDB();

    // Get all job descriptions
    const jobDescriptions = await JobDescription.find();

    // Prepare documents for vector DB
    const documents = [];

    for (const job of jobDescriptions) {
      // Add job description
      documents.push({
        id: `job-${job._id}`,
        text: `${job.title} at ${job.company}. ${
          job.description
        }. Requirements: ${job.requirements.technical.join(', ')}`,
        metadata: {
          type: 'job_description' as const,
          jobId: job._id.toString(),
          title: job.title,
          company: job.company,
        },
      });

      // Add technical requirements separately
      documents.push({
        id: `job-tech-${job._id}`,
        text: `Technical requirements for ${
          job.title
        }: ${job.requirements.technical.join('. ')}`,
        metadata: {
          type: 'job_description' as const,
          section: 'technical_requirements',
          jobId: job._id.toString(),
        },
      });

      // Add soft skills requirements
      documents.push({
        id: `job-soft-${job._id}`,
        text: `Soft skills for ${
          job.title
        }: ${job.requirements.soft_skills.join('. ')}`,
        metadata: {
          type: 'job_description' as const,
          section: 'soft_skills',
          jobId: job._id.toString(),
        },
      });
    }

    // Add scoring rubrics
    const scoringRubrics = [
      {
        id: 'rubric-cv-technical',
        text: 'CV Technical Skills Scoring: 5 points for exact match with all required technologies, 4 points for 80% match, 3 points for 60% match, 2 points for basic understanding, 1 point for minimal exposure',
        metadata: {
          type: 'scoring_rubric' as const,
          category: 'cv',
          aspect: 'technical_skills',
        },
      },
      {
        id: 'rubric-cv-experience',
        text: 'CV Experience Level Scoring: 5 points for exceeding years requirement with relevant experience, 4 points for meeting requirement, 3 points for 1-2 years below requirement, 2 points for junior level, 1 point for entry level',
        metadata: {
          type: 'scoring_rubric' as const,
          category: 'cv',
          aspect: 'experience_level',
        },
      },
      {
        id: 'rubric-project-correctness',
        text: 'Project Correctness Scoring: 5 points for all requirements implemented perfectly, 4 points for minor issues, 3 points for most requirements met, 2 points for basic implementation, 1 point for incomplete',
        metadata: {
          type: 'scoring_rubric' as const,
          category: 'project',
          aspect: 'correctness',
        },
      },
      {
        id: 'rubric-project-quality',
        text: 'Project Code Quality Scoring: 5 points for excellent architecture and clean code, 4 points for good practices, 3 points for adequate structure, 2 points for functional but messy, 1 point for poor quality',
        metadata: {
          type: 'scoring_rubric' as const,
          category: 'project',
          aspect: 'code_quality',
        },
      },
    ];

    documents.push(...scoringRubrics);

    // Upsert all documents
    logger.info(`Seeding ${documents.length} documents to vector database...`);
    await vectordbService.upsertDocuments(documents);

    logger.info('✅ Vector database seeded successfully');

    await disconnectDB();
  } catch (error) {
    logger.error('Failed to seed vector database:', error);
    process.exit(1);
  }
};

seedVectorDB();
