import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import { saveAs } from "file-saver";

async function fetchJson(url: string, opts?: RequestInit) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

interface Category { id: string; label: string; sub: string[] }
interface Reference {
  type: string; title: string; source: string; date: string; url: string;
}
interface ReportResult {
  label: string; generatedAt: string; report: string;
  stats: { papers: number; domesticNews: number; policy: number; globalNews: number };
  references: Reference[];
}

// 마크다운 → 간단 렌더링
function ReportBody({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: JSX.Element[] = [];

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) {
      elements.push(<div key={i} className="h-3" />);
    } else if (trimmed.startsWith("## ")) {
      elements.push(
        <h2 key={i} className="text-lg font-bold text-white mt-8 mb-3 pb-2 border-b border-slate-800">
          {trimmed.replace("## ", "")}
        </h2>
      );
    } else if (trimmed.startsWith("### ")) {
      elements.push(
        <h3 key={i} className="text-base font-semibold text-blue-400 mt-5 mb-2">
          {trimmed.replace("### ", "")}
        </h3>
      );
    } else if (trimmed.startsWith("- ")) {
      elements.push(
        <div key={i} className="flex gap-2 pl-2 mb-1.5">
          <span className="text-slate-600 shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-slate-600" />
          <span className="text-sm text-slate-300 leading-relaxed">{renderBold(trimmed.slice(2))}</span>
        </div>
      );
    } else if (/^\d+\.\s/.test(trimmed)) {
      const num = trimmed.match(/^(\d+)\.\s/)?.[1];
      elements.push(
        <div key={i} className="flex gap-2 pl-2 mb-1.5">
          <span className="text-blue-400 text-sm font-semibold shrink-0">{num}.</span>
          <span className="text-sm text-slate-300 leading-relaxed">{renderBold(trimmed.replace(/^\d+\.\s/, ""))}</span>
        </div>
      );
    } else {
      elements.push(
        <p key={i} className="text-sm text-slate-300 leading-relaxed mb-2">{renderBold(trimmed)}</p>
      );
    }
  });

  return <div>{elements}</div>;
}

function renderBold(text: string): (string | JSX.Element)[] {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1
      ? <strong key={i} className="text-white font-semibold">{part}</strong>
      : part
  );
}

// Word 다운로드
async function downloadWord(report: ReportResult) {
  const lines = report.report.split("\n");
  const paragraphs: Paragraph[] = [
    new Paragraph({
      text: `${report.label} 산업동향 초안`,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      children: [new TextRun({ text: `생성일: ${new Date(report.generatedAt).toLocaleDateString("ko-KR")} | 수집 논문 ${report.stats.papers.toLocaleString()}건, 뉴스 ${report.stats.domesticNews + report.stats.globalNews}건`, size: 20, color: "888888" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    }),
  ];

  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) {
      paragraphs.push(new Paragraph({ text: "", spacing: { after: 100 } }));
    } else if (trimmed.startsWith("## ")) {
      paragraphs.push(new Paragraph({
        text: trimmed.replace("## ", ""),
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
      }));
    } else if (trimmed.startsWith("### ")) {
      paragraphs.push(new Paragraph({
        text: trimmed.replace("### ", ""),
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 150 },
      }));
    } else if (trimmed.startsWith("- ")) {
      paragraphs.push(new Paragraph({
        children: parseBoldRuns(trimmed.slice(2)),
        bullet: { level: 0 },
        spacing: { after: 80 },
      }));
    } else if (/^\d+\.\s/.test(trimmed)) {
      paragraphs.push(new Paragraph({
        children: parseBoldRuns(trimmed),
        spacing: { after: 80 },
      }));
    } else {
      paragraphs.push(new Paragraph({
        children: parseBoldRuns(trimmed),
        spacing: { after: 100 },
      }));
    }
  });

  // 참고자료 섹션
  paragraphs.push(new Paragraph({
    text: "참고자료",
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 600, after: 200 },
  }));
  report.references.forEach((ref, i) => {
    const typeLabel = ref.type === "paper" ? "[논문]" : ref.type === "policy" ? "[정책]" : ref.type === "global" ? "[글로벌]" : "[뉴스]";
    paragraphs.push(new Paragraph({
      children: [
        new TextRun({ text: `${i + 1}. ${typeLabel} `, size: 18, color: "666666" }),
        new TextRun({ text: ref.title, size: 18 }),
        new TextRun({ text: ` - ${ref.source}, ${ref.date}`, size: 18, color: "888888" }),
      ],
      spacing: { after: 60 },
    }));
  });

  paragraphs.push(new Paragraph({
    children: [new TextRun({ text: "\n본 보고서는 DBpia, 네이버 뉴스, NewsAPI 데이터를 기반으로 AI가 자동 생성하였습니다.", size: 18, color: "999999", italics: true })],
    spacing: { before: 400 },
  }));

  const doc = new Document({ sections: [{ children: paragraphs }] });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${report.label}_산업동향초안_${new Date().toISOString().slice(0, 10)}.docx`);
}

function parseBoldRuns(text: string): TextRun[] {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return parts.map((part, i) =>
    new TextRun({ text: part, bold: i % 2 === 1, size: 22 })
  );
}

// PDF 다운로드 (브라우저 인쇄)
function downloadPDF() {
  window.print();
}

// PPT 다운로드 (상태 관리는 컴포넌트 내부에서)

export default function App() {
  const [industry, setIndustry] = useState("");
  const [subField, setSubField] = useState<string | null>(null);
  const [customQuery, setCustomQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [pptLoading, setPptLoading] = useState(false);
  const [reportKey, setReportKey] = useState("");
  const [loadingStep, setLoadingStep] = useState(0);
  const reportRef = useRef<HTMLDivElement>(null);

  const LOADING_MESSAGES = [
    "뉴스 기사를 수집하고 있습니다...",
    "학술 논문을 검색하고 있습니다...",
    "정책·규제 자료를 확인하고 있습니다...",
    "경제전망 데이터를 조회하고 있습니다...",
    "글로벌 이슈를 탐색하고 있습니다...",
    "수집된 데이터를 종합 분석하고 있습니다...",
    "AI가 인사이트 보고서를 작성하고 있습니다...",
    "보고서 품질을 검토하고 있습니다...",
    "거의 완료되었습니다. 잠시만 기다려주세요...",
  ];

  const { data: categories } = useQuery<Category[]>({
    queryKey: ["categories"],
    queryFn: () => fetchJson("/api/categories"),
  });

  const selectedCategory = categories?.find(c => c.id === industry);

  const { data: report, isLoading, error } = useQuery<ReportResult>({
    queryKey: ["report", reportKey],
    queryFn: () => fetchJson("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        industry: customQuery ? null : industry,
        subField,
        customQuery: customQuery || null,
      }),
    }),
    enabled: !!reportKey && generating,
  });

  useEffect(() => {
    if (!generating || !isLoading) {
      setLoadingStep(0);
      return;
    }
    const interval = setInterval(() => {
      setLoadingStep((prev) => Math.min(prev + 1, LOADING_MESSAGES.length - 1));
    }, 5000);
    return () => clearInterval(interval);
  }, [generating, isLoading]);

  function handleGenerate() {
    if (!industry && !customQuery) return;
    setReportKey(`${industry}-${subField}-${customQuery}-${Date.now()}`);
    setGenerating(true);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchInput.trim()) return;
    setCustomQuery(searchInput.trim());
    setIndustry("");
    setSubField(null);
    setReportKey(`custom-${searchInput.trim()}-${Date.now()}`);
    setGenerating(true);
  }

  function selectCategory(catId: string) {
    setIndustry(catId);
    setSubField(null);
    setCustomQuery("");
    setGenerating(false);
    setReportKey("");
  }

  function selectSubField(sf: string) {
    if (subField === sf) {
      setSubField(null);
    } else {
      setSubField(sf);
    }
    setGenerating(false);
    setReportKey("");
  }

  const loading = isLoading && generating;

  return (
    <div className="min-h-screen bg-slate-950">
      {/* 헤더 */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-10 print:hidden">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <h1 className="text-lg font-bold text-white">산업동향 초안 생성(Claude Code Ver.)</h1>
          <p className="text-xs text-slate-500">AI 기반 산업 리서치 리포트</p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* ── 입력 영역 ── */}
        <div className="bg-slate-900 rounded-2xl p-5 border border-slate-800 mb-6 print:hidden">
          {/* 직접 검색 */}
          <form onSubmit={handleSearch} className="flex gap-2 mb-5">
            <input type="text" value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="직접 검색 (예: 전고체 배터리, 자율주행 라이다, 탄소중립)"
              className="bg-slate-800 border border-slate-700 text-white px-4 py-2.5 rounded-lg text-sm focus:outline-none focus:border-blue-500 flex-1" />
            <button type="submit"
              className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2.5 rounded-lg text-sm transition-colors shrink-0">
              검색
            </button>
          </form>

          {/* 카테고리 */}
          <label className="block text-xs font-semibold text-slate-400 mb-2">산업 카테고리</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 mb-4">
            {categories?.map((cat) => (
              <button key={cat.id} onClick={() => selectCategory(cat.id)}
                className={`px-3 py-2 rounded-lg text-xs text-left transition-all ${
                  industry === cat.id
                    ? "bg-blue-600 text-white"
                    : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-300"
                }`}>
                {cat.label}
              </button>
            ))}
          </div>

          {/* 세부 카테고리 */}
          {selectedCategory && selectedCategory.sub.length > 0 && (
            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-400 mb-2">세부 분야 (선택)</label>
              <div className="flex flex-wrap gap-1.5">
                {selectedCategory.sub.map((sf) => (
                  <button key={sf} onClick={() => selectSubField(sf)}
                    className={`px-3 py-1.5 rounded-full text-xs transition-all ${
                      subField === sf
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                    }`}>
                    {sf}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 생성 버튼 */}
          <button onClick={handleGenerate}
            disabled={(!industry && !customQuery) || loading}
            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed">
            {loading ? LOADING_MESSAGES[loadingStep] : "보고서 생성"}
          </button>
        </div>

        {/* ── 로딩 ── */}
        {loading && (
          <div className="text-center py-16">
            <div className="inline-block w-10 h-10 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
            <div className="text-slate-400 text-sm transition-all">{LOADING_MESSAGES[loadingStep]}</div>
            <div className="flex justify-center gap-1 mt-3">
              {LOADING_MESSAGES.map((_, i) => (
                <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all ${i <= loadingStep ? "bg-blue-500" : "bg-slate-700"}`} />
              ))}
            </div>
            <div className="text-xs text-slate-600 mt-2">단계 {loadingStep + 1} / {LOADING_MESSAGES.length}</div>
          </div>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 text-red-300 text-sm">
            오류: {(error as Error).message}
          </div>
        )}

        {/* ── 보고서 ── */}
        {report && !loading && (
          <>
            {/* 다운로드 버튼 */}
            <div className="flex flex-wrap gap-3 mb-5 print:hidden">
              <button onClick={downloadPDF}
                className="group px-5 py-2.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-red-900/20 hover:shadow-red-900/40 flex items-center gap-2">
                <svg className="w-4 h-4 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                PDF
              </button>
              <button onClick={() => downloadWord(report)}
                className="group px-5 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-blue-900/20 hover:shadow-blue-900/40 flex items-center gap-2">
                <svg className="w-4 h-4 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                Word
              </button>
              <button
                onClick={async () => {
                  setPptLoading(true);
                  try {
                    const res = await fetch("/api/generate-ppt", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(report),
                    });
                    if (!res.ok) {
                      const err = await res.json().catch(() => ({ error: "PPT 생성 실패" }));
                      alert(err.error || "PPT 생성 실패");
                      return;
                    }
                    const blob = await res.blob();
                    saveAs(blob, `${report.label}_산업동향초안_${new Date().toISOString().slice(0, 10)}.pptx`);
                  } catch (e: any) {
                    alert("PPT 생성 중 오류: " + (e.message || e));
                  } finally {
                    setPptLoading(false);
                  }
                }}
                disabled={pptLoading}
                className="group px-5 py-2.5 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 disabled:from-orange-800 disabled:to-orange-900 disabled:cursor-wait text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-orange-900/20 hover:shadow-orange-900/40 flex items-center gap-2">
                {pptLoading ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    PPT 생성 중...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                    PPT (Beta)
                  </>
                )}
              </button>
            </div>

            <article ref={reportRef} className="bg-slate-900 rounded-2xl border border-slate-800 p-6 md:p-8 print:bg-white print:text-black print:border-0 print:p-0">
              {/* 표지 */}
              <div className="mb-6 pb-5 border-b border-slate-800 print:border-gray-300">
                <div className="text-xs text-blue-400 font-semibold mb-1 print:text-blue-700">INDUSTRY REPORT</div>
                <h1 className="text-2xl md:text-3xl font-bold text-white mb-2 print:text-black">
                  {report.label} 산업동향 초안
                </h1>
                <p className="text-sm text-slate-400 mb-3 print:text-gray-500">
                  {new Date(report.generatedAt).toLocaleDateString("ko-KR")} 기준 | 최근 1년 국내외 동향 분석
                </p>
                <div className="flex gap-4 text-xs text-slate-500 print:text-gray-500">
                  <span>논문 {report.stats.papers.toLocaleString()}건</span>
                  <span>국내뉴스 {report.stats.domesticNews}건</span>
                  <span>정책 {report.stats.policy}건</span>
                  <span>글로벌 {report.stats.globalNews}건</span>
                  {report.stats.kdi > 0 && <span>KDI {report.stats.kdi}건</span>}
                </div>
              </div>

              {/* 본문 */}
              <ReportBody text={report.report} />

              {/* 참고자료 */}
              <div className="mt-10 pt-6 border-t border-slate-800 print:border-gray-300">
                <h2 className="text-sm font-bold text-slate-400 mb-4 print:text-gray-600">
                  참고자료 ({report.references.length}건)
                </h2>
                <div className="space-y-1">
                  {report.references.map((ref, i) => (
                    <div key={i} className="flex gap-2 text-xs">
                      <span className="text-slate-600 shrink-0 w-5 text-right print:text-gray-400">{i + 1}.</span>
                      <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium print:border print:border-gray-300 ${
                        ref.type === "paper" ? "bg-blue-900/50 text-blue-400 print:text-blue-700" :
                        ref.type === "policy" ? "bg-purple-900/50 text-purple-400 print:text-purple-700" :
                        ref.type === "global" ? "bg-amber-900/50 text-amber-400 print:text-amber-700" :
                        "bg-green-900/50 text-green-400 print:text-green-700"
                      }`}>
                        {ref.type === "paper" ? "논문" : ref.type === "policy" ? "정책" : ref.type === "global" ? "글로벌" : "뉴스"}
                      </span>
                      <div className="min-w-0">
                        <a href={ref.url} target="_blank" rel="noopener noreferrer"
                          className="text-slate-300 hover:text-blue-400 transition-colors print:text-black print:no-underline">
                          {ref.title}
                        </a>
                        <span className="text-slate-600 ml-2 print:text-gray-500">{ref.source} | {ref.date}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 푸터 */}
              <div className="mt-8 pt-4 border-t border-slate-800 text-xs text-slate-600 print:border-gray-300 print:text-gray-500">
                <p>본 보고서는 DBpia, 네이버 뉴스, NewsAPI 데이터를 기반으로 AI가 자동 생성하였습니다.</p>
                <p>의사결정 시 원출처 확인 및 추가 검증을 권장합니다.</p>
              </div>
            </article>
          </>
        )}

        {/* 빈 상태 */}
        {!generating && !report && (
          <div className="text-center py-16 text-slate-500">
            <p className="text-lg mb-1">산업을 선택하거나 직접 검색하세요</p>
            <p className="text-sm text-slate-600">논문·뉴스·정책자료를 수집한 뒤 AI가 인사이트 보고서를 작성합니다</p>
          </div>
        )}
      </main>

      {/* 인쇄용 CSS */}
      <style>{`
        @media print {
          header, .print\\:hidden { display: none !important; }
          body { background: white !important; }
          article { box-shadow: none !important; border-radius: 0 !important; }
        }
      `}</style>
    </div>
  );
}
