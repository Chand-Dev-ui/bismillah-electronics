-- FINAL ADD-ON MIGRATION for existing Bismillah Electronics project.
-- Run once in Supabase SQL Editor. Safe to re-run for policies/tables.

create table if not exists public.wishlist_items (
  customer_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(customer_id, product_id)
);
alter table public.wishlist_items enable row level security;
drop policy if exists "Customers manage own wishlist" on public.wishlist_items;
create policy "Customers manage own wishlist" on public.wishlist_items for all to authenticated
using(customer_id = auth.uid()) with check(customer_id = auth.uid());

drop policy if exists "Admins manage delivery charges" on public.city_delivery_charges;
create policy "Admins manage delivery charges" on public.city_delivery_charges for all to authenticated
using(public.is_store_admin()) with check(public.is_store_admin());

drop policy if exists "Admins update orders" on public.orders;
create policy "Admins update orders" on public.orders for update to authenticated
using(public.is_store_admin()) with check(public.is_store_admin());

drop policy if exists "Admins read contact messages" on public.contact_messages;
create policy "Admins read contact messages" on public.contact_messages for select to authenticated
using(public.is_store_admin());
drop policy if exists "Public submit contact messages" on public.contact_messages;
create policy "Public submit contact messages" on public.contact_messages for insert to anon, authenticated
with check(length(trim(name)) between 2 and 100 and length(trim(message)) between 5 and 2000);

drop policy if exists "Verified customers submit reviews" on public.reviews;
create policy "Verified customers submit reviews" on public.reviews for insert to authenticated
with check(customer_id = auth.uid() and exists (
  select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid() and o.status = 'delivered'
) and exists (select 1 from public.order_items oi where oi.order_id = order_id and oi.product_id = product_id));
drop policy if exists "Admins moderate reviews" on public.reviews;
create policy "Admins moderate reviews" on public.reviews for all to authenticated
using(public.is_store_admin()) with check(public.is_store_admin());

-- Main-admin-only helper. Sub-admins can manage catalogue/orders but not delivery pricing.
create or replace function public.is_main_store_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='main_admin'); $$;
revoke all on function public.is_main_store_admin() from public;
grant execute on function public.is_main_store_admin() to authenticated;

-- Replace delivery policy with main-admin-only write permission.
drop policy if exists "Admins manage delivery charges" on public.city_delivery_charges;
drop policy if exists "Main admin manages delivery charges"
on public.city_delivery_charges;
create policy "Main admin manages delivery charges" on public.city_delivery_charges for all to authenticated
using(public.is_main_store_admin()) with check(public.is_main_store_admin());

-- Contact/reviews read controls; only approved reviews are public.
-- Keep existing public approved review policy and admin moderation policy.

-- Important: no payment gateway is activated by this migration. Manual payment methods
-- are instructions/confirmation only until merchant API credentials and approval exist.

-- Recreate order RPC so the deployed Edge Function and current schema agree.
create or replace function public.create_store_order(
  p_customer_id uuid,
  p_customer_name text,
  p_phone text,
  p_email text,
  p_address text,
  p_city text,
  p_payment_method text,
  p_items jsonb
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  v_item jsonb;
  v_product public.products%rowtype;
  v_product_id uuid;
  v_qty integer;
  v_order_id uuid;
  v_subtotal numeric(12,2):=0;
  v_delivery numeric(12,2):=0;
begin
  if p_customer_id is null or p_customer_name is null or length(trim(p_customer_name))<2
     or p_phone is null or length(trim(p_phone))<7
     or p_address is null or length(trim(p_address))<5
     or p_city is null or length(trim(p_city))<2 then
    raise exception 'Please provide valid name, phone, address and city';
  end if;
  if p_payment_method not in ('cod','jazzcash_manual','easypaisa_manual','bank_transfer_manual') then
    raise exception 'Invalid payment method';
  end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>30 then
    raise exception 'Cart is empty or contains too many items';
  end if;
  select fee into v_delivery from public.city_delivery_charges where lower(city)=lower(trim(p_city));
  if not found then raise exception 'Delivery fee is not configured for this city yet. Please contact the store.'; end if;
  v_delivery:=coalesce(v_delivery,0);

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_product_id:=(v_item->>'product_id')::uuid;
    v_qty:=(v_item->>'quantity')::integer;
    if v_qty<1 or v_qty>20 then raise exception 'Invalid product quantity'; end if;
    select * into v_product from public.products where id=v_product_id and is_active=true for update;
    if not found or v_product.stock<v_qty then raise exception 'A product is unavailable or has insufficient stock'; end if;
    update public.products set stock=stock-v_qty where id=v_product_id;
    v_subtotal:=v_subtotal+(v_product.price*v_qty);
  end loop;

  insert into public.orders(customer_id,customer_name,phone,email,address,city,payment_method,subtotal,delivery_fee)
  values(p_customer_id,trim(p_customer_name),trim(p_phone),nullif(trim(coalesce(p_email,'')),''),trim(p_address),trim(p_city),p_payment_method,v_subtotal,v_delivery)
  returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_product_id:=(v_item->>'product_id')::uuid;
    v_qty:=(v_item->>'quantity')::integer;
    select * into v_product from public.products where id=v_product_id;
    insert into public.order_items(order_id,product_id,product_name,quantity,unit_price)
    values(v_order_id,v_product_id,v_product.name,v_qty,v_product.price);
  end loop;
  return jsonb_build_object('order_id',v_order_id,'subtotal',v_subtotal,'delivery_fee',v_delivery,'total',v_subtotal+v_delivery);
end; $$;
revoke all on function public.create_store_order(uuid,text,text,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.create_store_order(uuid,text,text,text,text,text,text,jsonb) to service_role;

-- Customer can cancel only their own order before shipment; cannot alter other order fields.
create or replace function public.cancel_my_order(p_order_id uuid)
returns boolean language plpgsql security definer set search_path=public
as $$
declare v_count integer;
begin
  update public.orders set status='cancelled'
  where id=p_order_id and customer_id=auth.uid() and status in ('pending','confirmed','packed');
  get diagnostics v_count=row_count;
  return v_count=1;
end; $$;
revoke all on function public.cancel_my_order(uuid) from public,anon;
grant execute on function public.cancel_my_order(uuid) to authenticated;

alter table public.products add column if not exists category text not null default 'Smartphones';


-- Allow permanent product deletion without deleting historical order line snapshots.
-- order_items.product_name and unit_price preserve the purchased item details.
alter table public.order_items
  drop constraint if exists order_items_product_id_fkey;
alter table public.order_items
  add constraint order_items_product_id_fkey
  foreign key (product_id) references public.products(id) on delete set null;

-- Customer cancellation is allowed only before packing/shipping.
create or replace function public.cancel_my_order(p_order_id uuid)
returns boolean language plpgsql security definer set search_path=public
as $$
declare v_count integer;
begin
  update public.orders set status='cancelled'
  where id=p_order_id and customer_id=auth.uid()
    and status in ('pending','confirmed');
  get diagnostics v_count=row_count;
  return v_count=1;
end; $$;
revoke all on function public.cancel_my_order(uuid) from public,anon;
grant execute on function public.cancel_my_order(uuid) to authenticated;
