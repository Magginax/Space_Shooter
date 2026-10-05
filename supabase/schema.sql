-- Leaderboard table. Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.

create table public.scores (
  id         bigint generated always as identity primary key,
  game       text        not null default 'dodge',  -- one table serves every game
  nickname   text        not null,
  score      integer     not null,
  created_at timestamptz not null default now()
);

-- Makes "top N scores for a game" fast.
create index scores_game_score_idx on public.scores (game, score desc);

-- Row Level Security: everything is blocked unless a policy below allows it.
alter table public.scores enable row level security;

-- Anyone with the public (publishable/anon) key may read and add scores.
-- Nobody may update or delete them, because there is no policy for that.
-- Score limits / anti-cheat checks will go into the insert policy's "with check" later.
create policy "Anyone can read scores"
  on public.scores for select
  to anon
  using (true);

create policy "Anyone can submit a score"
  on public.scores for insert
  to anon
  with check (true);

grant select, insert on public.scores to anon;
