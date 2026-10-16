create table if not exists public.decks (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    title text not null,
    cards jsonb not null default '[]'::jsonb check (jsonb_typeof(cards) = 'array'),
    created_at timestamptz not null default now()
);

alter table public.decks enable row level security;

grant select, insert, update, delete on public.decks to authenticated;

drop policy if exists "Users can manage their own decks" on public.decks;
create policy "Users can manage their own decks"
    on public.decks
    for all
    to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);