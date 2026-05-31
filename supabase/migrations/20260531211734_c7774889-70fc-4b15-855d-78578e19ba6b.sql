CREATE TABLE public.role_change_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id uuid NOT NULL,
  previous_role app_role,
  new_role app_role NOT NULL,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_role_change_history_target ON public.role_change_history(target_user_id, created_at DESC);

GRANT SELECT, INSERT ON public.role_change_history TO authenticated;
GRANT ALL ON public.role_change_history TO service_role;

ALTER TABLE public.role_change_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR views all role history"
ON public.role_change_history FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'hr'::app_role));

CREATE POLICY "Users view own role history"
ON public.role_change_history FOR SELECT TO authenticated
USING (target_user_id = auth.uid());