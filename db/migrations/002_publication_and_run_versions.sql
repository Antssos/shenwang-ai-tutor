-- Publication decisions outlive index rebuilds and removed/reintroduced documents.
CREATE TABLE publication_overrides(document_id TEXT PRIMARY KEY,active INTEGER NOT NULL CHECK(active IN (0,1)));
INSERT INTO publication_overrides SELECT id,0 FROM documents WHERE status='retired';
ALTER TABLE runs ADD COLUMN corpus_version TEXT;
ALTER TABLE runs ADD COLUMN policy_version TEXT;
