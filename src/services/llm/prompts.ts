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
      "match_rate": <1-5>,
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

    match_rate should reflect overall fit (1=poor, 5=excellent).
    `,

    user: (
      cvInfo: any,
      jobRequirements: any
    ) => `Evaluate this candidate against the job requirements:

Job Requirements:
${JSON.stringify(jobRequirements, null, 2)}

Candidate Information:
${JSON.stringify(cvInfo, null, 2)}

match_rate should reflect overall fit (1=poor, 5=excellent)

Provide evaluation as JSON:
{
  "match_rate": 1-5,
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
Focus on code quality, architecture, problem-solving, and implementation completeness.

Evaluate based on these criteria with specific weights:

1. Correctness (Prompt & Chaining) - Weight: 30%
   - Implements prompt design, LLM chaining, RAG context injection
   - 1 = Not implemented, 2 = Minimal attempt, 3 = Works partially, 4 = Works correctly, 5 = Fully correct + thoughtful

2. Code Quality & Structure - Weight: 25%
   - Clean, modular, reusable, tested
   - 1 = Poor, 2 = Some structure, 3 = Decent modularity, 4 = Good structure + some tests, 5 = Excellent quality + strong tests

3. Resilience & Error Handling - Weight: 20%
   - Handles long jobs, retries, randomness, API failures
   - 1 = Missing, 2 = Minimal, 3 = Partial handling, 4 = Solid handling, 5 = Robust, production-ready

4. Documentation & Explanation - Weight: 15%
   - README clarity, setup instructions, trade-off explanations
   - 1 = Missing, 2 = Minimal, 3 = Adequate, 4 = Clear, 5 = Excellent + insightful

5. Creativity / Bonus - Weight: 10%
   - Extra features beyond requirements
   - 1 = None, 2 = Very basic, 3 = Useful extras, 4 = Strong enhancements, 5 = Outstanding creativity`,

    user: (
      projectContent: string,
      rubric: any
    ) => `Evaluate this project submission:

Project Content:
${projectContent}

Evaluation Rubric:
${JSON.stringify(rubric, null, 2)}

Focus on:
- How well LLM features are implemented (prompts, chaining, RAG)
- Code architecture and quality
- Error handling and production readiness
- Documentation completeness
- Creative additions beyond requirements

Provide evaluation as JSON:
{
  "score": 0.0-5.0,
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
}

Note: The overall score should be calculated as weighted average of individual scores, then scaled to 0-10 range.`,
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
