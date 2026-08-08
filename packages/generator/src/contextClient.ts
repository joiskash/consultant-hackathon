// Thin client for the context.dev API (base URL MUST include /v1 — without it
// the API returns a misleading "API does not exist" 403).

const BASE_URL = 'https://api.context.dev/v1';

export interface SearchResult {
  url: string;
  title: string;
  description?: string;
  relevance?: 'high' | 'medium' | 'low';
}

export interface BrandData {
  domain?: string;
  title?: string;
  description?: string;
  slogan?: string;
  stock?: { ticker?: string; exchange?: string };
  employees?: unknown;
  industries?: { eic?: { industry: string; subindustry: string }[] };
  [key: string]: unknown;
}

export interface NaicsCode {
  code: string;
  name: string;
  confidence: 'high' | 'medium' | 'low';
}

export type FetchLike = typeof fetch;

export interface ContextClientOptions {
  apiKey?: string;
  fetchImpl?: FetchLike;
}

export class ContextClient {
  private apiKey: string;
  private fetchImpl: FetchLike;

  constructor(opts: ContextClientOptions = {}) {
    const key = opts.apiKey ?? process.env.CONTEXT_DEV_API_KEY;
    if (!key) throw new Error('CONTEXT_DEV_API_KEY is not configured');
    this.apiKey = key;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  // 408 = cold cache: retry once ("the second hit is warm"). 429: respect Retry-After.
  private async request(url: string, init: RequestInit, retried = false): Promise<Response> {
    const response = await this.fetchImpl(url, {
      ...init,
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    if (response.status === 408 && !retried) {
      return this.request(url, init, true);
    }
    if (response.status === 429 && !retried) {
      const retryAfter = Number(response.headers.get('retry-after') ?? '2');
      await new Promise((r) => setTimeout(r, Math.min(retryAfter, 30) * 1000));
      return this.request(url, init, true);
    }
    return response;
  }

  async searchWeb(params: {
    query: string;
    numResults?: number;
    includeDomains?: string[];
    freshness?: 'last_24_hours' | 'last_week' | 'last_month' | 'last_year';
    country?: string;
  }): Promise<SearchResult[]> {
    const response = await this.request(`${BASE_URL}/web/search`, {
      method: 'POST',
      body: JSON.stringify(params),
    });
    if (!response.ok) {
      throw new Error(`context.dev /web/search failed: ${response.status}`);
    }
    const data = (await response.json()) as { results?: SearchResult[] };
    return data.results ?? [];
  }

  async scrapeMarkdown(url: string): Promise<string> {
    const qs = new URLSearchParams({ url, useMainContentOnly: 'true' });
    const response = await this.request(`${BASE_URL}/web/scrape/markdown?${qs}`, {
      method: 'GET',
    });
    if (!response.ok) {
      throw new Error(`context.dev /web/scrape/markdown failed: ${response.status}`);
    }
    const data = (await response.json()) as { markdown?: string };
    return data.markdown ?? '';
  }

  async retrieveBrand(
    lookup: { type: 'by_domain'; domain: string } | { type: 'by_name'; name: string },
  ): Promise<BrandData | null> {
    const response = await this.request(`${BASE_URL}/brand/retrieve`, {
      method: 'POST',
      body: JSON.stringify(lookup),
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`context.dev /brand/retrieve failed: ${response.status}`);
    }
    const data = (await response.json()) as { brand?: BrandData };
    return data.brand ?? null;
  }

  async classifyNaics(input: string): Promise<NaicsCode[]> {
    const qs = new URLSearchParams({ input, maxResults: '5' });
    const response = await this.request(`${BASE_URL}/web/naics?${qs}`, { method: 'GET' });
    if (response.status === 404) return [];
    if (!response.ok) {
      throw new Error(`context.dev /web/naics failed: ${response.status}`);
    }
    const data = (await response.json()) as { codes?: NaicsCode[] };
    return data.codes ?? [];
  }
}
