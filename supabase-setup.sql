-- ============================================================
-- Configuration Supabase pour le portfolio
-- A executer dans le SQL Editor de votre projet Supabase
-- ============================================================

-- Table unique contenant le contenu publie du site
create table if not exists portfolio (
  id integer primary key,
  data jsonb not null,
  published_at timestamptz not null default now()
);

-- Securite au niveau des lignes
alter table portfolio enable row level security;

-- Lecture publique : tous les visiteurs peuvent lire le contenu du site
create policy "lecture publique"
  on portfolio for select
  using (true);

-- Ecriture reservee a l'admin connecte (Supabase Auth)
create policy "insertion authentifiee"
  on portfolio for insert
  to authenticated
  with check (true);

create policy "mise a jour authentifiee"
  on portfolio for update
  to authenticated
  using (true);
