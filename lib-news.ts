import { Agent, fetch as undiciFetch } from "undici";

const BASE_URL = "https://newsapi.org/v2";
const agent = new Agent({ connect: { rejectUnauthorized: false } });
const apiFetch = (url: string, init?: RequestInit) =>
  undiciFetch(url, { ...init, dispatcher: agent } as Parameters<typeof undiciFetch>[1]) as unknown as ReturnType<typeof fetch>;

export type Category = "business" | "entertainment" | "general" | "health" | "science" | "sports" | "technology";
export type SortBy = "relevancy" | "popularity" | "publishedAt";

export interface Article {
  source: { id: string | null; name: string };
  author: string | null;
  title: string;
  description: string | null;
  url: string;
  urlToImage: string | null;
  publishedAt: string;
  content: string | null;
}

interface NewsResponse {
  status: string;
  totalResults: number;
  articles: Article[];
  code?: string;
  message?: string;
}

export class NewsClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async get(path: string, params: Record<string, string>): Promise<NewsResponse> {
    const url = new URL(`${BASE_URL}${path}`);
    url.searchParams.set("apiKey", this.apiKey);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const res = await apiFetch(url.toString());
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json() as NewsResponse;
    if (data.status !== "ok") throw new Error(`NewsAPI Error [${data.code}]: ${data.message}`);
    return data;
  }

  /**
   * 주요 헤드라인
   * @param options country(예: kr, us), category, q(검색어), pageSize(최대 100)
   */
  async getTopHeadlines(options: {
    country?: string;
    category?: Category;
    q?: string;
    sources?: string;
    pageSize?: number;
    page?: number;
  } = {}): Promise<{ total: number; articles: Article[] }> {
    const params: Record<string, string> = {};
    if (options.country)  params.country  = options.country;
    if (options.category) params.category = options.category;
    if (options.q)        params.q        = options.q;
    if (options.sources)  params.sources  = options.sources;
    if (options.pageSize) params.pageSize = String(options.pageSize);
    if (options.page)     params.page     = String(options.page);

    const data = await this.get("/top-headlines", params);
    return { total: data.totalResults, articles: data.articles };
  }

  /**
   * 전체 기사 검색
   * @param q 검색어 (필수)
   * @param options from/to(ISO 날짜), sortBy, language, pageSize
   */
  async searchEverything(
    q: string,
    options: {
      from?: string;       // ISO 날짜 (예: "2026-03-01")
      to?: string;
      language?: string;   // en, ko 등
      sortBy?: SortBy;
      sources?: string;
      pageSize?: number;
      page?: number;
    } = {}
  ): Promise<{ total: number; articles: Article[] }> {
    const params: Record<string, string> = { q };
    if (options.from)     params.from     = options.from;
    if (options.to)       params.to       = options.to;
    if (options.language) params.language = options.language;
    if (options.sortBy)   params.sortBy   = options.sortBy;
    if (options.sources)  params.sources  = options.sources;
    if (options.pageSize) params.pageSize = String(options.pageSize);
    if (options.page)     params.page     = String(options.page);

    const data = await this.get("/everything", params);
    return { total: data.totalResults, articles: data.articles };
  }

  /** 사용 가능한 뉴스 소스 목록 */
  async getSources(options: { category?: Category; language?: string; country?: string } = {}) {
    const params: Record<string, string> = {};
    if (options.category) params.category = options.category;
    if (options.language) params.language = options.language;
    if (options.country)  params.country  = options.country;

    const url = new URL(`${BASE_URL}/top-headlines/sources`);
    url.searchParams.set("apiKey", this.apiKey);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const res = await apiFetch(url.toString());
    const data = await res.json() as { status: string; sources: { id: string; name: string; description: string; url: string; category: string; country: string }[] };
    return data.sources;
  }
}
