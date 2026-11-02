import { CandidateForMatching, JobListing, RoleSuggestion } from '../features/jobs/model/job.types';
import { jobsService } from '../features/jobs/jobs.service';

/** @deprecated Import jobsService from the feature module. */
class ScrapingService {
  FindJobs(roleSuggestion: RoleSuggestion): Promise<JobListing[]> {
    return jobsService.findJobs(roleSuggestion);
  }

  matchWithJobs(cv: CandidateForMatching, jobs: JobListing[]) {
    return jobsService.matchWithJobs(cv, jobs);
  }
}

export default new ScrapingService();
