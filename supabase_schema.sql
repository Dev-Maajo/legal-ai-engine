-- ── Enable UUID extension ────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Documents table ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  file_path   TEXT NOT NULL,
  file_size   BIGINT NOT NULL DEFAULT 0,
  page_count  INTEGER NOT NULL DEFAULT 0,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'ready', 'error')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Chat messages table ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_messages (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id  UUID NOT NULL,
  role             TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content          TEXT NOT NULL,
  citations        JSONB NOT NULL DEFAULT '[]',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_documents_user_id    ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_status     ON documents(status);
CREATE INDEX IF NOT EXISTS idx_chat_user_id         ON chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversation_id ON chat_messages(conversation_id);

-- ── Updated_at trigger ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Row Level Security ───────────────────────────────────────────────────────────
ALTER TABLE documents     ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Documents: users see only their own
CREATE POLICY "users_own_documents" ON documents
  USING (auth.uid() = user_id);

CREATE POLICY "users_insert_documents" ON documents
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_update_documents" ON documents
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "users_delete_documents" ON documents
  FOR DELETE USING (auth.uid() = user_id);

-- Chat messages: users see only their own
CREATE POLICY "users_own_chat_messages" ON chat_messages
  USING (auth.uid() = user_id);

CREATE POLICY "users_insert_chat_messages" ON chat_messages
  FOR INSERT WITH CHECK (auth.uid() = user_id);
