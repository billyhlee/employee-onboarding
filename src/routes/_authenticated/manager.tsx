import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { approveOnboarding } from "@/lib/employees.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_authenticated/manager")({
  component: ManagerDashboard,
});

function ManagerDashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const approve = useServerFn(approveOnboarding);

  const team = useQuery({
    enabled: !!user,
    queryKey: ["team", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, job_title, start_date, notion_page_url, onboarding_approved, onboarding_approved_at")
        .eq("manager_id", user!.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const tasks = useQuery({
    enabled: !!team.data,
    queryKey: ["team_tasks", (team.data ?? []).map((t) => t.id).join(",")],
    queryFn: async () => {
      const ids = (team.data ?? []).map((t) => t.id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("employee_tasks")
        .select("id, employee_id, title, completed")
        .in("employee_id", ids);
      if (error) throw error;
      return data ?? [];
    },
  });

  const progressFor = (id: string) => {
    const t = (tasks.data ?? []).filter((x) => x.employee_id === id);
    if (t.length === 0) return { pct: 0, done: 0, total: 0 };
    const done = t.filter((x) => x.completed).length;
    return { pct: Math.round((done / t.length) * 100), done, total: t.length };
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My team</h1>
        <p className="text-sm text-muted-foreground">Approve onboarding when a team member finishes their checklist.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {(team.data ?? []).map((m) => {
          const p = progressFor(m.id);
          const ready = p.total > 0 && p.done === p.total;
          return (
            <Card key={m.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>{m.full_name || m.email}</CardTitle>
                    <CardDescription>
                      {m.job_title ?? "—"}{m.start_date ? ` · starts ${m.start_date}` : ""}
                    </CardDescription>
                  </div>
                  {m.onboarding_approved ? (
                    <Badge>Approved</Badge>
                  ) : ready ? (
                    <Badge variant="secondary">Ready</Badge>
                  ) : (
                    <Badge variant="outline">In progress</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                    <span>Checklist</span>
                    <span>{p.done}/{p.total}</span>
                  </div>
                  <Progress value={p.pct} />
                </div>
                <div className="flex items-center gap-2">
                  {m.notion_page_url && (
                    <a
                      href={m.notion_page_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      Notion page <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  <div className="ml-auto">
                    {!m.onboarding_approved && (
                      <Button
                        size="sm"
                        disabled={!ready}
                        onClick={async () => {
                          try {
                            await approve({ data: { employeeId: m.id } });
                            qc.invalidateQueries({ queryKey: ["team"] });
                            toast.success("Onboarding approved");
                          } catch (e: any) {
                            toast.error(e.message);
                          }
                        }}
                      >
                        <CheckCircle2 className="mr-1 h-4 w-4" /> Approve onboarding
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {team.data?.length === 0 && (
          <div className="col-span-full rounded-lg border bg-card p-6 text-sm text-muted-foreground">
            You don't have any direct reports yet.
          </div>
        )}
      </div>
    </div>
  );
}
