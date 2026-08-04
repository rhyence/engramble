create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  username text,
  plan text not null default 'free' check (plan in ('free', 'paid')),
  is_admin boolean not null default false,
  streak integer not null default 0,
  last_played_date date,
  days_played integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.study_sets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  is_public boolean not null default false,
  share_slug text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.study_sets(id) on delete cascade,
  name text not null,
  color text not null,
  sequence_enabled boolean not null default false,
  sort_order integer not null default 0
);

create table if not exists public.terms (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete cascade,
  term text not null,
  def text not null,
  blackout_words text,
  sort_order integer not null default 0
);

create table if not exists public.daily_records (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  played_date date not null,
  connections_completed boolean not null default false,
  connections_mistakes integer not null default 0,
  connections_score integer not null default 0,
  reveal_completed boolean not null default false,
  reveal_score integer not null default 0,
  blackout_completed boolean not null default false,
  blackout_score integer not null default 0,
  arrange_completed boolean not null default false,
  arrange_score integer not null default 0,
  total_score integer not null default 0,
  set_id_used uuid references public.study_sets(id) on delete set null,
  unique (user_id, played_date)
);

create table if not exists public.term_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  set_id text,
  category_name text not null,
  term text not null,
  game_mode text not null check (game_mode in ('connections', 'reveal', 'blackout', 'arrange')),
  correct boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists study_sets_owner_id_idx on public.study_sets(owner_id);
create index if not exists study_sets_share_slug_idx on public.study_sets(share_slug) where share_slug is not null;
create index if not exists categories_set_id_sort_order_idx on public.categories(set_id, sort_order);
create index if not exists terms_category_id_sort_order_idx on public.terms(category_id, sort_order);
create index if not exists daily_records_user_date_idx on public.daily_records(user_id, played_date);
create index if not exists term_attempts_user_created_idx on public.term_attempts(user_id, created_at desc);
create index if not exists term_attempts_user_term_idx on public.term_attempts(user_id, lower(term));
create index if not exists term_attempts_user_category_idx on public.term_attempts(user_id, lower(category_name));
create unique index if not exists profiles_username_unique_idx on public.profiles (lower(username)) where username is not null;

alter table public.categories add column if not exists sequence_enabled boolean not null default false;
alter table public.terms add column if not exists blackout_words text;
alter table public.daily_records add column if not exists blackout_completed boolean not null default false;
alter table public.daily_records add column if not exists blackout_score integer not null default 0;
alter table public.daily_records add column if not exists arrange_completed boolean not null default false;
alter table public.daily_records add column if not exists arrange_score integer not null default 0;
alter table public.term_attempts drop constraint if exists term_attempts_game_mode_check;
alter table public.term_attempts add constraint term_attempts_game_mode_check check (game_mode in ('connections', 'reveal', 'blackout', 'arrange'));

create schema if not exists app_private;

create or replace function app_private.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and is_admin = true
  );
$$;

revoke all on function app_private.current_user_is_admin() from public;
grant usage on schema app_private to authenticated;
grant execute on function app_private.current_user_is_admin() to authenticated;

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friendships_no_self check (requester_id <> addressee_id)
);

create unique index if not exists friendships_pair_unique_idx on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists friendships_requester_idx on public.friendships(requester_id);
create index if not exists friendships_addressee_idx on public.friendships(addressee_id);
create index if not exists friendships_status_idx on public.friendships(status);

create table if not exists public.push_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  subscription jsonb not null,
  reminders_enabled boolean not null default true,
  streak_reminders_enabled boolean not null default true,
  leaderboard_reminders_enabled boolean not null default true,
  last_streak_notified_date date,
  last_leaderboard_notified_date date,
  last_random_study_notified_date date,
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications_queue (
  id uuid primary key default gen_random_uuid(),
  target text not null default 'all',
  title text not null,
  body text not null,
  url text not null default '/',
  sent boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.study_sets enable row level security;
alter table public.categories enable row level security;
alter table public.terms enable row level security;
alter table public.daily_records enable row level security;
alter table public.term_attempts enable row level security;
alter table public.friendships enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notifications_queue enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.study_sets, public.categories, public.terms to anon;
grant select, insert, update, delete on public.profiles, public.study_sets, public.categories, public.terms, public.daily_records to authenticated;
grant select, insert, delete on public.term_attempts to authenticated;
grant select, insert, update, delete on public.friendships to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant select, insert on public.notifications_queue to authenticated;

create policy "profiles are owned by user"
  on public.profiles
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "profiles usernames are searchable by signed in users"
  on public.profiles
  for select
  to authenticated
  using (true);

create policy "admins can update profiles"
  on public.profiles
  for update
  to authenticated
  using (app_private.current_user_is_admin())
  with check (app_private.current_user_is_admin());

create policy "owners can manage sets"
  on public.study_sets
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "public sets are readable"
  on public.study_sets
  for select
  to anon, authenticated
  using (is_public = true or (select auth.uid()) = owner_id);

create policy "categories readable through visible sets"
  on public.categories
  for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.study_sets s
      where s.id = set_id and (s.is_public = true or s.owner_id = (select auth.uid()))
    )
  );

create policy "owners can manage categories"
  on public.categories
  to authenticated
  using (
    exists (
      select 1 from public.study_sets s
      where s.id = set_id and s.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.study_sets s
      where s.id = set_id and s.owner_id = (select auth.uid())
    )
  );

create policy "terms readable through visible sets"
  on public.terms
  for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.categories c
      join public.study_sets s on s.id = c.set_id
      where c.id = category_id and (s.is_public = true or s.owner_id = (select auth.uid()))
    )
  );

create policy "owners can manage terms"
  on public.terms
  to authenticated
  using (
    exists (
      select 1 from public.categories c
      join public.study_sets s on s.id = c.set_id
      where c.id = category_id and s.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.categories c
      join public.study_sets s on s.id = c.set_id
      where c.id = category_id and s.owner_id = (select auth.uid())
    )
  );

create policy "daily records are owned by user"
  on public.daily_records
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "friends can read daily records"
  on public.daily_records
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id = (select auth.uid()) and f.addressee_id = daily_records.user_id)
          or (f.addressee_id = (select auth.uid()) and f.requester_id = daily_records.user_id)
        )
    )
  );

create policy "term attempts are owned by user"
  on public.term_attempts
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "users can read their friendships"
  on public.friendships
  for select
  to authenticated
  using ((select auth.uid()) = requester_id or (select auth.uid()) = addressee_id);

create policy "users can request friendships"
  on public.friendships
  for insert
  to authenticated
  with check ((select auth.uid()) = requester_id and status = 'pending');

create policy "users can update friendships they participate in"
  on public.friendships
  for update
  to authenticated
  using ((select auth.uid()) = requester_id or (select auth.uid()) = addressee_id)
  with check ((select auth.uid()) = requester_id or (select auth.uid()) = addressee_id);

create policy "users can delete friendships they participate in"
  on public.friendships
  for delete
  to authenticated
  using ((select auth.uid()) = requester_id or (select auth.uid()) = addressee_id);

create policy "users manage their push subscription"
  on public.push_subscriptions
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "signed in users can read notification queue"
  on public.notifications_queue
  for select
  to authenticated
  using (true);

create policy "admins can queue notifications"
  on public.notifications_queue
  for insert
  to authenticated
  with check (app_private.current_user_is_admin());

-- Production reminder schedule currently runs at 23:00, 04:00, and 11:00 UTC,
-- which is 7:00 AM, 12:00 PM, and 7:00 PM Asia/Manila:
-- select net.http_post(
--   url := 'https://giknuzqnixrzpvyxszxs.supabase.co/functions/v1/engramble-push-notify',
--   headers := '{"Content-Type":"application/json"}'::jsonb,
--   body := '{}'::jsonb
-- );
