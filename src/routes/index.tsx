import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { loading, user, primaryRole } = useAuth();
  if (loading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" />;
  if (primaryRole === "hr") return <Navigate to="/hr" />;
  if (primaryRole === "manager") return <Navigate to="/manager" />;
  return <Navigate to="/employee" />;
}

function FullPageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-sm text-muted-foreground">Loading…</div>
    </div>
  );
}

