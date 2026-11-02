import { JobSearchParams, RapidApiJobDetailsResponse, RapidApiSearchResponse } from '../model/job.types';

interface HttpResponse { ok: boolean; status: number; json(): Promise<unknown>; }
type Fetcher = (url: string, init: { method: string; headers: Record<string, string> }) => Promise<HttpResponse>;
type Delay = (milliseconds: number) => Promise<void>;

export interface RapidApiConfig {
  apiKey?: string;
  apiHost?: string;
  baseUrl?: string;
}

export class RapidApiJobProvider {
  private readonly config: Required<RapidApiConfig>;
  constructor(
    config: RapidApiConfig = {},
    private readonly fetcher: Fetcher = fetch as unknown as Fetcher,
    private readonly delay: Delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
  ) {
    this.config = {
      apiKey: config.apiKey ?? process.env.RAPIDAPI_KEY ?? '',
      apiHost: config.apiHost ?? process.env.RAPIDAPI_HOST ?? 'jobs-api14.p.rapidapi.com',
      baseUrl: config.baseUrl ?? process.env.RAPIDAPI_BASE_URL ?? 'https://jobs-api14.p.rapidapi.com/v2/linkedin',
    };
  }

  async search(params: JobSearchParams, retries = 3): Promise<RapidApiSearchResponse> {
    if (!this.config.apiKey) throw new Error('RapidAPI job provider is not configured');
    const queryParams = new URLSearchParams({
      query: params.query || '',
      ...(params.experienceLevels && { experienceLevels: params.experienceLevels }),
      ...(params.workplaceTypes && { workplaceTypes: params.workplaceTypes }),
      ...(params.datePosted && { datePosted: params.datePosted }),
      ...(params.employmentTypes && { employmentTypes: params.employmentTypes }),
    });
    const url = `${this.config.baseUrl}/search?${queryParams.toString()}`;
    for (let attempt = 1; attempt <= retries; attempt += 1) {
      try {
        const response = await this.fetcher(url, { method: 'GET', headers: this.headers() });
        if (response.ok) return await response.json() as RapidApiSearchResponse;
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
    throw new Error('Search API failed after all retries');
  }

  async getDetails(jobId: string): Promise<RapidApiJobDetailsResponse | null> {
    if (!this.config.apiKey) return null;
    try {
      const response = await this.fetcher(`${this.config.baseUrl}/get?id=${encodeURIComponent(jobId)}`, { method: 'GET', headers: this.headers() });
      if (!response.ok) return null;
      return await response.json() as RapidApiJobDetailsResponse;
    } catch {
      return null;
    }
  }

  private headers(): Record<string, string> {
    return { 'x-rapidapi-host': this.config.apiHost, 'x-rapidapi-key': this.config.apiKey };
  }
}

export const rapidApiJobProvider = new RapidApiJobProvider();
