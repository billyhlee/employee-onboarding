import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/employee")({
  component: EmployeeDashboard,
});

function EmployeeDashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const profile = useQuery({
    enabled: !!user,
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, job_title, start_date, notion_page_url, onboarding_approved, onboarding_approved_at")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const tasks = useQuery({
    enabled: !!user,
    queryKey: ["my_tasks", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_tasks")
        .select("id, title, description, completed, position")
        .eq("employee_id", user!.id)
        .order("position", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const total = tasks.data?.length ?? 0;
  const done = (tasks.data ?? []).filter((t) => t.completed).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  const toggle = async (id: string, completed: boolean) => {
    const { error } = await supabase
      .from("employee_tasks")
      .update({ completed, completed_at: completed ? new Date().toISOString() : null })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["my_tasks", user?.id] });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome{profile.data?.full_name ? `, ${profile.data.full_name}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground">
            {profile.data?.job_title ?? "Let's get you onboarded."}
            {profile.data?.start_date ? ` · Start date ${profile.data.start_date}` : ""}
          </p>
        </div>
        {profile.data?.onboarding_approved ? (
          <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" /> Onboarding approved</Badge>
        ) : (
          <Badge variant="secondary">Onboarding in progress</Badge>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your onboarding checklist</CardTitle>
          <CardDescription>
            {done} of {total} complete
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={pct} />
          <ul className="divide-y rounded-md border">
            {(tasks.data ?? []).map((t) => (
              <li key={t.id} className="flex items-start gap-3 p-3">
                <Checkbox
                  checked={t.completed}
                  onCheckedChange={(v) => toggle(t.id, Boolean(v))}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className={t.completed ? "font-medium line-through text-muted-foreground" : "font-medium"}>
                    {t.title}
                  </div>
                  {t.description && (
                    <div className="text-sm text-muted-foreground">{t.description}</div>
                  )}
                </div>
              </li>
            ))}
            {tasks.data?.length === 0 && (
              <li className="p-6 text-center text-sm text-muted-foreground">
                No tasks yet. HR will add them shortly.
              </li>
            )}
          </ul>
        </CardContent>
      </Card>

      {profile.data?.notion_page_url && (
        <Card>
          <CardHeader>
            <CardTitle>Onboarding page</CardTitle>
            <CardDescription>Your personal Notion page with everything in one place.</CardDescription>
          </CardHeader>
          <CardContent>
            <a
              href={profile.data.notion_page_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              Open in Notion <ExternalLink className="h-3 w-3" />
            </a>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
