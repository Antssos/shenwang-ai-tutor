from __future__ import annotations

import argparse
import json
from pathlib import Path


def write_chunks(records: list[dict], output_dir: Path, limit: int) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    paths: list[Path] = []
    chunk: list[str] = []
    chunk_no = 1

    def encoded(items: list[str]) -> bytes:
        return ("[\n" + ",\n".join(items) + "\n]\n").encode("utf-8")

    for record in records:
        serialized = json.dumps(record, ensure_ascii=False, separators=(",", ":"))
        candidate = chunk + [serialized]
        if chunk and len(encoded(candidate)) > limit:
            path = output_dir / f"psychological_qa_{chunk_no:03d}.json"
            path.write_bytes(encoded(chunk))
            paths.append(path)
            chunk_no += 1
            chunk = [serialized]
        else:
            chunk = candidate

    if chunk:
        path = output_dir / f"psychological_qa_{chunk_no:03d}.json"
        path.write_bytes(encoded(chunk))
        paths.append(path)
    return paths


def write_serialized_chunks(records: list[str], output_dir: Path, limit: int) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    paths: list[Path] = []
    chunk: list[str] = []
    chunk_no = 1
    size = len("[\n]\n".encode("utf-8"))

    def encoded(items: list[str]) -> bytes:
        return ("[\n" + ",\n".join(items) + "\n]\n").encode("utf-8")

    for record in records:
        record_size = len(record.encode("utf-8")) + (2 if chunk else 0)
        if chunk and size + record_size > limit:
            path = output_dir / f"psychological_qa_{chunk_no:03d}.json"
            path.write_bytes(encoded(chunk))
            paths.append(path)
            chunk_no += 1
            chunk = [record]
            size = len(record.encode("utf-8")) + len("[\n\n]\n".encode("utf-8"))
        else:
            chunk.append(record)
            size += record_size
    if chunk:
        path = output_dir / f"psychological_qa_{chunk_no:03d}.json"
        path.write_bytes(encoded(chunk))
        paths.append(path)
    return paths


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input_json", type=Path)
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("--limit-mb", type=float, default=15.0)
    args = parser.parse_args()
    text = args.input_json.read_text(encoding="utf-8")
    decoder = json.JSONDecoder()
    pos = text.find("[") + 1
    records: list[dict] = []
    serialized_records: list[str] = []
    while pos < len(text):
        while pos < len(text) and text[pos].isspace():
            pos += 1
        if pos >= len(text) or text[pos] == "]":
            break
        start = pos
        record, pos = decoder.raw_decode(text, pos)
        records.append(record)
        serialized_records.append(text[start:pos])
        while pos < len(text) and text[pos].isspace():
            pos += 1
        if pos < len(text) and text[pos] == ",":
            pos += 1
    limit = int(args.limit_mb * 1024 * 1024) - 1
    # Reuse the source serialization to avoid expensive reformatting of the
    # 270+ MB dataset while still validating every top-level JSON object.
    paths = write_serialized_chunks(serialized_records, args.output_dir, limit)
    print(json.dumps({
        "records": len(serialized_records),
        "chunks": len(paths),
        "limit_bytes": limit,
        "max_bytes": max(p.stat().st_size for p in paths),
        "files": [p.name for p in paths],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
