import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const migration = new URL('../../supabase/migrations/001_init.sql', import.meta.url);

export async function boot() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant usage on schema public to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);
  await db.exec(readFileSync(migration, 'utf8'));
  return db;
}

export async function addUser(db, id) {
  await db.query('insert into auth.users (id) values ($1)', [id]);
  await db.query('insert into public.profiles (id, display_name) values ($1, $2)', [id, 'u-' + id.slice(-4)]);
}

// Run fn(db) as an authenticated user (RLS applies). Always resets role.
export async function as(db, userId, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false)`);
  try { return await fn(db); }
  finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false)`); }
}
