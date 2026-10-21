create table public.decks (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    title text not null,
    cards jsonb not null default '[]'::jsonb check (jsonb_typeof(cards) = 'array'),
    created_at timestamptz not null default now()
);

create index decks_user_id_created_at_idx
    on public.decks (user_id, created_at desc);

alter table public.decks enable row level security;

revoke all privileges on table public.decks from anon, public;
grant select, insert, update, delete on public.decks to authenticated;

create policy "Users can manage their own decks"
    on public.decks
    for all
    to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);
