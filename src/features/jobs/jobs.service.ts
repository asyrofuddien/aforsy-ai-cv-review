import appLogger from '../../utils/logger';
import { JobsAIService } from './jobs.ai';
import { configuredJobProvider } from './providers/ats.adapter';
import { JobParser } from './model/job.parser';
import { calculateSkillMatch, matchJobs, SkillMatcher } from './model/job.scoring';
import { CandidateForMatching, JobListing, JobProvider, RoleSuggestion } from './model/job.types';

const logger = appLogger.child({ scope: 'jobs' });
const jobsAI = new JobsAIService();

export interface JobDescriptionEnhancer {
  beautifyDescription(description: string): Promise<{ description?: string }>;
}

export class JobsService {
  constructor(
    private readonly provider: JobProvider = configuredJobProvider,
    private readonly parser = new JobParser(),
    private readonly enhance: JobDescriptionEnhancer = jobsAI,
    private readonly skillMatch: SkillMatcher = async (skills, requirements) => {
      const result = await jobsAI.calculateSkillmatch(skills, requirements);
      return Number.parseFloat(result?.score);
    },
  ) {}

  async findJobs(roleSuggestion: RoleSuggestion): Promise<JobListing[]> {
    if (!roleSuggestion.suggested_roles?.length) return [];
    const jobs: JobListing[] = [];
    const seenJobs = new Set<string>();
    const errors: unknown[] = [];
    let completedSearches = 0;
    const roles = roleSuggestion.suggested_roles.slice(0, 3);
    logger.info('Job provider search batch started', { roleCount: roles.length });
    for (const [roleIndex, role] of roles.entries()) {
      const roleStarted = performance.now();
      try {
        logger.info('Job provider search started', { roleIndex: roleIndex + 1, roleCount: roles.length });
        const search = await this.provider.search(this.buildSearchParams(role, roleSuggestion.seniority));
        completedSearches += 1;
        const candidates = search.data?.slice(0, 3) || [];
        logger.info('Job provider search completed', {
          roleIndex: roleIndex + 1,
          roleCount: roles.length,
          resultCount: search.data?.length || 0,
          detailCandidates: candidates.length,
          durationMs: Math.round(performance.now() - roleStarted),
        });
        for (const [detailIndex, { id: jobId }] of candidates.entries()) {
          logger.info('Job detail lookup started', {
            roleIndex: roleIndex + 1,
            detailIndex: detailIndex + 1,
            detailCount: candidates.length,
          });
          const detailStarted = performance.now();
          const details = await this.provider.getDetails(jobId);
          if (!details?.data) {
            logger.info('Job detail lookup completed without details', {
              roleIndex: roleIndex + 1,
              detailIndex: detailIndex + 1,
              durationMs: Math.round(performance.now() - detailStarted),
            });
            continue;
          }
          const job = this.parser.parseProviderDetails(details);
          const dedupeKey = job.link || `${job.title.toLowerCase()}|${job.company.toLowerCase()}|${job.location.toLowerCase()}`;
          if (seenJobs.has(dedupeKey)) {
            logger.info('Duplicate job listing skipped', { roleIndex: roleIndex + 1, detailIndex: detailIndex + 1 });
            continue;
          }
          seenJobs.add(dedupeKey);
          const enhanced = await this.enhance.beautifyDescription(details.data.description || '');
          job.job_description = enhanced.description || job.job_description;
          jobs.push(job);
          logger.info('Job detail normalized', {
            roleIndex: roleIndex + 1,
            detailIndex: detailIndex + 1,
            durationMs: Math.round(performance.now() - detailStarted),
          });
        }
      } catch (error) {
        errors.push(error);
        logger.warn('Job provider lookup failed; continuing with other role suggestions', {
          roleIndex: roleIndex + 1,
          durationMs: Math.round(performance.now() - roleStarted),
          error,
        });
      }
    }
    if (!jobs.length && completedSearches === 0 && errors.length) {
      logger.error('Every configured job provider search failed', { roleCount: roles.length, failureCount: errors.length });
      throw new Error(`Job matching could not run: ${errors.map(error => error instanceof Error ? error.message : 'provider error').join('; ')}`);
    }
    logger.info('Job provider search batch completed', {
      roleCount: roles.length,
      completedSearches,
      failedSearches: errors.length,
      listingCount: jobs.length,
    });
    return jobs;
  }

  async matchWithJobs(cv: CandidateForMatching, jobs: JobListing[]) {
    const started = performance.now();
    logger.info('Job scoring started', { listingCount: jobs.length });
    try {
      const matches = await matchJobs(cv, jobs, (skills, requirements) => calculateSkillMatch(skills, requirements, this.skillMatch));
      logger.info('Job scoring completed', {
        listingCount: jobs.length,
        matchCount: matches.length,
        durationMs: Math.round(performance.now() - started),
      });
      return matches;
    } catch (error) {
      logger.error('Job scoring failed', { listingCount: jobs.length, durationMs: Math.round(performance.now() - started), error });
      throw error;
    }
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
