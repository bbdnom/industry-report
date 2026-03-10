/**
 * KDI (한국개발연구원) OpenAPI 클라이언트
 * - 경제전망(cd=C) 카테고리 활용
 * - 거시경제 동향, 산업 키워드 관련 정책 보고서 검색
 */

import { fetch as undiciFetch, Agent } from "undici";

const BASE_URL = "https://www.kdi.re.kr/KDIOpenAPI";

// ISU GROUP SSL 프록시 우회
const sslAgent = new Agent({ connect: { rejectUnauthorized: false } });

export interface KdiItem {
  title: string;
  titleEn: string;
  date: string;
  summary: string;
  keyword: string;
  detailPage: string;
  content: string;
  pubNo: string;
}

export interface KdiResponse {
  totalCount: number;
  items: KdiItem[];
}

function stripHtml(s: string): string {
  return s.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim();
}

export class KdiClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * KDI 경제전망 검색
   * @param keyword 검색어 (없으면 전체 목록)
   * @param options srhKey: ALL|TITLE|NAME|CONTENT
   */
  async search(
    keyword?: string,
    options: { srhKey?: "ALL" | "TITLE" | "NAME" | "CONTENT" } = {}
  ): Promise<KdiResponse> {
    const params = new URLSearchParams({
      type: "json",
      apiKey: this.apiKey,
      cd: "C",
    });

    if (keyword) {
      params.set("srhKey", options.srhKey || "ALL");
      params.set("srhValue", keyword);
    }

    const url = `${BASE_URL}?${params.toString()}`;

    try {
      const res = await undiciFetch(url, {
        dispatcher: sslAgent,
      });

      const text = (await res.text()).trim();
      if (!text || text === "null" || text.length < 3) {
        return { totalCount: 0, items: [] };
      }

      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        return { totalCount: 0, items: [] };
      }
      const archives = data?.ARCHIVE;
      if (!archives || !Array.isArray(archives)) {
        return { totalCount: 0, items: [] };
      }

      const items: KdiItem[] = archives.map((a: any) => ({
        title: a.PUB_NM_KORN || "",
        titleEn: a.PUB_NM_ENG || "",
        date: a.ISSU_DT || "",
        summary: stripHtml(a.PUB_KEYWORD || ""),
        keyword: a.TOPIC_ARR || "",
        detailPage: a.DETAIL_PAGE || "",
        content: stripHtml(a.PUB_CN || ""),
        pubNo: a.PUB_NO || "",
      }));

      return { totalCount: items.length, items };
    } catch (e) {
      console.error("KDI API error:", e);
      return { totalCount: 0, items: [] };
    }
  }

  /**
   * 최신 경제전망 가져오기 (검색어 없이 최신순)
   */
  async getLatest(limit = 5): Promise<KdiResponse> {
    const result = await this.search();
    return {
      totalCount: Math.min(result.totalCount, limit),
      items: result.items.slice(0, limit),
    };
  }
}
