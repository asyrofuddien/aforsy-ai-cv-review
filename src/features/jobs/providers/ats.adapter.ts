import { JobProvider, JobSearchParams, RapidApiJobDetailsResponse, RapidApiSearchResponse } from '../model/job.types';
import config from '../../../config/config';

type Fetcher = typeof fetch;
type NormalizedDetail = NonNullable<RapidApiJobDetailsResponse['data']>;

abstract class PublicAtsProvider implements JobProvider {
  protected readonly cache = new Map<string, NormalizedDetail>();
  constructor(protected readonly fetcher: Fetcher = fetch) {}
  abstract search(params: JobSearchParams): Promise<RapidApiSearchResponse>;
  async getDetails(id: string): Promise<RapidApiJobDetailsResponse | null> {
    const detail = this.cache.get(id);
    return detail ? { data: detail } : null;
  }
  protected matches(query: string, title: string, description: string): boolean {
    const terms = query.toLowerCase().split(/\s+/).filter(term => term.length > 2);
    return !terms.length || terms.some(term => `${title} ${description}`.toLowerCase().includes(term));
  }
  protected plainText(value: string): string {
    return value.replace(/<\/(p|div|li|h[1-6])>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"').replace(/[ \t]+/g, ' ').replace(/\n\s+/g, '\n').trim();
  }
}

interface GreenhousePost {
  id: number;
  title: string;
  updated_at?: string;
  absolute_url?: string;
  content?: string;
  location?: { name?: string };
  offices?: Array<{ location?: string; name?: string }>;
  departments?: Array<{ name?: string }>;
}

export class GreenhouseJobProvider extends PublicAtsProvider {
  constructor(private readonly boards: string[], fetcher: Fetcher = fetch) { super(fetcher); }
  async search(params: JobSearchParams): Promise<RapidApiSearchResponse> {
    if (!this.boards.length) throw new Error('No Greenhouse boards configured. Set GREENHOUSE_BOARDS.');
    const outcomes = await Promise.allSettled(this.boards.map(async board => {
      const response = await this.fetcher(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`);
      if (!response.ok) throw new Error(`Greenhouse board request failed (${response.status})`);
      const payload = await response.json() as { jobs?: GreenhousePost[] };
      return (payload.jobs || []).filter(job => this.matches(params.query || '', job.title || '', job.content || '')).map(job => {
        const id = `greenhouse:${board}:${job.id}`;
        this.cache.set(id, {
          title: job.title,
          companyName: job.departments?.map(item => item.name).filter(Boolean).join(', ') || board,
          location: job.location?.name || job.offices?.map(item => item.location || item.name).filter(Boolean).join(', ') || params.location || 'Not specified',
          description: this.plainText(job.content || ''),
          employmentType: 'Full-time',
          seniorityLevel: '',
          datePosted: job.updated_at,
          linkedinUrl: job.absolute_url,
        });
        return { id };
      });
    }));
    const successful = outcomes.filter((result): result is PromiseFulfilledResult<Array<{ id: string }>> => result.status === 'fulfilled');
    if (!successful.length) throw new Error('All configured Greenhouse boards failed');
    return { data: successful.flatMap(result => result.value).slice(0, 20) };
  }
}

interface LeverPost {
  id: string;
  text?: string;
  descriptionPlain?: string;
  hostedUrl?: string;
  categories?: { location?: string; commitment?: string; team?: string; department?: string };
  createdAt?: number;
}

export class LeverJobProvider extends PublicAtsProvider {
  constructor(private readonly sites: string[], fetcher: Fetcher = fetch) { super(fetcher); }
  async search(params: JobSearchParams): Promise<RapidApiSearchResponse> {
    if (!this.sites.length) throw new Error('No Lever sites configured. Set LEVER_SITES.');
    const outcomes = await Promise.allSettled(this.sites.map(async site => {
      const response = await this.fetcher(`https://api.lever.co/v0/postings/${encodeURIComponent(site)}?mode=json`);
      if (!response.ok) throw new Error(`Lever site request failed (${response.status})`);
      const postings = await response.json() as LeverPost[];
      return (postings || []).filter(post => this.matches(params.query || '', post.text || '', post.descriptionPlain || '')).map(post => {
        const id = `lever:${site}:${post.id}`;
        this.cache.set(id, {
          title: post.text || 'Untitled role',
          companyName: post.categories?.team || post.categories?.department || site,
          location: post.categories?.location || params.location || 'Not specified',
          description: this.plainText(post.descriptionPlain || ''),
          employmentType: post.categories?.commitment || 'Not specified',
          seniorityLevel: '',
          datePosted: post.createdAt ? new Date(post.createdAt).toISOString() : undefined,
          linkedinUrl: post.hostedUrl,
        });
        return { id };
      });
    }));
    const successful = outcomes.filter((result): result is PromiseFulfilledResult<Array<{ id: string }>> => result.status === 'fulfilled');
    if (!successful.length) throw new Error('All configured Lever sites failed');
    return { data: successful.flatMap(result => result.value).slice(0, 20) };
  }
}

export class AggregateJobProvider implements JobProvider {
  constructor(private readonly providers: JobProvider[]) {}
  async search(params: JobSearchParams): Promise<RapidApiSearchResponse> {
    if (!this.providers.length) throw new Error('No ATS providers are configured. Set GREENHOUSE_BOARDS or LEVER_SITES.');
    const outcomes = await Promise.allSettled(this.providers.map(provider => provider.search(params)));
    const data = outcomes.flatMap(result => result.status === 'fulfilled' ? result.value.data || [] : []);
    if (!data.length && outcomes.every(result => result.status === 'rejected')) throw new Error('All job providers failed');
    return { data: [...new Map(data.map(job => [job.id, job])).values()].slice(0, 20) };
  }
  async getDetails(id: string): Promise<RapidApiJobDetailsResponse | null> {
    const provider = this.providers.find(item => item instanceof GreenhouseJobProvider ? id.startsWith('greenhouse:') : item instanceof LeverJobProvider ? id.startsWith('lever:') : item === rapidApiJobProvider);
    return provider?.getDetails(id) || null;
  }
}

export class RapidApiFallbackProvider implements JobProvider {
  constructor(private readonly primary: JobProvider, private readonly fallback: JobProvider) {}
  async search(params: JobSearchParams): Promise<RapidApiSearchResponse> {
    try {
      const result = await this.primary.search(params);
      if (result.data?.length) {
        const encodedSearch = encodeURIComponent(JSON.stringify(params));
        return { data: result.data.map(item => ({ id: `rapidapi:${encodedSearch}:${item.id}` })) };
      }
    } catch { /* the configured fallback owns the final error if it also fails */ }
    return this.searchFallback(params);
  }
  async getDetails(id: string): Promise<RapidApiJobDetailsResponse | null> {
    if (id.startsWith('rapidapi:')) {
      const encoded = id.slice('rapidapi:'.length);
      const separator = encoded.indexOf(':');
      if (separator < 0) return null;
      const params = JSON.parse(decodeURIComponent(encoded.slice(0, separator))) as JobSearchParams;
      const rapidId = encoded.slice(separator + 1);
      try {
        const detail = await this.primary.getDetails(rapidId);
        if (detail?.data) return detail;
      } catch { /* attempt the configured ATS fallback */ }
      const result = await this.searchFallback(params);
      const fallbackId = result.data?.[0]?.id;
      return fallbackId ? this.fallback.getDetails(fallbackId.slice('aggregate:'.length)) : null;
    }
    return this.fallback.getDetails(id.startsWith('aggregate:') ? id.slice('aggregate:'.length) : id);
  }
  private async searchFallback(params: JobSearchParams): Promise<RapidApiSearchResponse> {
    const result = await this.fallback.search(params);
    return { data: (result.data || []).map(item => ({ id: `aggregate:${item.id}` })) };
  }
}

import { rapidApiJobProvider } from './rapidapi.adapter';

export function createJobProvider(providerName = config.jobs.provider, fallbackName = config.jobs.fallback): JobProvider {
  const greenhouse = new GreenhouseJobProvider(config.jobs.greenhouseBoards);
  const lever = new LeverJobProvider(config.jobs.leverSites);
  switch (providerName.toLowerCase()) {
    case 'greenhouse': return greenhouse;
    case 'lever': return lever;
    case 'aggregate': return new AggregateJobProvider([greenhouse, lever]);
    case 'rapidapi': return fallbackName.toLowerCase() === 'none' ? rapidApiJobProvider : new RapidApiFallbackProvider(rapidApiJobProvider, new AggregateJobProvider([greenhouse, lever]));
    default: throw new Error(`Unsupported JOB_PROVIDER: ${providerName}`);
  }
}

export const configuredJobProvider = createJobProvider();
