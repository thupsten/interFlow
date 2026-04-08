import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: callerProfile } = await userClient.from("profiles").select("role").eq("id", user.id).single();
    const canDelete = callerProfile?.role === "admin" || callerProfile?.role === "csm";
    if (!canDelete) {
      return new Response(
        JSON.stringify({ error: "Only admins or CSM can delete users" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { user_id: targetUserId } = await req.json();
    if (!targetUserId) {
      return new Response(
        JSON.stringify({ error: "user_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (targetUserId === user.id) {
      return new Response(
        JSON.stringify({ error: "You cannot delete your own account" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    await supabaseAdmin.from("user_skills").delete().eq("user_id", targetUserId);
    await supabaseAdmin.from("task_assignees").delete().eq("user_id", targetUserId);
    await supabaseAdmin.from("time_logs").delete().eq("user_id", targetUserId);
    await supabaseAdmin.from("notifications").delete().eq("user_id", targetUserId);
    await supabaseAdmin.from("project_csm_draft_comments").delete().eq("user_id", targetUserId);
    await supabaseAdmin.from("project_csm_drafts").delete().eq("created_by", targetUserId);
    await supabaseAdmin.from("project_comments").delete().eq("user_id", targetUserId);
    await supabaseAdmin.from("task_comments").delete().eq("user_id", targetUserId);
    await supabaseAdmin.from("interest_requests").delete().eq("user_id", targetUserId);
    await supabaseAdmin.from("interest_requests").delete().eq("reviewed_by", targetUserId);
    await supabaseAdmin.from("project_contributors").delete().eq("user_id", targetUserId);
    await supabaseAdmin.from("project_contributors").delete().eq("approved_by", targetUserId);
    await supabaseAdmin.from("project_managers").delete().eq("user_id", targetUserId);
    await supabaseAdmin.from("favorite_projects").delete().eq("user_id", targetUserId);
    await supabaseAdmin.from("activity_log").delete().eq("actor_id", targetUserId);
    await supabaseAdmin.from("project_attachments").delete().eq("uploaded_by", targetUserId);
    await supabaseAdmin.from("task_attachments").delete().eq("uploaded_by", targetUserId);
    await supabaseAdmin.from("it_support_tickets").delete().eq("raised_by", targetUserId);
    await supabaseAdmin.from("it_support_tickets").delete().eq("resolved_by", targetUserId);
    await supabaseAdmin.from("profiles").delete().eq("id", targetUserId);

    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(targetUserId);
    if (deleteAuthError) {
      console.warn("Auth delete warning (profile already removed):", deleteAuthError.message);
    }

    return new Response(
      JSON.stringify({ success: true, message: "User deleted" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("delete-user error:", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
