import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/notion/v1";

interface NewEmployeeInput {
  userId: string;
  fullName: string;
  email: string;
  jobTitle?: string;
  startDate?: string;
}

/**
 * Creates a Notion page for the new employee under the parent page stored in app_settings.
 * Returns null when not configured. Throws on API errors.
 */
export async function createNotionOnboardingPage(
  input: NewEmployeeInput,
): Promise<{ id: string; url: string } | null> {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const NOTION_API_KEY = process.env.NOTION_API_KEY;
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
  if (!NOTION_API_KEY) throw new Error("NOTION_API_KEY is not configured");

  const { data: setting } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", "notion_parent_page_id")
    .maybeSingle();
  const parentId = setting?.value?.trim();
  if (!parentId) return null;

  // Fetch checklist for the employee (template tasks already created by trigger)
  const { data: tasks } = await supabaseAdmin
    .from("employee_tasks")
    .select("title, description")
    .eq("employee_id", input.userId)
    .order("position", { ascending: true });

  const checklistBlocks =
    (tasks ?? []).map((t) => ({
      object: "block",
      type: "to_do",
      to_do: {
        rich_text: [{ type: "text", text: { content: t.title } }],
        checked: false,
      },
    })) ?? [];

  const body = {
    parent: { type: "page_id", page_id: parentId },
    properties: {
      title: {
        title: [{ type: "text", text: { content: `Onboarding · ${input.fullName}` } }],
      },
    },
    children: [
      {
        object: "block",
        type: "heading_1",
        heading_1: {
          rich_text: [{ type: "text", text: { content: `Welcome, ${input.fullName}!` } }],
        },
      },
      {
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [
            {
              type: "text",
              text: {
                content: `Email: ${input.email}${input.jobTitle ? ` · Role: ${input.jobTitle}` : ""}${input.startDate ? ` · Start: ${input.startDate}` : ""}`,
              },
            },
          ],
        },
      },
      {
        object: "block",
        type: "heading_2",
        heading_2: { rich_text: [{ type: "text", text: { content: "Onboarding checklist" } }] },
      },
      ...checklistBlocks,
    ],
  };

  const res = await fetch(`${GATEWAY_URL}/pages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": NOTION_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Notion API failed [${res.status}]: ${JSON.stringify(json)}`);
  }
  return { id: json.id, url: json.url };
}
