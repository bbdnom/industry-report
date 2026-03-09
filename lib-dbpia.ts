import { parseStringPromise } from "xml2js";
import { Agent, fetch as undiciFetch } from "undici";

const BASE_URL = "https://api.dbpia.co.kr/v2/search/search.xml";
const agent = new Agent({ connect: { rejectUnauthorized: false } });
const apiFetch = (url: string) =>
  undiciFetch(url, { dispatcher: agent }) as unknown as ReturnType<typeof fetch>;

export interface DbpiaArticle {
  title: string;
  authors: string;
  publisher: string;
  publication: string;
  issueDate: string;
  pages: string;
  linkUrl: string;
  preview: string;
  dregName: string;
}

export interface DbpiaSearchResult {
  totalCount: number;
  pageCount: number;
  pageNumber: number;
  items: DbpiaArticle[];
}

function text(node: any): string {
  if (!node) return "";
  if (typeof node === "string") return node.trim();
  if (typeof node === "object" && node._) return node._.trim();
  if (typeof node === "object" && node.name) return text(node.name);
  return String(node).trim();
}

function stripHighlight(s: string): string {
  return s.replace(/<!HS>/g, "").replace(/<!HE>/g, "");
}

function parseItem(item: any): DbpiaArticle {
  // authors: { author: { name } } 또는 { author: [{ name }, ...] }
  let authorNames = "";
  const authorsNode = item?.authors;
  if (authorsNode) {
    let authorList = authorsNode.author;
    if (!Array.isArray(authorList)) authorList = authorList ? [authorList] : [];
    authorNames = authorList.map((a: any) => text(a?.name)).filter(Boolean).join(", ");
  }

  return {
    title: stripHighlight(text(item?.title)),
    authors: stripHighlight(authorNames),
    publisher: stripHighlight(text(item?.publisher?.name)),
    publication: stripHighlight(text(item?.publication?.name)),
    issueDate: text(item?.issue?.yymm),
    pages: text(item?.pages),
    linkUrl: text(item?.link_url),
    preview: text(item?.preview),
    dregName: text(item?.dreg_name),
  };
}

export class DbpiaClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request(params: Record<string, string>): Promise<any> {
    const url = new URL(BASE_URL);
    url.searchParams.set("key", this.apiKey);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }

    const res = await apiFetch(url.toString());
    if (!res.ok) throw new Error(`DBpia API Error: HTTP ${res.status}`);

    const xml = await res.text();
    const parsed = await parseStringPromise(xml, { explicitArray: false, trim: true });

    if (parsed?.error) {
      throw new Error(`DBpia Error: ${parsed.error.message || JSON.stringify(parsed.error)}`);
    }

    return parsed;
  }

  private parseResult(data: any): DbpiaSearchResult {
    const root = data?.root;
    const paramdata = root?.paramdata;
    const totalCount = Number(text(paramdata?.totalcount)) || 0;
    const pageCount = Number(text(paramdata?.pagecount)) || 20;
    const pageNumber = Number(text(paramdata?.pagenumber)) || 1;

    let rawItems = root?.result?.items?.item || [];
    if (!Array.isArray(rawItems)) rawItems = rawItems ? [rawItems] : [];

    const items: DbpiaArticle[] = rawItems.map(parseItem);
    return { totalCount, pageCount, pageNumber, items };
  }

  async search(
    query: string,
    options: {
      pageCount?: number;
      pageNumber?: number;
      sortType?: 1 | 2 | 3;
      category?: number;
    } = {}
  ): Promise<DbpiaSearchResult> {
    const data = await this.request({
      target: "se",
      searchall: query,
      pagecount: String(options.pageCount ?? 20),
      pagenumber: String(options.pageNumber ?? 1),
      sorttype: String(options.sortType ?? 2),
      ...(options.category ? { category: String(options.category) } : {}),
    });
    return this.parseResult(data);
  }

  async advancedSearch(
    options: {
      searchall?: string;
      searchauthor?: string;
      searchbook?: string;
      searchpublisher?: string;
      itype?: 1 | 2 | 3 | 4;
      category?: number;
      pyear?: 1 | 2 | 3;
      pyearStart?: string;
      pyearEnd?: string;
      pageCount?: number;
      pageNumber?: number;
      sortType?: 1 | 2 | 3;
    } = {}
  ): Promise<DbpiaSearchResult> {
    const params: Record<string, string> = {
      target: "se_adv",
      pagecount: String(options.pageCount ?? 20),
      pagenumber: String(options.pageNumber ?? 1),
      sorttype: String(options.sortType ?? 2),
    };

    if (options.searchall) params.searchall = options.searchall;
    if (options.searchauthor) params.searchauthor = options.searchauthor;
    if (options.searchbook) params.searchbook = options.searchbook;
    if (options.searchpublisher) params.searchpublisher = options.searchpublisher;
    if (options.itype) params.itype = String(options.itype);
    if (options.category) params.category = String(options.category);
    if (options.pyear) params.pyear = String(options.pyear);
    if (options.pyearStart) params.pyear_start = options.pyearStart;
    if (options.pyearEnd) params.pyear_end = options.pyearEnd;

    const data = await this.request(params);
    return this.parseResult(data);
  }

  async getPopular(options: { year?: number; month?: number; category?: number } = {}): Promise<DbpiaSearchResult> {
    const params: Record<string, string> = { target: "rated_art" };
    if (options.year) params.pyear = String(options.year);
    if (options.month) params.pmonth = String(options.month);
    if (options.category) params.category = String(options.category);

    const data = await this.request(params);
    return this.parseResult(data);
  }
}
