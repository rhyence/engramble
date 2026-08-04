alter table public.categories add column if not exists sequence_enabled boolean not null default false;

alter table public.terms add column if not exists blackout_words text;

alter table public.daily_records add column if not exists blackout_completed boolean not null default false;
alter table public.daily_records add column if not exists blackout_score integer not null default 0;
alter table public.daily_records add column if not exists arrange_completed boolean not null default false;
alter table public.daily_records add column if not exists arrange_score integer not null default 0;

alter table public.term_attempts drop constraint if exists term_attempts_game_mode_check;
alter table public.term_attempts add constraint term_attempts_game_mode_check
  check (game_mode in ('connections', 'reveal', 'blackout', 'arrange'));
