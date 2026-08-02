from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

from pypdf import PdfReader


PAGE_MARKER_RE = re.compile(r"^P\d{2}$", re.MULTILINE)
PHONE_RE = re.compile(r"(?<!\d)1[3-9]\d{9}(?!\d)")
GENERIC_IMAGE_TEXT = {"精彩回顾\nHighlights", "活动剪影", "Activity\nHighlights"}


def section_for_page(page: int) -> str:
    if page == 3:
        return "标志释义与目录"
    if page == 4:
        return "中心简介与登记信息"
    if 5 <= page <= 11:
        return "农村留守儿童关爱活动"
    if 12 <= page <= 14:
        return "领导支持、媒体报道与社会反响"
    if page == 15:
        return "发展规划"
    if page == 16:
        return "可持续发展请求事项与章程"
    if 17 <= page <= 19:
        return "中心章程"
    return "封面与扉页"


def normalize_text(text: str) -> str:
    text = text.replace("\u3000", " ").replace("\xa0", " ")
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = PAGE_MARKER_RE.sub("", text)
    text = PHONE_RE.sub("[联系电话已脱敏]", text)
    lines = [line.strip() for line in text.splitlines()]
    cleaned: list[str] = []
    for line in lines:
        if not line:
            if cleaned and cleaned[-1] != "":
                cleaned.append("")
            continue
        if re.fullmatch(r"(?:活\s*动\s*剪\s*影|Activity\s*Highlights?)", line, re.I):
            continue
        cleaned.append(line)
    text = "\n".join(cleaned).strip()
    text = re.sub(r"\n{3,}", "\n\n", text)
    # Join Chinese line wraps while retaining headings, lists, and punctuation boundaries.
    text = re.sub(r"(?<=[\u4e00-\u9fff，、（(])\n(?=[\u4e00-\u9fff])", "", text)
    return text


def split_paragraphs(text: str) -> list[str]:
    parts = re.split(r"\n{2,}", text)
    return [re.sub(r"\n+", "\n", p).strip() for p in parts if p.strip()]


def chunk_pages(pages: list[dict], target: int = 900) -> list[dict]:
    chunks: list[dict] = []
    for page in pages:
        paragraphs = split_paragraphs(page["text"])
        paragraphs = [p for p in paragraphs if p not in GENERIC_IMAGE_TEXT]
        current = ""
        page_chunks: list[str] = []
        seq = 1
        for para in paragraphs:
            if current and len(current) + len(para) + 2 > target:
                page_chunks.append(current)
                current = para
            else:
                current = (current + "\n\n" + para).strip()
        if current:
            page_chunks.append(current)
        if len(page_chunks) > 1 and len(page_chunks[-1]) < 220:
            page_chunks[-2] = page_chunks[-2] + "\n\n" + page_chunks[-1]
            page_chunks.pop()
        for text in page_chunks:
            if len(text) >= 25:
                chunks.append(make_chunk(page, seq, text))
                seq += 1
    return chunks


def make_chunk(page: dict, seq: int, text: str) -> dict:
    chunk_id = f"shenwang-a-p{page['pdf_page']:02d}-c{seq:02d}"
    return {
        "id": chunk_id,
        "source": "申望儿童关爱服务（A）.pdf",
        "pdf_page": page["pdf_page"],
        "printed_pages": page["printed_pages"],
        "section": section_for_page(page["pdf_page"]),
        "chunk_index_on_page": seq,
        "char_count": len(text),
        "text": text,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input_pdf", type=Path)
    parser.add_argument("output_dir", type=Path)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    raw = args.input_pdf.read_bytes()
    reader = PdfReader(args.input_pdf)
    pages: list[dict] = []
    for idx, page in enumerate(reader.pages, 1):
        raw_text = page.extract_text() or ""
        printed = PAGE_MARKER_RE.findall(raw_text)
        pages.append({
            "pdf_page": idx,
            "printed_pages": printed,
            "raw_char_count": len(raw_text),
            "text": normalize_text(raw_text),
            "section": section_for_page(idx),
        })

    chunks = chunk_pages(pages)
    jsonl_path = args.output_dir / "申望儿童关爱服务A_chunks.jsonl"
    jsonl_path.write_text("".join(json.dumps(x, ensure_ascii=False) + "\n" for x in chunks), encoding="utf-8")

    markdown = ["# 申望儿童关爱服务（A）", "", f"> 来源：{args.input_pdf.name}", ""]
    for page in pages:
        markdown.extend([f"## PDF 第 {page['pdf_page']} 页｜{page['section']}", "", page["text"] or "[本页无可提取文字，主要为图片内容]", ""])
    (args.output_dir / "申望儿童关爱服务A_clean.md").write_text("\n".join(markdown).rstrip() + "\n", encoding="utf-8")

    empty_pages = [p["pdf_page"] for p in pages if not p["text"]]
    sparse_pages = [p["pdf_page"] for p in pages if 0 < len(p["text"]) < 80]
    report = {
        "source_file": str(args.input_pdf),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "file_size_bytes": len(raw),
        "pdf_pages": len(pages),
        "extractable_chars": sum(len(p["text"]) for p in pages),
        "empty_text_pages": empty_pages,
        "sparse_text_pages_under_80_chars": sparse_pages,
        "chunk_count": len(chunks),
        "chunk_char_min": min((c["char_count"] for c in chunks), default=0),
        "chunk_char_max": max((c["char_count"] for c in chunks), default=0),
        "chunk_char_average": round(sum(c["char_count"] for c in chunks) / len(chunks), 1) if chunks else 0,
        "phone_numbers_redacted": sum(len(PHONE_RE.findall(page.extract_text() or "")) for page in reader.pages),
        "page_raw_char_counts": {str(p["pdf_page"]): p["raw_char_count"] for p in pages},
        "notes": [
            "PDF printed-page labels may place two brochure pages on one PDF page; both are retained in printed_pages.",
            "Image-only pages are marked in Markdown but omitted from JSONL chunks.",
            "Manual visual review is required for photographs, logos, and text embedded in images.",
            "Mainland China mobile numbers are redacted from clean text and retrieval chunks.",
        ],
    }
    (args.output_dir / "申望儿童关爱服务A_quality.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
