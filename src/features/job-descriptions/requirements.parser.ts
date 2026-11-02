export interface ParsedRequirements {
  technical: string[];
  soft_skills: string[];
}

/** Extracts bullet points from the same section headings accepted by the legacy upload flow. */
export function parseRequirements(content: string): ParsedRequirements {
  const requirements: ParsedRequirements = { technical: [], soft_skills: [] };
  let section: keyof ParsedRequirements | null = null;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    const heading = trimmed.toLowerCase();
    if (heading.includes('technical') || heading.includes('requirements')) section = 'technical';
    else if (heading.includes('soft skills') || heading.includes('qualifications')) section = 'soft_skills';
    if (section && /^[-•*]/.test(trimmed)) requirements[section].push(trimmed.slice(1).trim());
  }

  return requirements;
}
