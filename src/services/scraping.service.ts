import { JobListing } from '../types/evaluation.types';
import chainService from '../services/llm/chains';

interface RapidAPIConfig {
  apiKey: string;
  apiHost: string;
  baseUrl: string;
}

interface JobSearchParams {
  query?: string;
  location?: string;
  experienceLevels?: string;
  workplaceTypes?: string;
  datePosted?: string;
  employmentTypes?: string;
}

// Interface yang sesuai dengan struktur roleSuggestion Anda
interface RoleSuggestion {
  suggested_roles: string[]; // Array of role names
  seniority: string; // e.g., "Mid-level", "Senior", etc.
}

interface LinkedInJobSearchResponse {
  data: Array<{
    id: string;
    title: string;
    companyName: string;
    linkedinCompanyName: string;
    location: string;
    postedTimeAgo: string;
    datePosted: string;
  }>;
  meta: {
    position: number;
    count: number;
    nextToken?: string;
  };
  _links: {
    self: string;
    next?: string;
  };
}

interface LinkedInJobDetailResponse {
  id: string;
  title: string;
  acceptingApplications: boolean;
  applicants: number;
  companyName: string;
  linkedinCompanyName: string;
  location: string;
  postedTimeAgo: string;
  seniorityLevel: string;
  employmentType: string;
  jobFunction: string;
  industries: string;
  description: string;
  linkedinUrl: string;
  datePosted?: string;
}

class ScrapingService {
  private config: RapidAPIConfig = {
    apiKey: process.env.RAPIDAPI_KEY || '8b2a7d8bdemsha646ce2c8c34b3cp142b51jsnd51d3f8a759e',
    apiHost: 'jobs-api14.p.rapidapi.com',
    baseUrl: 'https://jobs-api14.p.rapidapi.com/v2/linkedin',
  };

  /**
   * Mencari jobs dari LinkedIn API berdasarkan roleSuggestion
   */
  async FindJobs(roleSuggestion: RoleSuggestion): Promise<JobListing[]> {
    try {
      // Validasi input
      if (!roleSuggestion.suggested_roles || roleSuggestion.suggested_roles.length === 0) {
        console.log('No suggested roles found, returning dummy data');
        return this.getDummyJobs();
      }

      const allJobs: JobListing[] = [];

      // Loop through each suggested role dan fetch jobs
      for (const role of roleSuggestion.suggested_roles.slice(0, 3)) {
        // Maksimal 3 roles
        try {
          const searchParams = this.buildSearchParams(role, roleSuggestion.seniority);
          const searchResults = await this.searchJobs(searchParams);

          if (searchResults.data && searchResults.data.length > 0) {
            // Get first job for this role
            const topJob = searchResults.data[0];
            const jobDetail = await this.getJobDetail(topJob.id);

            if (jobDetail) {
              const jobListing = await this.mapToJobListing(jobDetail);
              allJobs.push(jobListing);
            }
          }
        } catch (error) {
          console.error(`Error fetching jobs for role: ${role}`, error);
          continue;
        }
      }

      // If no jobs found from API, return dummy data
      if (allJobs.length === 0) {
        console.log('No jobs found from API, returning dummy data');
        return this.getDummyJobs();
      }

      return allJobs;
    } catch (error) {
      console.error('Error in FindJobs:', error);
      return this.getDummyJobs();
    }
  }

  /**
   * Build search parameters dari role dan seniority
   */
  private buildSearchParams(role: string, seniority: string): JobSearchParams {
    // Map seniority to LinkedIn experience levels
    const experienceLevels = this.mapSeniorityToExperienceLevels(seniority);

    return {
      query: role,
      location: 'Worldwide',
      experienceLevels: experienceLevels,
      workplaceTypes: 'remote;hybrid;onSite',
      datePosted: 'month',
      employmentTypes: 'fulltime;parttime;contractor;intern;temporary',
    };
  }

  /**
   * Map seniority ke LinkedIn experience levels
   */
  private mapSeniorityToExperienceLevels(seniority: string): string {
    const seniorityLower = seniority?.toLowerCase() || '';

    if (seniorityLower.includes('entry') || seniorityLower.includes('junior') || seniorityLower.includes('intern')) {
      return 'intern;entry';
    } else if (seniorityLower.includes('mid')) {
      return 'associate;midSenior';
    } else if (seniorityLower.includes('senior') || seniorityLower.includes('lead')) {
      return 'midSenior;director';
    } else if (seniorityLower.includes('director') || seniorityLower.includes('principal')) {
      return 'director;executive';
    }

    // Default: all levels
    return 'intern;entry;associate;midSenior;director';
  }

  /**
   * Search jobs dari LinkedIn API
   */
  private async searchJobs(params: JobSearchParams): Promise<any> {
    const queryParams = new URLSearchParams({
      query: params.query || '',
      ...(params.location && { location: params.location }),
      ...(params.experienceLevels && { experienceLevels: params.experienceLevels }),
      ...(params.workplaceTypes && { workplaceTypes: params.workplaceTypes }),
      ...(params.datePosted && { datePosted: params.datePosted }),
      ...(params.employmentTypes && { employmentTypes: params.employmentTypes }),
    });

    const url = `${this.config.baseUrl}/search?${queryParams.toString()}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-rapidapi-host': this.config.apiHost,
        'x-rapidapi-key': this.config.apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Search API failed with status ${response.status}`);
    }

    return await response.json();
  }

  /**
   * Get job detail by ID
   */
  private async getJobDetail(jobId: string): Promise<any | null> {
    try {
      const url = `${this.config.baseUrl}/get?id=${jobId}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'x-rapidapi-host': this.config.apiHost,
          'x-rapidapi-key': this.config.apiKey,
        },
      });

      if (!response.ok) {
        console.error(`Failed to fetch job detail for ID ${jobId}`);
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error(`Error fetching job detail for ID ${jobId}:`, error);
      return null;
    }
  }

  /**
   * Map LinkedIn job detail to JobListing format
   */
  private async mapToJobListing(details: any) {
    const { requirements, responsibilities } = this.extractSkillsAndResponsibilities(details.data.description);
    const detail = details.data;
    const description = await chainService.beautifyDescription(detail.description);
    return {
      title: detail.title,
      company: detail.companyName,
      location: detail.location,
      salary_range: 'Not specified',
      job_type: detail.employmentType || 'Full-time',
      seniority: this.normalizeSeniority(detail.seniorityLevel),
      requirements: requirements,
      responsibilities: responsibilities,
      job_description: description?.description,
      posted_at: detail.datePosted || this.convertPostedTimeAgo(detail.postedTimeAgo),
      link: detail.linkedinUrl,
    };
  }

  /**
   * Extract skills/requirements dan responsibilities dari job description
   */
  private extractSkillsAndResponsibilities(description: string): {
    requirements: string[];
    responsibilities: string[];
  } {
    const requirements: string[] = [];
    const responsibilities: string[] = [];

    if (!description) {
      return { requirements, responsibilities };
    }

    const lines = description.split('\n').map((line) => line.trim());

    let inRequirementsSection = false;
    let inResponsibilitiesSection = false;

    const requirementKeywords = [
      'requirement',
      'qualification',
      'skill',
      'experience',
      'must have',
      'knowledge',
      'what you need',
      "what we're looking for",
    ];
    const responsibilityKeywords = [
      'responsibilit',
      'duty',
      'duties',
      'you will',
      "you'll",
      'role includes',
      "what you'll do",
      'day to day',
    ];

    for (const line of lines) {
      const lowerLine = line.toLowerCase();

      if (requirementKeywords.some((keyword) => lowerLine.includes(keyword))) {
        inRequirementsSection = true;
        inResponsibilitiesSection = false;
        continue;
      }

      if (responsibilityKeywords.some((keyword) => lowerLine.includes(keyword))) {
        inResponsibilitiesSection = true;
        inRequirementsSection = false;
        continue;
      }

      if (line.match(/^[-•*]\s/) || line.match(/^\d+[.)]\s/)) {
        const cleanedLine = line
          .replace(/^[-•*]\s/, '')
          .replace(/^\d+[.)]\s/, '')
          .trim();

        if (cleanedLine.length > 10) {
          if (inRequirementsSection && requirements.length < 10) {
            requirements.push(cleanedLine);
          } else if (inResponsibilitiesSection && responsibilities.length < 8) {
            responsibilities.push(cleanedLine);
          }
        }
      }
    }

    if (requirements.length === 0) {
      requirements.push(...this.extractTechSkills(description));
    }

    if (responsibilities.length === 0) {
      responsibilities.push(
        'Contribute to product development and feature implementation',
        'Collaborate with cross-functional teams',
        'Write clean, maintainable code',
        'Participate in code reviews and knowledge sharing'
      );
    }

    return {
      requirements: requirements.slice(0, 10),
      responsibilities: responsibilities.slice(0, 8),
    };
  }

  /**
   * Extract tech skills from description
   */
  private extractTechSkills(description: string): string[] {
    const commonSkills = [
      'JavaScript',
      'TypeScript',
      'Python',
      'Java',
      'Kotlin',
      'Swift',
      'React',
      'Angular',
      'Vue',
      'Node.js',
      'Express',
      'Django',
      'Flask',
      'Spring',
      'MongoDB',
      'PostgreSQL',
      'MySQL',
      'Redis',
      'Docker',
      'Kubernetes',
      'AWS',
      'GCP',
      'Azure',
      'Git',
      'REST',
      'RESTful',
      'GraphQL',
      'CI/CD',
      'Agile',
      'Scrum',
      'Android',
      'iOS',
    ];

    const foundSkills: string[] = [];
    const lowerDescription = description.toLowerCase();

    for (const skill of commonSkills) {
      if (lowerDescription.includes(skill.toLowerCase())) {
        foundSkills.push(skill);
      }
    }

    return foundSkills.length > 0 ? foundSkills : ['Programming', 'Problem Solving', 'Team Collaboration'];
  }

  /**
   * Normalize seniority level
   */
  private normalizeSeniority(seniorityLevel: string): string {
    const level = seniorityLevel?.toLowerCase() || '';

    if (level.includes('entry') || level.includes('intern') || level.includes('junior')) {
      return 'Entry-level';
    } else if (level.includes('mid') || level.includes('associate')) {
      return 'Mid-level';
    } else if (level.includes('senior') || level.includes('lead')) {
      return 'Senior';
    } else if (level.includes('director') || level.includes('principal')) {
      return 'Lead';
    }

    return 'Mid-level';
  }

  /**
   * Convert "3 weeks ago" to date format
   */
  private convertPostedTimeAgo(postedTimeAgo: string): string {
    const now = new Date();
    const match = postedTimeAgo.match(/(\d+)\s+(day|week|month|year)/i);

    if (!match) {
      return now.toISOString().split('T')[0];
    }

    const amount = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    switch (unit) {
      case 'day':
        now.setDate(now.getDate() - amount);
        break;
      case 'week':
        now.setDate(now.getDate() - amount * 7);
        break;
      case 'month':
        now.setMonth(now.getMonth() - amount);
        break;
      case 'year':
        now.setFullYear(now.getFullYear() - amount);
        break;
    }

    return now.toISOString().split('T')[0];
  }

  /**
   * Get dummy jobs for testing/fallback
   */
  private getDummyJobs(): JobListing[] {
    return [
      {
        title: 'Backend Engineer',
        company: 'Tokopedia',
        location: 'Jakarta, Indonesia',
        salary_range: 'IDR 15.000.000 – 25.000.000',
        job_type: 'Full-time',
        seniority: 'Mid-level',
        requirements: ['Node.js', 'Express', 'MongoDB', 'RESTful APIs', 'Docker'],
        responsibilities: [
          'Develop and maintain scalable backend services',
          'Design and implement RESTful APIs',
          'Collaborate with frontend and DevOps teams',
          'Write unit and integration tests',
        ],
        job_description:
          'Sebagai Backend Engineer di Tokopedia, kamu akan bertanggung jawab mengembangkan dan memelihara layanan backend yang scalable, mendesain API yang efisien, serta bekerja sama dengan tim lintas fungsi untuk menghadirkan solusi berkualitas tinggi.',
        posted_at: '2025-11-05',
        link: 'https://www.linkedin.com/jobs/view/backend-engineer-at-tokopedia-12345',
      },
      {
        title: 'Frontend Developer',
        company: 'Gojek',
        location: 'Jakarta, Indonesia',
        salary_range: 'IDR 12.000.000 – 20.000.000',
        job_type: 'Full-time',
        seniority: 'Mid-level',
        requirements: ['React', 'TypeScript', 'Redux', 'HTML/CSS', 'Git'],
        responsibilities: [
          'Build responsive web applications',
          'Optimize application performance',
          'Work with designers and backend engineers',
          'Maintain code quality and documentation',
        ],
        job_description:
          'Join Gojek as a Frontend Developer to create amazing user experiences. Work with modern technologies and collaborate with talented teams.',
        posted_at: '2025-11-03',
        link: 'https://www.linkedin.com/jobs/view/frontend-developer-at-gojek-67890',
      },
      {
        title: 'Full Stack Developer',
        company: 'Bukalapak',
        location: 'Jakarta, Indonesia',
        salary_range: 'IDR 18.000.000 – 28.000.000',
        job_type: 'Full-time',
        seniority: 'Senior',
        requirements: ['JavaScript', 'React', 'Node.js', 'PostgreSQL', 'AWS'],
        responsibilities: [
          'Develop full-stack features from conception to deployment',
          'Lead technical decisions and architecture',
          'Mentor junior developers',
          'Ensure code quality and best practices',
        ],
        job_description:
          'As a Full Stack Developer at Bukalapak, you will lead the development of innovative features and mentor team members.',
        posted_at: '2025-10-28',
        link: 'https://www.linkedin.com/jobs/view/fullstack-developer-at-bukalapak-11223',
      },
    ];
  }

  async matchWithJobs(cvJson: any, suggestedRoles: JobListing[]): Promise<any[]> {
    const scoredJobs = suggestedRoles.map((job) => {
      const skillMatch = this.calculateSkillMatch(cvJson.skills, job.requirements);
      const experienceMatch = this.calculateExperienceMatch(cvJson.seniority, job.seniority);
      const responsibilityMatch = this.calculateResponsibilityMatch(cvJson.work_experience, job.responsibilities);

      const totalScore = (skillMatch + experienceMatch + responsibilityMatch) / 3;
      const grade = this.getGrade(parseFloat(totalScore.toFixed(2)));

      return {
        ...job,
        skill_match: parseFloat(skillMatch.toFixed(2)),
        experience_match: parseFloat(experienceMatch.toFixed(2)),
        responsibility_match: parseFloat(responsibilityMatch.toFixed(2)),
        score: parseFloat(totalScore.toFixed(2)),
        grade: grade,
        explanation: this.generateExplanation(skillMatch, experienceMatch, responsibilityMatch),
      };
    });

    return scoredJobs.sort((a, b) => b.score - a.score).slice(0, 5);
  }

  private calculateSkillMatch(cvSkills: string[], jobRequirements: string[]): number {
    if (!cvSkills || cvSkills.length === 0 || !jobRequirements || jobRequirements.length === 0) {
      return 0;
    }

    const cvSkillsLower = cvSkills.map((skill) => skill.toLowerCase());
    const jobRequirementsLower = jobRequirements.map((req) => req.toLowerCase());

    const matchedSkills = jobRequirementsLower.filter((req) => cvSkillsLower.some((skill) => skill.includes(req) || req.includes(skill)));

    return (matchedSkills.length / jobRequirementsLower.length) * 100;
  }

  private calculateExperienceMatch(cvSeniority: string, jobExperienceLevel: string): number {
    const seniorityLevels: { [key: string]: number } = {
      'entry-level': 1,
      junior: 2,
      'mid-level': 3,
      mid: 3,
      senior: 4,
      lead: 5,
      principal: 6,
    };

    const cvLevel = seniorityLevels[cvSeniority?.toLowerCase()] || 0;
    const jobLevel = seniorityLevels[jobExperienceLevel?.toLowerCase()] || 0;

    if (cvLevel === 0 || jobLevel === 0) {
      return 0;
    }

    if (cvLevel === jobLevel) {
      return 100;
    } else if (cvLevel > jobLevel) {
      return 90 - (cvLevel - jobLevel) * 5;
    } else {
      return 70 - (jobLevel - cvLevel) * 15;
    }
  }

  private calculateResponsibilityMatch(cvExperience: any[], jobResponsibilities: string[]): number {
    if (!cvExperience || cvExperience.length === 0 || !jobResponsibilities || jobResponsibilities.length === 0) {
      return 0;
    }

    const cvExperienceText = cvExperience.map((exp) => ((exp.description || '') + ' ' + (exp.achievements || '')).toLowerCase()).join(' ');

    const matchedResponsibilities = jobResponsibilities.filter((responsibility) => {
      const words = responsibility
        .toLowerCase()
        .split(' ')
        .filter((word) => word.length > 3);
      return words.some((word) => cvExperienceText.includes(word));
    });

    return (matchedResponsibilities.length / jobResponsibilities.length) * 100;
  }

  private getGrade(score: number): string {
    if (score >= 85) {
      return 'A';
    } else if (score >= 70) {
      return 'B';
    } else if (score >= 55) {
      return 'C';
    } else if (score >= 40) {
      return 'D';
    } else {
      return 'F';
    }
  }

  private generateExplanation(skillMatch: number, experienceMatch: number, responsibilityMatch: number): string {
    const skillLevel = skillMatch >= 70 ? 'strong' : skillMatch >= 50 ? 'moderate' : 'weak';
    const experienceLevel = experienceMatch >= 85 ? 'well-aligned' : experienceMatch >= 70 ? 'aligned' : 'misaligned';
    const responsibilityLevel =
      responsibilityMatch >= 70 ? 'highly relevant' : responsibilityMatch >= 50 ? 'relevant' : 'somewhat relevant';

    return `Skills match is ${skillLevel} (${skillMatch.toFixed(1)}%), experience level is ${experienceLevel} (${experienceMatch.toFixed(
      1
    )}%), and past responsibilities are ${responsibilityLevel} (${responsibilityMatch.toFixed(1)}%).`;
  }
}

export default new ScrapingService();
