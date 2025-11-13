import { Request, Response, NextFunction } from 'express';
import { asyncHandler } from '../middlewares/error.middleware';
import codeModel from '../models/code.model';
import logger from '../utils/logger';
import { customAlphabet } from 'nanoid';

const nano = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 8);

export class CodeGeneratorController {
  GenerateCode = asyncHandler(async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    let code = '';
    let exists = true;
    let attempt = 0;

    while (exists && attempt < 10) {
      code = `AFORSY-${nano()}`;
      const found = await codeModel.findOne({ code });
      if (!found) exists = false;
      attempt++;
    }

    if (exists) throw new Error('Failed to generate unique code after 10 attempts');

    logger.info(`Code Created: ${code}`);

    await codeModel.create({ code });

    res.status(201).json({
      success: true,
      message: 'Code Generated',
      data: { code },
    });
  });
  RedeemCode = asyncHandler(async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const { id } = req.params;

    if (!id) {
      throw new Error('code is required!');
    }

    const code = await codeModel.findOne({ code: id }).select('-__v');

    if (!code) {
      throw new Error('code not found!');
    }

    res.status(200).json({
      success: true,
      message: 'Code Found!',
      data: { code },
    });
  });
}

export default new CodeGeneratorController();
