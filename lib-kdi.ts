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
  category?: string;
}

export interface KdiResponse {
  totalCount: number;
  items: KdiItem[];
}

function stripHtml(s: string): string {
  return s.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim();
}

export type KdiCategory = "A" | "B" | "C" | "D" | "E";

const CATEGORY_LABELS: Record<KdiCategory, string> = {
  A: "연구보고서",
  B: "KDI FOCUS",
  C: "경제전망",
  D: "경제동향",
  E: "학술저널",
};

export class KdiClient {
  private keys: Partial<Record<KdiCategory, string>>;

  constructor(keys: Partial<Record<KdiCategory, string>>) {
    this.keys = keys;
  }

  /**
   * 특정 카테고리 검색
   */
  async search(
    cd: KdiCategory,
    keyword?: string,
    options: { srhKey?: "ALL" | "TITLE" | "NAME" | "CONTENT" } = {}
  ): Promise<KdiResponse> {
    const apiKey = this.keys[cd];
    if (!apiKey) return { totalCount: 0, items: [] };

    const params = new URLSearchParams({
      type: "json",
      apiKey,
      cd,
    });

    if (keyword) {
      params.set("srhKey", options.srhKey || "ALL");
      params.set("srhValue", keyword);
    }

    const url = `${BASE_URL}?${params.toString()}`;

    try {
      const res = await undiciFetch(url, { dispatcher: sslAgent });
      const text = (await res.text()).trim();
      if (!text || text === "null" || text.length < 3) {
        return { totalCount: 0, items: [] };
      }

      let data: any;
      try { data = JSON.parse(text); } catch { return { totalCount: 0, items: [] }; }

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
        category: CATEGORY_LABELS[cd],
      }));

      return { totalCount: items.length, items };
    } catch (e) {
      console.error(`KDI API error (cd=${cd}):`, e);
      return { totalCount: 0, items: [] };
    }
  }

  /**
   * 모든 카테고리에서 병렬 검색
   */
  async searchAll(
    keyword?: string,
    options: { srhKey?: "ALL" | "TITLE" | "NAME" | "CONTENT" } = {}
  ): Promise<KdiResponse> {
    const categories = Object.keys(this.keys) as KdiCategory[];
    const results = await Promise.allSettled(
      categories.map(cd => this.search(cd, keyword, options))
    );

    const allItems: KdiItem[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") allItems.push(...r.value.items);
    }

    // pubNo 기준 중복 제거
    const seen = new Set<string>();
    const unique = allItems.filter(item => {
      if (seen.has(item.pubNo)) return false;
      seen.add(item.pubNo);
      return true;
    });

    return { totalCount: unique.length, items: unique };
  }

  /**
   * 모든 카테고리에서 최신 자료 가져오기
   */
  async getLatest(limit = 5): Promise<KdiResponse> {
    const result = await this.searchAll();
    const sorted = result.items.sort((a, b) => b.date.localeCompare(a.date));
    return {
      totalCount: Math.min(sorted.length, limit),
      items: sorted.slice(0, limit),
    };
  }
}
