/*
# AI Creator Platform Initial Schema

## Overview
Creates the core database structure for the AI Creator Platform including content management,
user audience tracking, conversations, messages, and analytics.

## Tables

### 1. folders
Organizes content into hierarchical folder structure
- `id` (uuid, primary key)
- `name` (text, not null)
- `parent_id` (uuid, references folders, nullable for root folders)
- `created_at` (timestamptz, default: now())

### 2. content_items
Stores uploaded content (videos, PDFs, documents, etc.)
- `id` (uuid, primary key)
- `title` (text, not null)
- `source_type` (text, e.g., 'YouTube', 'Document', 'Feed')
- `word_count` (integer, default: 0)
- `file_url` (text, nullable)
- `folder_id` (uuid, references folders, nullable)
- `status` (text, default: 'active', values: 'active', 'failed')
- `uploaded_at` (timestamptz, default: now())
- `metadata` (jsonb, for additional info like transcripts)

### 3. audience_users
Tracks audience members and their engagement
- `id` (uuid, primary key)
- `name` (text, not null)
- `email` (text, unique)
- `tags` (text array)
- `message_count` (integer, default: 0)
- `status` (text, default: 'active', values: 'active', 'invited', 'revoked')
- `last_active` (timestamptz)
- `created_at` (timestamptz, default: now())

### 4. conversations
Tracks conversations with audience members
- `id` (uuid, primary key)
- `user_id` (uuid, references audience_users)
- `started_at` (timestamptz, default: now())
- `last_message_at` (timestamptz)
- `message_count` (integer, default: 0)

### 5. messages
Individual messages within conversations
- `id` (uuid, primary key)
- `conversation_id` (uuid, references conversations)
- `content` (text, not null)
- `is_answered` (boolean, default: true)
- `created_at` (timestamptz, default: now())

### 6. analytics_metrics
Daily aggregated metrics for dashboard
- `id` (uuid, primary key)
- `date` (date, not null, unique)
- `total_conversations` (integer, default: 0)
- `active_users` (integer, default: 0)
- `time_created_minutes` (integer, default: 0)
- `messages_answered` (integer, default: 0)
- `messages_unanswered` (integer, default: 0)
- `created_at` (timestamptz, default: now())

### 7. insights
AI-generated insights and recommendations
- `id` (uuid, primary key)
- `title` (text, not null)
- `description` (text)
- `action_text` (text)
- `created_at` (timestamptz, default: now())

### 8. trending_topics
Popular discussion themes
- `id` (uuid, primary key)
- `topic` (text, not null)
- `mention_count` (integer, default: 0)
- `period_start` (timestamptz, not null)
- `period_end` (timestamptz, not null)

## Security
- No RLS enabled - this is an admin dashboard for the creator
- All data is accessible to the authenticated creator

## Storage Buckets
- Content uploads bucket will be created separately
*/

-- Create folders table
CREATE TABLE IF NOT EXISTS folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  parent_id uuid REFERENCES folders(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

-- Create content_items table
CREATE TABLE IF NOT EXISTS content_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  source_type text NOT NULL,
  word_count integer DEFAULT 0,
  file_url text,
  folder_id uuid REFERENCES folders(id) ON DELETE SET NULL,
  status text DEFAULT 'active' CHECK (status IN ('active', 'failed')),
  uploaded_at timestamptz DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb
);

-- Create audience_users table
CREATE TABLE IF NOT EXISTS audience_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text UNIQUE,
  tags text[] DEFAULT ARRAY[]::text[],
  message_count integer DEFAULT 0,
  status text DEFAULT 'active' CHECK (status IN ('active', 'invited', 'revoked')),
  last_active timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Create conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES audience_users(id) ON DELETE CASCADE,
  started_at timestamptz DEFAULT now(),
  last_message_at timestamptz,
  message_count integer DEFAULT 0
);

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
  content text NOT NULL,
  is_answered boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Create analytics_metrics table
CREATE TABLE IF NOT EXISTS analytics_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL UNIQUE,
  total_conversations integer DEFAULT 0,
  active_users integer DEFAULT 0,
  time_created_minutes integer DEFAULT 0,
  messages_answered integer DEFAULT 0,
  messages_unanswered integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create insights table
CREATE TABLE IF NOT EXISTS insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  action_text text,
  created_at timestamptz DEFAULT now()
);

-- Create trending_topics table
CREATE TABLE IF NOT EXISTS trending_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic text NOT NULL,
  mention_count integer DEFAULT 0,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_content_items_folder ON content_items(folder_id);
CREATE INDEX IF NOT EXISTS idx_content_items_status ON content_items(status);
CREATE INDEX IF NOT EXISTS idx_audience_users_status ON audience_users(status);
CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_analytics_date ON analytics_metrics(date);

-- Create storage bucket for content uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('app-81mqyjlan9xd_content', 'app-81mqyjlan9xd_content', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policy for content bucket
CREATE POLICY "Public read access for content"
ON storage.objects FOR SELECT
USING (bucket_id = 'app-81mqyjlan9xd_content');

CREATE POLICY "Authenticated upload access for content"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'app-81mqyjlan9xd_content');

CREATE POLICY "Authenticated delete access for content"
ON storage.objects FOR DELETE
USING (bucket_id = 'app-81mqyjlan9xd_content');