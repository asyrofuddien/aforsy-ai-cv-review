import type { IJobDescription } from '../../models/jobDescription.model';
import vectorDb from '../../services/vectordb/vectordb.service';
import appLogger from '../../utils/logger';

const logger = appLogger.child({ scope: 'jobDescription.indexer' });

/** Vector indexing is best-effort: the Mongo catalog remains the source of truth. */
export async function indexJobDescription(job: IJobDescription): Promise<void> {
  try {
    await vectorDb.upsertDocuments([
      {
        id: `job-${job._id}`,
        text: `${job.title} at ${job.company}. ${job.description}`,
        metadata: { type: 'job_description', jobId: String(job._id), title: job.title, company: job.company, slug: job.slug },
      },
      {
        id: `job-tech-${job._id}`,
        text: `Technical requirements for ${job.title}: ${job.requirements.technical.join('. ')}`,
        metadata: { type: 'job_description', section: 'technical_requirements', jobId: String(job._id), slug: job.slug },
      },
    ]);
  } catch (error) {
    logger.error('Job description indexing failed; Mongo remains authoritative', { jobId: String(job._id), error });
  }
}

export async function updateJobDescriptionIndex(job: IJobDescription): Promise<void> {
  await removeJobDescriptionIndex(String(job._id));
  await indexJobDescription(job);
}

/** Deletion is not implemented by the current vector adapter; record that explicitly. */
export async function removeJobDescriptionIndex(jobId: string): Promise<void> {
  logger.info('Vector deletion is not supported by the configured adapter', { jobId });
}
