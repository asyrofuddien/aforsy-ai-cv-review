import { JobSearchParams, RapidApiJobDetailsResponse, RapidApiSearchResponse } from '../model/job.types';

interface HttpResponse { ok: boolean; status: number; json(): Promise<unknown>; }
type Fetcher = (url: string, init: { method: string; headers: Record<string, string> }) => Promise<HttpResponse>;
type Delay = (milliseconds: number) => Promise<void>;

export interface RapidApiConfig {
  apiKey?: string;
  apiHost?: string;
  baseUrl?: string;
  platform?: 'linkedin' | 'indeed' | 'bing' | 'xing';
  countryCode?: string;
  maxPages?: number;
}

type RapidApiPlatform = NonNullable<RapidApiConfig['platform']>;

export class RapidApiJobProvider {
  private readonly config: Required<RapidApiConfig>;
  constructor(
    config: RapidApiConfig = {},
    private readonly fetcher: Fetcher = fetch as unknown as Fetcher,
    private readonly delay: Delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
  ) {
    const platform = config.platform ?? (process.env.RAPIDAPI_PLATFORM as RapidApiPlatform | undefined) ?? 'linkedin';
    if (!['linkedin', 'indeed', 'bing', 'xing'].includes(platform)) {
      throw new Error(`Unsupported RAPIDAPI_PLATFORM: ${platform}`);
    }
    this.config = {
      apiKey: config.apiKey ?? process.env.RAPIDAPI_KEY ?? '',
      apiHost: config.apiHost ?? process.env.RAPIDAPI_HOST ?? 'jobs-api14.p.rapidapi.com',
      baseUrl: config.baseUrl ?? process.env.RAPIDAPI_BASE_URL ?? 'https://jobs-api14.p.rapidapi.com',
      platform,
      countryCode: config.countryCode ?? process.env.RAPIDAPI_COUNTRY_CODE ?? 'id',
      maxPages: Math.floor(Math.max(1, Math.min(5, config.maxPages ?? (Number(process.env.RAPIDAPI_MAX_PAGES) || 1)))),
    };
  }

  async search(params: JobSearchParams, retries = 3): Promise<RapidApiSearchResponse> {
    if (!this.config.apiKey) throw new Error('RapidAPI job provider is not configured');
    if (this.config.platform === 'bing' && !params.location?.trim()) {
      throw new Error('RapidAPI Bing search requires a location');
    }
    const data: NonNullable<RapidApiSearchResponse['data']> = [];
    let nextToken = params.token;
    let nextPageToken: string | undefined;
    for (let page = 0; page < this.config.maxPages; page += 1) {
      const pageParams = { ...params, token: nextToken };
      const url = this.searchUrl(pageParams);
      let pageResult: RapidApiSearchResponse | undefined;
      try {
        for (let attempt = 1; attempt <= retries; attempt += 1) {
          try {
            const response = await this.fetcher(url, { method: 'GET', headers: this.headers() });
            if (response.ok) {
              pageResult = await response.json() as RapidApiSearchResponse;
              break;
            }
            if (response.status === 429 && attempt < retries) {
              await this.delay(Math.pow(2, attempt) * 1000);
              continue;
            }
            throw new Error(`Search API failed with status ${response.status}`);
          } catch (error) {
            if (attempt === retries) throw error;
            await this.delay(1000 * attempt);
          }
        }
      } catch (error) {
        if (!data.length) throw error;
        nextPageToken = nextToken;
        break;
      }
      if (!pageResult) break;
      data.push(...(pageResult.data || []));
      nextPageToken = pageResult.meta?.nextToken;
      if (!nextPageToken) break;
      nextToken = nextPageToken;
    }
    return { data: [...new Map(data.map(job => [job.id, job])).values()], meta: { nextToken: nextPageToken } };
  }

  async getDetails(jobId: string): Promise<RapidApiJobDetailsResponse | null> {
    if (!this.config.apiKey) return null;
    try {
      const response = await this.fetcher(`${this.platformBaseUrl()}/get?id=${encodeURIComponent(jobId)}`, { method: 'GET', headers: this.headers() });
      if (!response.ok) return null;
      return await response.json() as RapidApiJobDetailsResponse;
    } catch {
      return null;
    }
  }

  private headers(): Record<string, string> {
    return { 'x-rapidapi-host': this.config.apiHost, 'x-rapidapi-key': this.config.apiKey };
  }

  private platformBaseUrl(): string {
    const base = new URL(this.config.baseUrl);
    const legacyPlatformPath = /\/v2\/(linkedin|indeed|bing|xing)\/?$/i;
    base.pathname = base.pathname.replace(legacyPlatformPath, '').replace(/\/$/, '');
    return `${base.toString().replace(/\/$/, '')}/v2/${this.config.platform}`;
  }

  private searchUrl(params: JobSearchParams): string {
    const query = new URLSearchParams();
    if (params.query) query.set('query', params.query);
    if (params.location) query.set('location', params.location);
    if (params.token) query.set('token', params.token);

    switch (this.config.platform) {
      case 'linkedin':
        if (params.experienceLevels) query.set('experienceLevels', params.experienceLevels);
        if (params.workplaceTypes) query.set('workplaceTypes', params.workplaceTypes);
        if (params.datePosted) query.set('datePosted', params.datePosted);
        if (params.employmentTypes) query.set('employmentTypes', params.employmentTypes);
        if (params.geoId) query.set('geoId', params.geoId);
        if (params.organizationIds) query.set('organizationIds', params.organizationIds);
        break;
      case 'indeed':
        query.set('countryCode', params.countryCode || this.config.countryCode);
        if (params.radius !== undefined) query.set('radius', String(params.radius));
        if (params.sortType) query.set('sortType', params.sortType);
        break;
      case 'bing':
        if (params.remoteOnly !== undefined) query.set('remoteOnly', String(params.remoteOnly));
        break;
      case 'xing':
        break;
    }
    return `${this.platformBaseUrl()}/search?${query.toString()}`;
  }
}

export const rapidApiJobProvider = new RapidApiJobProvider();
