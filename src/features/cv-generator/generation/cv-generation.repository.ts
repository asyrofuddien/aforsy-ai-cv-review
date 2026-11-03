import AtsPdf from '../../../models/atsPDF.model';
import AtsTemplate from '../../../models/atsTemplate.model';
import TemplateModel from '../../../models/Template.model';
import { getActiveAtsTemplate } from '../../../services/atsTemplate.service';

export const cvGenerationRepository = {
  findLegacyTemplate: () => TemplateModel.findOne().lean(),
  findNewTemplate: () => TemplateModel.findOne({ name: 'new_template' }).lean(),
  findNewTemplateContent: async () => {
    const stored = await TemplateModel.findOne({ name: 'new_template' }).lean() as { content?: string } | null;
    return stored?.content;
  },
  findActiveTemplate: (templateId: string) => getActiveAtsTemplate(templateId),
  createGeneratedCv: (record: Record<string, unknown>) => AtsPdf.create(record),
  findAllForOwner: async (ownerId: string, page: number, limit: number) => {
    const filter = { userId: ownerId };
    const [records, total] = await Promise.all([
      AtsPdf.find(filter)
        .sort('-createdAt')
        .select('file_name html_file source_data_available createdAt')
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      AtsPdf.countDocuments(filter),
    ]);
    return { records, total };
  },
  findPdfForOwner: (id: string, ownerId: string) => AtsPdf.findOne({ _id: id, userId: ownerId }).select('pdf_file'),
  findHtmlForOwner: (id: string, ownerId: string) => AtsPdf.findOne({ _id: id, userId: ownerId }).select('html_text'),
  findSourceForOwner: (id: string, ownerId: string) => AtsPdf.findOne({ _id: id, userId: ownerId }).select('source_data'),
  findActiveTemplates: () => AtsTemplate.find({ status: 'active' })
    .select('id name description version status layout preview').sort({ name: 1 }).lean(),
};
