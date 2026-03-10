#!/usr/bin/env python3
"""산업동향 보고서 PPT 생성
Claude가 생성한 slideContent JSON을 직접 사용하여 깔끔한 PPT 생성
"""

import json, sys, re
from io import BytesIO
from pptx import Presentation
from pptx.util import Pt, Cm, Emu
from pptx.enum.text import PP_ALIGN
from pptx.enum.shapes import MSO_SHAPE
from pptx.dml.color import RGBColor

FONT = "맑은 고딕"

# 컬러 팔레트
NAVY = RGBColor(0x1B, 0x2A, 0x4A)
DARK_NAVY = RGBColor(0x0F, 0x1A, 0x30)
BLUE = RGBColor(0x2E, 0x75, 0xB6)
LIGHT_BLUE = RGBColor(0xD6, 0xE4, 0xF0)
ORANGE = RGBColor(0xE8, 0x6C, 0x00)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
BLACK = RGBColor(0x33, 0x33, 0x33)
GRAY = RGBColor(0x76, 0x76, 0x76)
LIGHT_GRAY = RGBColor(0xF2, 0xF2, 0xF2)
BORDER_GRAY = RGBColor(0xD9, 0xD9, 0xD9)

W = Cm(25.4)
H = Cm(19.05)

ACCENT_COLORS = [
    RGBColor(0x2E, 0x75, 0xB6),
    RGBColor(0xE8, 0x6C, 0x00),
    RGBColor(0x54, 0x8B, 0x54),
    RGBColor(0x8B, 0x5C, 0xF6),
    RGBColor(0xC0, 0x39, 0x2B),
]


# ── 유틸리티 ──

def rect(slide, left, top, width, height, color):
    sh = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, width, height)
    sh.fill.solid()
    sh.fill.fore_color.rgb = color
    sh.line.fill.background()
    return sh


def text_box(slide, left, top, width, height):
    tb = slide.shapes.add_textbox(left, top, width, height)
    tb.text_frame.word_wrap = True
    return tb.text_frame


def add_para(tf, text, size=11, bold=False, color=BLACK, spacing=0, align=PP_ALIGN.LEFT):
    if len(tf.paragraphs) == 1 and tf.paragraphs[0].text == "":
        p = tf.paragraphs[0]
    else:
        p = tf.add_paragraph()
    p.text = text
    p.font.name = FONT
    p.font.size = Pt(size)
    p.font.bold = bold
    p.font.color.rgb = color
    p.space_before = Pt(spacing)
    p.alignment = align
    p.line_spacing = Pt(size * 1.5)
    return p


def add_notes(slide, text):
    tf = slide.notes_slide.notes_text_frame
    tf.text = text
    for p in tf.paragraphs:
        p.font.name = FONT
        p.font.size = Pt(12)


def footer_bar(slide):
    rect(slide, Cm(0), Cm(18.2), W, Cm(0.85), NAVY)
    tf = text_box(slide, Cm(0.8), Cm(18.25), Cm(10), Cm(0.7))
    add_para(tf, "ISU GROUP", size=8, bold=True, color=WHITE)
    tf2 = text_box(slide, Cm(15), Cm(18.25), Cm(10), Cm(0.7))
    add_para(tf2, "(주)이수 기획팀", size=8, color=WHITE, align=PP_ALIGN.RIGHT)


def top_bar(slide, title, section_num=None):
    rect(slide, Cm(0), Cm(0), W, Cm(1.4), NAVY)
    label = f"{section_num}. {title}" if section_num else title
    tf = text_box(slide, Cm(0.5), Cm(0.15), Cm(22), Cm(1.1))
    add_para(tf, label, size=16, bold=True, color=WHITE)
    rect(slide, Cm(24.4), Cm(0), Cm(1.0), Cm(1.4), ORANGE)


def head_message_box(slide, text):
    rect(slide, Cm(0.8), Cm(1.8), Cm(23.8), Cm(1.6), LIGHT_BLUE)
    tf = text_box(slide, Cm(1.2), Cm(1.9), Cm(23.0), Cm(1.4))
    add_para(tf, text, size=13, bold=True, color=NAVY)


def numbered_circle(slide, left, top, num, color):
    sh = slide.shapes.add_shape(MSO_SHAPE.OVAL, left, top, Cm(1.0), Cm(1.0))
    sh.fill.solid()
    sh.fill.fore_color.rgb = color
    sh.line.fill.background()
    ntf = sh.text_frame
    ntf.margin_left = ntf.margin_right = ntf.margin_top = ntf.margin_bottom = Cm(0)
    np = ntf.paragraphs[0]
    np.text = str(num)
    np.font.name = FONT
    np.font.size = Pt(14)
    np.font.bold = True
    np.font.color.rgb = WHITE
    np.alignment = PP_ALIGN.CENTER


def bullet_dot(slide, left, top, color):
    dot = slide.shapes.add_shape(MSO_SHAPE.OVAL, left, top, Cm(0.35), Cm(0.35))
    dot.fill.solid()
    dot.fill.fore_color.rgb = color
    dot.line.fill.background()


# ── 슬라이드 ──

def slide_cover(prs, label, date, sub_field):
    sl = prs.slides.add_slide(prs.slide_layouts[6])
    rect(sl, Cm(0), Cm(0), W, H, DARK_NAVY)
    rect(sl, Cm(0), Cm(0), Cm(0.5), H, BLUE)
    rect(sl, Cm(3.0), Cm(7.5), Cm(3.0), Cm(0.15), ORANGE)

    tf = text_box(sl, Cm(3.0), Cm(8.0), Cm(19), Cm(3.0))
    add_para(tf, label, size=36, bold=True, color=WHITE)
    add_para(tf, "산업동향 초안", size=28, color=RGBColor(0xA0, 0xB4, 0xCC), spacing=8)

    if sub_field:
        tf2 = text_box(sl, Cm(3.0), Cm(11.5), Cm(19), Cm(1.5))
        add_para(tf2, sub_field, size=16, color=RGBColor(0x80, 0x99, 0xB3))

    tf3 = text_box(sl, Cm(3.0), Cm(15.5), Cm(19), Cm(2.0))
    add_para(tf3, date, size=14, color=GRAY)
    add_para(tf3, "(주)이수 기획팀", size=14, bold=True, color=RGBColor(0xA0, 0xB4, 0xCC), spacing=4)

    sf = f" 중 {sub_field} 분야" if sub_field else ""
    add_notes(sl, f"안녕하십니까. 지금부터 {label}{sf} 산업동향에 대해 보고드리겠습니다.\n\n본 보고서는 국내외 뉴스, 학술논문, KDI 경제전망, 정책자료 등을 종합 분석하여 작성되었습니다.")


def slide_exec_summary(prs, slides_data):
    """Executive Summary: 각 섹션의 헤드메시지를 모아서 요약"""
    sl = prs.slides.add_slide(prs.slide_layouts[6])
    top_bar(sl, "Executive Summary")
    footer_bar(sl)

    y = Cm(2.0)
    for i, sd in enumerate(slides_data[:4]):
        color = ACCENT_COLORS[i % len(ACCENT_COLORS)]

        # 좌측 컬러 바
        rect(sl, Cm(1.0), y + Cm(0.2), Cm(0.25), Cm(3.2), color)

        # 넘버 원
        numbered_circle(sl, Cm(1.6), y + Cm(0.3), i + 1, color)

        # 제목
        tf = text_box(sl, Cm(3.0), y + Cm(0.2), Cm(21), Cm(0.7))
        add_para(tf, sd.get("title", ""), size=13, bold=True, color=NAVY)

        # 헤드메시지
        hm = sd.get("head_message", "")
        if hm:
            tf2 = text_box(sl, Cm(3.0), y + Cm(1.0), Cm(21), Cm(0.7))
            add_para(tf2, hm, size=11, color=BLACK)

        # 좌측 불릿 2개
        bullets = sd.get("left_bullets", [])[:2]
        tf3 = text_box(sl, Cm(3.5), y + Cm(1.8), Cm(20.5), Cm(1.2))
        for b in bullets:
            add_para(tf3, f"▸ {b}", size=9, color=GRAY, spacing=2)

        y += Cm(3.8)

    script = "먼저 핵심 내용을 요약드리겠습니다.\n\n"
    for sd in slides_data[:4]:
        script += f"{sd.get('title', '')}: {sd.get('head_message', '')}\n\n"
    add_notes(sl, script)


def slide_toc(prs, slides_data):
    sl = prs.slides.add_slide(prs.slide_layouts[6])
    top_bar(sl, "목 차")
    footer_bar(sl)

    for i, sd in enumerate(slides_data):
        y = Cm(2.8) + Cm(i * 2.0)
        if y > Cm(16.5):
            break
        color = ACCENT_COLORS[i % len(ACCENT_COLORS)]
        numbered_circle(sl, Cm(3.5), y, i + 1, color)

        tf = text_box(sl, Cm(5.2), y + Cm(0.1), Cm(18), Cm(0.9))
        add_para(tf, sd.get("title", ""), size=15, bold=True, color=NAVY)

        if i < len(slides_data) - 1:
            line = sl.shapes.add_connector(1, Cm(5.2), y + Cm(1.5), Cm(21), y + Cm(1.5))
            line.line.color.rgb = BORDER_GRAY
            line.line.width = Pt(0.5)

    sc = "보고서 구성은 다음과 같습니다.\n\n"
    for i, sd in enumerate(slides_data, 1):
        sc += f"{i}번째로 {sd.get('title', '')},\n"
    sc += "\n순서로 말씀드리겠습니다."
    add_notes(sl, sc)


def slide_body(prs, sd, sec_num):
    """본문 슬라이드: Claude가 생성한 좌/우 불릿으로 2컬럼 구성"""
    sl = prs.slides.add_slide(prs.slide_layouts[6])
    title = sd.get("title", "")
    top_bar(sl, title, sec_num)
    footer_bar(sl)

    y_start = Cm(1.8)
    hm = sd.get("head_message", "")
    if hm:
        head_message_box(sl, hm)
        y_start = Cm(3.8)

    left_title = sd.get("left_title", "주요 동향")
    left_bullets = sd.get("left_bullets", [])
    right_title = sd.get("right_title", "핵심 시사점")
    right_bullets = sd.get("right_bullets", [])

    # ── 좌측 ──
    rect(sl, Cm(1.0), y_start, Cm(11.2), Cm(1.0), LIGHT_GRAY)
    tf_lt = text_box(sl, Cm(1.3), y_start + Cm(0.1), Cm(10.6), Cm(0.8))
    add_para(tf_lt, left_title, size=13, bold=True, color=NAVY)

    line1 = sl.shapes.add_connector(1, Cm(1.0), y_start + Cm(1.0), Cm(12.2), y_start + Cm(1.0))
    line1.line.color.rgb = BLUE
    line1.line.width = Pt(1.5)

    ly = y_start + Cm(1.4)
    for i, bullet in enumerate(left_bullets[:5]):
        color = ACCENT_COLORS[i % len(ACCENT_COLORS)]
        bullet_dot(sl, Cm(1.3), ly + Cm(0.12), color)
        tf = text_box(sl, Cm(2.0), ly, Cm(10.0), Cm(1.2))
        add_para(tf, bullet, size=11, color=BLACK)
        ly += Cm(2.2)

    # ── 우측 ──
    rect(sl, Cm(13.2), y_start, Cm(11.2), Cm(1.0), LIGHT_GRAY)
    tf_rt = text_box(sl, Cm(13.5), y_start + Cm(0.1), Cm(10.6), Cm(0.8))
    add_para(tf_rt, right_title, size=13, bold=True, color=NAVY)

    line2 = sl.shapes.add_connector(1, Cm(13.2), y_start + Cm(1.0), Cm(24.4), y_start + Cm(1.0))
    line2.line.color.rgb = BLUE
    line2.line.width = Pt(1.5)

    ry = y_start + Cm(1.4)
    for i, bullet in enumerate(right_bullets[:5]):
        color = ACCENT_COLORS[i % len(ACCENT_COLORS)]
        bullet_dot(sl, Cm(13.5), ry + Cm(0.12), color)
        tf = text_box(sl, Cm(14.2), ry, Cm(10.0), Cm(1.2))
        add_para(tf, bullet, size=11, color=BLACK)
        ry += Cm(2.2)

    # 스크립트
    script = sd.get("script", f"[{title}] 섹션입니다.")
    add_notes(sl, script)


def slide_end(prs):
    sl = prs.slides.add_slide(prs.slide_layouts[6])
    rect(sl, Cm(0), Cm(0), W, H, DARK_NAVY)
    rect(sl, Cm(0), Cm(0), Cm(0.5), H, BLUE)
    rect(sl, Cm(8.0), Cm(8.5), Cm(3.0), Cm(0.15), ORANGE)

    tf = text_box(sl, Cm(3.0), Cm(9.0), Cm(19.4), Cm(3.0))
    add_para(tf, "감사합니다", size=36, bold=True, color=WHITE, align=PP_ALIGN.CENTER)

    tf2 = text_box(sl, Cm(3.0), Cm(14.0), Cm(19.4), Cm(1.0))
    add_para(tf2, "(주)이수 기획팀", size=14, color=RGBColor(0xA0, 0xB4, 0xCC), align=PP_ALIGN.CENTER)

    add_notes(sl, "이상으로 산업동향 보고를 마치겠습니다.\n\n궁금하신 사항이나 추가 논의가 필요한 부분이 있으시면 말씀해 주십시오.\n\n감사합니다.")


# ── 폴백: slideContent가 없을 때 보고서 원문에서 파싱 ──

def strip_num(title):
    m = re.match(r'^[\d]+[\.\)]\s*', title)
    return title[m.end():] if m else title


def fallback_parse(report):
    """보고서 원문을 파싱하여 간이 슬라이드 데이터 생성"""
    slides = []
    sections = []
    cur = None
    for line in report.split("\n"):
        line = line.strip()
        if not line:
            continue
        if line.startswith("## "):
            if cur:
                sections.append(cur)
            title = strip_num(line[3:].strip())
            cur = {"title": title, "bullets": []}
        elif cur:
            clean = re.sub(r'\*\*(.*?)\*\*', r'\1', line)
            if clean.startswith("- ") or clean.startswith("* "):
                cur["bullets"].append(clean[2:])
            elif clean.startswith("### "):
                cur["bullets"].append(clean[4:])

    if cur:
        sections.append(cur)

    body = [s for s in sections if "executive" not in s["title"].lower() and "summary" not in s["title"].lower()]

    for sec in body:
        bullets = sec["bullets"][:8]
        mid = max(len(bullets) // 2, 1)
        slides.append({
            "title": sec["title"],
            "head_message": bullets[0] if bullets else sec["title"],
            "left_title": "주요 동향",
            "left_bullets": bullets[:mid],
            "right_title": "핵심 시사점",
            "right_bullets": bullets[mid:],
            "script": f"[{sec['title']}] 섹션입니다."
        })

    return slides


def generate_ppt(data):
    prs = Presentation()
    prs.slide_width = Emu(int(W))
    prs.slide_height = Emu(int(H))

    label = data.get("label", "산업")
    sub_field = data.get("subField", None)
    date = data.get("generatedAt", "")[:10]

    # Claude가 생성한 슬라이드 콘텐츠 사용, 없으면 폴백
    slide_content = data.get("slideContent", {})
    slides_data = slide_content.get("slides", [])

    if not slides_data:
        report = data.get("report", "")
        slides_data = fallback_parse(report)

    # 1. 표지
    slide_cover(prs, label, date, sub_field)

    # 2. Executive Summary
    if slides_data:
        slide_exec_summary(prs, slides_data)

    # 3. 목차
    if slides_data:
        slide_toc(prs, slides_data)

    # 4. 본문
    for i, sd in enumerate(slides_data):
        slide_body(prs, sd, i + 1)

    # 5. 끝
    slide_end(prs)

    buf = BytesIO()
    prs.save(buf)
    return buf.getvalue()


if __name__ == "__main__":
    data = json.load(sys.stdin)
    sys.stdout.buffer.write(generate_ppt(data))
