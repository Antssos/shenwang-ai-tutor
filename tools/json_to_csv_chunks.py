from __future__ import annotations

import argparse
import csv
import io
import json
import re
from pathlib import Path


FIELDS = [
    "row_id", "ques_id", "title", "question_content", "answer_count",
    "reward_num", "ques_label", "hug", "collect", "reply",
    "recommend_flag", "answer_content", "zan", "shang", "comment_count",
]
CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def clean(value: object) -> str:
    if value is None:
        return ""
    text = str(value).replace("\r\n", "\n").replace("\r", "\n")
    return CONTROL_RE.sub("", text).strip()


def rows(records: list[dict]) -> list[dict[str, str]]:
    result: list[dict[str, str]] = []
    n = 0
    for record in records:
        q = record.get("ques_info") or {}
        stats = record.get("staic_info") or {}
        answers = record.get("answers_info") or [{}]
        for answer in answers:
            n += 1
            result.append({
                "row_id": str(n),
                "ques_id": clean(record.get("ques_id")),
                "title": clean(q.get("title")),
                "question_content": clean(q.get("content")),
                "answer_count": clean(q.get("answer_count")),
                "reward_num": clean(q.get("reward_num")),
                "ques_label": json.dumps(q.get("ques_label") or [], ensure_ascii=False),
                "hug": clean(stats.get("hug")),
                "collect": clean(stats.get("collect")),
                "reply": clean(stats.get("reply")),
                "recommend_flag": clean(answer.get("recommend_flag")),
                "answer_content": clean(answer.get("content")),
                "zan": clean(answer.get("zan")),
                "shang": clean(answer.get("shang")),
                "comment_count": clean(answer.get("comment_count")),
            })
    return result


def write_chunks(data: list[dict[str, str]], output_dir: Path, limit: int) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    paths: list[Path] = []
    chunk_no = 1
    handle = None
    writer = None

    def start() -> tuple[object, csv.DictWriter, Path]:
        nonlocal chunk_no
        path = output_dir / f"psychological_qa_{chunk_no:03d}.csv"
        chunk_no += 1
        f = path.open("w", encoding="utf-8-sig", newline="")
        w = csv.DictWriter(f, fieldnames=FIELDS, lineterminator="\n")
        w.writeheader()
        return f, w, path

    for row in data:
        if writer is None:
            handle, writer, path = start()
            paths.append(path)
        probe = io.StringIO()
        csv.DictWriter(probe, fieldnames=FIELDS, lineterminator="\n").writerow(row)
        row_bytes = len(probe.getvalue().encode("utf-8"))
        if handle.tell() + row_bytes > limit and handle.tell() > len("\ufeff") + 64:
            handle.close()
            handle, writer, path = start()
            paths.append(path)
        writer.writerow(row)
    if handle is not None:
        handle.close()
    return paths


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input_json", type=Path)
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("--limit-mb", type=float, default=14.5)
    args = parser.parse_args()
    records = json.loads(args.input_json.read_text(encoding="utf-8"))
    data = rows(records)
    limit = int(args.limit_mb * 1024 * 1024)
    paths = write_chunks(data, args.output_dir, limit)
    print(json.dumps({
        "source": str(args.input_json),
        "questions": len(records),
        "rows": len(data),
        "chunks": len(paths),
        "limit_bytes": limit,
        "max_output_bytes": max((p.stat().st_size for p in paths), default=0),
        "files": [str(p) for p in paths],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
