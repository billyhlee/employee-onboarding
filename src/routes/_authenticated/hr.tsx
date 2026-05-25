import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  createEmployee,
  saveTemplate,
  deleteTemplate,
  saveNotionParent,
  setUserRole,
} from "@/lib/employees.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Trash2, Plus, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_authenticated/hr")({
  component: HrDashboard,
});

type ProfileRow = {
  id: string;
  full_name: string;
  email: string;
  job_title: string | null;
  start_date: string | null;
  manager_id: string | null;
  notion_page_url: string | null;
  onboarding_approved: boolean;
};

function HrDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">HR dashboard</h1>
        <p className="text-sm text-muted-foreground">Manage employees, templates and settings.</p>
      </div>
      <Tabs defaultValue="employees">
        <TabsList>
          <TabsTrigger value="employees">Employees</TabsTrigger>
          <TabsTrigger value="templates">Task templates</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="employees" className="pt-4">
          <EmployeesTab />
        </TabsContent>
        <TabsContent value="templates" className="pt-4">
          <TemplatesTab />
        </TabsContent>
        <TabsContent value="settings" className="pt-4">
          <SettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EmployeesTab() {
  const qc = useQueryClient();
  const profilesQuery = useQuery({
    queryKey: ["profiles"],
    queryFn: async (): Promise<ProfileRow[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, job_title, start_date, manager_id, notion_page_url, onboarding_approved")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const rolesQuery = useQuery({
    queryKey: ["user_roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id, role");
      if (error) throw error;
      return data ?? [];
    },
  });

  const rolesByUser = new Map<string, string>();
  for (const r of rolesQuery.data ?? []) rolesByUser.set(r.user_id, r.role);

  const setRole = useServerFn(setUserRole);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Team</h2>
        <NewEmployeeDialog
          managers={(profilesQuery.data ?? []).filter((p) => rolesByUser.get(p.id) === "manager" || rolesByUser.get(p.id) === "hr")}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ["profiles"] });
            qc.invalidateQueries({ queryKey: ["user_roles"] });
          }}
        />
      </div>
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Name</th>
                <th className="p-3">Email</th>
                <th className="p-3">Role</th>
                <th className="p-3">Status</th>
                <th className="p-3">Notion</th>
              </tr>
            </thead>
            <tbody>
              {(profilesQuery.data ?? []).map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="p-3 font-medium">{p.full_name || "—"}</td>
                  <td className="p-3 text-muted-foreground">{p.email}</td>
                  <td className="p-3">
                    <Select
                      value={rolesByUser.get(p.id) ?? "employee"}
                      onValueChange={async (value) => {
                        try {
                          await setRole({ data: { targetUserId: p.id, role: value as "hr" | "manager" | "employee" } });
                          qc.invalidateQueries({ queryKey: ["user_roles"] });
                          toast.success("Role updated");
                        } catch (e: any) {
                          toast.error(e.message);
                        }
                      }}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hr">HR</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="employee">Employee</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-3">
                    {p.onboarding_approved ? (
                      <Badge variant="default">Approved</Badge>
                    ) : (
                      <Badge variant="secondary">In progress</Badge>
                    )}
                  </td>
                  <td className="p-3">
                    {p.notion_page_url ? (
                      <a
                        href={p.notion_page_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        Open <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {profilesQuery.data?.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted-foreground">
                    No employees yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function NewEmployeeDialog({
  managers,
  onCreated,
}: {
  managers: ProfileRow[];
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [managerId, setManagerId] = useState<string>("none");
  const [role, setRole] = useState<"employee" | "manager" | "hr">("employee");
  const [customTasksRaw, setCustomTasksRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const create = useServerFn(createEmployee);

  const reset = () => {
    setFullName(""); setEmail(""); setPassword(""); setJobTitle(""); setStartDate("");
    setManagerId("none"); setRole("employee"); setCustomTasksRaw("");
  };

  const submit = async () => {
    setBusy(true);
    try {
      const customTasks = customTasksRaw
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((title) => ({ title }));
      const result = await create({
        data: {
          email, password, fullName,
          jobTitle: jobTitle || null,
          startDate: startDate || null,
          managerId: managerId === "none" ? null : managerId,
          role,
          customTasks,
        },
      });
      if (result.notion) {
        toast.success("Employee created and Notion page generated");
      } else {
        toast.success("Employee created (set a Notion parent page in Settings to enable Notion pages)");
      }
      reset();
      setOpen(false);
      onCreated();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to create employee");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="mr-1 h-4 w-4" /> New employee</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a new employee</DialogTitle>
          <DialogDescription>They'll receive the template checklist and a Notion onboarding page.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Full name</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Job title</Label>
              <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Temporary password</Label>
              <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Start date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Manager</Label>
              <Select value={managerId} onValueChange={setManagerId}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No manager</SelectItem>
                  {managers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.full_name || m.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="employee">Employee</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="hr">HR</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Extra tasks (one per line, optional)</Label>
            <Textarea rows={3} value={customTasksRaw} onChange={(e) => setCustomTasksRaw(e.target.value)} placeholder="Set up VPN&#10;Order laptop" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !email || !password || !fullName}>
            {busy ? "Creating…" : "Create employee"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TemplatesTab() {
  const qc = useQueryClient();
  const templates = useQuery({
    queryKey: ["templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("onboarding_templates")
        .select("id, title, description, position")
        .order("position", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
  const save = useServerFn(saveTemplate);
  const del = useServerFn(deleteTemplate);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Add template task</CardTitle>
          <CardDescription>Added to every new employee's checklist.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <Button
            onClick={async () => {
              if (!title) return;
              try {
                await save({ data: { title, description: description || null, position: (templates.data?.length ?? 0) } });
                setTitle(""); setDescription("");
                qc.invalidateQueries({ queryKey: ["templates"] });
                toast.success("Template added");
              } catch (e: any) {
                toast.error(e.message);
              }
            }}
          >Add</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Current templates</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {(templates.data ?? []).map((t) => (
              <li key={t.id} className="flex items-start justify-between rounded-md border p-3">
                <div>
                  <div className="font-medium">{t.title}</div>
                  {t.description && <div className="text-sm text-muted-foreground">{t.description}</div>}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={async () => {
                    await del({ data: { id: t.id } });
                    qc.invalidateQueries({ queryKey: ["templates"] });
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
            {templates.data?.length === 0 && (
              <li className="text-sm text-muted-foreground">No templates yet.</li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function SettingsTab() {
  const settingQuery = useQuery({
    queryKey: ["notion_parent"],
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "notion_parent_page_id")
        .maybeSingle();
      return data?.value ?? "";
    },
  });
  const [pageId, setPageId] = useState<string | null>(null);
  const value = pageId ?? settingQuery.data ?? "";
  const save = useServerFn(saveNotionParent);

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Notion integration</CardTitle>
        <CardDescription>
          Paste the ID of the Notion page that should serve as the parent for new onboarding pages. Make sure
          the page is shared with the connected Notion integration.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <Label>Parent page ID</Label>
          <Input value={value} onChange={(e) => setPageId(e.target.value)} placeholder="e.g. 1f2a3b4c5d6e7f8…" />
          <p className="text-xs text-muted-foreground">
            Find this in the page URL: the 32-character ID after the last dash.
          </p>
        </div>
        <Button
          onClick={async () => {
            try {
              await save({ data: { pageId: value } });
              toast.success("Saved");
            } catch (e: any) {
              toast.error(e.message);
            }
          }}
          disabled={!value}
        >
          Save
        </Button>
      </CardContent>
    </Card>
  );
}
