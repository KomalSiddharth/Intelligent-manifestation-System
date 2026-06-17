alter table knowledge_sources
add column if not exists word_count integer default 0;
