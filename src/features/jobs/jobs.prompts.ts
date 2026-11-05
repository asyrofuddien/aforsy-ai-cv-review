export const JOBS_PROMPTS = {
  BEAUTIFY_DESCRIPTION: {
    system:
      'You are an expert at summarizing job descriptions concisely while preserving key information.',
    user: (
      description: string,
    ) => `Rewrite this job description into 1-3 clear, concise sentences that capture the main responsibilities and requirements:

${description}

Focus on:
- Main role responsibilities
- Key technical requirements
- Team/company context if relevant

Return ONLY this JSON (no markdown, no explanation):
{
  "description": "1-3 sentence summary"
}`,
  },
  CALCULATE_SKILL: {
    system:
      'You are an expert recruiter evaluating skill alignment between candidates and job requirements across ALL industries.',
    user: (
      cvSkills: any,
      jobRequirements: any,
    ) => `Calculate the skill match percentage between the candidate's skills and job requirements.

Candidate Skills:
${JSON.stringify(cvSkills, null, 2)}

Job Requirements:
${JSON.stringify(jobRequirements, null, 2)}

Scoring Guidelines:
- 90-100: Excellent match - has all or most required skills plus relevant extras
- 70-89: Strong match - has most required skills with minor gaps
- 50-69: Moderate match - has some required skills but missing key ones
- 30-49: Weak match - has few required skills
- 0-29: Poor match - minimal skill overlap

Consider ALL types of skills:
1. Technical/Hard Skills: Programming languages, software, tools, equipment
2. Creative Skills: Design software (Adobe Suite, Figma), video editing (Premiere, After Effects), photography
3. Business Skills: Excel, CRM systems, project management tools, analytics platforms
4. Soft Skills: Communication, leadership, teamwork, problem-solving
5. Industry-Specific Skills: Medical equipment, teaching methods, sales techniques, etc.

Matching Rules:
- Direct skill matches (exact tool/software/skill names)
- Related/transferable skills (e.g., Photoshop → Illustrator, Excel → Google Sheets)
- Similar tools in same category (e.g., Premiere Pro → Final Cut Pro)
- Depth of experience with each skill
- Bonus for rare/specialized skills

Return ONLY this JSON (no markdown, no explanation):
{
  "score": 0-100
}

IMPORTANT: "score" must be a valid number between 0 and 100`,
  },
};
