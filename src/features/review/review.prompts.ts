const scoringGuide = {
  technicalSkillsMatch: {
    description: 'Alignment with job requirements',
    scoring: {
      '1': 'Irrelevant skills',
      '2': 'Few overlaps',
      '3': 'Partial match',
      '4': 'Strong match',
      '5': 'Excellent match + AI/LLM exposure',
    },
  },
  experienceLevel: {
    description: 'Years of experience and project complexity',
    scoring: {
      '1': '<1 yr / trivial projects',
      '2': '1-2 yrs',
      '3': '3-4 yrs with mid-size projects',
      '4': '5-6 yrs solid track record',
      '5': '6+ yrs / high-impact projects',
    },
  },
  relevantAchievements: {
    description: 'Impact of past work (scaling, performance, adoption)',
    scoring: {
      '1': 'No clear achievements',
      '2': 'Minimal improvements',
      '3': 'Some measurable outcomes',
      '4': 'Significant contributions',
      '5': 'Major measurable impact',
    },
  },
  culturalFit: {
    description: 'Communication, learning mindset, teamwork/leadership',
    scoring: {
      '1': 'Not demonstrated',
      '2': 'Minimal',
      '3': 'Average',
      '4': 'Good',
      '5': 'Excellent and well-demonstrated',
    },
  },
};

export const REVIEW_PROMPTS = {
  CV_EXTRACTION: {
    system: `You are an expert HR analyst. Extract structured information from CVs/resumes.
Return ONLY valid JSON with the specified structure. No additional text.`,

    user: (cvContent: string) => `Extract the following information from this CV:
- Name
- Email
- Skills (technical skills as array)
- Years of experience (number)
- Work experiences (company, position, duration, key achievements)
- Education (degree, institution, year)
- Projects (name, description, technologies used)

CV Content:
${cvContent}

Return as JSON with this structure:
{
  "name": "string",
  "email": "string", 
  "skills": ["skill1", "skill2"],
  "experience_years": number,
  "experiences": [{
    "company": "string",
    "position": "string",
    "duration": "string",
    "achievements": ["achievement1", "achievement2"]
  }],
  "education": [{
    "degree": "string",
    "institution": "string",
    "year": "string"
  }],
  "projects": [{
    "name": "string",
    "description": "string",
    "technologies": ["tech1", "tech2"]
  }]
}`,
  },
  CV_EVALUATION: {
    system: `You are an expert CV reviewer. Follow the evaluation mode provided in the input.
Use the following scoring guide for each criterion:

${JSON.stringify(scoringGuide, null, 2)}

Important:
- Each score (0.0-5.0) must follow the scoring guide.
- The "match_rate" must be computed as a weighted average using the provided weights in jobRequirements.
- Formula: match_rate = sum(score * weight) / sum(weights), then round to nearest float (0.0–5.0).

Provide your evaluation in JSON format with the following structure:
{
  "match_rate": <0.0-5.0>,
  "strengths": ["..."],
  "gaps": ["..."],
  "feedback": "...",
  "scores": {
    "technicalSkillsMatch": <0.0-5.0>,
    "experienceLevel": <0.0-5.0>,
    "relevantAchievements": <0.0-5.0>,
    "culturalFit": <0.0-5.0>,
    "aiExperience": <0.0-5.0>
  }
}
`,

    user: (cvInfo: any, jobRequirements: any) => jobRequirements.mode === 'general' ? `Review this CV as a document for a general job search. Do not infer a target profession, job fit, hiring recommendation, or skills the person may have but did not include.

Review these dimensions: ATS readability and structure, clarity of profile and information consistency, clarity of experience and responsibilities, evidence and impact of achievements, relevant section completeness, and spelling/grammar/format consistency. Base every observation on the supplied CV information. Treat absent details as "not visible in the CV", not as facts about the candidate. Provide concrete revision suggestions and examples where possible.

Candidate Information:
${JSON.stringify(cvInfo, null, 2)}

Return ONLY JSON with match_rate as a document-quality estimate from 0 to 5, strengths and gaps as evidence-based items, feedback, scores (use technicalSkillsMatch for ATS/readability, experienceLevel for clarity/completeness of experience, relevantAchievements for evidence/impact, culturalFit for clarity/consistency of written information, and aiExperience for spelling/format consistency), and missing_information as a string array. Do not describe role fit or recommend hiring. The score is an estimate of this document, not a guarantee of employment.` : `Evaluate this CV against the supplied job description and requirements. Do not invent requirements. For every match or gap, point to the stated requirement and evidence (or lack of evidence) in the CV; missing evidence does not prove the candidate lacks the skill.

Job Requirements (including weights):
${JSON.stringify(jobRequirements, null, 2)}

Candidate Information:
${JSON.stringify(cvInfo, null, 2)}

Remember:
- Use weights from jobRequirements["scoringWeigths"] when computing match_rate.
- Explain your reasoning for each score.

Provide evaluation as JSON:
{
  "match_rate": 0.0-5.0,
  "strengths": ["strength1", "strength2"],
  "gaps": ["gap1", "gap2"],
  "feedback": "Detailed feedback paragraph",
  "scores": {
    "technicalSkillsMatch": 0.0-5.0,
    "experienceLevel": 0.0-5.0,
    "relevantAchievements": 0.0-5.0,
    "culturalFit": 0.0-5.0,
    "aiExperience": 0.0-5.0
  }
}`,
  },
  FINAL_SUMMARY: {
    system: `You are an expert CV reviewer. Follow the mode provided in the input.

Rules for Overall Candidate Evaluation:
- CV Match Rate: Convert the weighted average (1-5 scale) to percentage by multiplying by 20
- Overall Summary: Provide exactly 3-5 sentences covering strengths, gaps, and recommendations`,

    user: (cvEval: any, mode: 'general' | 'job_specific' = 'job_specific') => mode === 'general' ? `Summarize this general CV document review. Do not assess candidate/job fit, give a hiring recommendation, or treat missing CV details as facts about the candidate.

Evaluation:
${JSON.stringify(cvEval, null, 2)}

Return JSON with "overall_summary" (2-4 neutral sentences about document quality and the most useful improvements), "recommendation" as an empty string, and "missing_information" as an array of information that cannot be assessed from the CV.` : `Based on this job-specific CV evaluation, provide a concise candidate assessment:

CV Evaluation:
${JSON.stringify(cvEval, null, 2)}

Return as JSON:
{
  "overall_summary": "3-5 sentences covering strengths, gaps, and recommendations",
"recommendation": "STRONG_YES | YES | CONDITIONAL | NO"
}`,
  },
};
