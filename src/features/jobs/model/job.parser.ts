import { JobListing, RapidApiJobDetailsResponse } from './job.types';

export class JobParser {
  parseProviderDetails(response: RapidApiJobDetailsResponse): JobListing {
    const detail = response.data;
    if (!detail) throw new Error('Job provider details are missing');
    const { requirements, responsibilities } = this.extractSkillsAndResponsibilities(
      detail.description || '',
    );
    return {
      title: detail.title || 'Untitled role',
      company: detail.companyName || detail.company || detail.employer || 'Unknown company',
      location: detail.location || 'Indonesia',
      salary_range: detail.salaryRange || 'Not specified',
      job_type: detail.employmentType || detail.jobType || 'Full-time',
      seniority: this.normalizeSeniority(detail.seniorityLevel || ''),
      requirements,
      responsibilities,
      job_description: detail.description || '',
      posted_at:
        detail.datePosted ||
        detail.postedAt ||
        this.convertPostedTimeAgo(detail.postedTimeAgo || ''),
      link: detail.linkedinUrl || detail.applyUrl || detail.url || '',
    };
  }

  extractSkillsAndResponsibilities(description: string): {
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
  normalizeSeniority(seniorityLevel: string): string {
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
  convertPostedTimeAgo(postedTimeAgo: string): string {
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
}
