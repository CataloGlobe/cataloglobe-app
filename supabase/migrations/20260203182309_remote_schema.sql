create extension if not exists "pg_cron" with schema "pg_catalog";

drop extension if exists "pg_net";


  create table if not exists "public"."business_collection_schedules" (
    "id" uuid not null default gen_random_uuid(),
    "business_id" uuid not null,
    "collection_id" uuid not null,
    "slot" text not null,
    "days_of_week" smallint[] not null,
    "start_time" time without time zone not null,
    "end_time" time without time zone not null,
    "priority" integer not null default 0,
    "is_active" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."business_collection_schedules" enable row level security;


  create table if not exists "public"."business_item_overrides" (
    "id" uuid not null default gen_random_uuid(),
    "business_id" uuid not null,
    "item_id" uuid not null,
    "price_override" numeric(10,2),
    "visible_override" boolean,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."business_item_overrides" enable row level security;


  create table if not exists "public"."businesses" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid,
    "name" text not null,
    "city" text,
    "slug" text not null,
    "created_at" timestamp with time zone default now(),
    "address" text,
    "type" text default 'restaurant'::text,
    "updated_at" timestamp without time zone default now(),
    "cover_image" text,
    "theme" jsonb,
    "timezone" text not null default 'Europe/Rome'::text,
    "is_public" boolean not null default true
      );


alter table "public"."businesses" enable row level security;


  create table if not exists "public"."collection_items" (
    "id" uuid not null default gen_random_uuid(),
    "collection_id" uuid not null,
    "section_id" uuid not null,
    "item_id" uuid not null,
    "order_index" integer not null default 0,
    "visible" boolean not null default true
      );


alter table "public"."collection_items" enable row level security;


  create table if not exists "public"."collection_sections" (
    "id" uuid not null default gen_random_uuid(),
    "collection_id" uuid not null,
    "order_index" integer not null default 0,
    "base_category_id" uuid not null,
    "label" text not null
      );


alter table "public"."collection_sections" enable row level security;


  create table if not exists "public"."collections" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "description" text,
    "collection_type" text not null default 'generic'::text,
    "style" jsonb,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "kind" text not null default 'standard'::text,
    "user_id" uuid not null default auth.uid()
      );


alter table "public"."collections" enable row level security;


  create table if not exists "public"."item_categories" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "slug" text not null,
    "created_at" timestamp with time zone not null default now(),
    "type" text not null default 'generic'::text,
    "user_id" uuid not null default auth.uid()
      );


alter table "public"."item_categories" enable row level security;


  create table if not exists "public"."item_tags" (
    "item_id" uuid not null,
    "tag_id" uuid not null
      );


alter table "public"."item_tags" enable row level security;


  create table if not exists "public"."items" (
    "id" uuid not null default gen_random_uuid(),
    "type" text not null default 'generic'::text,
    "name" text not null,
    "description" text,
    "base_price" numeric(10,2),
    "duration" integer,
    "metadata" jsonb,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "category_id" uuid not null,
    "user_id" uuid not null default auth.uid()
      );


alter table "public"."items" enable row level security;


  create table "public"."otp_challenges" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "code_hash" text not null,
    "created_at" timestamp with time zone not null default now(),
    "expires_at" timestamp with time zone not null,
    "consumed_at" timestamp with time zone,
    "attempts" integer not null default 0,
    "max_attempts" integer not null default 5,
    "last_sent_at" timestamp with time zone default now(),
    "send_count" integer not null default 0,
    "request_ip" inet,
    "user_agent" text,
    "window_start_at" timestamp with time zone not null default now(),
    "locked_until" timestamp with time zone
      );


alter table "public"."otp_challenges" enable row level security;


  create table "public"."otp_session_verifications" (
    "session_id" uuid not null,
    "user_id" uuid not null,
    "verified_at" timestamp with time zone not null default now()
      );



  create table if not exists "public"."profiles" (
    "id" uuid not null,
    "name" text,
    "avatar_url" text,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."profiles" enable row level security;


  create table if not exists "public"."qr_scans" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "business_id" uuid,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."qr_scans" enable row level security;


  create table if not exists "public"."reviews" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid,
    "rating" integer,
    "comment" text,
    "source" text default 'internal'::text,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "response" text,
    "response_date" timestamp with time zone,
    "business_id" uuid,
    "tags" text[]
      );


alter table "public"."reviews" enable row level security;


  create table if not exists "public"."tags" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "slug" text not null,
    "created_at" timestamp with time zone not null default now(),
    "user_id" uuid default auth.uid()
      );


alter table "public"."tags" enable row level security;

CREATE UNIQUE INDEX business_collection_schedules_pkey ON public.business_collection_schedules USING btree (id);

CREATE UNIQUE INDEX business_item_overrides_pkey ON public.business_item_overrides USING btree (id);

CREATE UNIQUE INDEX business_item_overrides_unique ON public.business_item_overrides USING btree (business_id, item_id);

CREATE UNIQUE INDEX businesses_pkey ON public.businesses USING btree (id);

CREATE UNIQUE INDEX businesses_slug_key ON public.businesses USING btree (slug);

CREATE UNIQUE INDEX collection_items_pkey1 ON public.collection_items USING btree (id);

CREATE UNIQUE INDEX collection_items_unique ON public.collection_items USING btree (collection_id, item_id);

CREATE UNIQUE INDEX collection_sections_pkey ON public.collection_sections USING btree (id);

CREATE UNIQUE INDEX collections_pkey1 ON public.collections USING btree (id);

CREATE INDEX idx_collection_items_collection ON public.collection_items USING btree (collection_id);

CREATE INDEX idx_collection_items_section ON public.collection_items USING btree (section_id);

CREATE INDEX idx_collection_sections_collection ON public.collection_sections USING btree (collection_id);

CREATE INDEX idx_item_categories_type ON public.item_categories USING btree (type);

CREATE INDEX idx_items_category_id ON public.items USING btree (category_id);

CREATE UNIQUE INDEX item_categories_pkey ON public.item_categories USING btree (id);

CREATE UNIQUE INDEX item_categories_user_slug_unique ON public.item_categories USING btree (user_id, slug);

CREATE UNIQUE INDEX item_tags_pkey ON public.item_tags USING btree (item_id, tag_id);

CREATE UNIQUE INDEX items_pkey ON public.items USING btree (id);

CREATE INDEX otp_challenges_active_idx ON public.otp_challenges USING btree (user_id, expires_at DESC) WHERE (consumed_at IS NULL);

CREATE INDEX otp_challenges_consumed_at_idx ON public.otp_challenges USING btree (consumed_at);

CREATE INDEX otp_challenges_expires_at_idx ON public.otp_challenges USING btree (expires_at);

CREATE UNIQUE INDEX otp_challenges_one_active_per_user ON public.otp_challenges USING btree (user_id) WHERE (consumed_at IS NULL);

CREATE UNIQUE INDEX otp_challenges_pkey ON public.otp_challenges USING btree (id);

CREATE INDEX otp_challenges_user_id_idx ON public.otp_challenges USING btree (user_id);

CREATE INDEX otp_challenges_user_idx ON public.otp_challenges USING btree (user_id);

CREATE UNIQUE INDEX otp_session_verifications_pkey ON public.otp_session_verifications USING btree (session_id);

CREATE INDEX otp_session_verifications_user_id_idx ON public.otp_session_verifications USING btree (user_id);

CREATE INDEX otp_session_verifications_verified_at_idx ON public.otp_session_verifications USING btree (verified_at);

CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id);

CREATE UNIQUE INDEX qr_scans_pkey ON public.qr_scans USING btree (id);

CREATE UNIQUE INDEX reviews_pkey ON public.reviews USING btree (id);

CREATE UNIQUE INDEX tags_pkey ON public.tags USING btree (id);

CREATE UNIQUE INDEX tags_user_slug_unique ON public.tags USING btree (user_id, slug);

alter table "public"."business_collection_schedules" add constraint "business_collection_schedules_pkey" PRIMARY KEY using index "business_collection_schedules_pkey";

alter table "public"."business_item_overrides" add constraint "business_item_overrides_pkey" PRIMARY KEY using index "business_item_overrides_pkey";

alter table "public"."businesses" add constraint "businesses_pkey" PRIMARY KEY using index "businesses_pkey";

alter table "public"."collection_items" add constraint "collection_items_pkey1" PRIMARY KEY using index "collection_items_pkey1";

alter table "public"."collection_sections" add constraint "collection_sections_pkey" PRIMARY KEY using index "collection_sections_pkey";

alter table "public"."collections" add constraint "collections_pkey1" PRIMARY KEY using index "collections_pkey1";

alter table "public"."item_categories" add constraint "item_categories_pkey" PRIMARY KEY using index "item_categories_pkey";

alter table "public"."item_tags" add constraint "item_tags_pkey" PRIMARY KEY using index "item_tags_pkey";

alter table "public"."items" add constraint "items_pkey" PRIMARY KEY using index "items_pkey";

alter table "public"."otp_challenges" add constraint "otp_challenges_pkey" PRIMARY KEY using index "otp_challenges_pkey";

alter table "public"."otp_session_verifications" add constraint "otp_session_verifications_pkey" PRIMARY KEY using index "otp_session_verifications_pkey";

alter table "public"."profiles" add constraint "profiles_pkey" PRIMARY KEY using index "profiles_pkey";

alter table "public"."qr_scans" add constraint "qr_scans_pkey" PRIMARY KEY using index "qr_scans_pkey";

alter table "public"."reviews" add constraint "reviews_pkey" PRIMARY KEY using index "reviews_pkey";

alter table "public"."tags" add constraint "tags_pkey" PRIMARY KEY using index "tags_pkey";

alter table "public"."business_collection_schedules" add constraint "business_collection_schedules_business_id_fkey" FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE not valid;

alter table "public"."business_collection_schedules" validate constraint "business_collection_schedules_business_id_fkey";

alter table "public"."business_collection_schedules" add constraint "business_collection_schedules_collection_id_fkey" FOREIGN KEY (collection_id) REFERENCES public.collections(id) ON DELETE CASCADE not valid;

alter table "public"."business_collection_schedules" validate constraint "business_collection_schedules_collection_id_fkey";

alter table "public"."business_collection_schedules" add constraint "business_collection_schedules_slot_check" CHECK ((slot = ANY (ARRAY['primary'::text, 'overlay'::text]))) not valid;

alter table "public"."business_collection_schedules" validate constraint "business_collection_schedules_slot_check";

alter table "public"."business_collection_schedules" add constraint "business_collection_schedules_time_check" CHECK (((start_time IS NOT NULL) AND (end_time IS NOT NULL))) not valid;

alter table "public"."business_collection_schedules" validate constraint "business_collection_schedules_time_check";

alter table "public"."business_item_overrides" add constraint "business_item_overrides_business_fkey" FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE not valid;

alter table "public"."business_item_overrides" validate constraint "business_item_overrides_business_fkey";

alter table "public"."business_item_overrides" add constraint "business_item_overrides_item_fkey" FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE CASCADE not valid;

alter table "public"."business_item_overrides" validate constraint "business_item_overrides_item_fkey";

alter table "public"."business_item_overrides" add constraint "business_item_overrides_unique" UNIQUE using index "business_item_overrides_unique";

alter table "public"."businesses" add constraint "businesses_slug_key" UNIQUE using index "businesses_slug_key";

alter table "public"."businesses" add constraint "businesses_type_check" CHECK ((type = ANY (ARRAY['restaurant'::text, 'bar'::text, 'hotel'::text, 'hairdresser'::text, 'beauty'::text, 'shop'::text, 'other'::text]))) not valid;

alter table "public"."businesses" validate constraint "businesses_type_check";

alter table "public"."businesses" add constraint "businesses_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."businesses" validate constraint "businesses_user_id_fkey";

alter table "public"."collection_items" add constraint "collection_items_collection_fkey" FOREIGN KEY (collection_id) REFERENCES public.collections(id) ON DELETE CASCADE not valid;

alter table "public"."collection_items" validate constraint "collection_items_collection_fkey";

alter table "public"."collection_items" add constraint "collection_items_item_fkey" FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE CASCADE not valid;

alter table "public"."collection_items" validate constraint "collection_items_item_fkey";

alter table "public"."collection_items" add constraint "collection_items_section_fkey" FOREIGN KEY (section_id) REFERENCES public.collection_sections(id) ON DELETE SET NULL not valid;

alter table "public"."collection_items" validate constraint "collection_items_section_fkey";

alter table "public"."collection_items" add constraint "collection_items_unique" UNIQUE using index "collection_items_unique";

alter table "public"."collection_sections" add constraint "collection_sections_base_category_fkey" FOREIGN KEY (base_category_id) REFERENCES public.item_categories(id) ON DELETE RESTRICT not valid;

alter table "public"."collection_sections" validate constraint "collection_sections_base_category_fkey";

alter table "public"."collection_sections" add constraint "collection_sections_collection_fkey" FOREIGN KEY (collection_id) REFERENCES public.collections(id) ON DELETE CASCADE not valid;

alter table "public"."collection_sections" validate constraint "collection_sections_collection_fkey";

alter table "public"."collections" add constraint "collections_kind_check" CHECK ((kind = ANY (ARRAY['standard'::text, 'special'::text]))) not valid;

alter table "public"."collections" validate constraint "collections_kind_check";

alter table "public"."collections" add constraint "collections_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."collections" validate constraint "collections_user_id_fkey";

alter table "public"."item_categories" add constraint "item_categories_type_check" CHECK ((type = ANY (ARRAY['menu'::text, 'services'::text, 'products'::text, 'events'::text, 'offers'::text, 'generic'::text]))) not valid;

alter table "public"."item_categories" validate constraint "item_categories_type_check";

alter table "public"."item_categories" add constraint "item_categories_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."item_categories" validate constraint "item_categories_user_id_fkey";

alter table "public"."item_tags" add constraint "item_tags_item_id_fkey" FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE CASCADE not valid;

alter table "public"."item_tags" validate constraint "item_tags_item_id_fkey";

alter table "public"."item_tags" add constraint "item_tags_tag_id_fkey" FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE not valid;

alter table "public"."item_tags" validate constraint "item_tags_tag_id_fkey";

alter table "public"."items" add constraint "items_category_fkey" FOREIGN KEY (category_id) REFERENCES public.item_categories(id) ON DELETE RESTRICT not valid;

alter table "public"."items" validate constraint "items_category_fkey";

alter table "public"."items" add constraint "items_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."items" validate constraint "items_user_id_fkey";

alter table "public"."otp_challenges" add constraint "otp_challenges_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."otp_challenges" validate constraint "otp_challenges_user_id_fkey";

alter table "public"."otp_session_verifications" add constraint "otp_session_verifications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."otp_session_verifications" validate constraint "otp_session_verifications_user_id_fkey";

alter table "public"."profiles" add constraint "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."profiles" validate constraint "profiles_id_fkey";

alter table "public"."qr_scans" add constraint "qr_scans_restaurant_id_fkey" FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE not valid;

alter table "public"."qr_scans" validate constraint "qr_scans_restaurant_id_fkey";

alter table "public"."reviews" add constraint "reviews_rating_check" CHECK (((rating >= 1) AND (rating <= 5))) not valid;

alter table "public"."reviews" validate constraint "reviews_rating_check";

alter table "public"."reviews" add constraint "reviews_restaurant_id_fkey" FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE not valid;

alter table "public"."reviews" validate constraint "reviews_restaurant_id_fkey";

alter table "public"."reviews" add constraint "reviews_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."reviews" validate constraint "reviews_user_id_fkey";

alter table "public"."tags" add constraint "tags_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."tags" validate constraint "tags_user_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.delete_empty_collection_sections()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  delete from collection_sections cs
  where cs.id = old.section_id
    and not exists (
      select 1
      from collection_items ci
      where ci.section_id = cs.id
    );

  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.duplicate_collection(p_source_collection_id uuid, p_new_name text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_new_collection_id uuid;
begin
  -- 1) Duplica collection
  insert into public.collections (
    name,
    description,
    collection_type,
    style,
    kind,
    user_id
  )
  select
    coalesce(p_new_name, c.name || ' (copia)'),
    c.description,
    c.collection_type,
    c.style,
    c.kind,
    auth.uid()
  from public.collections c
  where c.id = p_source_collection_id
    and c.user_id = auth.uid()
  returning id into v_new_collection_id;

  if v_new_collection_id is null then
    raise exception 'Collection non trovata o accesso non autorizzato';
  end if;

  -- 2) Duplica sections + mapping old -> new
  with src_sections as (
    select *
    from public.collection_sections
    where collection_id = p_source_collection_id
  ),
  inserted_sections as (
    insert into public.collection_sections (
      collection_id,
      base_category_id,
      label,
      order_index
    )
    select
      v_new_collection_id,
      s.base_category_id,
      s.label,
      s.order_index
    from src_sections s
    returning id, base_category_id, label, order_index
  ),
  section_map as (
    select
      ss.id as old_section_id,
      ns.id as new_section_id
    from src_sections ss
    join inserted_sections ns
      on ns.base_category_id = ss.base_category_id
     and ns.label = ss.label
     and ns.order_index = ss.order_index
  )

  -- 3) Duplica collection_items rimappando section_id
  insert into public.collection_items (
    collection_id,
    section_id,
    item_id,
    order_index,
    visible
  )
  select
    v_new_collection_id,
    sm.new_section_id,
    ci.item_id,
    ci.order_index,
    ci.visible
  from public.collection_items ci
  join section_map sm
    on sm.old_section_id = ci.section_id
  where ci.collection_id = p_source_collection_id;

  return v_new_collection_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.duplicate_collection(p_source_collection_id uuid, p_new_name text DEFAULT NULL::text, p_duplicate_items boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_new_collection_id uuid;
begin
  -- 1) Duplica collection
  insert into public.collections (
    name,
    description,
    collection_type,
    style,
    kind,
    user_id
  )
  select
    coalesce(p_new_name, c.name || ' (copia)'),
    c.description,
    c.collection_type,
    c.style,
    c.kind,
    auth.uid()
  from public.collections c
  where c.id = p_source_collection_id
    and c.user_id = auth.uid()
  returning id into v_new_collection_id;

  if v_new_collection_id is null then
    raise exception 'Collection non trovata o accesso non autorizzato';
  end if;

  -- 2) Duplica sections e crea mapping old -> new
  with src_sections as (
    select *
    from public.collection_sections
    where collection_id = p_source_collection_id
  ),
  inserted_sections as (
    insert into public.collection_sections (
      collection_id,
      base_category_id,
      label,
      order_index
    )
    select
      v_new_collection_id,
      s.base_category_id,
      s.label,
      s.order_index
    from src_sections s
    returning id, base_category_id, label, order_index
  ),
  section_map as (
    select
      ss.id as old_section_id,
      ns.id as new_section_id
    from src_sections ss
    join inserted_sections ns
      on ns.base_category_id = ss.base_category_id
     and ns.label = ss.label
     and ns.order_index = ss.order_index
  )
  -- 3) Duplica items solo se richiesto
  insert into public.collection_items (
    collection_id,
    section_id,
    item_id,
    order_index,
    visible
  )
  select
    v_new_collection_id,
    sm.new_section_id,
    ci.item_id,
    ci.order_index,
    ci.visible
  from public.collection_items ci
  join section_map sm
    on sm.old_section_id = ci.section_id
  where ci.collection_id = p_source_collection_id
    and p_duplicate_items = true;

  return v_new_collection_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_collection_item_section_category()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  item_cat uuid;
  section_cat uuid;
  section_collection uuid;
begin
  select category_id into item_cat
  from public.items
  where id = new.item_id;

  select base_category_id, collection_id into section_cat, section_collection
  from public.collection_sections
  where id = new.section_id;

  if section_collection <> new.collection_id then
    raise exception 'section_id does not belong to collection_id';
  end if;

  if item_cat <> section_cat then
    raise exception 'item category does not match section base category';
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  insert into public.profiles (id, name)
  values (new.id, new.raw_user_meta_data->>'name');
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.increment_otp_attempt(challenge_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.otp_challenges
  set attempts = attempts + 1
  where id = challenge_id;
$function$
;

CREATE OR REPLACE FUNCTION public.is_schedule_active_now(days smallint[], start_t time without time zone, end_t time without time zone, tz text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  now_local timestamp;
  dow int;
  prev_dow int;
  now_min int;
  start_min int;
  end_min int;
begin
  if days is null or array_length(days, 1) is null then
    return false;
  end if;

  -- now in business timezone
  now_local := now() at time zone tz;

  -- postgres dow: 0=Sunday .. 6=Saturday (come JS getDay)
  dow := extract(dow from now_local)::int;
  prev_dow := (dow + 6) % 7;

  now_min := extract(hour from now_local)::int * 60 + extract(minute from now_local)::int;
  start_min := extract(hour from start_t)::int * 60 + extract(minute from start_t)::int;
  end_min := extract(hour from end_t)::int * 60 + extract(minute from end_t)::int;

  -- ALL DAY (start == end): attivo tutto il giorno se il day matcha
  if start_min = end_min then
    return dow = any(days);
  end if;

  -- SAME DAY
  if start_min < end_min then
    return (dow = any(days)) and (start_min <= now_min) and (now_min < end_min);
  end if;

  -- OVERNIGHT (start > end)
  return ((dow = any(days)) and (now_min >= start_min))
      or ((prev_dow = any(days)) and (now_min < end_min));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.simple_slug(input text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select lower(regexp_replace(trim(input), '[^a-zA-Z0-9]+', '-', 'g'));
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_days_of_week()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  d smallint;
begin
  if new.days_of_week is null or array_length(new.days_of_week, 1) = 0 then
    raise exception 'days_of_week must contain at least one value';
  end if;

  foreach d in array new.days_of_week loop
    if d < 0 or d > 6 then
      raise exception 'Invalid day_of_week value: %. Must be between 0 and 6', d;
    end if;
  end loop;

  return new;
end;
$function$
;

create or replace view "public"."businesses_with_capabilities" as  WITH business_allowed_catalogs AS (
         SELECT b_1.id,
            b_1.user_id,
            b_1.name,
            b_1.city,
            b_1.slug,
            b_1.created_at,
            b_1.address,
            b_1.type,
            b_1.updated_at,
            b_1.cover_image,
            b_1.theme,
            b_1.timezone,
                CASE
                    WHEN (b_1.type = ANY (ARRAY['restaurant'::text, 'bar'::text, 'hotel'::text])) THEN ARRAY['menu'::text, 'products'::text, 'events'::text, 'offers'::text, 'generic'::text]
                    WHEN (b_1.type = ANY (ARRAY['hairdresser'::text, 'beauty'::text])) THEN ARRAY['services'::text, 'products'::text, 'offers'::text, 'generic'::text]
                    WHEN (b_1.type = 'shop'::text) THEN ARRAY['products'::text, 'offers'::text, 'generic'::text]
                    ELSE ARRAY['generic'::text]
                END AS allowed_catalog_types
           FROM public.businesses b_1
        )
 SELECT id,
    user_id,
    name,
    city,
    slug,
    created_at,
    address,
    type,
    updated_at,
    cover_image,
    theme,
    timezone,
    (( SELECT count(*) AS count
           FROM public.collections c
          WHERE (c.collection_type = ANY (b.allowed_catalog_types))))::integer AS compatible_collection_count,
    (( SELECT count(DISTINCT s.collection_id) AS count
           FROM (public.business_collection_schedules s
             JOIN public.collections c ON ((c.id = s.collection_id)))
          WHERE ((s.business_id = b.id) AND (c.collection_type = ANY (b.allowed_catalog_types)))))::integer AS scheduled_compatible_collection_count,
    ( SELECT c.name
           FROM (public.business_collection_schedules s
             JOIN public.collections c ON ((c.id = s.collection_id)))
          WHERE ((s.business_id = b.id) AND (s.slot = 'primary'::text) AND (s.is_active = true) AND (c.collection_type = ANY (b.allowed_catalog_types)) AND public.is_schedule_active_now(s.days_of_week, s.start_time, s.end_time, b.timezone))
          ORDER BY s.priority DESC, s.updated_at DESC
         LIMIT 1) AS active_primary_collection_name,
    ( SELECT c.name
           FROM (public.business_collection_schedules s
             JOIN public.collections c ON ((c.id = s.collection_id)))
          WHERE ((s.business_id = b.id) AND (s.slot = 'primary'::text) AND (s.is_active = true) AND (c.collection_type = ANY (b.allowed_catalog_types)) AND (( SELECT count(*) AS count
                   FROM (public.business_collection_schedules s2
                     JOIN public.collections c2 ON ((c2.id = s2.collection_id)))
                  WHERE ((s2.business_id = b.id) AND (s2.slot = 'primary'::text) AND (s2.is_active = true) AND (c2.collection_type = ANY (b.allowed_catalog_types)) AND public.is_schedule_active_now(s2.days_of_week, s2.start_time, s2.end_time, b.timezone))) = 0))
          ORDER BY s.priority DESC, s.updated_at DESC
         LIMIT 1) AS fallback_primary_collection_name,
    ( SELECT c.name
           FROM (public.business_collection_schedules s
             JOIN public.collections c ON ((c.id = s.collection_id)))
          WHERE ((s.business_id = b.id) AND (s.is_active = true) AND (c.kind = 'special'::text) AND (c.collection_type = ANY (b.allowed_catalog_types)) AND public.is_schedule_active_now(s.days_of_week, s.start_time, s.end_time, b.timezone))
          ORDER BY s.priority DESC, s.updated_at DESC
         LIMIT 1) AS active_special_collection_name
   FROM business_allowed_catalogs b;


grant delete on table "public"."business_collection_schedules" to "anon";

grant insert on table "public"."business_collection_schedules" to "anon";

grant references on table "public"."business_collection_schedules" to "anon";

grant select on table "public"."business_collection_schedules" to "anon";

grant trigger on table "public"."business_collection_schedules" to "anon";

grant truncate on table "public"."business_collection_schedules" to "anon";

grant update on table "public"."business_collection_schedules" to "anon";

grant delete on table "public"."business_collection_schedules" to "authenticated";

grant insert on table "public"."business_collection_schedules" to "authenticated";

grant references on table "public"."business_collection_schedules" to "authenticated";

grant select on table "public"."business_collection_schedules" to "authenticated";

grant trigger on table "public"."business_collection_schedules" to "authenticated";

grant truncate on table "public"."business_collection_schedules" to "authenticated";

grant update on table "public"."business_collection_schedules" to "authenticated";

grant delete on table "public"."business_collection_schedules" to "service_role";

grant insert on table "public"."business_collection_schedules" to "service_role";

grant references on table "public"."business_collection_schedules" to "service_role";

grant select on table "public"."business_collection_schedules" to "service_role";

grant trigger on table "public"."business_collection_schedules" to "service_role";

grant truncate on table "public"."business_collection_schedules" to "service_role";

grant update on table "public"."business_collection_schedules" to "service_role";

grant delete on table "public"."business_item_overrides" to "anon";

grant insert on table "public"."business_item_overrides" to "anon";

grant references on table "public"."business_item_overrides" to "anon";

grant select on table "public"."business_item_overrides" to "anon";

grant trigger on table "public"."business_item_overrides" to "anon";

grant truncate on table "public"."business_item_overrides" to "anon";

grant update on table "public"."business_item_overrides" to "anon";

grant delete on table "public"."business_item_overrides" to "authenticated";

grant insert on table "public"."business_item_overrides" to "authenticated";

grant references on table "public"."business_item_overrides" to "authenticated";

grant select on table "public"."business_item_overrides" to "authenticated";

grant trigger on table "public"."business_item_overrides" to "authenticated";

grant truncate on table "public"."business_item_overrides" to "authenticated";

grant update on table "public"."business_item_overrides" to "authenticated";

grant delete on table "public"."business_item_overrides" to "service_role";

grant insert on table "public"."business_item_overrides" to "service_role";

grant references on table "public"."business_item_overrides" to "service_role";

grant select on table "public"."business_item_overrides" to "service_role";

grant trigger on table "public"."business_item_overrides" to "service_role";

grant truncate on table "public"."business_item_overrides" to "service_role";

grant update on table "public"."business_item_overrides" to "service_role";

grant delete on table "public"."businesses" to "anon";

grant insert on table "public"."businesses" to "anon";

grant references on table "public"."businesses" to "anon";

grant select on table "public"."businesses" to "anon";

grant trigger on table "public"."businesses" to "anon";

grant truncate on table "public"."businesses" to "anon";

grant update on table "public"."businesses" to "anon";

grant delete on table "public"."businesses" to "authenticated";

grant insert on table "public"."businesses" to "authenticated";

grant references on table "public"."businesses" to "authenticated";

grant select on table "public"."businesses" to "authenticated";

grant trigger on table "public"."businesses" to "authenticated";

grant truncate on table "public"."businesses" to "authenticated";

grant update on table "public"."businesses" to "authenticated";

grant delete on table "public"."businesses" to "service_role";

grant insert on table "public"."businesses" to "service_role";

grant references on table "public"."businesses" to "service_role";

grant select on table "public"."businesses" to "service_role";

grant trigger on table "public"."businesses" to "service_role";

grant truncate on table "public"."businesses" to "service_role";

grant update on table "public"."businesses" to "service_role";

grant delete on table "public"."collection_items" to "anon";

grant insert on table "public"."collection_items" to "anon";

grant references on table "public"."collection_items" to "anon";

grant select on table "public"."collection_items" to "anon";

grant trigger on table "public"."collection_items" to "anon";

grant truncate on table "public"."collection_items" to "anon";

grant update on table "public"."collection_items" to "anon";

grant delete on table "public"."collection_items" to "authenticated";

grant insert on table "public"."collection_items" to "authenticated";

grant references on table "public"."collection_items" to "authenticated";

grant select on table "public"."collection_items" to "authenticated";

grant trigger on table "public"."collection_items" to "authenticated";

grant truncate on table "public"."collection_items" to "authenticated";

grant update on table "public"."collection_items" to "authenticated";

grant delete on table "public"."collection_items" to "service_role";

grant insert on table "public"."collection_items" to "service_role";

grant references on table "public"."collection_items" to "service_role";

grant select on table "public"."collection_items" to "service_role";

grant trigger on table "public"."collection_items" to "service_role";

grant truncate on table "public"."collection_items" to "service_role";

grant update on table "public"."collection_items" to "service_role";

grant delete on table "public"."collection_sections" to "anon";

grant insert on table "public"."collection_sections" to "anon";

grant references on table "public"."collection_sections" to "anon";

grant select on table "public"."collection_sections" to "anon";

grant trigger on table "public"."collection_sections" to "anon";

grant truncate on table "public"."collection_sections" to "anon";

grant update on table "public"."collection_sections" to "anon";

grant delete on table "public"."collection_sections" to "authenticated";

grant insert on table "public"."collection_sections" to "authenticated";

grant references on table "public"."collection_sections" to "authenticated";

grant select on table "public"."collection_sections" to "authenticated";

grant trigger on table "public"."collection_sections" to "authenticated";

grant truncate on table "public"."collection_sections" to "authenticated";

grant update on table "public"."collection_sections" to "authenticated";

grant delete on table "public"."collection_sections" to "service_role";

grant insert on table "public"."collection_sections" to "service_role";

grant references on table "public"."collection_sections" to "service_role";

grant select on table "public"."collection_sections" to "service_role";

grant trigger on table "public"."collection_sections" to "service_role";

grant truncate on table "public"."collection_sections" to "service_role";

grant update on table "public"."collection_sections" to "service_role";

grant delete on table "public"."collections" to "anon";

grant insert on table "public"."collections" to "anon";

grant references on table "public"."collections" to "anon";

grant select on table "public"."collections" to "anon";

grant trigger on table "public"."collections" to "anon";

grant truncate on table "public"."collections" to "anon";

grant update on table "public"."collections" to "anon";

grant delete on table "public"."collections" to "authenticated";

grant insert on table "public"."collections" to "authenticated";

grant references on table "public"."collections" to "authenticated";

grant select on table "public"."collections" to "authenticated";

grant trigger on table "public"."collections" to "authenticated";

grant truncate on table "public"."collections" to "authenticated";

grant update on table "public"."collections" to "authenticated";

grant delete on table "public"."collections" to "service_role";

grant insert on table "public"."collections" to "service_role";

grant references on table "public"."collections" to "service_role";

grant select on table "public"."collections" to "service_role";

grant trigger on table "public"."collections" to "service_role";

grant truncate on table "public"."collections" to "service_role";

grant update on table "public"."collections" to "service_role";

grant delete on table "public"."item_categories" to "anon";

grant insert on table "public"."item_categories" to "anon";

grant references on table "public"."item_categories" to "anon";

grant select on table "public"."item_categories" to "anon";

grant trigger on table "public"."item_categories" to "anon";

grant truncate on table "public"."item_categories" to "anon";

grant update on table "public"."item_categories" to "anon";

grant delete on table "public"."item_categories" to "authenticated";

grant insert on table "public"."item_categories" to "authenticated";

grant references on table "public"."item_categories" to "authenticated";

grant select on table "public"."item_categories" to "authenticated";

grant trigger on table "public"."item_categories" to "authenticated";

grant truncate on table "public"."item_categories" to "authenticated";

grant update on table "public"."item_categories" to "authenticated";

grant delete on table "public"."item_categories" to "service_role";

grant insert on table "public"."item_categories" to "service_role";

grant references on table "public"."item_categories" to "service_role";

grant select on table "public"."item_categories" to "service_role";

grant trigger on table "public"."item_categories" to "service_role";

grant truncate on table "public"."item_categories" to "service_role";

grant update on table "public"."item_categories" to "service_role";

grant delete on table "public"."item_tags" to "anon";

grant insert on table "public"."item_tags" to "anon";

grant references on table "public"."item_tags" to "anon";

grant select on table "public"."item_tags" to "anon";

grant trigger on table "public"."item_tags" to "anon";

grant truncate on table "public"."item_tags" to "anon";

grant update on table "public"."item_tags" to "anon";

grant delete on table "public"."item_tags" to "authenticated";

grant insert on table "public"."item_tags" to "authenticated";

grant references on table "public"."item_tags" to "authenticated";

grant select on table "public"."item_tags" to "authenticated";

grant trigger on table "public"."item_tags" to "authenticated";

grant truncate on table "public"."item_tags" to "authenticated";

grant update on table "public"."item_tags" to "authenticated";

grant delete on table "public"."item_tags" to "service_role";

grant insert on table "public"."item_tags" to "service_role";

grant references on table "public"."item_tags" to "service_role";

grant select on table "public"."item_tags" to "service_role";

grant trigger on table "public"."item_tags" to "service_role";

grant truncate on table "public"."item_tags" to "service_role";

grant update on table "public"."item_tags" to "service_role";

grant delete on table "public"."items" to "anon";

grant insert on table "public"."items" to "anon";

grant references on table "public"."items" to "anon";

grant select on table "public"."items" to "anon";

grant trigger on table "public"."items" to "anon";

grant truncate on table "public"."items" to "anon";

grant update on table "public"."items" to "anon";

grant delete on table "public"."items" to "authenticated";

grant insert on table "public"."items" to "authenticated";

grant references on table "public"."items" to "authenticated";

grant select on table "public"."items" to "authenticated";

grant trigger on table "public"."items" to "authenticated";

grant truncate on table "public"."items" to "authenticated";

grant update on table "public"."items" to "authenticated";

grant delete on table "public"."items" to "service_role";

grant insert on table "public"."items" to "service_role";

grant references on table "public"."items" to "service_role";

grant select on table "public"."items" to "service_role";

grant trigger on table "public"."items" to "service_role";

grant truncate on table "public"."items" to "service_role";

grant update on table "public"."items" to "service_role";

grant delete on table "public"."otp_challenges" to "anon";

grant insert on table "public"."otp_challenges" to "anon";

grant references on table "public"."otp_challenges" to "anon";

grant select on table "public"."otp_challenges" to "anon";

grant trigger on table "public"."otp_challenges" to "anon";

grant truncate on table "public"."otp_challenges" to "anon";

grant update on table "public"."otp_challenges" to "anon";

grant delete on table "public"."otp_challenges" to "authenticated";

grant insert on table "public"."otp_challenges" to "authenticated";

grant references on table "public"."otp_challenges" to "authenticated";

grant select on table "public"."otp_challenges" to "authenticated";

grant trigger on table "public"."otp_challenges" to "authenticated";

grant truncate on table "public"."otp_challenges" to "authenticated";

grant update on table "public"."otp_challenges" to "authenticated";

grant delete on table "public"."otp_challenges" to "service_role";

grant insert on table "public"."otp_challenges" to "service_role";

grant references on table "public"."otp_challenges" to "service_role";

grant select on table "public"."otp_challenges" to "service_role";

grant trigger on table "public"."otp_challenges" to "service_role";

grant truncate on table "public"."otp_challenges" to "service_role";

grant update on table "public"."otp_challenges" to "service_role";

grant delete on table "public"."otp_session_verifications" to "anon";

grant insert on table "public"."otp_session_verifications" to "anon";

grant references on table "public"."otp_session_verifications" to "anon";

grant select on table "public"."otp_session_verifications" to "anon";

grant trigger on table "public"."otp_session_verifications" to "anon";

grant truncate on table "public"."otp_session_verifications" to "anon";

grant update on table "public"."otp_session_verifications" to "anon";

grant delete on table "public"."otp_session_verifications" to "authenticated";

grant insert on table "public"."otp_session_verifications" to "authenticated";

grant references on table "public"."otp_session_verifications" to "authenticated";

grant select on table "public"."otp_session_verifications" to "authenticated";

grant trigger on table "public"."otp_session_verifications" to "authenticated";

grant truncate on table "public"."otp_session_verifications" to "authenticated";

grant update on table "public"."otp_session_verifications" to "authenticated";

grant delete on table "public"."otp_session_verifications" to "service_role";

grant insert on table "public"."otp_session_verifications" to "service_role";

grant references on table "public"."otp_session_verifications" to "service_role";

grant select on table "public"."otp_session_verifications" to "service_role";

grant trigger on table "public"."otp_session_verifications" to "service_role";

grant truncate on table "public"."otp_session_verifications" to "service_role";

grant update on table "public"."otp_session_verifications" to "service_role";

grant delete on table "public"."profiles" to "anon";

grant insert on table "public"."profiles" to "anon";

grant references on table "public"."profiles" to "anon";

grant select on table "public"."profiles" to "anon";

grant trigger on table "public"."profiles" to "anon";

grant truncate on table "public"."profiles" to "anon";

grant update on table "public"."profiles" to "anon";

grant delete on table "public"."profiles" to "authenticated";

grant insert on table "public"."profiles" to "authenticated";

grant references on table "public"."profiles" to "authenticated";

grant select on table "public"."profiles" to "authenticated";

grant trigger on table "public"."profiles" to "authenticated";

grant truncate on table "public"."profiles" to "authenticated";

grant update on table "public"."profiles" to "authenticated";

grant delete on table "public"."profiles" to "service_role";

grant insert on table "public"."profiles" to "service_role";

grant references on table "public"."profiles" to "service_role";

grant select on table "public"."profiles" to "service_role";

grant trigger on table "public"."profiles" to "service_role";

grant truncate on table "public"."profiles" to "service_role";

grant update on table "public"."profiles" to "service_role";

grant delete on table "public"."qr_scans" to "anon";

grant insert on table "public"."qr_scans" to "anon";

grant references on table "public"."qr_scans" to "anon";

grant select on table "public"."qr_scans" to "anon";

grant trigger on table "public"."qr_scans" to "anon";

grant truncate on table "public"."qr_scans" to "anon";

grant update on table "public"."qr_scans" to "anon";

grant delete on table "public"."qr_scans" to "authenticated";

grant insert on table "public"."qr_scans" to "authenticated";

grant references on table "public"."qr_scans" to "authenticated";

grant select on table "public"."qr_scans" to "authenticated";

grant trigger on table "public"."qr_scans" to "authenticated";

grant truncate on table "public"."qr_scans" to "authenticated";

grant update on table "public"."qr_scans" to "authenticated";

grant delete on table "public"."qr_scans" to "service_role";

grant insert on table "public"."qr_scans" to "service_role";

grant references on table "public"."qr_scans" to "service_role";

grant select on table "public"."qr_scans" to "service_role";

grant trigger on table "public"."qr_scans" to "service_role";

grant truncate on table "public"."qr_scans" to "service_role";

grant update on table "public"."qr_scans" to "service_role";

grant delete on table "public"."reviews" to "anon";

grant insert on table "public"."reviews" to "anon";

grant references on table "public"."reviews" to "anon";

grant select on table "public"."reviews" to "anon";

grant trigger on table "public"."reviews" to "anon";

grant truncate on table "public"."reviews" to "anon";

grant update on table "public"."reviews" to "anon";

grant delete on table "public"."reviews" to "authenticated";

grant insert on table "public"."reviews" to "authenticated";

grant references on table "public"."reviews" to "authenticated";

grant select on table "public"."reviews" to "authenticated";

grant trigger on table "public"."reviews" to "authenticated";

grant truncate on table "public"."reviews" to "authenticated";

grant update on table "public"."reviews" to "authenticated";

grant delete on table "public"."reviews" to "service_role";

grant insert on table "public"."reviews" to "service_role";

grant references on table "public"."reviews" to "service_role";

grant select on table "public"."reviews" to "service_role";

grant trigger on table "public"."reviews" to "service_role";

grant truncate on table "public"."reviews" to "service_role";

grant update on table "public"."reviews" to "service_role";

grant delete on table "public"."tags" to "anon";

grant insert on table "public"."tags" to "anon";

grant references on table "public"."tags" to "anon";

grant select on table "public"."tags" to "anon";

grant trigger on table "public"."tags" to "anon";

grant truncate on table "public"."tags" to "anon";

grant update on table "public"."tags" to "anon";

grant delete on table "public"."tags" to "authenticated";

grant insert on table "public"."tags" to "authenticated";

grant references on table "public"."tags" to "authenticated";

grant select on table "public"."tags" to "authenticated";

grant trigger on table "public"."tags" to "authenticated";

grant truncate on table "public"."tags" to "authenticated";

grant update on table "public"."tags" to "authenticated";

grant delete on table "public"."tags" to "service_role";

grant insert on table "public"."tags" to "service_role";

grant references on table "public"."tags" to "service_role";

grant select on table "public"."tags" to "service_role";

grant trigger on table "public"."tags" to "service_role";

grant truncate on table "public"."tags" to "service_role";

grant update on table "public"."tags" to "service_role";


  create policy "business_collection_schedules_owner_only"
  on "public"."business_collection_schedules"
  as permissive
  for all
  to public
using (((EXISTS ( SELECT 1
   FROM public.businesses b
  WHERE ((b.id = business_collection_schedules.business_id) AND (b.user_id = auth.uid())))) AND (EXISTS ( SELECT 1
   FROM public.collections c
  WHERE ((c.id = business_collection_schedules.collection_id) AND (c.user_id = auth.uid()))))))
with check (((EXISTS ( SELECT 1
   FROM public.businesses b
  WHERE ((b.id = business_collection_schedules.business_id) AND (b.user_id = auth.uid())))) AND (EXISTS ( SELECT 1
   FROM public.collections c
  WHERE ((c.id = business_collection_schedules.collection_id) AND (c.user_id = auth.uid()))))));



  create policy "business_item_overrides_owner_only"
  on "public"."business_item_overrides"
  as permissive
  for all
  to public
using (((EXISTS ( SELECT 1
   FROM public.businesses b
  WHERE ((b.id = business_item_overrides.business_id) AND (b.user_id = auth.uid())))) AND (EXISTS ( SELECT 1
   FROM public.items i
  WHERE ((i.id = business_item_overrides.item_id) AND (i.user_id = auth.uid()))))))
with check (((EXISTS ( SELECT 1
   FROM public.businesses b
  WHERE ((b.id = business_item_overrides.business_id) AND (b.user_id = auth.uid())))) AND (EXISTS ( SELECT 1
   FROM public.items i
  WHERE ((i.id = business_item_overrides.item_id) AND (i.user_id = auth.uid()))))));



  create policy "businesses_delete_owner"
  on "public"."businesses"
  as permissive
  for delete
  to public
using ((user_id = auth.uid()));



  create policy "businesses_insert_owner"
  on "public"."businesses"
  as permissive
  for insert
  to public
with check ((user_id = auth.uid()));



  create policy "businesses_public_select"
  on "public"."businesses"
  as permissive
  for select
  to anon
using ((is_public = true));



  create policy "businesses_select_owner"
  on "public"."businesses"
  as permissive
  for select
  to public
using ((user_id = auth.uid()));



  create policy "businesses_update_owner"
  on "public"."businesses"
  as permissive
  for update
  to public
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));



  create policy "collection_items_owner_only"
  on "public"."collection_items"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.collections c
  WHERE ((c.id = collection_items.collection_id) AND (c.user_id = auth.uid())))))
with check ((EXISTS ( SELECT 1
   FROM public.collections c
  WHERE ((c.id = collection_items.collection_id) AND (c.user_id = auth.uid())))));



  create policy "collection_sections_owner_only"
  on "public"."collection_sections"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.collections c
  WHERE ((c.id = collection_sections.collection_id) AND (c.user_id = auth.uid())))))
with check ((EXISTS ( SELECT 1
   FROM public.collections c
  WHERE ((c.id = collection_sections.collection_id) AND (c.user_id = auth.uid())))));



  create policy "collections_delete_owner"
  on "public"."collections"
  as permissive
  for delete
  to public
using ((user_id = auth.uid()));



  create policy "collections_insert_owner"
  on "public"."collections"
  as permissive
  for insert
  to public
with check ((user_id = auth.uid()));



  create policy "collections_select_owner"
  on "public"."collections"
  as permissive
  for select
  to public
using ((user_id = auth.uid()));



  create policy "collections_update_owner"
  on "public"."collections"
  as permissive
  for update
  to public
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));



  create policy "item_categories_delete_owner"
  on "public"."item_categories"
  as permissive
  for delete
  to public
using ((user_id = auth.uid()));



  create policy "item_categories_insert_owner"
  on "public"."item_categories"
  as permissive
  for insert
  to public
with check ((user_id = auth.uid()));



  create policy "item_categories_select_owner"
  on "public"."item_categories"
  as permissive
  for select
  to public
using ((user_id = auth.uid()));



  create policy "item_categories_update_owner"
  on "public"."item_categories"
  as permissive
  for update
  to public
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));



  create policy "item_tags_owner_only"
  on "public"."item_tags"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.items i
  WHERE ((i.id = item_tags.item_id) AND (i.user_id = auth.uid())))))
with check ((EXISTS ( SELECT 1
   FROM public.items i
  WHERE ((i.id = item_tags.item_id) AND (i.user_id = auth.uid())))));



  create policy "items_delete_owner"
  on "public"."items"
  as permissive
  for delete
  to public
using ((user_id = auth.uid()));



  create policy "items_insert_owner"
  on "public"."items"
  as permissive
  for insert
  to public
with check ((user_id = auth.uid()));



  create policy "items_select_owner"
  on "public"."items"
  as permissive
  for select
  to public
using ((user_id = auth.uid()));



  create policy "items_update_owner"
  on "public"."items"
  as permissive
  for update
  to public
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));



  create policy "profiles_insert_owner"
  on "public"."profiles"
  as permissive
  for insert
  to public
with check ((id = auth.uid()));



  create policy "profiles_select_owner"
  on "public"."profiles"
  as permissive
  for select
  to public
using ((id = auth.uid()));



  create policy "profiles_update_owner"
  on "public"."profiles"
  as permissive
  for update
  to public
using ((id = auth.uid()))
with check ((id = auth.uid()));



  create policy "qr_scans_select_owner"
  on "public"."qr_scans"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.businesses b
  WHERE ((b.id = qr_scans.business_id) AND (b.user_id = auth.uid())))));



  create policy "Public can insert reviews"
  on "public"."reviews"
  as permissive
  for insert
  to anon
with check (true);



  create policy "Users can insert their own reviews"
  on "public"."reviews"
  as permissive
  for insert
  to authenticated
with check ((auth.uid() = user_id));



  create policy "Users can read reviews of their restaurants"
  on "public"."reviews"
  as permissive
  for select
  to authenticated
using ((business_id IN ( SELECT businesses.id
   FROM public.businesses
  WHERE (businesses.user_id = auth.uid()))));



  create policy "Users can read their own reviews"
  on "public"."reviews"
  as permissive
  for select
  to authenticated
using ((auth.uid() = user_id));



  create policy "reviews_delete_business_owner"
  on "public"."reviews"
  as permissive
  for delete
  to public
using ((EXISTS ( SELECT 1
   FROM public.businesses b
  WHERE ((b.id = reviews.business_id) AND (b.user_id = auth.uid())))));



  create policy "tags_delete_owner"
  on "public"."tags"
  as permissive
  for delete
  to public
using ((user_id = auth.uid()));



  create policy "tags_insert_owner"
  on "public"."tags"
  as permissive
  for insert
  to public
with check ((user_id = auth.uid()));



  create policy "tags_select_owner"
  on "public"."tags"
  as permissive
  for select
  to public
using ((user_id = auth.uid()));



  create policy "tags_update_owner"
  on "public"."tags"
  as permissive
  for update
  to public
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));


CREATE TRIGGER trg_validate_days_of_week BEFORE INSERT OR UPDATE ON public.business_collection_schedules FOR EACH ROW EXECUTE FUNCTION public.validate_days_of_week();

CREATE TRIGGER trg_delete_empty_collection_sections AFTER DELETE ON public.collection_items FOR EACH ROW EXECUTE FUNCTION public.delete_empty_collection_sections();

CREATE TRIGGER trg_enforce_collection_item_section_category BEFORE INSERT OR UPDATE OF item_id, section_id, collection_id ON public.collection_items FOR EACH ROW EXECUTE FUNCTION public.enforce_collection_item_section_category();

CREATE TRIGGER handle_reviews_updated_at BEFORE UPDATE ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


  create policy "avatars delete"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using ((bucket_id = 'avatars'::text));



  create policy "avatars insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'avatars'::text));



  create policy "avatars read"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'avatars'::text));



  create policy "avatars update"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using ((bucket_id = 'avatars'::text));



  create policy "business-covers delete"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using ((bucket_id = 'business-covers'::text));



  create policy "business-covers insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'business-covers'::text));



  create policy "business-covers read"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'business-covers'::text));



  create policy "business-covers update"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using ((bucket_id = 'business-covers'::text));



  create policy "business-items insert"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check ((bucket_id = 'business-items'::text));



  create policy "business-items read"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'business-items'::text));



  create policy "catalog-items delete"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using ((bucket_id = 'catalog-items'::text));



  create policy "catalog-items insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'catalog-items'::text));



  create policy "catalog-items read"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'catalog-items'::text));



  create policy "catalog-items update"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using ((bucket_id = 'catalog-items'::text));



