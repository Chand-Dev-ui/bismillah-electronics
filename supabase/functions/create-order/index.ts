import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  const reply = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) return reply({ error: "Server configuration is incomplete." }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return reply({ error: "Please sign in before ordering." }, 401);

    const authClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: authError } = await authClient.auth.getUser();
    if (authError || !userData.user) return reply({ error: "Your session is invalid. Please sign in again." }, 401);

    const body = await req.json();
    const serviceClient = createClient(url, serviceKey);
    const { data, error } = await serviceClient.rpc("create_store_order", {
      p_customer_id: userData.user.id,
      p_customer_name: body.customer_name,
      p_phone: body.phone,
      p_email: body.email || null,
      p_address: body.address,
      p_city: body.city,
      p_payment_method: body.payment_method,
      p_items: body.items,
    });
    if (error) return reply({ error: error.message }, 400);
    return reply({ success: true, order: data });
  } catch (error) {
    console.error("create-order failed", error);
    return reply({ error: "Order could not be processed. Please try again." }, 400);
  }
});
