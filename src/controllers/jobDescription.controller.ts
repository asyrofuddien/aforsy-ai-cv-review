import { Request, Response, NextFunction } from 'express';
import { asyncHandler } from '../middlewares/error.middleware';
import JobDescription from '../models/jobDescription.model';
import parserService from '../services/parser.service';
import vectordbService from '../services/vectordb/vectordb.service';
import { AppError } from '../middlewares/error.middleware';
import logger from '../utils/logger';

export class JobDescriptionController {
  // Create job description (manual input)
  create = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      const {
        slug,
        title,
        company,
        description,
        requirements,
        scoringWeights,
        isDefault,
      } = req.body;

      // Check if slug already exists
      const existing = await JobDescription.findOne({ slug });
      if (existing) {
        throw new AppError(
          'Job description with this slug already exists',
          400
        );
      }

      // If setting as default, unset other defaults
      if (isDefault) {
        await JobDescription.updateMany(
          { isDefault: true },
          { isDefault: false }
        );
      }

      const jobDescription = await JobDescription.create({
        slug,
        title,
        company,
        description,
        requirements,
        scoringWeights,
        isDefault: isDefault || false,
      });

      // Add to vector database
      await this.addToVectorDB(jobDescription);

      logger.info(`Job description created: ${jobDescription.slug}`);

      res.status(201).json({
        success: true,
        message: 'Job description created successfully',
        data: jobDescription,
      });
    }
  );

  // Upload job description from file
  uploadJobDescription = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      const file = req.file;

      if (!file) {
        throw new AppError('Job description file is required', 400);
      }

      const { slug, title, company, isDefault } = req.body;

      if (!slug || !title || !company) {
        throw new AppError('Slug, title, and company are required', 400);
      }

      // Check if slug exists
      const existing = await JobDescription.findOne({ slug });
      if (existing) {
        throw new AppError(
          'Job description with this slug already exists',
          400
        );
      }

      // Parse file content
      const content = await parserService.parseFile(file.path, file.mimetype);

      // Extract requirements from content (basic parsing)
      const requirements = this.parseRequirements(content);

      // If setting as default, unset others
      if (isDefault === 'true' || isDefault === true) {
        await JobDescription.updateMany(
          { isDefault: true },
          { isDefault: false }
        );
      }

      const jobDescription = await JobDescription.create({
        slug,
        title,
        company,
        description: content,
        requirements,
        isDefault: isDefault === 'true' || isDefault === true,
      });

      // Add to vector database
      await this.addToVectorDB(jobDescription);

      logger.info(`Job description uploaded: ${jobDescription.slug}`);

      res.status(201).json({
        success: true,
        message: 'Job description uploaded successfully',
        data: jobDescription,
      });
    }
  );

  // Get all job descriptions
  getAll = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      const { page = 1, limit = 10, search } = req.query;

      const query: any = {};
      if (search) {
        query.$or = [
          { title: { $regex: search, $options: 'i' } },
          { company: { $regex: search, $options: 'i' } },
          { slug: { $regex: search, $options: 'i' } },
        ];
      }

      const skip = (Number(page) - 1) * Number(limit);

      const [jobDescriptions, total] = await Promise.all([
        JobDescription.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(Number(limit))
          .select('-description'), // Exclude full description in list view
        JobDescription.countDocuments(query),
      ]);

      res.status(200).json({
        success: true,
        data: jobDescriptions,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      });
    }
  );

  // Get single job description
  getOne = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      const { id } = req.params;

      const jobDescription = await JobDescription.findById(id);

      if (!jobDescription) {
        throw new AppError('Job description not found', 404);
      }

      res.status(200).json({
        success: true,
        data: jobDescription,
      });
    }
  );

  // Get by slug
  getBySlug = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      const { slug } = req.params;

      const jobDescription = await JobDescription.findOne({ slug });

      if (!jobDescription) {
        throw new AppError('Job description not found', 404);
      }

      res.status(200).json({
        success: true,
        data: jobDescription,
      });
    }
  );

  // Update job description
  update = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      const { id } = req.params;
      const updates = req.body;

      // Don't allow changing slug if it would conflict
      if (updates.slug) {
        const existing = await JobDescription.findOne({
          slug: updates.slug,
          _id: { $ne: id },
        });
        if (existing) {
          throw new AppError(
            'Another job description with this slug exists',
            400
          );
        }
      }

      // Handle default flag
      if (updates.isDefault === true) {
        await JobDescription.updateMany(
          { _id: { $ne: id }, isDefault: true },
          { isDefault: false }
        );
      }

      const jobDescription = await JobDescription.findByIdAndUpdate(
        id,
        updates,
        { new: true, runValidators: true }
      );

      if (!jobDescription) {
        throw new AppError('Job description not found', 404);
      }

      // Update in vector database
      await this.updateInVectorDB(jobDescription);

      logger.info(`Job description updated: ${jobDescription.slug}`);

      res.status(200).json({
        success: true,
        message: 'Job description updated successfully',
        data: jobDescription,
      });
    }
  );

  // Delete job description
  delete = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      const { id } = req.params;

      const jobDescription = await JobDescription.findById(id);

      if (!jobDescription) {
        throw new AppError('Job description not found', 404);
      }

      // Don't allow deleting the default job description
      if (jobDescription.isDefault) {
        throw new AppError('Cannot delete the default job description', 400);
      }

      await jobDescription.deleteOne();

      // Remove from vector database
      await this.removeFromVectorDB(jobDescription._id.toString());

      logger.info(`Job description deleted: ${jobDescription.slug}`);

      res.status(200).json({
        success: true,
        message: 'Job description deleted successfully',
      });
    }
  );

  // Set default job description
  setDefault = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      const { id } = req.params;

      // Unset all defaults
      await JobDescription.updateMany(
        { isDefault: true },
        { isDefault: false }
      );

      // Set new default
      const jobDescription = await JobDescription.findByIdAndUpdate(
        id,
        { isDefault: true },
        { new: true }
      );

      if (!jobDescription) {
        throw new AppError('Job description not found', 404);
      }

      logger.info(`Default job description set: ${jobDescription.slug}`);

      res.status(200).json({
        success: true,
        message: 'Default job description updated',
        data: jobDescription,
      });
    }
  );

  // Helper methods
  private parseRequirements(content: string) {
    const lines = content.split('\n');
    const requirements = {
      technical: [] as string[],
      soft_skills: [] as string[],
    };

    let currentSection = '';

    for (const line of lines) {
      const trimmed = line.trim();

      // Detect sections
      if (
        trimmed.toLowerCase().includes('technical') ||
        trimmed.toLowerCase().includes('requirements')
      ) {
        currentSection = 'technical';
      } else if (
        trimmed.toLowerCase().includes('soft skills') ||
        trimmed.toLowerCase().includes('qualifications')
      ) {
        currentSection = 'soft_skills';
      }

      // Extract bullet points
      if (
        trimmed.startsWith('-') ||
        trimmed.startsWith('•') ||
        trimmed.startsWith('*')
      ) {
        const requirement = trimmed.substring(1).trim();
        if (currentSection === 'technical') {
          requirements.technical.push(requirement);
        } else if (currentSection === 'soft_skills') {
          requirements.soft_skills.push(requirement);
        }
      }
    }

    return requirements;
  }

  private async addToVectorDB(jobDescription: any) {
    try {
      const documents = [
        {
          id: `job-${jobDescription._id}`,
          text: `${jobDescription.title} at ${jobDescription.company}. ${jobDescription.description}`,
          metadata: {
            type: 'job_description' as const,
            jobId: jobDescription._id.toString(),
            title: jobDescription.title,
            company: jobDescription.company,
            slug: jobDescription.slug,
          },
        },
        {
          id: `job-tech-${jobDescription._id}`,
          text: `Technical requirements for ${
            jobDescription.title
          }: ${jobDescription.requirements.technical.join('. ')}`,
          metadata: {
            type: 'job_description' as const,
            section: 'technical_requirements',
            jobId: jobDescription._id.toString(),
            slug: jobDescription.slug,
          },
        },
      ];

      await vectordbService.upsertDocuments(documents);
    } catch (error) {
      logger.error('Failed to add job description to vector DB:', error);
    }
  }

  private async updateInVectorDB(jobDescription: any) {
    // Remove old entries and add new ones
    await this.removeFromVectorDB(jobDescription._id.toString());
    await this.addToVectorDB(jobDescription);
  }

  private async removeFromVectorDB(jobId: string) {
    try {
      // This would ideally delete from vector DB
      // For now, we'll log it
      logger.info(`Would remove job-${jobId} from vector DB`);
    } catch (error) {
      logger.error('Failed to remove from vector DB:', error);
    }
  }
}

export default new JobDescriptionController();
