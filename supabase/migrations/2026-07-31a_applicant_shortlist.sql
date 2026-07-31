-- Applicant shortlisting.
--
-- `stage` answers "where are they in the process". `shortlisted` answers
-- "I liked this one". Those genuinely differ: you can rate someone highly at
-- Applied and go cold on them at Interview, and squeezing both into one enum
-- would mean losing an opinion every time the process moves.
--
-- Applied live 2026-07-31 (migration name `applicants_shortlisted`); this file
-- exists so the repo matches the database.

alter table public.applicants
  add column if not exists shortlisted boolean not null default false;

comment on column public.applicants.shortlisted is
  'Your opinion of the candidate, deliberately separate from `stage`, which '
  'tracks process. Set from the row without opening anything.';

-- Partial: the interesting query is "show me the shortlist", never
-- "show me everyone I haven't starred", so indexing the false rows is dead weight.
create index if not exists idx_applicants_shortlisted
  on public.applicants(shortlisted) where shortlisted;
