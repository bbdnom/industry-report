import express from "express";
import cors from "cors";
import path from "path";
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { DbpiaClient } from "./lib-dbpia.js";
import { NaverClient } from "./lib-naver.js";
import { NewsClient } from "./lib-news.js";

const app = express();
const PORT = process.env.PORT ?? 3002;
const isProd = process.env.NODE_ENV === "production";

app.use(cors());
app.use(express.json());

const dbpia = new DbpiaClient(process.env.DBPIA_API_KEY!);
const naver = new NaverClient(process.env.NAVER_CLIENT_ID!, process.env.NAVER_CLIENT_SECRET!);
const newsApi = new NewsClient(process.env.NEWS_API_KEY!);

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

// ── 산업 키워드 매핑 ──
const INDUSTRY_KEYWORDS: Record<string, { kr: string[]; en: string[]; sub: string[] }> = {
  "it-sw-ai": {
    kr: ["인공지능", "AI", "소프트웨어", "클라우드", "SaaS", "생성AI", "LLM", "머신러닝", "데이터분석", "디지털전환"],
    en: ["artificial intelligence", "software", "cloud computing", "SaaS", "generative AI", "LLM", "machine learning"],
    sub: ["생성형 AI / LLM", "클라우드 / SaaS", "데이터 분석 / MLOps", "사이버보안", "디지털 전환"],
  },
  "semiconductor": {
    kr: ["반도체", "파운드리", "메모리", "HBM", "시스템반도체", "패키징", "EUV", "NAND", "DRAM", "웨이퍼"],
    en: ["semiconductor", "foundry", "HBM", "memory chip", "advanced packaging", "EUV lithography", "NAND", "DRAM"],
    sub: ["메모리 반도체", "시스템 반도체", "파운드리", "후공정 / 패키징", "장비 / 소재"],
  },
  "auto-mobility": {
    kr: ["자동차", "전기차", "자율주행", "모빌리티", "SDV", "배터리", "충전인프라", "커넥티드카"],
    en: ["electric vehicle", "autonomous driving", "mobility", "SDV", "EV battery", "connected car"],
    sub: ["전기차 / xEV", "자율주행", "SDV / 소프트웨어정의차량", "충전 인프라", "모빌리티 서비스"],
  },
  "battery-energy": {
    kr: ["이차전지", "배터리", "리튬", "양극재", "음극재", "전고체", "ESS", "태양광", "풍력", "수소", "탄소중립"],
    en: ["lithium battery", "cathode", "solid-state battery", "ESS", "solar energy", "hydrogen", "carbon neutral"],
    sub: ["리튬이온 배터리", "전고체 배터리", "양극재 / 음극재", "ESS / 에너지저장", "태양광 / 풍력", "수소 에너지"],
  },
  "bio-healthcare": {
    kr: ["바이오", "제약", "신약", "항체", "세포치료", "유전자치료", "디지털헬스", "의료기기", "임상시험"],
    en: ["biotech", "pharmaceutical", "antibody drug", "cell therapy", "gene therapy", "digital health", "medical device"],
    sub: ["항체 / 바이오의약품", "세포·유전자 치료", "디지털 헬스케어", "의료기기", "임상 / 규제"],
  },
  "chemical-material": {
    kr: ["화학", "석유화학", "소재", "부품", "정밀화학", "특수화학", "탄소소재", "2차전지소재", "고분자"],
    en: ["petrochemical", "specialty chemical", "advanced material", "carbon material", "polymer"],
    sub: ["석유화학", "정밀 / 특수화학", "2차전지 소재", "탄소 / 신소재", "전자소재"],
  },
  "finance-fintech": {
    kr: ["금융", "핀테크", "디지털금융", "가상자산", "블록체인", "인슈어테크", "오픈뱅킹", "CBDC"],
    en: ["fintech", "digital finance", "blockchain", "cryptocurrency", "insurtech", "open banking", "CBDC"],
    sub: ["디지털 뱅킹", "가상자산 / 블록체인", "인슈어테크", "결제 / 페이", "자산관리 / 웰스테크"],
  },
  "retail-ecommerce": {
    kr: ["유통", "이커머스", "소비재", "라이브커머스", "퀵커머스", "D2C", "리테일테크", "옴니채널"],
    en: ["e-commerce", "retail tech", "live commerce", "quick commerce", "D2C", "omnichannel"],
    sub: ["이커머스 / 온라인유통", "라이브커머스", "퀵커머스", "D2C / 브랜드", "리테일 테크"],
  },
  "media-content": {
    kr: ["미디어", "콘텐츠", "게임", "OTT", "웹툰", "메타버스", "XR", "숏폼", "크리에이터"],
    en: ["media", "content", "gaming", "OTT streaming", "webtoon", "metaverse", "XR", "creator economy"],
    sub: ["OTT / 스트리밍", "게임", "웹툰 / 웹소설", "메타버스 / XR", "크리에이터 이코노미"],
  },
  "construction-realestate": {
    kr: ["건설", "부동산", "인프라", "스마트시티", "모듈러건축", "프롭테크", "도시재생"],
    en: ["construction", "real estate", "smart city", "modular construction", "proptech", "urban renewal"],
    sub: ["주택 / 부동산", "인프라 / SOC", "스마트시티", "프롭테크", "도시재생"],
  },
  "logistics-shipping": {
    kr: ["물류", "해운", "항공", "택배", "풀필먼트", "스마트물류", "자율배송", "드론배송"],
    en: ["logistics", "shipping", "air freight", "fulfillment", "smart logistics", "autonomous delivery"],
    sub: ["해운 / 컨테이너", "항공물류", "택배 / 라스트마일", "풀필먼트", "스마트 물류"],
  },
  "food-agri": {
    kr: ["식품", "농업", "푸드테크", "대체식품", "스마트팜", "배양육", "식품안전"],
    en: ["food tech", "agriculture", "alternative protein", "smart farm", "cultured meat", "food safety"],
    sub: ["푸드테크", "대체식품 / 배양육", "스마트팜", "식품 안전 / 규제", "농업 기술"],
  },
  "education": {
    kr: ["교육", "에듀테크", "온라인교육", "AI교육", "평생교육", "직업훈련"],
    en: ["education technology", "edtech", "online learning", "AI education", "lifelong learning"],
    sub: ["K-12 에듀테크", "대학 / 고등교육", "직업 / 평생교육", "AI 기반 학습", "교육 콘텐츠"],
  },
  "manufacturing": {
    kr: ["제조", "스마트팩토리", "산업장비", "로봇", "자동화", "디지털트윈", "3D프린팅", "CNC"],
    en: ["smart factory", "industrial robot", "automation", "digital twin", "3D printing", "Industry 4.0"],
    sub: ["스마트팩토리", "산업용 로봇", "자동화 / FA", "디지털트윈", "적층제조 / 3D프린팅"],
  },
  "telecom-cloud": {
    kr: ["통신", "5G", "6G", "네트워크", "클라우드", "엣지컴퓨팅", "IDC", "데이터센터"],
    en: ["telecom", "5G", "6G", "network", "cloud", "edge computing", "data center"],
    sub: ["5G / 6G", "클라우드 인프라", "데이터센터 / IDC", "엣지 컴퓨팅", "네트워크 장비"],
  },
  "new-industry": {
    kr: ["우주항공", "양자컴퓨팅", "합성생물학", "핵융합", "뉴로모픽"],
    en: ["space", "quantum computing", "synthetic biology", "fusion energy", "neuromorphic"],
    sub: ["우주항공", "양자컴퓨팅", "합성생물학", "핵융합", "뉴로모픽 컴퓨팅"],
  },
};

function decodeHtml(str: string) {
  return str
    .replace(/<\/?b>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}

// ── API 라우트 ──

app.get("/api/categories", (_req, res) => {
  res.json([
    { id: "it-sw-ai", label: "IT / 소프트웨어 / AI" },
    { id: "semiconductor", label: "반도체 / 전자부품" },
    { id: "auto-mobility", label: "자동차 / 모빌리티" },
    { id: "battery-energy", label: "이차전지 / 에너지 / 친환경" },
    { id: "bio-healthcare", label: "바이오 / 헬스케어 / 제약" },
    { id: "chemical-material", label: "화학 / 소재 / 부품" },
    { id: "finance-fintech", label: "금융 / 핀테크" },
    { id: "retail-ecommerce", label: "유통 / 이커머스 / 소비재" },
    { id: "media-content", label: "미디어 / 콘텐츠 / 게임" },
    { id: "construction-realestate", label: "건설 / 부동산 / 인프라" },
    { id: "logistics-shipping", label: "물류 / 해운 / 항공" },
    { id: "food-agri", label: "식품 / 농업 / 푸드테크" },
    { id: "education", label: "교육 / 에듀테크" },
    { id: "manufacturing", label: "제조 / 스마트팩토리 / 산업장비" },
    { id: "telecom-cloud", label: "통신 / 네트워크 / 클라우드" },
    { id: "new-industry", label: "기타 신산업" },
  ]);
});

app.get("/api/keywords", (req, res) => {
  const industry = req.query.industry as string;
  const kw = INDUSTRY_KEYWORDS[industry];
  if (!kw) return res.status(400).json({ error: "잘못된 산업 카테고리" });
  res.json({ kr: kw.kr, en: kw.en, subFields: kw.sub });
});

// 데이터 수집 함수
async function collectData(searchKr: string[], searchEn: string[]) {
  const krMainQuery = searchKr.slice(0, 4).join(" OR ");
  const krTrendQuery = searchKr.slice(0, 3).join(" ") + " 동향 전망";
  const krPolicyQuery = searchKr[0] + " 정책 규제";
  const krInvestQuery = searchKr[0] + " 투자 시장 성장";
  const krCompanyQuery = searchKr.slice(0, 2).join(" ") + " 기업 실적 전략";
  const enMainQuery = searchEn.slice(0, 3).join(" OR ");
  const enTrendQuery = searchEn[0] + " market trend outlook 2025 2026";

  const [
    papersResult, papersTrendResult,
    domesticNewsResult, domesticTrendResult, domesticPolicyResult,
    domesticInvestResult, domesticCompanyResult,
    globalNewsResult, globalTrendResult,
  ] = await Promise.allSettled([
    dbpia.search(searchKr.slice(0, 3).join(" "), { pageCount: 20, sortType: 2 }),
    dbpia.search(krTrendQuery, { pageCount: 15, sortType: 2 }),
    naver.searchNews(krMainQuery, { display: 30, sort: "date" }),
    naver.searchNews(krTrendQuery, { display: 20, sort: "date" }),
    naver.searchNews(krPolicyQuery, { display: 15, sort: "date" }),
    naver.searchNews(krInvestQuery, { display: 15, sort: "date" }),
    naver.searchNews(krCompanyQuery, { display: 15, sort: "date" }),
    newsApi.searchEverything(enMainQuery, { language: "en", pageSize: 30, sortBy: "publishedAt" }),
    newsApi.searchEverything(enTrendQuery, { language: "en", pageSize: 20, sortBy: "relevancy" }),
  ]);

  const papers = papersResult.status === "fulfilled" ? papersResult.value : { totalCount: 0, items: [] };
  const papersTrend = papersTrendResult.status === "fulfilled" ? papersTrendResult.value : { totalCount: 0, items: [] };
  const decodeNews = (r: PromiseSettledResult<any>) =>
    r.status === "fulfilled"
      ? r.value.items.map((n: any) => ({ ...n, title: decodeHtml(n.title), description: decodeHtml(n.description) }))
      : [];
  const domesticNews = [
    ...decodeNews(domesticNewsResult),
    ...decodeNews(domesticInvestResult),
    ...decodeNews(domesticCompanyResult),
  ];
  // 제목 기준 중복 제거
  const seenTitles = new Set<string>();
  const dedup = (arr: any[]) => arr.filter((n: any) => {
    const key = n.title.slice(0, 30);
    if (seenTitles.has(key)) return false;
    seenTitles.add(key);
    return true;
  });
  const domesticNewsDeduped = dedup(domesticNews);
  const domesticTrend = dedup(decodeNews(domesticTrendResult));
  const domesticPolicy = dedup(decodeNews(domesticPolicyResult));
  const globalRaw = [
    ...(globalNewsResult.status === "fulfilled" ? (globalNewsResult.value as any).articles || [] : []),
    ...(globalTrendResult.status === "fulfilled" ? (globalTrendResult.value as any).articles || [] : []),
  ].filter((a: any) => a.title !== "[Removed]");
  const globalSeen = new Set<string>();
  const globalNews = globalRaw.filter((a: any) => {
    const key = a.title.slice(0, 30);
    if (globalSeen.has(key)) return false;
    globalSeen.add(key);
    return true;
  });

  return { papers, papersTrend, domesticNews: domesticNewsDeduped, domesticTrend, domesticPolicy, globalNews };
}

// 키워드 빈도 분석 기반 보고서 생성 (LLM 없이)
function generateLocalReport(industryLabel: string, subField: string | null, data: any): string {
  const allNews = [...data.domesticNews, ...data.domesticTrend];
  const policyNews = data.domesticPolicy;
  const globalNews = data.globalNews;
  const allPapers = [...data.papers.items, ...data.papersTrend.items];

  // 키워드 빈도 추출
  const allText = [
    ...allNews.map((n: any) => `${n.title} ${n.description}`),
    ...globalNews.map((n: any) => `${n.title} ${n.description || ""}`),
    ...allPapers.map((p: any) => p.title),
  ].join(" ");

  const stopWords = new Set(["있는", "하는", "되는", "위한", "대한", "통한", "관련", "에서", "으로", "것으로", "이상", "이하", "the", "and", "for", "with", "from", "that", "this", "are", "was", "has", "have", "been", "will", "can", "not", "its", "but", "also"]);
  const words = allText.replace(/[^\w가-힣\s]/g, " ").split(/\s+/).filter(w => w.length >= 2 && !stopWords.has(w.toLowerCase()));
  const freq: Record<string, number> = {};
  words.forEach(w => { freq[w] = (freq[w] || 0) + 1; });
  const topKeywords = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([w]) => w);

  const focusNote = subField ? ` 특히 '${subField}' 분야를 중심으로 분석하였다.` : "";

  // 뉴스 요약 블록 생성 (제목+설명 결합)
  const newsBlocks = allNews.slice(0, 8).map((n: any) => {
    const desc = n.description?.trim() ? ` ${n.description.trim()}` : "";
    return `- **${n.title}**${desc}`;
  }).join("\n");

  const trendBlocks = data.domesticTrend.slice(0, 6).map((n: any) => {
    const desc = n.description?.trim() ? ` ${n.description.trim()}` : "";
    return `- **${n.title}**${desc}`;
  }).join("\n");

  const policyBlocks = policyNews.slice(0, 6).map((n: any) => {
    const desc = n.description?.trim() ? ` ${n.description.trim()}` : "";
    return `- **${n.title}**${desc}`;
  }).join("\n") || "- 확인 가능한 최신 정책/규제 자료 부족";

  const globalBlocks = globalNews.slice(0, 8).map((n: any) => {
    const desc = n.description?.trim() ? ` ${n.description.trim()}` : "";
    return `- **${n.title}** (${n.source?.name || "글로벌"})${desc}`;
  }).join("\n") || "- 확인 가능한 최신 글로벌 자료 부족";

  const paperBlocks = allPapers.slice(0, 8).map((p: any) => {
    const meta = [p.authors, p.publication, p.issueDate].filter(Boolean).join(", ");
    return `- **${p.title}** (${meta})`;
  }).join("\n") || "- 확인 가능한 최신 논문 자료 부족";

  return `## 산업 개요

본 보고서는 ${industryLabel} 산업의 최근 동향을 국내외 뉴스 기사 ${allNews.length + globalNews.length}건, 학술논문 ${data.papers.totalCount}건, 정책/규제 기사 ${policyNews.length}건을 바탕으로 분석하였다.${focusNote}

수집된 자료에서 가장 빈번하게 등장하는 핵심 키워드는 ${topKeywords.slice(0, 10).map(k => `**${k}**`).join(", ")} 등이다.

## 최근 핵심 동향

최근 수집된 주요 뉴스와 기사를 종합하면 다음과 같은 동향이 파악된다.

${newsBlocks}

## 시장 전망 및 트렌드

시장 전망과 관련된 주요 보도 내용은 다음과 같다.

${trendBlocks}

## 정책 및 규제 환경

정책 및 규제와 관련된 주요 동향은 다음과 같다.

${policyBlocks}

## 최신 연구 동향

DBpia 학술 데이터베이스에서 수집된 관련 논문 ${data.papers.totalCount}건 중 최신 연구를 정리하면 다음과 같다.

${paperBlocks}

## 글로벌 동향

해외 주요 매체에서 보도된 관련 내용은 다음과 같다.

${globalBlocks}

## 종합 시사점

수집된 ${allNews.length + globalNews.length + allPapers.length + policyNews.length}건의 자료를 종합하면, ${industryLabel} 산업은 현재 **${topKeywords.slice(0, 3).join("**, **")}** 등을 중심으로 빠르게 변화하고 있다. 국내외 정책 환경의 변화와 기술 진보가 산업 구조에 미치는 영향을 지속적으로 모니터링할 필요가 있다.`;
}

// Claude API로 인사이트 보고서 생성
async function generateInsightReport(industryLabel: string, subField: string | null, data: any): Promise<string> {
  if (!anthropic) {
    return generateLocalReport(industryLabel, subField, data);
  }

  // 수집된 데이터를 풍부한 컨텍스트로 변환
  const domesticArticles = data.domesticNews.map((n: any, i: number) =>
    `[국내뉴스-${i + 1}] ${n.title}\n  내용: ${n.description}\n  일시: ${n.pubDate}`
  ).slice(0, 30).join("\n\n");

  const trendArticles = data.domesticTrend.map((n: any, i: number) =>
    `[시장동향-${i + 1}] ${n.title}\n  내용: ${n.description}\n  일시: ${n.pubDate}`
  ).slice(0, 15).join("\n\n");

  const policyArticles = data.domesticPolicy.map((n: any, i: number) =>
    `[정책규제-${i + 1}] ${n.title}\n  내용: ${n.description}\n  일시: ${n.pubDate}`
  ).slice(0, 12).join("\n\n");

  const globalArticles = data.globalNews.map((n: any, i: number) =>
    `[글로벌-${i + 1}] ${n.title} (${n.source?.name || ""})\n  내용: ${n.description || "N/A"}\n  일시: ${n.publishedAt}`
  ).slice(0, 25).join("\n\n");

  const paperDetails = [
    ...data.papers.items,
    ...data.papersTrend.items,
  ].slice(0, 25).map((p: any, i: number) =>
    `[논문-${i + 1}] ${p.title}\n  저자: ${p.authors}\n  학술지: ${p.publication} (${p.publisher})\n  발행: ${p.issueDate}${p.dregName ? `\n  등재: ${p.dregName}` : ""}`
  ).join("\n\n");

  const topicFocus = subField ? `\n\n**분석 초점**: "${subField}" 하위 분야를 중심으로 분석하되, 상위 산업과의 연계성도 함께 다룰 것.` : "";

  const totalSources = data.domesticNews.length + data.domesticTrend.length + data.domesticPolicy.length + data.globalNews.length + data.papers.items.length + data.papersTrend.items.length;

  const prompt = `당신은 맥킨지, BCG 수준의 산업 리서치 시니어 애널리스트다. 아래 수집된 ${totalSources}건의 실시간 뉴스 기사, 학술논문, 정책자료를 **면밀히 분석**하여 "${industryLabel}" 산업에 대한 **심층 인사이트 보고서**를 작성하라.${topicFocus}

━━━━━━━━━━━━━━━━━━━━━━
## 수집된 국내 뉴스 기사
━━━━━━━━━━━━━━━━━━━━━━
${domesticArticles}

━━━━━━━━━━━━━━━━━━━━━━
## 수집된 시장 동향/전망 기사
━━━━━━━━━━━━━━━━━━━━━━
${trendArticles}

━━━━━━━━━━━━━━━━━━━━━━
## 수집된 정책/규제 기사
━━━━━━━━━━━━━━━━━━━━━━
${policyArticles}

━━━━━━━━━━━━━━━━━━━━━━
## 수집된 글로벌 뉴스
━━━━━━━━━━━━━━━━━━━━━━
${globalArticles}

━━━━━━━━━━━━━━━━━━━━━━
## 수집된 학술논문
━━━━━━━━━━━━━━━━━━━━━━
${paperDetails}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 보고서 작성 지침 (반드시 준수)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### 핵심 원칙
- **단순 요약 금지**: 기사를 나열하거나 제목을 반복하는 것은 금지. 여러 소스를 교차 분석하여 패턴, 인과관계, 숨겨진 의미를 도출할 것.
- **인사이트 중심**: "무엇이 일어났는가"보다 "왜 일어났는가", "이것이 의미하는 바는 무엇인가", "앞으로 어떻게 될 것인가"에 초점.
- **데이터 기반 논증**: 기사에서 언급된 구체적 수치, 비율, 금액 등을 적극 인용하여 주장의 근거로 활용.
- **복수 관점 제시**: 낙관론과 비관론을 균형 있게 제시하고, 시나리오별 분석 포함.
- **실무 활용 가능성**: 경영진이 읽고 바로 의사결정에 활용할 수 있는 수준의 구체성.

### 작성 형식 (각 섹션 ## 으로 시작, 풍부하게 작성)

## Executive Summary
- 보고서 전체를 3~4문장으로 압축한 핵심 요약
- 가장 중요한 인사이트 1가지를 명확히 제시

## 산업 구조 및 현황
- 산업의 정의, 범위, 가치사슬을 구체적으로 서술
- 현재 산업이 위치한 사이클 단계 (성장기/성숙기/전환기 등) 판단 및 근거
- 주요 플레이어별 포지셔닝과 경쟁 구도 분석
- 글로벌 vs 국내 시장의 차이점

## 핵심 동향 Deep-Dive
- 수집된 자료에서 가장 임팩트 있는 변화 4~6가지를 **깊이 있게** 분석
- 각 동향에 대해:
  1) 현상 설명 (무엇이 변화했는가)
  2) 원인 분석 (왜 이런 변화가 발생했는가)
  3) 파급 효과 (가치사슬 전반에 미치는 영향)
  4) 수혜/피해 기업 또는 분야
- 동향 간 상호 연관성 분석 (A 변화가 B에 미치는 영향 등)

## 시장 전망 및 시나리오 분석
- 기본 시나리오 (Base Case): 가장 가능성 높은 전개
- 낙관 시나리오 (Bull Case): 상방 요인이 모두 현실화될 경우
- 비관 시나리오 (Bear Case): 하방 리스크가 현실화될 경우
- 각 시나리오의 발생 조건과 시그널
- 기사에서 언급된 구체적 수치(시장 규모, 성장률, 투자 금액 등) 인용

## 정책·규제 환경 분석
- 국내외 규제 변화가 산업에 미치는 실질적 영향 분석
- 정부 지원 정책의 효과성 평가
- 규제 리스크 vs 규제 수혜 프레임으로 분류
- 기업이 선제적으로 대응해야 할 규제 이슈

## 기술·연구 트렌드 인사이트
- 학술논문에서 포착된 기술 발전 방향과 산업화 가능성
- 현재 주류 기술 vs 차세대 기술의 전환 타이밍 예측
- 기술 발전이 산업 구조를 바꿀 수 있는 '게임 체인저' 요소
- R&D 투자 방향에 대한 시사점

## 글로벌 경쟁 지형
- 글로벌 뉴스에서 포착된 해외 동향과 국내 산업에 대한 함의
- 주요국의 전략과 한국의 포지셔닝 비교
- 글로벌 공급망 변화가 국내 기업에 미치는 영향

## 리스크·기회 매트릭스
- 리스크 요인 4~5가지 (발생 가능성 × 영향도 관점에서 서술)
- 기회 요인 4~5가지 (시장 크기 × 실현 가능성 관점에서 서술)
- 각 요인에 대한 구체적 근거와 대응 방안

## 전략적 제언
- 산업 내 포지션별 (대기업/중견기업/스타트업) 차별화된 전략 제안
- 단기(6개월) 실행 과제: 즉시 착수해야 할 3가지
- 중기(1~2년) 전략 방향: 투자 및 역량 확보
- 장기(3~5년) 비전: 산업 구조 변화에 대비한 포지셔닝
- **의사결정자를 위한 핵심 메시지** (3~4문장, 보고서의 결론)

### 문체 및 품질 기준
- 한국어로 작성. 전문적이되 읽기 쉬운 문체.
- 각 섹션은 최소 3~5개 문단 이상으로 풍부하게 작성.
- 단정적 표현 대신 "~로 분석된다", "~할 가능성이 높다" 등 근거 기반 표현 사용.
- 기사 원문의 핵심 수치나 인용구를 적극 활용.
- 섹션 간 논리적 흐름을 유지하고, 앞 섹션의 분석이 뒤 섹션의 근거가 되도록 구성.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8000,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock ? textBlock.text : "보고서 생성 실패";
}

// POST /api/generate - 보고서 생성 (industry, subField?, customQuery?)
app.post("/api/generate", async (req, res) => {
  try {
    const { industry, subField, customQuery } = req.body;

    // 커스텀 검색어가 있으면 그것으로, 없으면 산업 키워드 사용
    let searchKr: string[];
    let searchEn: string[];
    let label: string;

    if (customQuery) {
      searchKr = [customQuery];
      searchEn = [customQuery];
      label = customQuery;
    } else if (industry && INDUSTRY_KEYWORDS[industry]) {
      const kw = INDUSTRY_KEYWORDS[industry];
      // subField가 있으면 해당 하위분야 키워드를 앞에 추가
      if (subField) {
        const sfKeyword = subField.replace(/\s*\/\s*/g, " ").trim();
        searchKr = [sfKeyword, ...kw.kr.slice(0, 3)];
        searchEn = [sfKeyword, ...kw.en.slice(0, 2)];
      } else {
        searchKr = kw.kr;
        searchEn = kw.en;
      }
      label = subField
        ? `${CATEGORIES_MAP[industry]} > ${subField}`
        : CATEGORIES_MAP[industry];
    } else {
      return res.status(400).json({ error: "industry 또는 customQuery가 필요합니다" });
    }

    // 1. 데이터 수집
    const data = await collectData(searchKr, searchEn);

    // 2. AI 인사이트 보고서 생성
    const reportText = await generateInsightReport(label, subField, data);

    // 3. 참고자료 목록 생성
    const references: any[] = [];
    const seen = new Set<string>();
    const addRef = (type: string, title: string, source: string, date: string, url: string) => {
      const key = title.slice(0, 40);
      if (seen.has(key)) return;
      seen.add(key);
      references.push({ type, title, source, date, url });
    };

    data.domesticNews.forEach((n: any) => addRef("news", n.title, "네이버 뉴스", n.pubDate, n.originallink || n.link));
    data.domesticTrend.forEach((n: any) => addRef("trend", n.title, "네이버 뉴스", n.pubDate, n.originallink || n.link));
    data.domesticPolicy.forEach((n: any) => addRef("policy", n.title, "네이버 뉴스", n.pubDate, n.originallink || n.link));
    data.globalNews.forEach((n: any) => addRef("global", n.title, n.source?.name || "", new Date(n.publishedAt).toLocaleDateString("ko-KR"), n.url));
    data.papers.items.forEach((p: any) => addRef("paper", p.title, p.publication || p.publisher, p.issueDate, p.linkUrl));
    data.papersTrend.items.forEach((p: any) => addRef("paper", p.title, p.publication || p.publisher, p.issueDate, p.linkUrl));

    res.json({
      label,
      generatedAt: new Date().toISOString(),
      report: reportText,
      stats: {
        papers: data.papers.totalCount,
        domesticNews: data.domesticNews.length + data.domesticTrend.length,
        policy: data.domesticPolicy.length,
        globalNews: data.globalNews.length,
      },
      references,
    });
  } catch (e: unknown) {
    console.error(e);
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

const CATEGORIES_MAP: Record<string, string> = {
  "it-sw-ai": "IT / 소프트웨어 / AI",
  "semiconductor": "반도체 / 전자부품",
  "auto-mobility": "자동차 / 모빌리티",
  "battery-energy": "이차전지 / 에너지 / 친환경",
  "bio-healthcare": "바이오 / 헬스케어 / 제약",
  "chemical-material": "화학 / 소재 / 부품",
  "finance-fintech": "금융 / 핀테크",
  "retail-ecommerce": "유통 / 이커머스 / 소비재",
  "media-content": "미디어 / 콘텐츠 / 게임",
  "construction-realestate": "건설 / 부동산 / 인프라",
  "logistics-shipping": "물류 / 해운 / 항공",
  "food-agri": "식품 / 농업 / 푸드테크",
  "education": "교육 / 에듀테크",
  "manufacturing": "제조 / 스마트팩토리 / 산업장비",
  "telecom-cloud": "통신 / 네트워크 / 클라우드",
  "new-industry": "기타 신산업",
};

// 기존 GET 호환 유지
app.get("/api/generate", async (req, res) => {
  const industry = req.query.industry as string;
  const subField = req.query.subField as string || null;
  const customQuery = req.query.q as string || null;

  // POST로 리다이렉트
  const fakeReq = { body: { industry, subField, customQuery } } as any;
  const handler = app._router?.stack?.find((s: any) => s.route?.path === "/api/generate" && s.route?.methods?.post);
  if (handler) {
    return handler.route.stack[0].handle(fakeReq, res, () => {});
  }

  // fallback
  res.status(500).json({ error: "Internal routing error" });
});

app.get("/api/search", async (req, res) => {
  try {
    const q = req.query.q as string;
    if (!q) return res.status(400).json({ error: "검색어(q)를 입력해주세요" });
    const page = Number(req.query.page) || 1;
    const sort = Number(req.query.sort) || 2;
    const count = Number(req.query.count) || 20;
    const data = await dbpia.search(q, { pageNumber: page, pageCount: count, sortType: sort as 1 | 2 | 3 });
    res.json(data);
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// ── 프로덕션: 정적 파일 서빙 ──
if (isProd) {
  const distPath = path.join(process.cwd(), "client/dist");
  app.use(express.static(distPath));
  app.get("/{*splat}", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`Industry Report server running on http://localhost:${PORT}`);
  if (!anthropic) console.warn("⚠ ANTHROPIC_API_KEY 미설정 - AI 보고서 생성 불가");
});
