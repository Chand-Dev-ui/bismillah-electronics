-- Bismillah Electronics Supabase setup.
-- Run the entire file in Supabase Dashboard > SQL Editor > New query.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text, phone text,
 role text not null default 'customer' check (role in ('customer','main_admin','sub_admin')),
 created_at timestamptz not null default now()
);
create table if not exists public.products (
 id uuid primary key default gen_random_uuid(), name text not null, brand text not null,
 description text, price numeric(12,2) not null check(price>=0),
 original_price numeric(12,2), ram text, storage text, network text,
 specifications jsonb not null default '{}'::jsonb, image_urls text[] not null default '{}',
 stock integer not null default 0 check(stock>=0), is_active boolean not null default true,
 created_at timestamptz not null default now()
);
create table if not exists public.orders (
 id uuid primary key default gen_random_uuid(), customer_id uuid references auth.users(id),
 customer_name text not null, phone text not null, email text, address text not null, city text not null,
 payment_method text not null check(payment_method in ('cod','jazzcash_manual','easypaisa_manual','bank_transfer_manual')),
 subtotal numeric(12,2) not null check(subtotal>=0), delivery_fee numeric(12,2) not null default 0 check(delivery_fee>=0),
 status text not null default 'pending' check(status in ('pending','confirmed','packed','shipped','delivered','cancelled')),
 created_at timestamptz not null default now()
);
create table if not exists public.order_items (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade,
 product_id uuid references public.products(id), product_name text not null,
 quantity integer not null check(quantity>0), unit_price numeric(12,2) not null check(unit_price>=0)
);
create table if not exists public.city_delivery_charges (
 city text primary key, fee numeric(12,2) not null default 0 check(fee>=0), estimated_days integer not null default 3
);
create table if not exists public.contact_messages (
 id uuid primary key default gen_random_uuid(), name text not null, email text, phone text, message text not null,
 created_at timestamptz not null default now()
);
create table if not exists public.reviews (
 id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id) on delete cascade,
 customer_id uuid not null references auth.users(id), order_id uuid not null references public.orders(id),
 rating integer not null check(rating between 1 and 5), review_text text,
 is_approved boolean not null default false, created_at timestamptz not null default now(),
 unique(product_id,customer_id,order_id)
);

-- Create a customer profile automatically whenever someone signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public
as $$ begin
 insert into public.profiles(id,full_name) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',''));
 return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.is_store_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.profiles where id=auth.uid() and role in ('main_admin','sub_admin')); $$;

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.city_delivery_charges enable row level security;
alter table public.contact_messages enable row level security;
alter table public.reviews enable row level security;

drop policy if exists "Public can view active products" on public.products;
drop policy if exists "Admins manage products" on public.products;
create policy "Public can view active products" on public.products for select using(is_active=true or public.is_store_admin());
create policy "Admins manage products" on public.products for all to authenticated using(public.is_store_admin()) with check(public.is_store_admin());

drop policy if exists "Users view own profile" on public.profiles;
drop policy if exists "Admins view profiles" on public.profiles;
create policy "Users view own profile" on public.profiles for select to authenticated using(id=auth.uid());
create policy "Admins view profiles" on public.profiles for select to authenticated using(public.is_store_admin());

drop policy if exists "Public can view approved reviews" on public.reviews;
create policy "Public can view approved reviews" on public.reviews for select using(is_approved=true);
drop policy if exists "Public can view delivery charges" on public.city_delivery_charges;
create policy "Public can view delivery charges" on public.city_delivery_charges for select using(true);

drop policy if exists "Users view own orders" on public.orders;
drop policy if exists "Admins view all orders" on public.orders;
create policy "Users view own orders" on public.orders for select to authenticated using(customer_id=auth.uid());
create policy "Admins view all orders" on public.orders for select to authenticated using(public.is_store_admin());
drop policy if exists "Users view own order items" on public.order_items;
drop policy if exists "Admins view all order items" on public.order_items;
create policy "Users view own order items" on public.order_items for select to authenticated using(exists(select 1 from public.orders o where o.id=order_id and o.customer_id=auth.uid()));
create policy "Admins view all order items" on public.order_items for select to authenticated using(public.is_store_admin());

drop policy if exists "Public read product images" on storage.objects;
drop policy if exists "Admins manage storage objects" on storage.objects;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('product-images','product-images',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=5242880,allowed_mime_types=excluded.allowed_mime_types;
create policy "Public read product images" on storage.objects for select using(bucket_id='product-images');
create policy "Admins manage storage objects" on storage.objects for all to authenticated
using(bucket_id='product-images' and public.is_store_admin())
with check(bucket_id='product-images' and public.is_store_admin());

-- NOTE: This starter deliberately does NOT enable public order creation, payment processing,
-- reviews, or contact-form writes. These need secure server-side validation / Edge Functions.
-- Never put the Supabase service_role/secret key in config.js.
