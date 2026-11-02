export const MATCHER_PROMPTS = {
  EXTRACT_CV_STRUCTURED_JSON: {
    system: 'You are an expert CV Parsing Engine. Your PRIMARY task is to extract the candidate\'s NAME accurately. Extract ALL information from ANY type of CV (tech, creative, business, etc.) and convert it into structured JSON format.',
    user: (rawText: string) => `Extract information from this CV text:

"""
${rawText}
"""

CRITICAL INSTRUCTIONS FOR NAME EXTRACTION:
1. The candidate's NAME is ALWAYS the MOST IMPORTANT field - you MUST find it
2. Look for the name in these locations (in order of priority):
   - First H1 heading or largest text at the top With class CandidateName
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
};
