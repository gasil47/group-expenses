-- Group expenses: schema, RLS, RPCs, audit history. Runs on Supabase (auth schema provided there).

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default ''
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  created_by uuid not null references auth.users(id),
  invite_token text not null unique
    default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups(id),
  user_id uuid not null references auth.users(id),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id),
  description text not null default '',
  amount_fils integer not null check (amount_fils > 0),
  paid_by uuid not null references auth.users(id),
  spent_on date not null default current_date,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.expense_shares (
  expense_id uuid not null references public.expenses(id),
  user_id uuid not null references auth.users(id),
  fils integer not null check (fils >= 0),
  primary key (expense_id, user_id)
);

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id),
  from_user uuid not null references auth.users(id),
  to_user uuid not null references auth.users(id),
  amount_fils integer not null check (amount_fils > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.expense_history (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id),
  changed_by uuid not null references auth.users(id),
  changed_at timestamptz not null default now(),
  action text not null check (action in ('create', 'update', 'delete')),
  old_row jsonb,
  new_row jsonb
);

-- Helpers (security definer so policies do not recurse through RLS)
create function public.is_member(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members
                 where group_id = gid and user_id = auth.uid());
$$;

create function public.expense_group(eid uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select group_id from public.expenses
  where id = eid and exists (select 1 from public.group_members m
                             where m.group_id = expenses.group_id and m.user_id = auth.uid());
$$;

create function public.shares_json(eid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('user_id', s.user_id, 'fils', s.fils)
                            order by s.user_id), '[]'::jsonb)
  from public.expense_shares s
  where s.expense_id = eid and public.expense_group(eid) is not null;
$$;

-- RLS
alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_shares enable row level security;
alter table public.settlements enable row level security;
alter table public.expense_history enable row level security;

create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or exists (
    select 1 from public.group_members a
    where a.user_id = profiles.id and public.is_member(a.group_id)));
create policy profiles_insert on public.profiles for insert to authenticated
  with check (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy groups_select on public.groups for select to authenticated
  using (public.is_member(id));
create policy members_select on public.group_members for select to authenticated
  using (public.is_member(group_id));
create policy expenses_select on public.expenses for select to authenticated
  using (deleted_at is null and public.is_member(group_id));
create policy shares_select on public.expense_shares for select to authenticated
  using (public.is_member(public.expense_group(expense_id)));
create policy settlements_select on public.settlements for select to authenticated
  using (deleted_at is null and public.is_member(group_id));
create policy history_select on public.expense_history for select to authenticated
  using (public.is_member(public.expense_group(expense_id)));
-- No insert/update/delete policies on group data: writes go through the RPCs below.

-- RPCs
create function public.create_group(name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare gid uuid; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  insert into public.groups (name, created_by) values (name, uid) returning id into gid;
  insert into public.group_members (group_id, user_id) values (gid, uid);
  return gid;
end $$;

create function public.join_group(token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare gid uuid; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select id into gid from public.groups where invite_token = token;
  if gid is null then raise exception 'invalid invite'; end if;
  insert into public.group_members (group_id, user_id) values (gid, uid)
    on conflict do nothing;
  return gid;
end $$;

create function public.save_expense(expense jsonb, shares jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  eid uuid := nullif(expense->>'id', '')::uuid;
  gid uuid;
  amt integer := (expense->>'amount_fils')::integer;
  payer uuid := (expense->>'paid_by')::uuid;
  old_exp public.expenses;
  old_json jsonb;
  total bigint;
  bad int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if eid is not null then
    select * into old_exp from public.expenses where id = eid and deleted_at is null;
    if not found then raise exception 'expense not found'; end if;
    gid := old_exp.group_id;
  else
    gid := (expense->>'group_id')::uuid;
  end if;
  if gid is null or not public.is_member(gid) then raise exception 'not a member'; end if;
  if amt is null or amt <= 0 then raise exception 'invalid amount'; end if;
  if jsonb_typeof(shares) is distinct from 'array' then raise exception 'invalid shares'; end if;
  if payer is null or not exists (select 1 from public.group_members
                                  where group_id = gid and user_id = payer) then
    raise exception 'payer is not a member';
  end if;
  select coalesce(sum((s->>'fils')::bigint), 0) into total from jsonb_array_elements(shares) s;
  if total <> amt then raise exception 'shares must add up to amount'; end if;
  select count(*) into bad from jsonb_array_elements(shares) s
    where not exists (select 1 from public.group_members m
                      where m.group_id = gid and m.user_id = (s->>'user_id')::uuid);
  if bad > 0 then raise exception 'share user is not a member'; end if;

  if eid is null then
    insert into public.expenses (group_id, description, amount_fils, paid_by, spent_on, created_by)
    values (gid, coalesce(expense->>'description', ''), amt, payer,
            coalesce((expense->>'spent_on')::date, current_date), uid)
    returning id into eid;
  else
    old_json := to_jsonb(old_exp) || jsonb_build_object('shares', public.shares_json(eid));
    update public.expenses set description = coalesce(expense->>'description', ''),
      amount_fils = amt, paid_by = payer,
      spent_on = coalesce((expense->>'spent_on')::date, old_exp.spent_on)
    where id = eid;
    delete from public.expense_shares where expense_id = eid;
  end if;

  insert into public.expense_shares (expense_id, user_id, fils)
  select eid, (s->>'user_id')::uuid, (s->>'fils')::integer from jsonb_array_elements(shares) s;

  insert into public.expense_history (expense_id, changed_by, action, old_row, new_row)
  values (eid, uid, case when old_json is null then 'create' else 'update' end, old_json,
    (select to_jsonb(e) || jsonb_build_object('shares', public.shares_json(eid))
     from public.expenses e where e.id = eid));
  return eid;
end $$;

create function public.delete_expense(id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); old_exp public.expenses;
begin
  select * into old_exp from public.expenses e where e.id = delete_expense.id and e.deleted_at is null;
  if not found then raise exception 'expense not found'; end if;
  if uid is null or not public.is_member(old_exp.group_id) then raise exception 'not a member'; end if;
  insert into public.expense_history (expense_id, changed_by, action, old_row, new_row)
  values (old_exp.id, uid, 'delete',
    to_jsonb(old_exp) || jsonb_build_object('shares', public.shares_json(old_exp.id)), null);
  update public.expenses e set deleted_at = now() where e.id = old_exp.id;
end $$;

create function public.record_payment(grp uuid, to_user uuid, amount integer) returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); sid uuid;
begin
  if uid is null or not public.is_member(grp) then raise exception 'not a member'; end if;
  if amount is null or amount <= 0 then raise exception 'invalid amount'; end if;
  if to_user = uid or not exists (select 1 from public.group_members
                                  where group_id = grp and user_id = to_user) then
    raise exception 'invalid recipient';
  end if;
  insert into public.settlements (group_id, from_user, to_user, amount_fils, created_by)
  values (grp, uid, to_user, amount, uid) returning id into sid;
  return sid;
end $$;

-- Full audit history for a group, including soft-deleted expenses.
create function public.group_history(grp uuid) returns setof public.expense_history
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_member(grp) then raise exception 'not a member'; end if;
  return query select h.* from public.expense_history h
    join public.expenses e on e.id = h.expense_id
    where e.group_id = grp order by h.changed_at desc;
end $$;

-- Privileges
revoke all on all tables in schema public from anon, authenticated;
grant select on public.groups, public.group_members, public.expenses,
  public.expense_shares, public.settlements, public.expense_history to authenticated;
grant select, insert, update on public.profiles to authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.is_member(uuid), public.create_group(text),
  public.join_group(text), public.save_expense(jsonb, jsonb),
  public.delete_expense(uuid), public.record_payment(uuid, uuid, integer),
  public.expense_group(uuid), public.shares_json(uuid), public.group_history(uuid) to authenticated;
