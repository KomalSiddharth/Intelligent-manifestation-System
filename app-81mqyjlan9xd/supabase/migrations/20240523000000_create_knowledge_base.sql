-- Enable the pgvector extension to work with embedding vectors
create extension if not exists vector;

-- Create a table to store your knowledge base content
create table knowledge_base (
  id bigserial primary key,
  user_id uuid references auth.users not null,
  content text, -- The actual text content
  metadata jsonb, -- Extra info like filename, page number, etc.
  embedding vector(1536) -- OpenAI embeddings are 1536 dimensions
);

-- Enable Row Level Security (RLS)
alter table knowledge_base enable row level security;

-- Create a policy that allows users to only see their own data
create policy "Users can see their own knowledge base"
on knowledge_base for select
using ( auth.uid() = user_id );

create policy "Users can insert their own knowledge base"
on knowledge_base for insert
with check ( auth.uid() = user_id );

create policy "Users can update their own knowledge base"
on knowledge_base for update
using ( auth.uid() = user_id );

create policy "Users can delete their own knowledge base"
on knowledge_base for delete
using ( auth.uid() = user_id );

-- Create a function to search for knowledge
create or replace function match_knowledge (
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
returns table (
  id bigint,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query (
    select
      knowledge_base.id,
      knowledge_base.content,
      knowledge_base.metadata,
      1 - (knowledge_base.embedding <=> query_embedding) as similarity
    from knowledge_base
    where 1 - (knowledge_base.embedding <=> query_embedding) > match_threshold
    order by knowledge_base.embedding <=> query_embedding
    limit match_count
  );
end;
$$;
