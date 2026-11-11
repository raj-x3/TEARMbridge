-- 00005_create_documents.sql
-- Document groups, documents (versioned), and entity links.

-- Document Groups (logical document identity across versions)
CREATE TABLE IF NOT EXISTS document_groups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  document_type   TEXT NOT NULL DEFAULT 'general'
                  CHECK (document_type IN (
                    'purchase_order', 'agreement', 'amendment',
                    'invoice', 'supporting', 'general'
                  )),
  title           TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_document_groups_workspace ON document_groups (workspace_id);

-- Documents (individual file versions)
CREATE TABLE IF NOT EXISTS documents (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id            UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  document_group_id       UUID NOT NULL REFERENCES document_groups(id) ON DELETE CASCADE,
  original_filename       TEXT NOT NULL,
  storage_path            TEXT NOT NULL,
  mime_type               TEXT NOT NULL,
  extension               TEXT NOT NULL,
  size_bytes              BIGINT NOT NULL CHECK (size_bytes > 0),
  sha256_checksum         TEXT NOT NULL,
  version_number          INTEGER NOT NULL DEFAULT 1 CHECK (version_number > 0),
  supersedes_document_id  UUID REFERENCES documents(id) ON DELETE SET NULL,
  is_current              BOOLEAN NOT NULL DEFAULT true,
  upload_status           TEXT NOT NULL DEFAULT 'stored'
                          CHECK (upload_status IN ('stored', 'upload_failed', 'archived')),
  uploaded_by             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documents_workspace ON documents (workspace_id);
CREATE INDEX IF NOT EXISTS idx_documents_group ON documents (document_group_id);
CREATE INDEX IF NOT EXISTS idx_documents_checksum ON documents (workspace_id, sha256_checksum);
CREATE INDEX IF NOT EXISTS idx_documents_current ON documents (document_group_id, is_current) WHERE is_current = true;

-- Document Links (polymorphic entity association)
CREATE TABLE IF NOT EXISTS document_links (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  document_id       UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  entity_type       TEXT NOT NULL
                    CHECK (entity_type IN ('purchase_order', 'agreement', 'counterparty')),
  entity_id         UUID NOT NULL,
  relationship_type TEXT NOT NULL DEFAULT 'attachment'
                    CHECK (relationship_type IN ('source', 'attachment', 'reference', 'amendment')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Prevent linking the same document to the same entity multiple times
  UNIQUE (document_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_document_links_entity ON document_links (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_document_links_document ON document_links (document_id);

-- Add foreign key references from agreement_versions and agreement_terms to documents
-- (deferred because documents table didn't exist when those tables were created)
ALTER TABLE agreement_versions
  ADD CONSTRAINT fk_agreement_versions_document
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL;

ALTER TABLE agreement_terms
  ADD CONSTRAINT fk_agreement_terms_source_document
  FOREIGN KEY (source_document_id) REFERENCES documents(id) ON DELETE SET NULL;
