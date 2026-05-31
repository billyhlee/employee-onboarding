import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { bootstrapHr } from "@/lib/employees.functions";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { user, loading, refresh } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const bootstrap = useServerFn(bootstrapHr);

  if (!loading && user) return <Navigate to="/" />;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error, data } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      console.warn(`[LOGIN_AUDIT] Failed login attempt - Email: ${email}, IP: unknown, Error: ${error.message}`);
      setBusy(false);
      return toast.error(error.message);
    }
    console.info(`[LOGIN_AUDIT] Successful login - User ID: ${data.user?.id}, Email: ${email}, Timestamp: ${new Date().toISOString()}`);
    // If no HR exists yet, promote this user. No-op otherwise.
    try {
      const result = await bootstrap();
      if (result?.promoted) toast.success("Signed in — you are now the HR admin");
      else toast.success("Signed in");
    } catch {
      toast.success("Signed in");
    }
    await refresh();
    setBusy(false);
    navigate({ to: "/" });
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { data: signUpData, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) {
      console.warn(`[SIGNUP_AUDIT] Failed signup attempt - Email: ${email}, Error: ${error.message}`);
      setBusy(false);
      return toast.error(error.message);
    }
    console.info(`[SIGNUP_AUDIT] Account created - User ID: ${signUpData.user?.id}, Email: ${email}, Timestamp: ${new Date().toISOString()}`);
    // If email confirmation is required, no session exists yet — can't bootstrap.
    if (!signUpData.session) {
      setBusy(false);
      toast.success("Account created. Check your email to confirm, then sign in.");
      return;
    }
    // Try to bootstrap as HR if no HR exists yet
    try {
      const result = await bootstrap();
      if (result?.promoted) {
        toast.success("Account created — you are the HR admin");
      } else {
        toast.success("Account created. Ask HR to assign your role.");
      }
    } catch {
      toast.success("Account created");
    }
    await refresh();
    setBusy(false);
    navigate({ to: "/" });
  };


  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Onboarding</CardTitle>
          <CardDescription>Sign in to manage or complete your onboarding.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Create account</TabsTrigger>
            </TabsList>
            <TabsContent value="signin">
              <form onSubmit={handleLogin} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? "Signing in…" : "Sign in"}
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4 pt-4">
                <p className="text-xs text-muted-foreground">
                  The very first account created becomes the HR admin. Other accounts default to Employee until HR assigns them a role.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="su-name">Full name</Label>
                  <Input id="su-name" required value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-email">Email</Label>
                  <Input id="su-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-password">Password</Label>
                  <Input id="su-password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? "Creating…" : "Create account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
