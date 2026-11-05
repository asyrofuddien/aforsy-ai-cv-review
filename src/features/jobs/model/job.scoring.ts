import { CandidateForMatching, JobListing, ScoredJobListing } from './job.types';

export type SkillMatcher = (cvSkills: string[], requirements: string[]) => Promise<number>;

export async function calculateSkillMatch(
  cvSkills: string[],
  requirements: string[],
  matcher: SkillMatcher,
): Promise<number> {
  if (!cvSkills.length || !requirements.length) return 0;
  const score = await matcher(cvSkills, requirements);
  if (!Number.isFinite(score)) {
    throw new Error('Skill matching returned an invalid score.');
  }
  return score;
}

export function validateScore(score: number): number {
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    throw new Error('Job scoring returned an invalid score.');
  }
  return Math.max(0, Math.min(100, Number(score.toFixed(2))));
}

export function calculateExperienceMatch(cvSeniority = '', jobExperienceLevel = ''): number {
  const seniorityLevels: Record<string, number> = {
    'entry-level': 1,
    junior: 2,
    'mid-level': 3,
    mid: 3,
    senior: 4,
    lead: 5,
    principal: 6,
  };
  const cvLevel = seniorityLevels[cvSeniority.toLowerCase()] || 0;
  const jobLevel = seniorityLevels[jobExperienceLevel.toLowerCase()] || 0;
  if (!cvLevel || !jobLevel) return 0;
  if (cvLevel === jobLevel) return 100;
  if (cvLevel > jobLevel) return 90 - (cvLevel - jobLevel) * 5;
  return 70 - (jobLevel - cvLevel) * 15;
}

export function calculateResponsibilityMatch(
  cvExperience: CandidateForMatching['work_experience'] = [],
  jobResponsibilities: string[] = [],
): number {
  if (!cvExperience.length || !jobResponsibilities.length) return 0;
  const experienceText = cvExperience
    .map((exp) =>
      `${exp.description || ''} ${Array.isArray(exp.achievements) ? exp.achievements.join(' ') : exp.achievements || ''}`.toLowerCase(),
    )
    .join(' ');
  const matches = jobResponsibilities.filter((responsibility) =>
    responsibility
      .toLowerCase()
      .split(' ')
      .filter((word) => word.length > 3)
      .some((word) => experienceText.includes(word)),
  );
  return (matches.length / jobResponsibilities.length) * 100;
}

export function getGrade(score: number): string {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

export function generateExplanation(
  skillMatch: number,
  experienceMatch: number,
  responsibilityMatch: number,
): string {
  const skillLevel = skillMatch >= 70 ? 'strong' : skillMatch >= 50 ? 'moderate' : 'weak';
  const experienceLevel =
    experienceMatch >= 85 ? 'well-aligned' : experienceMatch >= 70 ? 'aligned' : 'misaligned';
  const responsibilityLevel =
    responsibilityMatch >= 70
      ? 'highly relevant'
      : responsibilityMatch >= 50
        ? 'relevant'
        : 'somewhat relevant';
  return `Skills match is ${skillLevel} (${skillMatch.toFixed(1)}%), experience level is ${experienceLevel} (${experienceMatch.toFixed(1)}%), and past responsibilities are ${responsibilityLevel} (${responsibilityMatch.toFixed(1)}%).`;
}

export async function matchJobs(
  cv: CandidateForMatching,
  jobs: JobListing[],
  calculateSkill: SkillMatcher,
): Promise<ScoredJobListing[]> {
  const scored = await Promise.all(
    jobs.map(async (job) => {
      const [skill, experience, responsibility] = await Promise.all([
        calculateSkill(cv.skills || [], job.requirements),
        Promise.resolve(calculateExperienceMatch(cv.seniority, job.seniority)),
        Promise.resolve(calculateResponsibilityMatch(cv.work_experience, job.responsibilities)),
      ]);
      const validSkill = validateScore(skill);
      const validExperience = validateScore(experience);
      const validResponsibility = validateScore(responsibility);
      const score = validateScore((validSkill + validExperience + validResponsibility) / 3);
      return {
        ...job,
        skill_match: validSkill,
        experience_match: validExperience,
        responsibility_match: validResponsibility,
        score,
        grade: getGrade(score),
        explanation: generateExplanation(validSkill, validExperience, validResponsibility),
      };
    }),
  );
  return scored.sort((a, b) => b.score - a.score).slice(0, 5);
}
