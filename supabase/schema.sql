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
-- No anti-cheat on purpose: this is a school project.
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

-- ---------------------------------------------------------------------------
-- Logged-in players may use the leaderboard too (added 2026-10-14).
-- After login the Supabase client sends the player's token, so the database
-- sees the role "authenticated" instead of "anon". Without this block the
-- leaderboard would stop working for logged-in players.
-- If the table already exists, run only this block in the SQL Editor.
alter policy "Anyone can read scores" on public.scores to anon, authenticated;
alter policy "Anyone can submit a score" on public.scores to anon, authenticated;
grant select, insert on public.scores to authenticated;

-- ---------------------------------------------------------------------------
-- Accounts and roles (added 2026-10-14). Run this whole block once.
--
-- Passwords are NOT stored in our tables. Supabase Auth keeps accounts in its
-- own table auth.users and stores only a bcrypt hash of each password, so not
-- even the dashboard can show it. The public key cannot read auth.users.
--
-- Players log in with a username only. Supabase Auth needs an e-mail, so
-- src/services/auth.js turns "pilot42" into "pilot42@players.space-shooter.local".
-- Nothing is ever sent there. For this to work, in the dashboard:
--   Authentication -> Sign In / Providers -> Email -> turn OFF "Confirm email".

-- Roles: admin (manages players), user (normal player), test (account for
-- `npm run test:db`). An enum rejects any other value.
create type public.app_role as enum ('admin', 'user', 'test');

-- One row per account, with what the game needs to know about the player.
create table public.profiles (
  id         uuid            primary key references auth.users (id) on delete cascade,
  username   text            not null unique,
  role       public.app_role not null default 'user',
  created_at timestamptz     not null default now(),
  -- Same rule as USERNAME_PATTERN in src/services/auth.js.
  constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,16}$')
);

-- Every new account gets a profile automatically. The username is the part of
-- the e-mail before "@", so it always matches what the player logs in with.
-- The role is never taken from the sign-up request: everyone starts as 'user',
-- otherwise anyone could sign up as an admin.
-- "security definer" = the function runs with the rights of its owner, because
-- the new player is not logged in yet and could not insert the row themselves.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, lower(split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Role of the logged-in player (null when not logged in). The policies below
-- use it. It is "security definer" because a policy on profiles that reads
-- profiles itself would otherwise call itself again and again.
create function public.my_role()
returns public.app_role
language sql
stable
security definer set search_path = ''
as $$
  select role from public.profiles where id = auth.uid();
$$;

alter table public.profiles enable row level security;

-- auth.uid() is the id inside the player's login token; it cannot be faked.
create policy "Players read their own profile, admins read all"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.my_role() = 'admin');

create policy "Admins change profiles"
  on public.profiles for update
  to authenticated
  using (public.my_role() = 'admin')
  with check (public.my_role() = 'admin');

-- Supabase gives anon/authenticated ALL rights on new tables by default, so
-- take them away first and then allow only what is needed:
-- only the role column may be updated, and only by admins (policy above).
-- The username is not changeable because it is also the login name.
-- Nobody gets insert or delete: profiles come and go with the account.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (role) on public.profiles to authenticated;

-- The first admin has to be made by hand, because nobody can make admins yet.
-- Register in the game, then run in the SQL Editor (with your username):
--   update public.profiles set role = 'admin' where username = 'your_name';

-- ---------------------------------------------------------------------------
-- Only logged-in players save scores (added 2026-10-15). Run after the
-- "Accounts and roles" block. Guests may still PLAY (the page lets them), but
-- their scores are not saved: the public key alone can no longer insert.
alter policy "Anyone can submit a score" on public.scores to authenticated;
alter policy "Anyone can submit a score" on public.scores rename to "Logged-in players can submit a score";
revoke insert on public.scores from anon;

-- Test rows ('e2e-test') may now be deleted only by an account with the role
-- 'test', no longer by anyone with the public key.
drop policy "Tests can delete their own rows" on public.scores;
create policy "Test accounts can delete test rows"
  on public.scores for delete
  to authenticated
  using (game = 'e2e-test' and public.my_role() = 'test');
revoke delete on public.scores from anon;
grant delete on public.scores to authenticated;

-- Renaming a player (added 2026-10-15). The username is the part of the login
-- e-mail before "@", so the page renames by changing the account's e-mail
-- (supabase.auth.updateUser). This trigger copies the new name into profiles.
-- Works immediately only while "Confirm email" is OFF; otherwise Supabase
-- would wait for a confirmation mail that can never arrive.
create function public.handle_user_email_change()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  update public.profiles
  set username = lower(split_part(new.email, '@', 1))
  where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();
