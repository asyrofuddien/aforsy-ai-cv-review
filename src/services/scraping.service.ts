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
  geoId?: string;
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
    apiKey: process.env.RAPIDAPI_KEY || 'fb4397004emsh469e668a1e1a18fp1aee54jsn9553247670c2',
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
      location: 'Indonesia',
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
   * Search jobs dari LinkedIn API with retry logic
   */
  private async searchJobs(params: JobSearchParams, retries = 3): Promise<any> {
    const queryParams = new URLSearchParams({
      query: params.query || '',
      ...(params.experienceLevels && { experienceLevels: params.experienceLevels }),
      ...(params.workplaceTypes && { workplaceTypes: params.workplaceTypes }),
      ...(params.datePosted && { datePosted: params.datePosted }),
      ...(params.employmentTypes && { employmentTypes: params.employmentTypes }),
    });

    console.log('Searching jobs with params:', queryParams.toString());

    const url = `${this.config.baseUrl}/search?${queryParams.toString()}`;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'x-rapidapi-host': this.config.apiHost,
            'x-rapidapi-key': this.config.apiKey,
          },
        });

        if (response.ok) {
          return await response.json();
        }

        // If rate limited (429), wait and retry
        if (response.status === 429 && attempt < retries) {
          const waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          continue;
        }

        throw new Error(`Search API failed with status ${response.status}`);
      } catch (error) {
        if (attempt === retries) {
          throw error;
        }
        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }

    throw new Error('Search API failed after all retries');
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
   * Now supports both tech and non-tech skills
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
      'proficiency',
      'expertise',
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
      'tasks',
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
      requirements.push(...this.extractSkillsFromDescription(description));
    }

    if (responsibilities.length === 0) {
      responsibilities.push(
        'Contribute to projects and deliverables',
        'Collaborate with cross-functional teams',
        'Maintain quality standards and best practices',
        'Participate in team meetings and knowledge sharing',
      );
    }

    return {
      requirements: requirements.slice(0, 10),
      responsibilities: responsibilities.slice(0, 8),
    };
  }

  /**
   * Extract skills from description - supports ALL industries
   */
  private extractSkillsFromDescription(description: string): string[] {
    // Tech skills
    const techSkills = [
      'JavaScript',
      'TypeScript',
      'Python',
      'Java',
      'Kotlin',
      'Swift',
      'Go',
      'PHP',
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

    // Creative/Design skills
    const creativeSkills = [
      'Adobe Photoshop',
      'Photoshop',
      'Illustrator',
      'InDesign',
      'After Effects',
      'Premiere Pro',
      'Final Cut Pro',
      'DaVinci Resolve',
      'Figma',
      'Sketch',
      'Adobe XD',
      'Lightroom',
      'Cinema 4D',
      'Blender',
      'Maya',
      'Video Editing',
      'Motion Graphics',
      'Color Grading',
      'Photography',
      'Videography',
      'UI Design',
      'UX Design',
      'Graphic Design',
    ];

    // Business/Marketing skills
    const businessSkills = [
      'Google Ads',
      'Facebook Ads',
      'Instagram Ads',
      'SEO',
      'SEM',
      'Google Analytics',
      'Content Marketing',
      'Social Media Marketing',
      'Email Marketing',
      'CRM',
      'Salesforce',
      'HubSpot',
      'Excel',
      'PowerPoint',
      'Data Analysis',
      'Project Management',
      'Jira',
      'Trello',
    ];

    // Combine all skills
    const allSkills = [...techSkills, ...creativeSkills, ...businessSkills];

    const foundSkills: string[] = [];
    const lowerDescription = description.toLowerCase();

    for (const skill of allSkills) {
      if (lowerDescription.includes(skill.toLowerCase())) {
        foundSkills.push(skill);
      }
    }

    // If no specific skills found, return generic ones
    if (foundSkills.length === 0) {
      return ['Communication', 'Problem Solving', 'Team Collaboration', 'Time Management'];
    }

    return foundSkills;
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
   * Get dummy jobs for testing/fallback - now supports multiple industries
   */
  private getDummyJobs(): JobListing[] {
    return [
      {
        title: 'Backend Engineer (Dummy Data)',
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
        title: 'Video Editor  (Dummy Data)',
        company: 'Creative Studio Indonesia',
        location: 'Jakarta, Indonesia',
        salary_range: 'IDR 8.000.000 – 15.000.000',
        job_type: 'Full-time',
        seniority: 'Mid-level',
        requirements: ['Adobe Premiere Pro', 'After Effects', 'DaVinci Resolve', 'Color Grading', 'Motion Graphics'],
        responsibilities: [
          'Edit video content for various platforms (YouTube, Instagram, TikTok)',
          'Create engaging motion graphics and animations',
          'Collaborate with content creators and directors',
          'Manage multiple projects with tight deadlines',
        ],
        job_description:
          'Join our creative team as a Video Editor to produce high-quality video content for brands and digital platforms. Work with modern editing tools and collaborate with talented creators.',
        posted_at: '2025-11-03',
        link: 'https://www.linkedin.com/jobs/view/video-editor-at-creative-studio-67890',
      },
      {
        title: 'Digital Marketing Specialist  (Dummy Data)',
        company: 'Marketing Agency',
        location: 'Jakarta, Indonesia',
        salary_range: 'IDR 10.000.000 – 18.000.000',
        job_type: 'Full-time',
        seniority: 'Mid-level',
        requirements: ['Google Ads', 'Facebook Ads', 'SEO', 'Google Analytics', 'Content Marketing'],
        responsibilities: [
          'Plan and execute digital marketing campaigns',
          'Manage social media advertising budgets',
          'Analyze campaign performance and optimize ROI',
          'Create marketing reports and presentations',
        ],
        job_description:
          'We are looking for a Digital Marketing Specialist to drive online growth for our clients through strategic campaigns and data-driven decisions.',
        posted_at: '2025-10-28',
        link: 'https://www.linkedin.com/jobs/view/digital-marketing-at-agency-11223',
      },
    ];
  }

  async matchWithJobs(cvJson: any, suggestedRoles: JobListing[]): Promise<any[]> {
    const scoredJobs = await Promise.all(
      suggestedRoles.map(async (job) => {
        try {
          const skillMatch = await this.calculateSkillMatch(cvJson.skills, job.requirements);
          const experienceMatch = this.calculateExperienceMatch(cvJson.seniority, job.seniority);
          const responsibilityMatch = this.calculateResponsibilityMatch(cvJson.work_experience, job.responsibilities);

          // Validate all scores are valid numbers
          const validSkillMatch = this.validateScore(skillMatch);
          const validExperienceMatch = this.validateScore(experienceMatch);
          const validResponsibilityMatch = this.validateScore(responsibilityMatch);

          const totalScore = (validSkillMatch + validExperienceMatch + validResponsibilityMatch) / 3;
          const finalScore = this.validateScore(totalScore);
          const grade = this.getGrade(finalScore);

          return {
            ...job,
            skill_match: validSkillMatch,
            experience_match: validExperienceMatch,
            responsibility_match: validResponsibilityMatch,
            score: finalScore,
            grade: grade,
            explanation: this.generateExplanation(validSkillMatch, validExperienceMatch, validResponsibilityMatch),
          };
        } catch (error) {
          console.error(`Error matching job ${job.title}:`, error);
          // Return job with default scores on error
          return {
            ...job,
            skill_match: 0,
            experience_match: 0,
            responsibility_match: 0,
            score: 0,
            grade: 'F',
            explanation: 'Unable to calculate match score due to an error.',
          };
        }
      }),
    );

    return scoredJobs.sort((a, b) => b.score - a.score).slice(0, 5);
  }

  /**
   * Validate and sanitize score values
   */
  private validateScore(score: number): number {
    if (typeof score !== 'number' || isNaN(score) || !isFinite(score)) {
      return 0;
    }
    // Clamp between 0 and 100
    return Math.max(0, Math.min(100, parseFloat(score.toFixed(2))));
  }

  private async calculateSkillMatch(cvSkills: string[], jobRequirements: string[]): Promise<number> {
    try {
      if (!cvSkills || cvSkills.length === 0 || !jobRequirements || jobRequirements.length === 0) {
        return 0;
      }

      const skillMatch = await chainService.calculateSkillmatch(cvSkills, jobRequirements);
      const result = parseFloat(skillMatch?.score);

      // Validate the result
      if (isNaN(result) || !isFinite(result)) {
        console.warn('Invalid skill match score received, defaulting to 0');
        return 0;
      }

      return result;
    } catch (error) {
      console.error('Error calculating skill match:', error);
      return 0;
    }
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

    const cvExperienceText = cvExperience
      .map((exp) => ((exp.description || '') + ' ' + (exp.achievements || '')).toLowerCase())
      .join(' ');

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
      1,
    )}%), and past responsibilities are ${responsibilityLevel} (${responsibilityMatch.toFixed(1)}%).`;
  }
}

export default new ScrapingService();
