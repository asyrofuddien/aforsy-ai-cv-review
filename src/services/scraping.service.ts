import { JobListing } from '../types/evaluation.types';

class ScrapingService {
  async FindJobs(roleSuggestion: object): Promise<JobListing[]> {
    // Dalam implementasi nyata, ini akan memanggil API eksternal atau scraper
    // Saat ini, mengembalikan data dummy yang representatif untuk simulasi

    const jobListings = [
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
        posted_at: '2025-11-05',
        link: 'https://www.linkedin.com/jobs/view/backend-engineer-at-tokopedia-12345',
      },
      {
        title: 'Senior Node.js Developer',
        company: 'GoTo Financial',
        location: 'Jakarta, Indonesia',
        salary_range: 'IDR 25.000.000 – 35.000.000',
        job_type: 'Full-time',
        seniority: 'Senior',
        requirements: ['Node.js', 'TypeScript', 'PostgreSQL', 'Redis', 'Microservices', 'AWS'],
        responsibilities: [
          'Lead backend development for core financial services',
          'Architect scalable and secure microservices',
          'Mentor junior engineers',
          'Optimize system performance and reliability',
        ],
        posted_at: '2025-11-07',
        link: 'https://glints.com/id/en/job/senior-nodejs-developer-goto-financial-67890',
      },
      {
        title: 'Backend Developer (Express.js)',
        company: 'Traveloka',
        location: 'Bangalore / Remote (SEA)',
        salary_range: 'IDR 20.000.000 – 30.000.000',
        job_type: 'Full-time',
        seniority: 'Mid-level',
        requirements: ['Express.js', 'Node.js', 'MySQL', 'Kafka', 'CI/CD', 'Git'],
        responsibilities: [
          'Build high-performance APIs for travel booking systems',
          'Integrate with third-party payment and logistics providers',
          'Participate in agile development cycles',
        ],
        posted_at: '2025-11-01',
        link: 'https://www.jobstreet.co.id/job/backend-developer-traveloka-24680',
      },
      {
        title: 'Node.js API Engineer',
        company: 'Bukalapak',
        location: 'Jakarta, Indonesia',
        salary_range: 'IDR 18.000.000 – 28.000.000',
        job_type: 'Full-time',
        seniority: 'Mid-level',
        requirements: ['Node.js', 'Express', 'MongoDB', 'GraphQL', 'Jest', 'Docker'],
        responsibilities: [
          'Develop internal and external-facing APIs',
          'Implement GraphQL endpoints for frontend consumption',
          'Ensure API documentation is up-to-date',
          'Monitor service health via logging and metrics',
        ],
        posted_at: '2025-11-09',
        link: 'https://kalibrr.com/bukalapak/nodejs-api-engineer-13579',
      },
      {
        title: 'Junior Backend Developer',
        company: 'Mekari',
        location: 'Yogyakarta, Indonesia',
        salary_range: 'IDR 8.000.000 – 12.000.000',
        job_type: 'Full-time',
        seniority: 'Entry-level',
        requirements: ['Node.js', 'Express', 'Basic SQL', 'Git', 'REST API concepts'],
        responsibilities: [
          'Assist in building internal HR and payroll services',
          'Fix bugs and implement small features under supervision',
          'Write clean and maintainable code',
        ],
        posted_at: '2025-11-10',
        link: 'https://glints.com/id/en/job/junior-backend-mekari-97531',
      },
    ];

    // Jika roleSuggestion digunakan di masa depan (misal: filter berdasarkan role)
    // Bisa ditambahkan logika filter di sini

    return jobListings;
  }

  async matchWithJobs(cvJson: any, suggestedRoles: JobListing[]): Promise<any[]> {
    // Score each job
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

    // Sort by score and return top matches
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

    const cvExperienceText = cvExperience.map((exp) => (exp.description || '' + ' ' + exp.achievements || '').toLowerCase()).join(' ');

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
