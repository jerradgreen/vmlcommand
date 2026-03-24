import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing auth");

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user } } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) throw new Error("Invalid token");

    // Check admin role
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const isAdmin = roles?.some((r: any) => r.role === "admin");
    // If no roles exist at all in the system, treat as admin (first-time setup)
    const { count } = await supabase.from("user_roles").select("*", { count: "exact", head: true });
    if (!isAdmin && (count ?? 0) > 0) throw new Error("Not authorized");

    const body = await req.json();
    const { action } = body;

    if (action === "bootstrap_admin") {
      // Insert current user as admin
      await supabase.from("user_roles").upsert(
        { user_id: user.id, role: "admin" },
        { onConflict: "user_id,role" }
      );
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "create_rep") {
      const { email, password } = body;
      if (!email || !password) throw new Error("email and password required");

      // Create user
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (createError) throw createError;

      // Assign sales_rep role
      await supabase.from("user_roles").insert({
        user_id: newUser.user.id,
        role: "sales_rep",
      });

      return new Response(JSON.stringify({ ok: true, user_id: newUser.user.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "add_existing_as_rep") {
      const { email } = body;
      if (!email) throw new Error("email required");

      const { data: { users } } = await supabase.auth.admin.listUsers();
      const found = users.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
      if (!found) throw new Error("No user found with that email");

      await supabase.from("user_roles").upsert(
        { user_id: found.id, role: "sales_rep" },
        { onConflict: "user_id,role" }
      );

      return new Response(JSON.stringify({ ok: true, user_id: found.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list_reps") {
      const { data: repRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "sales_rep");

      if (!repRoles || repRoles.length === 0) {
        return new Response(JSON.stringify({ reps: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const userIds = repRoles.map((r: any) => r.user_id);
      const { data: { users } } = await supabase.auth.admin.listUsers();
      const reps = users
        .filter((u: any) => userIds.includes(u.id))
        .map((u: any) => ({ id: u.id, email: u.email, created_at: u.created_at }));

      // Get style access for each rep
      const { data: styleAccess } = await supabase
        .from("rep_style_access")
        .select("user_id, sign_style")
        .in("user_id", userIds);

      const repData = reps.map((r: any) => ({
        ...r,
        styles: (styleAccess || []).filter((s: any) => s.user_id === r.id).map((s: any) => s.sign_style),
      }));

      return new Response(JSON.stringify({ reps: repData }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "toggle_style") {
      const { rep_user_id, sign_style, enabled } = body;
      if (!rep_user_id || !sign_style) throw new Error("rep_user_id and sign_style required");

      if (enabled) {
        await supabase.from("rep_style_access").upsert(
          { user_id: rep_user_id, sign_style },
          { onConflict: "user_id,sign_style" }
        );
      } else {
        await supabase.from("rep_style_access")
          .delete()
          .eq("user_id", rep_user_id)
          .eq("sign_style", sign_style);
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Unknown action: " + action);
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
