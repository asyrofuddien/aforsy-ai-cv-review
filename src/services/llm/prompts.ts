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

  EXTRACT_CV_STRUCTURED_JSON: {
    system: 'You are an expert CV Parsing Engine. Your PRIMARY task is to extract the candidate\'s NAME accurately. Extract ALL information from ANY type of CV (tech, creative, business, etc.) and convert it into structured JSON format.',
    user: (rawText: string) => `Extract information from this CV text:

"""
${rawText}
"""

CRITICAL INSTRUCTIONS FOR NAME EXTRACTION:
1. The candidate's NAME is ALWAYS the MOST IMPORTANT field - you MUST find it
2. Look for the name in these locations (in order of priority):
   - First H1 heading or largest text at the top
   - After words like "Resume", "CV", "Curriculum Vitae"
   - In contact information section
   - Before email/phone/address
   - Any text that looks like a person's full name (2-4 words, capitalized)
3. The name is typically 2-4 words and appears BEFORE contact details (email, phone, LinkedIn)
4. DO NOT use "Unknown Candidate" unless you absolutely cannot find ANY name-like text

OTHER EXTRACTION RULES:
- Extract email, phone, location from contact information
- List ALL skills mentioned (technical, creative, soft skills, tools, software, etc.)
- For work experience: extract company, position, dates, responsibilities, and achievements
- Calculate seniority based on total years of experience:
  - 0-2 years = "Entry-level" or "Junior"
  - 2-5 years = "Mid-level"
  - 5+ years = "Senior"
  - 8+ years = "Lead" or "Principal"

IMPORTANT: This CV can be from ANY industry:
- Tech/IT: Developer, Engineer, Data Scientist
- Creative: Designer, Videographer, Photographer, Content Creator
- Business: Marketing, Sales, HR, Finance
- Other: Healthcare, Education, Manufacturing, etc.

Extract skills relevant to THEIR industry, not just tech skills!

Return ONLY this JSON structure (no markdown, no explanation):

{
  "name": "FULL NAME HERE - THIS IS MANDATORY",
  "email": "email@example.com",
  "phone": "",
  "location": "",
  "summary": "Brief professional summary if available",
  "skills": ["skill1", "skill2", "skill3"],
  "work_experience": [
    {
      "company": "Company Name",
      "position": "Job Title",
      "start_date": "YYYY-MM or YYYY",
      "end_date": "YYYY-MM or YYYY or Present",
      "description": "What they did in this role",
      "achievements": "Key achievements and impact",
      "tech_stack": ["tool1", "tool2", "software1"]
    }
  ],
  "education": [
    {
      "institution": "University/School Name",
      "degree": "Degree Name",
      "start_date": "YYYY",
      "end_date": "YYYY"
    }
  ],
  "seniority": "Entry-level|Junior|Mid-level|Senior|Lead"
}

REMEMBER: The "name" field is the MOST CRITICAL field. Look at the VERY TOP of the CV text for the largest/first text that looks like a person's name.`,
  },
  ROLE_SUGGESTION: {
    system: 'You are an expert career advisor with knowledge across ALL industries (tech, creative, business, healthcare, etc.).',
    user: (extractedCv: object) => `Analyze this CV and suggest the most suitable job roles based on their background:

${JSON.stringify(extractedCv, null, 2)}

Based on their skills, experience, and background:
1. Identify their PRIMARY industry/field (e.g., Tech, Creative/Design, Marketing, Healthcare, Finance, etc.)
2. Suggest 3 most suitable job roles in THEIR industry
3. Confirm or adjust the seniority level based on:
   - Years of experience
   - Complexity of past projects/work
   - Leadership/mentoring experience
   - Depth and breadth of expertise

Seniority levels (applicable to ALL industries):
- "Entry-level" or "Junior": 0-2 years
- "Mid-level": 2-5 years
- "Senior": 5-8 years
- "Lead" or "Principal": 8+ years

EXAMPLES OF ROLE SUGGESTIONS BY INDUSTRY:
- Tech: Backend Developer, Full Stack Engineer, DevOps Engineer
- Creative: Video Editor, Motion Graphics Designer, Content Creator
- Design: UI/UX Designer, Graphic Designer, Product Designer
- Marketing: Digital Marketing Specialist, Social Media Manager, Content Strategist
- Business: Business Analyst, Project Manager, Operations Manager
- Finance: Financial Analyst, Accountant, Investment Analyst

Return ONLY this JSON (no markdown, no explanation):
{
  "suggested_roles": ["Role 1", "Role 2", "Role 3"],
  "seniority": "Entry-level|Junior|Mid-level|Senior|Lead"
}`,
  },
  SUMMARY_RECOMENDATION: {
    system: 'You are an expert career advisor providing actionable recommendations.',
    user: (extractedCv: object, roleSuggestion: object, jobListed: object) => `Analyze this candidate's profile and job matches to provide career recommendations:

CV Profile:
${JSON.stringify(extractedCv, null, 2)}

Suggested Roles:
${JSON.stringify(roleSuggestion, null, 2)}

Job Match Results:
${JSON.stringify(jobListed, null, 2)}

Provide a concise career summary with:
- Top 3 strengths (what makes them stand out)
- Top 3 areas for improvement (skills/experience gaps)
- Top 3 actionable next steps (specific recommendations)

Return ONLY this JSON (no markdown, no explanation):
{
  "summary": {
    "strengths": [
      "Specific strength 1",
      "Specific strength 2",
      "Specific strength 3"
    ],
    "improvements": [
      "Specific improvement area 1",
      "Specific improvement area 2",
      "Specific improvement area 3"
    ],
    "next_steps": [
      "Actionable step 1",
      "Actionable step 2",
      "Actionable step 3"
    ]
  }
}

Keep each point concise (1 sentence max).`,
  },
  BEAUTIFY_DESCRIPTION: {
    system: 'You are an expert at summarizing job descriptions concisely while preserving key information.',
    user: (description: string) => `Rewrite this job description into 1-3 clear, concise sentences that capture the main responsibilities and requirements:

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
    system: 'You are an expert recruiter evaluating skill alignment between candidates and job requirements across ALL industries.',
    user: (cvSkills: any, jobRequirements: any) => `Calculate the skill match percentage between the candidate's skills and job requirements.

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
