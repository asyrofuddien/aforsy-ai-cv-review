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

export const PROMPTS = {
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
    system: `You are an expert recruiter evaluating a CV against job requirements.
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

    user: (cvInfo: any, jobRequirements: any) => `Evaluate this candidate against the job requirements.

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

    user: (projectContent: string, rubric: any) => `Evaluate this project submission:

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
    system: `You are a hiring manager providing final recommendations based on CV.

Rules for Overall Candidate Evaluation:
- CV Match Rate: Convert the weighted average (1-5 scale) to percentage by multiplying by 20
- Overall Summary: Provide exactly 3-5 sentences covering strengths, gaps, and recommendations`,

    user: (cvEval: any) => `Based on these evaluations, provide a final candidate assessment:

CV Evaluation:
${JSON.stringify(cvEval, null, 2)}

Return as JSON:
{
  "overall_summary": "3-5 sentences covering strengths, gaps, and recommendations",
  "recommendation": "STRONG_YES | YES | CONDITIONAL | NO"
}`,
  },
};
