import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/")({
  component: AuthRoot,
});

function AuthRoot() {
  const { primaryRole } = useAuth();
  if (primaryRole === "hr") return <Navigate to="/hr" />;
  if (primaryRole === "manager") return <Navigate to="/manager" />;
  if (primaryRole === "employee") return <Navigate to="/employee" />;
  return (
    <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
      Your account doesn't have a role yet. Ask HR to assign one.
    </div>
  );
}
