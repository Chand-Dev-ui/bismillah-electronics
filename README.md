# Bismillah Electronics — Supabase-connected starter

## Included in this build
- Storefront reads active products from Supabase (not browser LocalStorage).
- Admin sign-in uses Supabase Auth.
- Admin access is checked against `profiles.role` (`main_admin` or `sub_admin`).
- Admin can add, edit and delete products; images upload to the `product-images` Storage bucket.
- Cart and wishlist remain local to each visitor's browser.
- No demo products are preloaded.

## Step 1 — Add your Supabase browser config
1. In this folder, make a copy of `config.js.example` and name the copy `config.js`.
2. Open `config.js` and paste your Project URL and Publishable Key (or legacy anon public key).
3. Do not use or paste any `service_role` or `secret` key in this file.
4. Keep `config.js` beside `index.html`, `admin.html`, `app.js` and `admin.js`.

## Step 2 — Create the database
1. Open Supabase Dashboard > SQL Editor > New query.
2. Open `supabase/schema.sql`, copy all its contents into SQL Editor, then click Run.
3. The script creates the tables, RLS policies and `product-images` storage bucket.
4. It does NOT activate live checkout/order creation or online payments.

## Step 3 — Create your admin account
1. In Supabase Dashboard > Authentication > Users, create a user with your admin email and a strong password.
2. Copy that user's UUID.
3. In SQL Editor, run this command after replacing the UUID:
   `update public.profiles set role='main_admin' where id='PASTE-USER-UUID-HERE';`
4. Sign in at `admin.html` using that account.
5. Never share the password or UUID publicly. If you need an adult-owned merchant account later, ask a parent/guardian to help.

## Step 4 — Test
- Open `index.html`: it should show an empty catalogue until you add products.
- Open `admin.html`, sign in, add a test product and image.
- Refresh `index.html`: the product should appear.
- Try editing and deleting that test product.

## Important — not production checkout yet
This is a Supabase-connected product catalogue and admin product manager, not the full e-commerce system requested. Checkout still opens a prefilled WhatsApp message; it does not create an order in the database. Customer accounts, guest checkout, order records, stock decrement, order tracking/cancellation, delivery fees, verified reviews, contact-message storage, admin sub-user management and automatic JazzCash/EasyPaisa/bank payments are not implemented. Those require additional secure server-side functions and testing. Manual COD / transfer instructions are not automatic payment processing.

## Deployment
Deploy the folder to Netlify only after `config.js` is added. Keep `config.js` private to your project repository if preferred; its publishable key is designed for browser use, but database security must come from RLS. Do not publish any service-role/secret key.


## Customer login and wishlist update
- The storefront now has visible Customer Login and Admin Login links.
- `customer.html` supports customer email/password sign-up and sign-in through Supabase Auth. Email confirmation may be required depending on Supabase Auth settings.
- Wishlist opens from the header and displays saved products. Wishlist is stored in the current browser only (localStorage), not synced between devices or customer accounts.
- Admin Login opens `admin.html`; only users whose `profiles.role` is `main_admin` or `sub_admin` can access the admin product manager.

## Checkout connection update
- Storefront checkout now requires a signed-in customer and calls the `create-order` Edge Function.
- The Edge Function verifies the customer's Supabase session, then calls the restricted `create_store_order` database function.
- The database function checks available stock, saves the order and order items, and decrements stock in one database transaction.
- Manual payment methods are recorded as selected payment methods; this does NOT automatically collect or verify JazzCash, EasyPaisa, or bank payments.
- Keep your existing private `config.js` when replacing the website files. Do not add service-role keys to it.

### Deploy / update Edge Function
The deployed function should be named exactly `create-order`. Its source is in `supabase/functions/create-order/index.ts`.
If you already deployed the same code in Supabase, no redeployment is needed. The browser calls it by name using `supabase.functions.invoke("create-order", ...)`.

### Test checkout
1. Sign in through `customer.html` with a confirmed customer account.
2. Add a product with stock greater than zero in the admin panel.
3. Add that product to cart and open checkout.
4. Submit customer delivery details and choose a payment method.
5. In Supabase Table Editor, verify a row appears in `orders` and matching rows appear in `order_items`.
6. Verify the product's `stock` decreased by the ordered quantity.
7. Test an order quantity greater than available stock; it should fail without creating an order.

This code has been statically checked in the package, but a real live test still requires access to your deployed Supabase project and an actual signed-in test account.


## Final consolidated update (November 2026)
Use `FINAL-SETUP.txt` for the complete update and testing sequence. The additional SQL migration is `supabase/final-migration.sql`. It must be run in the existing Supabase project before using the new customer tracking, cancellation, wishlist sync, contact messages, reviews, city delivery management, categories and refreshed order RPC. Re-deploy `supabase/functions/create-order/index.ts` after running the migration.
