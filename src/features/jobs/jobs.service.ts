import appLogger from '../../utils/logger';
import { JobsAIService } from './jobs.ai';
import { configuredJobProvider } from './providers/ats.adapter';
import { JobParser } from './model/job.parser';
import { calculateSkillMatch, matchJobs, SkillMatcher } from './model/job.scoring';
import { CandidateForMatching, JobListing, JobProvider, RoleSuggestion } from './model/job.types';
import config from '../../config/config';
import JobOperationMetric, {
  JobOperationStage,
  JobOperationStatus,
} from '../../models/jobOperationMetric.model';
import { logContext } from '../../utils/log-context';

const logger = appLogger.child({ scope: 'jobs' });
const jobsAI = new JobsAIService();

export interface JobDescriptionEnhancer {
  beautifyDescription(description: string): Promise<{ description?: string; fallback?: boolean }>;
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
    const started = performance.now();
    const roles = (roleSuggestion.suggested_roles || []).slice(0, 3);
    if (!roles.length) {
      await this.recordMetric('search', 'no_query', started, { roleCount: 0 });
      return [];
    }
    const jobs: JobListing[] = [];
    const seenJobs = new Set<string>();
    let searchSucceeded = 0;
    let searchFailed = 0;
    let listingsFound = 0;
    let detailAttempts = 0;
    let detailUnavailable = 0;
    let detailFailed = 0;
    let listingsDeduplicated = 0;
    let enhancementFallbacks = 0;
    logger.info('Job provider search batch started', { roleCount: roles.length });
    for (const [roleIndex, role] of roles.entries()) {
      const roleStarted = performance.now();
      try {
        const search = await this.provider.search(this.buildSearchParams(role, roleSuggestion.seniority));
        searchSucceeded += 1;
        const found = search.data || [];
        listingsFound += found.length;
        const candidates = found.slice(0, 3);
        logger.info('Job provider search completed', {
          roleIndex: roleIndex + 1,
          roleCount: roles.length,
          resultCount: found.length,
          detailCandidates: candidates.length,
          durationMs: Math.round(performance.now() - roleStarted),
        });
        for (const [detailIndex, { id: jobId }] of candidates.entries()) {
          detailAttempts += 1;
          const detailStarted = performance.now();
          try {
            const details = await this.provider.getDetails(jobId);
            if (!details?.data) {
              detailUnavailable += 1;
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
              listingsDeduplicated += 1;
              continue;
            }
            seenJobs.add(dedupeKey);
            const enhanced = await this.enhance.beautifyDescription(details.data.description || '');
            if (enhanced.fallback) enhancementFallbacks += 1;
            job.job_description = enhanced.description || job.job_description;
            jobs.push(job);
            logger.info('Job detail normalized', {
              roleIndex: roleIndex + 1,
              detailIndex: detailIndex + 1,
              durationMs: Math.round(performance.now() - detailStarted),
            });
          } catch (error) {
            detailFailed += 1;
            logger.warn('Job detail lookup failed', {
              roleIndex: roleIndex + 1,
              detailIndex: detailIndex + 1,
              errorType: error instanceof Error ? error.name : 'unknown',
            });
          }
        }
      } catch (error) {
        searchFailed += 1;
        logger.warn('Job provider search failed', {
          roleIndex: roleIndex + 1,
          roleCount: roles.length,
          durationMs: Math.round(performance.now() - roleStarted),
          errorType: error instanceof Error ? error.name : 'unknown',
        });
      }
    }
    const status: JobOperationStatus =
      searchSucceeded === 0 && searchFailed > 0
        ? 'failed'
        : jobs.length === 0 &&
            searchSucceeded > 0 &&
            searchFailed === 0 &&
            detailUnavailable === 0 &&
            detailFailed === 0
          ? 'no_matches'
          : searchFailed > 0 || detailUnavailable > 0 || detailFailed > 0
            ? 'partial'
            : 'completed';
    await this.recordMetric('search', status, started, {
      roleCount: roles.length,
      searchAttempts: searchSucceeded + searchFailed,
      searchSucceeded,
      searchFailed,
      listingsFound,
      detailAttempts,
      detailUnavailable,
      detailFailed,
      listingsDeduplicated,
      enhancementFallbacks,
      listingsReadyForScoring: jobs.length,
    });
    if (status === 'failed') {
      logger.error('Every configured job provider search failed', {
        roleCount: roles.length,
        failureCount: searchFailed,
      });
      throw new Error('Job matching could not run because every search failed.');
    }
    logger.info('Job provider search batch completed', {
      roleCount: roles.length,
      completedSearches: searchSucceeded,
      failedSearches: searchFailed,
      listingCount: jobs.length,
      status,
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
      await this.recordMetric(
        'scoring',
        jobs.length ? 'completed' : 'no_matches',
        started,
        { listingsReadyForScoring: jobs.length },
      );
      return matches;
    } catch (error) {
      await this.recordMetric('scoring', 'failed', started, {
        listingsReadyForScoring: jobs.length,
        scoringFailed: 1,
      });
      logger.error('Job scoring failed', {
        listingCount: jobs.length,
        durationMs: Math.round(performance.now() - started),
        errorType: error instanceof Error ? error.name : 'unknown',
      });
      throw error;
    }
  }

  private async recordMetric(
    stage: JobOperationStage,
    status: JobOperationStatus,
    started: number,
    metrics: Partial<{
      roleCount: number;
      searchAttempts: number;
      searchSucceeded: number;
      searchFailed: number;
      listingsFound: number;
      detailAttempts: number;
      detailUnavailable: number;
      detailFailed: number;
      listingsDeduplicated: number;
      enhancementFallbacks: number;
      listingsReadyForScoring: number;
      scoringFailed: number;
    }>,
  ): Promise<void> {
    const context = logContext.getStore();
    const referenceType = context?.evaluationId
      ? 'evaluation'
      : context?.cvMatcherId
        ? 'cv_matcher'
        : null;
    const referenceId = context?.evaluationId ?? context?.cvMatcherId;
    if (!referenceType || !referenceId) return;

    await JobOperationMetric.findOneAndUpdate(
      {
        referenceType,
        referenceId,
        stage,
        attempt: Math.max(1, Number(context?.attempt) || 1),
      },
      {
        $set: {
          status,
          provider: config.jobs.provider,
          durationMs: Math.round(performance.now() - started),
          ...metrics,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
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
