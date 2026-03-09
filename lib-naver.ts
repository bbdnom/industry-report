const BASE_URL = "https://openapi.naver.com/v1/search";

export interface NewsItem {
  title: string;
  originallink: string;
  link: string;
  description: string;
  pubDate: string;
}

export interface NewsResponse {
  lastBuildDate: string;
  total: number;
  start: number;
  display: number;
  items: NewsItem[];
}

function stripTags(str: string) {
  return str.replace(/<[^>]+>/g, "");
}

export class NaverClient {
  private clientId: string;
  private clientSecret: string;

  constructor(clientId: string, clientSecret: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  private async request(path: string, params: Record<string, string>): Promise<NewsResponse> {
    const url = new URL(`${BASE_URL}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const res = await fetch(url.toString(), {
      headers: {
        "X-Naver-Client-Id": this.clientId,
        "X-Naver-Client-Secret": this.clientSecret,
      },
    });

    if (!res.ok) throw new Error(`Naver API Error: HTTP ${res.status}`);
    const data = await res.json() as NewsResponse;

    // title/description의 HTML 태그 제거
    data.items = data.items.map((item) => ({
      ...item,
      title: stripTags(item.title),
      description: stripTags(item.description),
    }));

    return data;
  }

  /**
   * 뉴스 검색
   * @param query 검색어
   * @param options display(최대 100), start(최대 1000), sort('sim'|'date')
   */
  async searchNews(
    query: string,
    options: { display?: number; start?: number; sort?: "sim" | "date" } = {}
  ): Promise<NewsResponse> {
    return this.request("/news.json", {
      query,
      display: String(options.display ?? 10),
      start: String(options.start ?? 1),
      sort: options.sort ?? "date",
    });
  }
}
