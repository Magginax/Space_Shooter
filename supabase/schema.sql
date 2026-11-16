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

-- ---------------------------------------------------------------------------
-- Display name = the name players see AND log in with (added 2026-10-15).
-- Run this whole block once, after the blocks above.
--
-- profiles.username and the Supabase Auth account never change: the player
-- stays filed under the name they registered with. display_name starts equal
-- to it and the player may change it in PROFILE; from then on they log in
-- with the new name. The page asks login_name_for() which account a name
-- belongs to, then logs in to that account (src/services/auth.js).

alter table public.profiles add column display_name text;
update public.profiles set display_name = username where display_name is null;
alter table public.profiles
  alter column display_name set not null,
  -- Same rule as the username: it is a login name too. Only lower case, so
  -- "unique" also means "unique regardless of letter case".
  add constraint profiles_display_name_format check (display_name ~ '^[a-z0-9_]{3,16}$'),
  add constraint profiles_display_name_unique unique (display_name);

-- New accounts start with display_name = username (replaces the function above).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  name text := lower(split_part(new.email, '@', 1));
begin
  insert into public.profiles (id, username, display_name)
  values (new.id, name, name);
  return new;
end;
$$;

-- The only way to change display_name, and only your own. Players get no
-- update right on profiles, otherwise they could change their role as well.
create function public.set_display_name(new_name text)
returns text
language plpgsql
security definer set search_path = ''
as $$
declare
  name text := lower(btrim(new_name));
begin
  if auth.uid() is null then
    raise exception 'You are not logged in';
  end if;
  update public.profiles set display_name = name where id = auth.uid();
  return name;
exception
  -- Readable messages; src/services/auth.js shows them as they are.
  when unique_violation then
    raise exception 'That username is taken';
  when check_violation then
    raise exception 'Username must be 3-16 characters: letters, numbers or _';
end;
$$;

revoke execute on function public.set_display_name(text) from public, anon;
grant execute on function public.set_display_name(text) to authenticated;

-- Which account a login name belongs to: the original username, or null.
-- Called BEFORE logging in, so visitors (anon) may call it. It only reveals
-- the original username of a display name, never anything else.
create function public.login_name_for(name text)
returns text
language sql
stable
security definer set search_path = ''
as $$
  select username from public.profiles where display_name = lower(btrim(name));
$$;

revoke execute on function public.login_name_for(text) from public;
grant execute on function public.login_name_for(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Level and experience (added 2026-11-11). Run this whole block once.
--
-- Lifetime XP lives on the profile. The game loads it at login and saves the
-- new total after each kill (set_xp). Level is derived from that total with
-- the same curve as src/games/space-shooter/experience.js: leaving level L
-- costs floor(200 * 3^L / 2^L). Level 0 costs 200. Players cannot write the
-- columns themselves, same as display_name, otherwise they could change
-- their role too.

alter table public.profiles
  add column xp integer not null default 0,
  add column level integer not null default 0,
  add constraint profiles_xp_not_negative check (xp >= 0),
  add constraint profiles_level_not_negative check (level >= 0);

-- floor() so a half (1012.5) matches Math.floor in experience.js. A plain
-- cast to integer would round it instead.
create function public.xp_to_next(current_level integer)
returns integer
language sql
immutable
strict
as $$
  select floor(
    200 * (3::numeric ^ current_level::numeric) / (2::numeric ^ current_level::numeric)
  )::integer;
$$;

create function public.level_for_xp(total_xp integer)
returns integer
language plpgsql
immutable
strict
as $$
declare
  remaining integer := total_xp;
  current_level integer := 0;
  cost integer;
begin
  if total_xp < 0 then
    raise exception 'Experience must be zero or more';
  end if;
  loop
    cost := public.xp_to_next(current_level);
    exit when cost is null or cost <= 0 or remaining < cost;
    remaining := remaining - cost;
    current_level := current_level + 1;
  end loop;
  return current_level;
end;
$$;

alter table public.profiles
  add constraint profiles_level_matches_xp check (level = public.level_for_xp(xp));

-- The only way to change xp, and only your own. A lower total is refused so a
-- slow earlier save cannot rewind a newer kill. A higher total is accepted,
-- same trust as a score.
create function public.set_xp(new_xp integer)
returns integer
language plpgsql
security definer set search_path = ''
as $$
declare
  current_xp integer;
begin
  if auth.uid() is null then
    raise exception 'You are not logged in';
  end if;
  if new_xp is null or new_xp < 0 then
    raise exception 'Experience must be zero or more';
  end if;
  select xp into current_xp from public.profiles where id = auth.uid();
  if current_xp is null then
    raise exception 'You are not logged in';
  end if;
  if new_xp < current_xp then
    raise exception 'Experience cannot go down';
  end if;
  update public.profiles
    set xp = new_xp, level = public.level_for_xp(new_xp)
    where id = auth.uid();
  return new_xp;
end;
$$;

revoke execute on function public.set_xp(integer) from public, anon;
grant execute on function public.set_xp(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Gun loadout (added 2026-11-14). Run this whole block once.
--
-- One mounted gun and the ranks bought with level points. Caps match
-- src/games/space-shooter/weapons.js. Players cannot write the column
-- themselves. set_loadout is the only way, and only for the logged-in player.
-- A rank cannot go down, so a slow earlier save cannot rewind a newer one.

alter table public.profiles
  add column loadout jsonb not null default '{
    "gun": "blaster",
    "ranks": {
      "blaster": {"rate": 0, "shot": 0, "pierce": 0},
      "beam": {"rate": 0, "shot": 0, "pierce": 0},
      "pods": {"rate": 0, "shot": 0, "burst": 0}
    }
  }'::jsonb;

-- A whole number rank, or null when the slot is missing or not a whole number.
create function public.loadout_rank(candidate jsonb, gun text, stat text)
returns integer
language sql
immutable
as $$
  select case
    when (candidate #>> array['ranks', gun, stat]) ~ '^[0-9]+$'
    then (candidate #>> array['ranks', gun, stat])::integer
    else null
  end;
$$;

-- Shape, caps, unlocks, and the point total. Ranks going down is checked
-- separately, because that needs the previous value.
create function public.loadout_valid(candidate jsonb, current_level integer)
returns boolean
language plpgsql
immutable
as $$
declare
  gun text;
  blaster_rate integer;
  blaster_shot integer;
  blaster_pierce integer;
  beam_rate integer;
  beam_shot integer;
  beam_pierce integer;
  pods_rate integer;
  pods_shot integer;
  pods_burst integer;
  spent integer;
begin
  if current_level is null or current_level < 0 then
    return false;
  end if;
  if candidate is null or jsonb_typeof(candidate) <> 'object' then
    return false;
  end if;
  if jsonb_typeof(candidate -> 'ranks') <> 'object' then
    return false;
  end if;
  gun := candidate ->> 'gun';
  if gun is null or gun not in ('blaster', 'beam', 'pods') then
    return false;
  end if;

  blaster_rate := public.loadout_rank(candidate, 'blaster', 'rate');
  blaster_shot := public.loadout_rank(candidate, 'blaster', 'shot');
  blaster_pierce := public.loadout_rank(candidate, 'blaster', 'pierce');
  beam_rate := public.loadout_rank(candidate, 'beam', 'rate');
  beam_shot := public.loadout_rank(candidate, 'beam', 'shot');
  beam_pierce := public.loadout_rank(candidate, 'beam', 'pierce');
  pods_rate := public.loadout_rank(candidate, 'pods', 'rate');
  pods_shot := public.loadout_rank(candidate, 'pods', 'shot');
  pods_burst := public.loadout_rank(candidate, 'pods', 'burst');

  if blaster_rate is null or blaster_rate > 2
     or blaster_shot is null or blaster_shot > 1
     or blaster_pierce is null or blaster_pierce > 1
     or beam_rate is null or beam_rate > 2
     or beam_shot is null or beam_shot > 1
     or beam_pierce is null or beam_pierce > 1
     or pods_rate is null or pods_rate > 2
     or pods_shot is null or pods_shot > 1
     or pods_burst is null or pods_burst > 1
  then
    return false;
  end if;

  if gun = 'beam' and current_level < 5 then
    return false;
  end if;
  if gun = 'pods' and current_level < 9 then
    return false;
  end if;
  if current_level < 5 and (beam_rate > 0 or beam_shot > 0 or beam_pierce > 0) then
    return false;
  end if;
  if current_level < 9 and (pods_rate > 0 or pods_shot > 0 or pods_burst > 0) then
    return false;
  end if;

  spent := blaster_rate + blaster_shot + blaster_pierce
    + beam_rate + beam_shot + beam_pierce
    + pods_rate + pods_shot + pods_burst;
  return spent <= current_level;
end;
$$;

create function public.loadout_dropped(previous jsonb, candidate jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  item text;
  spec text[] := array[
    'blaster.rate', 'blaster.shot', 'blaster.pierce',
    'beam.rate', 'beam.shot', 'beam.pierce',
    'pods.rate', 'pods.shot', 'pods.burst'
  ];
begin
  foreach item in array spec loop
    if public.loadout_rank(candidate, split_part(item, '.', 1), split_part(item, '.', 2))
       < public.loadout_rank(previous, split_part(item, '.', 1), split_part(item, '.', 2))
    then
      return true;
    end if;
  end loop;
  return false;
end;
$$;

alter table public.profiles
  add constraint profiles_loadout_matches_level
  check (public.loadout_valid(loadout, level));

-- The only way to change the loadout, and only your own.
create function public.set_loadout(new_loadout jsonb)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  current_level integer;
  current_loadout jsonb;
begin
  if auth.uid() is null then
    raise exception 'You are not logged in';
  end if;
  select level, loadout into current_level, current_loadout
  from public.profiles where id = auth.uid();
  if current_level is null then
    raise exception 'You are not logged in';
  end if;
  if not public.loadout_valid(new_loadout, current_level) then
    raise exception 'That loadout is not allowed';
  end if;
  if public.loadout_dropped(current_loadout, new_loadout) then
    raise exception 'A rank cannot go down';
  end if;
  update public.profiles
    set loadout = new_loadout
    where id = auth.uid();
  return new_loadout;
end;
$$;

revoke execute on function public.set_loadout(jsonb) from public, anon;
grant execute on function public.set_loadout(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Gun nodes (added 2026-11-14, after the loadout block). Run this whole
-- block once. Each rank has its own level, matching NODE_LEVELS in
-- src/games/space-shooter/weapons.js. Pods use pierce instead of burst.
-- Reaching a gun's level mounts it. It does not buy that gun's nodes.
--
-- Replace the check function before rewriting rows. profiles_loadout_matches_level
-- still calls loadout_valid, and the previous body requires pods.burst, so the
-- update below would be rejected if it ran first.

create or replace function public.loadout_valid(candidate jsonb, current_level integer)
returns boolean
language plpgsql
immutable
as $$
declare
  gun text;
  blaster_rate integer;
  blaster_shot integer;
  blaster_pierce integer;
  beam_rate integer;
  beam_shot integer;
  beam_pierce integer;
  pods_rate integer;
  pods_shot integer;
  pods_pierce integer;
begin
  if current_level is null or current_level < 0 then
    return false;
  end if;
  if candidate is null or jsonb_typeof(candidate) <> 'object' then
    return false;
  end if;
  if jsonb_typeof(candidate -> 'ranks') <> 'object' then
    return false;
  end if;
  gun := candidate ->> 'gun';
  if gun is null or gun not in ('blaster', 'beam', 'pods') then
    return false;
  end if;

  blaster_rate := public.loadout_rank(candidate, 'blaster', 'rate');
  blaster_shot := public.loadout_rank(candidate, 'blaster', 'shot');
  blaster_pierce := public.loadout_rank(candidate, 'blaster', 'pierce');
  beam_rate := public.loadout_rank(candidate, 'beam', 'rate');
  beam_shot := public.loadout_rank(candidate, 'beam', 'shot');
  beam_pierce := public.loadout_rank(candidate, 'beam', 'pierce');
  pods_rate := public.loadout_rank(candidate, 'pods', 'rate');
  pods_shot := public.loadout_rank(candidate, 'pods', 'shot');
  pods_pierce := public.loadout_rank(candidate, 'pods', 'pierce');

  if blaster_rate is null or blaster_shot is null or blaster_pierce is null
     or beam_rate is null or beam_shot is null or beam_pierce is null
     or pods_rate is null or pods_shot is null or pods_pierce is null
  then
    return false;
  end if;

  -- Caps, then the level of the highest node that rank includes.
  if blaster_rate > 2 or (blaster_rate >= 1 and current_level < 2) or (blaster_rate >= 2 and current_level < 4)
     or blaster_shot > 1 or (blaster_shot >= 1 and current_level < 3)
     or blaster_pierce > 1 or (blaster_pierce >= 1 and current_level < 6)
     or beam_rate > 2 or (beam_rate >= 1 and current_level < 7) or (beam_rate >= 2 and current_level < 9)
     or beam_shot > 1 or (beam_shot >= 1 and current_level < 8)
     or beam_pierce > 1 or (beam_pierce >= 1 and current_level < 11)
     or pods_rate > 2 or (pods_rate >= 1 and current_level < 12) or (pods_rate >= 2 and current_level < 14)
     or pods_shot > 1 or (pods_shot >= 1 and current_level < 13)
     or pods_pierce > 1 or (pods_pierce >= 1 and current_level < 16)
  then
    return false;
  end if;

  if gun = 'beam' and current_level < 5 then
    return false;
  end if;
  if gun = 'pods' and current_level < 10 then
    return false;
  end if;
  return true;
end;
$$;

create or replace function public.loadout_dropped(previous jsonb, candidate jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  item text;
  spec text[] := array[
    'blaster.rate', 'blaster.shot', 'blaster.pierce',
    'beam.rate', 'beam.shot', 'beam.pierce',
    'pods.rate', 'pods.shot', 'pods.pierce'
  ];
begin
  foreach item in array spec loop
    if public.loadout_rank(candidate, split_part(item, '.', 1), split_part(item, '.', 2))
       < public.loadout_rank(previous, split_part(item, '.', 1), split_part(item, '.', 2))
    then
      return true;
    end if;
  end loop;
  return false;
end;
$$;

update public.profiles
set loadout = jsonb_set(
  loadout #- '{ranks,pods,burst}',
  '{ranks,pods,pierce}',
  coalesce(loadout #> '{ranks,pods,burst}', '0'::jsonb)
)
where loadout #>> '{ranks,pods,burst}' is not null
  and loadout #>> '{ranks,pods,pierce}' is null;

alter table public.profiles
  alter column loadout set default '{
    "gun": "blaster",
    "ranks": {
      "blaster": {"rate": 0, "shot": 0, "pierce": 0},
      "beam": {"rate": 0, "shot": 0, "pierce": 0},
      "pods": {"rate": 0, "shot": 0, "pierce": 0}
    }
  }'::jsonb;
