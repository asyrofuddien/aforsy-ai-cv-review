import appLogger from '../../utils/logger';
import { JobsAIService } from './jobs.ai';
import { rapidApiJobProvider, RapidApiJobProvider } from './providers/rapidapi.adapter';
import { JobParser } from './model/job.parser';
import { calculateSkillMatch, matchJobs, SkillMatcher } from './model/job.scoring';
import { getDummyJobs } from './data/dummy-jobs';
import { CandidateForMatching, JobListing, RoleSuggestion } from './model/job.types';

const logger = appLogger.child({ scope: 'jobs' });
const jobsAI = new JobsAIService();

export interface JobDescriptionEnhancer {
  beautifyDescription(description: string): Promise<{ description?: string }>;
}

export class JobsService {
  constructor(
    private readonly provider: Pick<RapidApiJobProvider, 'search' | 'getDetails'> = rapidApiJobProvider,
    private readonly parser = new JobParser(),
    private readonly enhance: JobDescriptionEnhancer = jobsAI,
    private readonly skillMatch: SkillMatcher = async (skills, requirements) => {
      const result = await jobsAI.calculateSkillmatch(skills, requirements);
      return Number.parseFloat(result?.score);
    },
  ) {}

  async findJobs(roleSuggestion: RoleSuggestion): Promise<JobListing[]> {
    try {
      if (!roleSuggestion.suggested_roles?.length) return getDummyJobs();
      const jobs: JobListing[] = [];
      for (const role of roleSuggestion.suggested_roles.slice(0, 3)) {
        try {
          const search = await this.provider.search(this.buildSearchParams(role, roleSuggestion.seniority));
          const jobId = search.data?.[0]?.id;
          if (!jobId) continue;
          const details = await this.provider.getDetails(jobId);
          if (!details?.data) continue;
          const job = this.parser.parseProviderDetails(details);
          const enhanced = await this.enhance.beautifyDescription(details.data.description || '');
          job.job_description = enhanced.description || job.job_description;
          jobs.push(job);
        } catch (error) {
          logger.warn('Job provider lookup failed; continuing with other role suggestions', { role, error });
        }
      }
      return jobs.length ? jobs : getDummyJobs();
    } catch (error) {
      logger.warn('Job provider unavailable; using fallback fixture', { error });
      return getDummyJobs();
    }
  }

  async matchWithJobs(cv: CandidateForMatching, jobs: JobListing[]) {
    return matchJobs(cv, jobs, (skills, requirements) => calculateSkillMatch(skills, requirements, this.skillMatch));
  }

  async testJobScraping(jobSuggestions: string[], seniority?: string, location = 'indonesia'): Promise<JobListing[]> {
    // Preserve caller parameters in this smoke method; the provider adapter owns HTTP transport.
    const role = jobSuggestions[0];
    if (!role) return [];
    try {
      const search = await this.provider.search({ ...this.buildSearchParams(role, seniority || 'Mid'), location });
      const jobId = search.data?.[0]?.id;
      const details = jobId ? await this.provider.getDetails(jobId) : null;
      return details?.data ? [this.parser.parseProviderDetails(details)] : [];
    } catch (error) {
      logger.warn('Job provider smoke request failed', { error });
      throw error;
    }
  }

  private buildSearchParams(role: string, seniority: string) {
    return {
      query: role,
      location: 'Indonesia',
      experienceLevels: this.mapSeniorityToExperienceLevels(seniority),
      workplaceTypes: 'remote;hybrid;onSite',
      datePosted: 'month',
      employmentTypes: 'fulltime;parttime;contractor;intern;temporary',
    };
  }

  private mapSeniorityToExperienceLevels(seniority: string): string {
    const value = seniority.toLowerCase();
    if (value.includes('entry') || value.includes('junior') || value.includes('intern')) return 'intern;entry';
    if (value.includes('mid')) return 'associate;midSenior';
    if (value.includes('senior') || value.includes('lead')) return 'midSenior;director';
    if (value.includes('director') || value.includes('principal')) return 'director;executive';
    return 'intern;entry;associate;midSenior;director';
  }
}

export const jobsService = new JobsService();
