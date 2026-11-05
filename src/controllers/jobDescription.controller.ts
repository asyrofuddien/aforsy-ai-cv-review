import { Request, Response } from 'express';
import { asyncHandler } from '../middlewares/error.middleware';
import jobDescriptionService from '../features/job-descriptions/job-description.service';
import appLogger from '../utils/logger';

const logger = appLogger.child({ scope: 'jobDescription' });

export class JobDescriptionController {
  create = asyncHandler(async (req: Request, res: Response) => {
    const data = await jobDescriptionService.create(req.body);
    logger.info(`Job description created: ${data.slug}`);
    res.status(201).json({ success: true, message: 'Job description created successfully', data });
  });

  uploadJobDescription = asyncHandler(async (req: Request, res: Response) => {
    const data = await jobDescriptionService.upload(req.file!, req.body);
    logger.info(`Job description uploaded: ${data.slug}`);
    res.status(201).json({ success: true, message: 'Job description uploaded successfully', data });
  });

  getAll = asyncHandler(async (req: Request, res: Response) => {
    const result = await jobDescriptionService.list(
      req.query.page,
      req.query.limit,
      req.query.search,
    );
    res.status(200).json({ success: true, ...result });
  });

  getOne = asyncHandler(async (req: Request, res: Response) => {
    res
      .status(200)
      .json({ success: true, data: await jobDescriptionService.getById(req.params.id) });
  });

  getBySlug = asyncHandler(async (req: Request, res: Response) => {
    res
      .status(200)
      .json({ success: true, data: await jobDescriptionService.getBySlug(req.params.slug) });
  });

  update = asyncHandler(async (req: Request, res: Response) => {
    const data = await jobDescriptionService.update(req.params.id, req.body);
    logger.info(`Job description updated: ${data.slug}`);
    res.status(200).json({ success: true, message: 'Job description updated successfully', data });
  });

  delete = asyncHandler(async (req: Request, res: Response) => {
    await jobDescriptionService.delete(req.params.id);
    logger.info(`Job description deleted: ${req.params.id}`);
    res.status(200).json({ success: true, message: 'Job description deleted successfully' });
  });

  setDefault = asyncHandler(async (req: Request, res: Response) => {
    const data = await jobDescriptionService.setDefault(req.params.id);
    logger.info(`Default job description set: ${data.slug}`);
    res.status(200).json({ success: true, message: 'Default job description updated', data });
  });
}

export default new JobDescriptionController();
