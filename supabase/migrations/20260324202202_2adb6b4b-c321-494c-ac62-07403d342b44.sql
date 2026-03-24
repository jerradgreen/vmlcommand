
-- Step 1: Create enum for roles
CREATE TYPE public.app_role AS ENUM ('admin', 'sales_rep');

-- Step 2: user_roles table
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Step 3: has_role security definer function
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Step 4: RLS on user_roles
CREATE POLICY "Users can read own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Step 5: rep_style_access table
CREATE TABLE public.rep_style_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  sign_style text NOT NULL,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, sign_style)
);
ALTER TABLE public.rep_style_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reps can read own style access"
  ON public.rep_style_access FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can manage style access"
  ON public.rep_style_access FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Step 6: rep_lead_actions table
CREATE TABLE public.rep_lead_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
  action_type text NOT NULL,
  body text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.rep_lead_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reps can read own actions"
  ON public.rep_lead_actions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Reps can insert own actions"
  ON public.rep_lead_actions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can read all actions"
  ON public.rep_lead_actions FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Step 7: Assign current user as admin (we'll do this via edge function after)

-- Step 8: Enable realtime for rep_lead_actions
ALTER PUBLICATION supabase_realtime ADD TABLE public.rep_lead_actions;
