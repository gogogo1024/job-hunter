-- Create conversations and messages tables for chat-as-search auditing

CREATE TABLE IF NOT EXISTS conversations (
  id varchar(255) PRIMARY KEY,
  user_id varchar(255),
  title text,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversations_updated_idx ON conversations (updated_at);

CREATE TABLE IF NOT EXISTS messages (
  id varchar(255) PRIMARY KEY,
  conversation_id varchar(255) NOT NULL,
  role text NOT NULL,
  type text,
  content jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages (conversation_id, created_at);
