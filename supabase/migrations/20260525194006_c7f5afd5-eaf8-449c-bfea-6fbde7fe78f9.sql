
CREATE TABLE public.app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR manages settings" ON public.app_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'hr')) WITH CHECK (public.has_role(auth.uid(), 'hr'));

INSERT INTO public.app_settings (key, value) VALUES ('notion_parent_page_id', '');
