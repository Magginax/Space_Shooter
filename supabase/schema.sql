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

-- Data rules (added 2026-10-05). src/services/leaderboard.js checks the same
-- rules in the browser, but anyone can call the API directly with the public
-- key, so the database is where they are really enforced.
-- If the table already exists, run only this block in the SQL Editor.
alter table public.scores
  add constraint scores_nickname_length
    check (nickname = btrim(nickname) and char_length(nickname) between 1 and 20),
  add constraint scores_score_not_negative
    check (score >= 0);

-- Test clean-up (added 2026-10-05). tests/db/ saves rows with game = 'e2e-test'
-- and deletes them afterwards. The public key may delete ONLY those rows;
-- players' scores still cannot be deleted.
-- If the table already exists, run only this block in the SQL Editor.
create policy "Tests can delete their own rows"
  on public.scores for delete
  to anon
  using (game = 'e2e-test');

grant delete on public.scores to anon;
