import fs from 'fs/promises';
import JobDescription, { IJobDescription } from '../../models/jobDescription.model';
import { AppError } from '../../middlewares/error.middleware';
import parser from '../documents/parser/document-parser';
import { indexJobDescription, parseRequirements, removeJobDescriptionIndex, updateJobDescriptionIndex } from './index';

export class JobDescriptionService {
  async create(input: Record<string, any>) {
    const existing = await JobDescription.findOne({ slug: input.slug });
    if (existing) throw new AppError('Job description with this slug already exists', 400);
    if (input.isDefault) await JobDescription.updateMany({ isDefault: true }, { isDefault: false });
    const job = await JobDescription.create({ ...input, isDefault: input.isDefault || false });
    await indexJobDescription(job);
    return job;
  }

  async upload(file: Express.Multer.File, input: Record<string, any>) {
    if (!file) throw new AppError('Job description file is required', 400);
    const { slug, title, company, isDefault } = input;
    if (!slug || !title || !company) throw new AppError('Slug, title, and company are required', 400);
    if (await JobDescription.findOne({ slug })) throw new AppError('Job description with this slug already exists', 400);
    try {
      const content = await parser.parseFile(file.path, file.mimetype);
      const shouldDefault = isDefault === 'true' || isDefault === true;
      if (shouldDefault) await JobDescription.updateMany({ isDefault: true }, { isDefault: false });
      const job = await JobDescription.create({ slug, title, company, description: content, requirements: parseRequirements(content), isDefault: shouldDefault });
      await indexJobDescription(job);
      return job;
    } finally {
      await fs.rm(file.path, { force: true }).catch(() => undefined);
    }
  }

  async list(page: unknown, limit: unknown, search: unknown) {
    const pageNumber = Number(page || 1);
    const pageSize = Number(limit || 10);
    const filter: Record<string, any> = {};
    if (search) filter.$or = [
      { title: { $regex: search, $options: 'i' } },
      { company: { $regex: search, $options: 'i' } },
      { slug: { $regex: search, $options: 'i' } },
    ];
    const [data, total] = await Promise.all([
      JobDescription.find(filter).sort({ createdAt: -1 }).skip((pageNumber - 1) * pageSize).limit(pageSize).select('-description'),
      JobDescription.countDocuments(filter),
    ]);
    return { data, pagination: { page: pageNumber, limit: pageSize, total, pages: Math.ceil(total / pageSize) } };
  }

  async getById(id: string) { return this.require(await JobDescription.findById(id)); }
  async getBySlug(slug: string) { return this.require(await JobDescription.findOne({ slug })); }

  async update(id: string, input: Record<string, any>) {
    if (input.slug && await JobDescription.findOne({ slug: input.slug, _id: { $ne: id } })) {
      throw new AppError('Another job description with this slug exists', 400);
    }
    if (input.isDefault === true) await JobDescription.updateMany({ _id: { $ne: id }, isDefault: true }, { isDefault: false });
    const job = this.require(await JobDescription.findByIdAndUpdate(id, input, { new: true, runValidators: true }));
    await updateJobDescriptionIndex(job);
    return job;
  }

  async delete(id: string) {
    const job = this.require(await JobDescription.findById(id));
    if (job.isDefault) throw new AppError('Cannot delete the default job description', 400);
    await job.deleteOne();
    await removeJobDescriptionIndex(String(job._id));
  }

  async setDefault(id: string) {
    await JobDescription.updateMany({ isDefault: true }, { isDefault: false });
    return this.require(await JobDescription.findByIdAndUpdate(id, { isDefault: true }, { new: true }));
  }

  private require(value: IJobDescription | null | undefined): IJobDescription {
    if (!value) throw new AppError('Job description not found', 404);
    return value;
  }
}

export default new JobDescriptionService();
