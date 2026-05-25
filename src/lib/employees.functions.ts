import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";
import { createNotionOnboardingPage } from "./notion.server";

async function assertHr(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "hr")
    .maybeSingle();
  if (!data) throw new Error("Only HR can perform this action");
}

/**
 * If no HR exists yet, promote the caller. Used right after first signup.
 */
export const bootstrapHr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as { userId: string };
    const { count } = await supabaseAdmin
      .from("user_roles")
      .select("*", { count: "exact", head: true })
      .eq("role", "hr");
    if ((count ?? 0) > 0) return { promoted: false };

    // Remove employee role (default) and add hr role
    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: "hr" });
    if (error) throw new Error(error.message);
    return { promoted: true };
  });

const CreateEmployeeInput = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(72),
  fullName: z.string().min(1).max(120),
  jobTitle: z.string().max(120).optional().nullable(),
  startDate: z.string().optional().nullable(),
  managerId: z.string().uuid().optional().nullable(),
  role: z.enum(["hr", "manager", "employee"]).default("employee"),
  customTasks: z
    .array(z.object({ title: z.string().min(1).max(200), description: z.string().max(2000).optional().nullable() }))
    .max(50)
    .optional(),
});

export const createEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => CreateEmployeeInput.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertHr(userId);

    // Create auth user
    const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });
    if (cErr || !created.user) throw new Error(cErr?.message ?? "Failed to create user");
    const newUserId = created.user.id;

    // The on_auth_user_created trigger created profile + employee role + template tasks.
    // Update profile fields.
    await supabaseAdmin
      .from("profiles")
      .update({
        full_name: data.fullName,
        job_title: data.jobTitle ?? null,
        start_date: data.startDate ?? null,
        manager_id: data.managerId ?? null,
      })
      .eq("id", newUserId);

    // Adjust role if not employee
    if (data.role !== "employee") {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", newUserId);
      await supabaseAdmin.from("user_roles").insert({ user_id: newUserId, role: data.role });
    }

    // Add custom tasks
    if (data.customTasks?.length) {
      const rows = data.customTasks.map((t, i) => ({
        employee_id: newUserId,
        title: t.title,
        description: t.description ?? null,
        position: 1000 + i,
        source: "custom",
      }));
      await supabaseAdmin.from("employee_tasks").insert(rows);
    }

    // Create Notion page (best effort)
    let notion: { id: string; url: string } | null = null;
    try {
      notion = await createNotionOnboardingPage({
        userId: newUserId,
        fullName: data.fullName,
        email: data.email,
        jobTitle: data.jobTitle ?? undefined,
        startDate: data.startDate ?? undefined,
      });
      if (notion) {
        await supabaseAdmin
          .from("profiles")
          .update({ notion_page_id: notion.id, notion_page_url: notion.url })
          .eq("id", newUserId);
      }
    } catch (err) {
      console.error("Notion page creation failed:", err);
    }

    return { userId: newUserId, notion };
  });

const SetRoleInput = z.object({
  targetUserId: z.string().uuid(),
  role: z.enum(["hr", "manager", "employee"]),
});

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => SetRoleInput.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertHr(userId);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.targetUserId);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.targetUserId, role: data.role });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const SaveTemplateInput = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  position: z.number().int().min(0).max(10000).default(0),
});

export const saveTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => SaveTemplateInput.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertHr(userId);
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("onboarding_templates")
        .update({ title: data.title, description: data.description ?? null, position: data.position })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("onboarding_templates")
        .insert({ title: data.title, description: data.description ?? null, position: data.position });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertHr(userId);
    await supabaseAdmin.from("onboarding_templates").delete().eq("id", data.id);
    return { ok: true };
  });

export const saveNotionParent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ pageId: z.string().min(1).max(200) }).parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertHr(userId);
    await supabaseAdmin
      .from("app_settings")
      .upsert({ key: "notion_parent_page_id", value: data.pageId, updated_at: new Date().toISOString() });
    return { ok: true };
  });

export const approveOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ employeeId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context as { userId: string; supabase: any };
    // RLS allows manager (manager_id = auth.uid()) or HR to update
    const { error } = await supabase
      .from("profiles")
      .update({
        onboarding_approved: true,
        onboarding_approved_at: new Date().toISOString(),
        onboarding_approved_by: userId,
      })
      .eq("id", data.employeeId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
