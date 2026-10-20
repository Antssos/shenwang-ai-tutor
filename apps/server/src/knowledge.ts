import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";
import { parse } from "csv-parse/sync";
import { Worker } from "node:worker_threads";
import type { AppStore } from "./store.js";
import type { z } from "zod";
import type { sourceSchema } from "@wangxueban/contracts";
export type Source = z.infer<typeof sourceSchema>;
export interface Evidence {
  source: Source;
  content: string;
  corpusVersion?: string;
}
const segmenter = new Intl.Segmenter("zh-CN", { granularity: "word" });
const stop = new Set([
  "的",
  "了",
  "是",
  "我",
  "你",
  "他",
  "她",
  "它",
  "请",
  "一下",
  "什么",
  "怎么",
  "如何",
  "这个",
  "那个",
  "吗",
  "呢",
  "想",
  "知道",
  "可以",
  "我们",
  "有",
  "和",
  "在",
  "一个",
  "为什么",
]);
export function terms(text: string) {
  return [
    ...new Set(
      [...segmenter.segment(text.normalize("NFKC").toLowerCase())]
        .filter((s) => s.isWordLike && !stop.has(s.segment))
        .map((s) => s.segment),
    ),
  ].slice(0, 200);
}
export class Knowledge {
  constructor(readonly store: AppStore) {}
  documents() {
    return this.store.db
      .prepare(
        "SELECT id,title,knowledge_base knowledgeBase,status,version,hash FROM documents ORDER BY knowledge_base,id",
      )
      .all();
  }
  version() {
    return (
      (
        this.store.db
          .prepare("SELECT value FROM settings WHERE key='corpus_version'")
          .get() as { value: string } | undefined
      )?.value ?? "empty"
    );
  }
  private generation() {
    return (
      (
        this.store.db
          .prepare("SELECT value FROM settings WHERE key='corpus_generation'")
          .get() as { value: string } | undefined
      )?.value ?? "0"
    );
  }
  private updateVersion() {
    const documents = this.store.db
      .prepare(
        "SELECT id,title,knowledge_base,status,version,hash FROM documents ORDER BY id",
      )
      .all();
    const embedding = this.store.db
      .prepare("SELECT value FROM settings WHERE key='embedding_identity'")
      .get() as { value: string } | undefined;
    const version = createHash("sha256")
      .update(
        JSON.stringify({
          documents,
          chunker: "heading-char-v1:750:600",
          tokenizer: "Intl.Segmenter:zh-CN",
          embedding: embedding?.value ?? "none",
        }),
      )
      .digest("hex");
    this.store.db
      .prepare("INSERT OR REPLACE INTO settings VALUES(?,?)")
      .run("corpus_version", version);
    this.store.db
      .prepare("INSERT OR REPLACE INTO settings VALUES(?,?)")
      .run("corpus_generation", String(Number(this.generation()) + 1));
  }
  current(version: string, sources: Source[]) {
    return (
      this.version() === version &&
      sources.every((s) =>
        Boolean(
          this.store.db
            .prepare(
              "SELECT 1 FROM documents WHERE id=? AND status='active' AND version=?",
            )
            .get(s.documentId ?? "", s.version ?? ""),
        ),
      )
    );
  }
  publish(id: string, active: boolean) {
    return this.store.transaction(() => {
      const changed = this.store.db
        .prepare("UPDATE documents SET status=? WHERE id=?")
        .run(active ? "active" : "retired", id).changes;
      if (changed) {
        this.store.db
          .prepare("INSERT OR REPLACE INTO publication_overrides VALUES(?,?)")
          .run(id, Number(active));
        this.updateVersion();
      }
      return changed;
    });
  }
  async import(
    root: string,
    manifest: string,
    embed?: (text: string[]) => Promise<number[][]>,
    model = "",
    provider = "unspecified",
  ) {
    const base = realpathSync(root),
      rows = parse(readFileSync(manifest, "utf8").replace(/\r\n?/g, "\n"), {
        record_delimiter: "\n",
        columns: true,
        bom: true,
        skip_empty_lines: true,
      }) as Record<string, string>[];
    const documents: {
      row: Record<string, string>;
      chunks: {
        id: string;
        section: string;
        content: string;
        vector?: number[];
      }[];
      hash: string;
    }[] = [];
    const seen = new Set<string>();
    let dimension = 0,
      totalChunks = 0;
    for (const row of rows.filter((r) => r.status === "active")) {
      if (
        !row.doc_id ||
        seen.has(row.doc_id) ||
        !["learning", "center-public", "care-support"].includes(
          row.knowledge_base,
        )
      )
        throw new Error("Invalid or duplicate manifest record");
      seen.add(row.doc_id);
      const rel = row.clean_file
        .replaceAll("\\", "/")
        .replace(/^knowledge\//, "");
      const file = realpathSync(resolve(base, rel));
      if (!file.startsWith(base + sep))
        throw new Error("Knowledge path escapes root");
      const content = readFileSync(file, "utf8");
      if (Buffer.byteLength(content) > 2_000_000)
        throw new Error("Document too large");
      const chunks: {
        id: string;
        section: string;
        content: string;
        vector?: number[];
      }[] = [];
      let section = row.title || row.doc_id;
      for (const block of content.split(/(?=^#{1,3} )/m)) {
        section = block.match(/^#{1,3} (.+)/)?.[1] ?? section;
        const chars = Array.from(block);
        for (let offset = 0; offset < chars.length; offset += 600) {
          const text = chars
            .slice(offset, offset + 750)
            .join("")
            .trim();
          if (text)
            chunks.push({
              id: createHash("sha256")
                .update(row.doc_id + ":" + chunks.length + ":" + text)
                .digest("hex"),
              section,
              content: text,
            });
        }
      }
      totalChunks += chunks.length;
      if (totalChunks > 5000)
        throw new Error("Corpus exceeds bounded local index capacity");
      if (embed)
        for (let i = 0; i < chunks.length; i += 16) {
          const vectors = await embed(
            chunks.slice(i, i + 16).map((c) => c.content),
          );
          if (vectors.length !== chunks.slice(i, i + 16).length)
            throw new Error("Embedding count mismatch");
          vectors.forEach((v, j) => {
            if (
              !v.length ||
              v.length > 4096 ||
              v.some((n) => !Number.isFinite(n)) ||
              (dimension && v.length !== dimension)
            )
              throw new Error("Invalid vector");
            dimension = v.length;
            chunks[i + j].vector = v;
          });
        }
      documents.push({
        row,
        chunks,
        hash: createHash("sha256").update(content).digest("hex"),
      });
    }
    if (!documents.length) throw new Error("No active documents");
    if (documents.reduce((n, d) => n + d.chunks.length, 0) > 5000)
      throw new Error("Corpus exceeds bounded local index capacity");
    this.store.transaction(() => {
      this.store.db.exec("DELETE FROM chunks_fts; DELETE FROM documents;");
      for (const { row, chunks, hash } of documents) {
        this.store.db
          .prepare("INSERT INTO documents VALUES(?,?,?,?,?,?)")
          .run(
            row.doc_id,
            row.title || row.doc_id,
            row.knowledge_base,
            (
              this.store.db
                .prepare(
                  "SELECT active FROM publication_overrides WHERE document_id=?",
                )
                .get(row.doc_id) as { active: number } | undefined
            )?.active === 0
              ? "retired"
              : "active",
            row.version || hash.slice(0, 12),
            hash,
          );
        for (const c of chunks) {
          this.store.db
            .prepare("INSERT INTO chunks VALUES(?,?,?,?,?,?)")
            .run(
              c.id,
              row.doc_id,
              c.section,
              c.content,
              c.vector ? JSON.stringify(c.vector) : null,
              model || null,
            );
          this.store.db
            .prepare("INSERT INTO chunks_fts VALUES(?,?)")
            .run(c.id, terms(c.content).join(" "));
        }
      }
      this.store.db
        .prepare("INSERT OR REPLACE INTO settings VALUES(?,?)")
        .run(
          "embedding_identity",
          JSON.stringify({
            provider: embed ? provider : "none",
            model: embed ? model : "none",
            dimension,
            normalization: "cosine",
          }),
        );
      this.updateVersion();
    });
    return {
      documents: documents.length,
      chunks: documents.reduce((n, d) => n + d.chunks.length, 0),
      semantic: Boolean(embed),
    };
  }
  async search(
    query: string,
    base: string,
    queryVector?: number[],
    model = "",
  ): Promise<Evidence[]> {
    const generation = this.generation(),
      corpusVersion = this.version();
    const tokens = terms(query).slice(0, 24);
    const keywords = tokens.length
      ? (this.store.db
          .prepare(
            `SELECT c.id FROM chunks_fts f JOIN chunks c ON c.id=f.chunk_id JOIN documents d ON d.id=c.document_id WHERE chunks_fts MATCH ? AND d.status='active' AND d.knowledge_base=? ORDER BY bm25(chunks_fts) LIMIT 12`,
          )
          .all(
            tokens.map((t) => '"' + t.replaceAll('"', '""') + '"').join(" OR "),
            base,
          ) as { id: string }[])
      : [];
    const rank = new Map<string, number>();
    keywords.forEach((c, i) => rank.set(c.id, 1 / (60 + i)));
    if (queryVector) {
      const vectors = this.store.db
        .prepare(
          "SELECT c.id,c.vector FROM chunks c JOIN documents d ON d.id=c.document_id WHERE d.status='active' AND d.knowledge_base=? AND c.embedding_model=? AND c.vector IS NOT NULL LIMIT 5001",
        )
        .all(base, model);
      if (vectors.length > 5000) throw new Error("Index capacity exceeded");
      const ranked = await new Promise<{ id: string; score: number }[]>(
        (resolve, reject) => {
          const worker = new Worker(
            `const {parentPort,workerData:d}=require('node:worker_threads');const q=d.q;const norm=v=>Math.sqrt(v.reduce((s,x)=>s+x*x,0));const qn=norm(q);parentPort.postMessage(d.rows.map(r=>{const v=JSON.parse(r.vector);return {id:r.id,score:v.length===q.length&&qn&&norm(v)?v.reduce((s,x,i)=>s+x*q[i],0)/qn/norm(v):0}}).filter(r=>r.score>=0.4).sort((a,b)=>b.score-a.score).slice(0,12));`,
            {
              eval: true,
              workerData: { q: queryVector, rows: vectors },
              resourceLimits: { maxOldGenerationSizeMb: 24 },
            },
          );
          const timer = setTimeout(() => {
            void worker.terminate();
            reject(new Error("Vector search timeout"));
          }, 3000);
          worker.once("message", (v) => {
            clearTimeout(timer);
            resolve(v);
          });
          worker.once("error", (e) => {
            clearTimeout(timer);
            reject(e);
          });
        },
      );
      ranked.forEach((c, i) =>
        rank.set(c.id, (rank.get(c.id) ?? 0) + 1 / (60 + i)),
      );
    }
    if (this.generation() !== generation) return [];
    return [...rank]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .flatMap(([id]) => {
        const row = this.store.db
          .prepare(
            "SELECT c.content,c.section,c.id,d.id documentId,d.title,d.version FROM chunks c JOIN documents d ON d.id=c.document_id WHERE c.id=? AND d.status='active' AND d.knowledge_base=?",
          )
          .get(id, base) as
          | {
              content: string;
              section: string;
              id: string;
              documentId: string;
              title: string;
              version: string;
            }
          | undefined;
        if (!row) return [];
        return [
          {
            corpusVersion,
            content: row.content,
            source: {
              title: row.title,
              documentId: row.documentId,
              version: row.version,
              section: row.section,
              chunkId: row.id,
            },
          },
        ];
      });
  }
}
