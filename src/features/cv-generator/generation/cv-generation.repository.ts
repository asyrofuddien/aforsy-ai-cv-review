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
  findAllForOwner: (ownerId: string) => AtsPdf.find({ userId: ownerId }).sort('-createdAt').select('-__v -code_id'),
  findHtmlForOwner: (id: string, ownerId: string) => AtsPdf.findOne({ _id: id, userId: ownerId }).select('html_text'),
  findSourceForOwner: (id: string, ownerId: string) => AtsPdf.findOne({ _id: id, userId: ownerId }).select('source_data'),
  findActiveTemplates: () => AtsTemplate.find({ status: 'active' })
    .select('id name description version status layout preview').sort({ name: 1 }).lean(),
};
