import AtsTemplate from '../models/atsTemplate.model';

const DEFAULT_ATS_TEMPLATES = [
  {
    id: 'classic',
    name: 'Classic',
    description: 'Traditional black and white, familiar to every recruiter.',
    version: '1.0.0',
    status: 'active',
    layout: {
      variant: 'classic',
      columns: 1,
      fontFamily: 'Arial, Helvetica, sans-serif',
      pageMargin: '0.4in',
      density: 'standard',
      headingColor: '#000000',
      accentColor: '#000000',
    },
    preview: {
      sampleName: 'Alex Morgan',
      sampleRole: 'Product Manager',
      summary: 'Product leader with experience building useful, measurable products.',
    },
  },
  {
    id: 'modern',
    name: 'Modern',
    description: 'Subtle blue headings with the same ATS-friendly structure.',
    version: '1.0.0',
    status: 'active',
    layout: {
      variant: 'modern',
      columns: 1,
      fontFamily: 'Arial, Helvetica, sans-serif',
      pageMargin: '0.4in',
      density: 'standard',
      headingColor: '#1e3a8a',
      accentColor: '#2563eb',
    },
    preview: {
      sampleName: 'Alex Morgan',
      sampleRole: 'Product Manager',
      summary: 'Product leader with experience building useful, measurable products.',
    },
  },
  {
    id: 'compact',
    name: 'Compact',
    description: 'Tighter spacing to fit more content on fewer pages.',
    version: '1.0.0',
    status: 'active',
    layout: {
      variant: 'compact',
      columns: 1,
      fontFamily: 'Arial, Helvetica, sans-serif',
      pageMargin: '0.3in',
      density: 'compact',
      headingColor: '#000000',
      accentColor: '#555555',
    },
    preview: {
      sampleName: 'Alex Morgan',
      sampleRole: 'Product Manager',
      summary: 'Product leader with experience building useful, measurable products.',
    },
  },
];

export const ensureDefaultAtsTemplates = async (): Promise<void> => {
  for (const template of DEFAULT_ATS_TEMPLATES) {
    await AtsTemplate.updateOne({ id: template.id }, { $setOnInsert: template }, { upsert: true });
  }
};

export const getActiveAtsTemplate = (id: string) =>
  AtsTemplate.findOne({ id, status: 'active' }).lean();
