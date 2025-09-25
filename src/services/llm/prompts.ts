export const PROMPTS = {
  CV_EXTRACTION: {
    system: `You are an expert HR analyst. Extract structured information from CVs/resumes.
Return ONLY valid JSON with the specified structure. No additional text.`,

    user: (
      cvContent: string
    ) => `Extract the following information from this CV:
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
    system: `You are an expert recruiter evaluating a CV against job requirements.
    Provide your evaluation in JSON format with the following structure:
    {
      "match_rate": <0-1>,
      "strengths": ["..."],
      "gaps": ["..."],
      "feedback": "...",
      "scores": {
        "technicalSkillsMatch": <1-5>,
        "experienceLevel": <1-5>,
        "relevantAchievements": <1-5>,
        "culturalFit": <1-5>,
        "aiExperience": <1-5>
      }
    }
    
    Score each criterion from 1-5:
    - technicalSkillsMatch: How well technical skills match requirements
    - experienceLevel: Years and relevance of experience
    - relevantAchievements: Impact and relevance of past achievements
    - culturalFit: Alignment with company culture and soft skills
    - aiExperience: Experience with AI/ML technologies (if relevant)
    `,

    user: (
      cvInfo: any,
      jobRequirements: any
    ) => `Evaluate this candidate against the job requirements:

Job Requirements:
${JSON.stringify(jobRequirements, null, 2)}

Candidate Information:
${JSON.stringify(cvInfo, null, 2)}

Provide evaluation as JSON:
{
  "match_rate": 0.0-1.0,
  "strengths": ["strength1", "strength2"],
  "gaps": ["gap1", "gap2"],
  "feedback": "Detailed feedback paragraph",
  "scores": {
    "technical_skills": 1-5,
    "experience_level": 1-5,
    "relevant_achievements": 1-5,
    "cultural_fit": 1-5
  }
}`,
  },

  PROJECT_EVALUATION: {
    system: `You are a senior software engineer evaluating technical projects.
Focus on code quality, architecture, problem-solving, and implementation completeness.`,

    user: (
      projectContent: string,
      rubric: any
    ) => `Evaluate this project submission:

Project Content:
${projectContent}

Evaluation Rubric:
${JSON.stringify(rubric, null, 2)}

Provide evaluation as JSON:
{
  "score": 0.0-10.0,
  "feedback": "Detailed technical feedback",
  "strengths": ["strength1", "strength2"],
  "improvements": ["improvement1", "improvement2"],
  "scores": {
    "correctness": 1-5,
    "code_quality": 1-5,
    "resilience": 1-5,
    "documentation": 1-5,
    "creativity": 1-5
  }
}`,
  },

  FINAL_SUMMARY: {
    system: `You are a hiring manager providing final recommendations based on CV and project evaluations.`,

    user: (
      cvEval: any,
      projectEval: any
    ) => `Based on these evaluations, provide a final summary:

CV Evaluation:
${JSON.stringify(cvEval, null, 2)}

Project Evaluation:
${JSON.stringify(projectEval, null, 2)}

Provide a concise overall summary (2-3 sentences) and recommendation.
Focus on candidate fit, key strengths, and areas for growth.`,
  },
};
