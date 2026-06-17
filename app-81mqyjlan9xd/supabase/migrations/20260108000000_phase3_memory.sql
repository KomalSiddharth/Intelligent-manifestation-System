
-- Phase 3: Infinite Personalization (Memory)
-- Table: user_psych_profile
-- Stores high-level psychological attributes extracted from conversations.
create table if not exists public.user_psych_profile (
    user_id uuid references auth.users on delete cascade primary key,
    profile_id uuid references public.mind_profile(id) on delete cascade,
    core_desire text, -- e.g., "Financial Freedom", "Inner Peace"
    limiting_beliefs text[], -- e.g., ["I am not good enough", "Money is evil"]
    emotional_trends jsonb, -- e.g., { "last_5_moods": ["distressed", "neutral", "motivated"] }
    goals jsonb, -- e.g., { "short_term": "...", "long_term": "..." }
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS for user_psych_profile
alter table public.user_psych_profile enable row level security;

create policy "Users can view their own psych profile"
    on public.user_psych_profile for select
    using (auth.uid() = user_id);

create policy "Users can update their own psych profile"
    on public.user_psych_profile for update
    using (auth.uid() = user_id);

create policy "Users can insert their own psych profile"
    on public.user_psych_profile for insert
    with check (auth.uid() = user_id);

-- Table: conversation_summaries
-- Stores episodic memory of past sessions.
create table if not exists public.conversation_summaries (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users on delete cascade not null,
    session_id uuid references public.conversations(id) on delete cascade not null,
    summary text not null,
    key_insights text[],
    action_items text[], -- e.g., ["Meditate for 5 mins", "Watch Video X"]
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS for conversation_summaries
alter table public.conversation_summaries enable row level security;

create policy "Users can view their own conversation summaries"
    on public.conversation_summaries for select
    using (auth.uid() = user_id);

-- Function to update updated_at timestamp
create or replace function public.handle_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

create trigger on_psych_profile_updated
    before update on public.user_psych_profile
    for each row execute procedure public.handle_updated_at();
