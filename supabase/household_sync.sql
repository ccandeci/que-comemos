begin;

create schema if not exists que_comemos_private;
revoke all on schema que_comemos_private from public, anon, authenticated;
grant usage on schema que_comemos_private to authenticated;

alter table public.household_items add column revision bigint not null default 0;
grant select on public.households, public.household_items to authenticated;

create policy household_sync_insert on public.household_items
as restrictive for insert to authenticated
with check (item_key <> 'que-comemos/state-v1');
create policy household_sync_update on public.household_items
as restrictive for update to authenticated
using (item_key <> 'que-comemos/state-v1')
with check (item_key <> 'que-comemos/state-v1');
create policy household_sync_delete on public.household_items
as restrictive for delete to authenticated
using (item_key <> 'que-comemos/state-v1');

drop policy household_create on public.households;
drop policy household_manage_partner on public.households;
create index households_owner_idx on public.households (owner_id);
create index households_partner_idx on public.households (partner_id) where partner_id is not null;

create table que_comemos_private.invitations (
  household_id uuid primary key references public.households(id) on delete cascade,
  email text not null,
  digest bytea not null unique,
  expires_at timestamptz not null
);
alter table que_comemos_private.invitations enable row level security;

create function que_comemos_private.create_home() returns uuid
language plpgsql security definer set search_path = '' as $$
declare member uuid := auth.uid(); home uuid;
begin
  if member is null then raise exception 'Iniciá sesión.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(member::text, 70518));
  if exists (select 1 from public.households where member in (owner_id, partner_id)) then
    raise exception 'Ya pertenecés a un hogar.';
  end if;
  insert into public.households(owner_id) values (member) returning id into home;
  return home;
end;
$$;

create function que_comemos_private.invite(p_home uuid, p_email text) returns text
language plpgsql security definer set search_path = '' as $$
declare member uuid := auth.uid(); token text; address text := lower(trim(p_email));
begin
  if member is null then raise exception 'Iniciá sesión.'; end if;
  perform 1 from public.households
    where id = p_home and owner_id = member and partner_id is null for update;
  if not found then raise exception 'Solo el titular de un hogar sin pareja puede invitar.'; end if;
  if address is null or length(address) > 254 or address !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'Ingresá un correo válido.';
  end if;
  token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into que_comemos_private.invitations values
    (p_home, address, extensions.digest(token, 'sha256'), now() + interval '48 hours')
  on conflict (household_id) do update
    set email = excluded.email, digest = excluded.digest, expires_at = excluded.expires_at;
  return token;
end;
$$;

create function que_comemos_private.join_home(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare member uuid := auth.uid(); home uuid; token_hash bytea;
begin
  if member is null then raise exception 'Iniciá sesión.'; end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'Invitación inválida.'; end if;
  token_hash := extensions.digest(p_token, 'sha256');
  perform pg_advisory_xact_lock(hashtextextended(member::text, 70518));
  if exists (select 1 from public.households where member in (owner_id, partner_id)) then
    raise exception 'Ya pertenecés a un hogar.';
  end if;
  select household_id into home from que_comemos_private.invitations where digest = token_hash;
  perform 1 from public.households where id = home and partner_id is null for update;
  if not found then raise exception 'La invitación dejó de estar disponible.'; end if;
  delete from que_comemos_private.invitations i
    using auth.users u
    where i.household_id = home and i.digest = token_hash and i.expires_at > now()
      and u.id = member and u.email_confirmed_at is not null and lower(u.email) = i.email;
  if not found then raise exception 'La invitación venció o corresponde a otro correo verificado.'; end if;
  update public.households set partner_id = member where id = home;
  return home;
end;
$$;

create function que_comemos_private.save_state(p_home uuid, p_revision bigint, p_state jsonb) returns bigint
language plpgsql security definer set search_path = '' as $$
declare member uuid := auth.uid(); saved_revision bigint;
begin
  if member is null then raise exception 'Iniciá sesión.'; end if;
  perform 1 from public.households
    where id = p_home and member in (owner_id, partner_id) for share;
  if not found then raise exception 'El hogar no está disponible.'; end if;
  if p_state is null or jsonb_typeof(p_state) <> 'object' or octet_length(p_state::text) > 1048576 then
    raise exception 'El tamaño máximo de los datos del hogar es 1 MB.';
  end if;
  if p_revision = 0 then
    insert into public.household_items(household_id, item_key, payload, revision)
      values (p_home, 'que-comemos/state-v1', p_state, 1)
      on conflict do nothing returning revision into saved_revision;
  else
    update public.household_items set payload = p_state, revision = revision + 1
      where household_id = p_home and item_key = 'que-comemos/state-v1' and revision = p_revision
      returning revision into saved_revision;
  end if;
  return saved_revision;
end;
$$;

create function public.qc_create_home() returns uuid language sql set search_path = ''
as $$ select que_comemos_private.create_home() $$;
create function public.qc_invite(p_home uuid, p_email text) returns text language sql set search_path = ''
as $$ select que_comemos_private.invite(p_home, p_email) $$;
create function public.qc_join_home(p_token text) returns uuid language sql set search_path = ''
as $$ select que_comemos_private.join_home(p_token) $$;
create function public.qc_save_state(p_home uuid, p_revision bigint, p_state jsonb) returns bigint language sql set search_path = ''
as $$ select que_comemos_private.save_state(p_home, p_revision, p_state) $$;

revoke execute on all functions in schema que_comemos_private from public, anon, authenticated;
grant execute on all functions in schema que_comemos_private to authenticated;
revoke execute on function public.qc_create_home(), public.qc_invite(uuid,text),
  public.qc_join_home(text), public.qc_save_state(uuid,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.qc_create_home(), public.qc_invite(uuid,text),
  public.qc_join_home(text), public.qc_save_state(uuid,bigint,jsonb) to authenticated;

commit;
