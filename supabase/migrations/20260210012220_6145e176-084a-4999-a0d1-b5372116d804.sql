
CREATE OR REPLACE FUNCTION public.add_shared_access_by_email(target_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user_id uuid;
  new_access_id uuid;
BEGIN
  SELECT id INTO target_user_id FROM profiles WHERE email = target_email;
  
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário com este e-mail não encontrado';
  END IF;
  
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Você não pode adicionar a si mesmo';
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM shared_access 
    WHERE owner_id = auth.uid() AND shared_with_user_id = target_user_id
  ) THEN
    RAISE EXCEPTION 'Este usuário já tem acesso';
  END IF;
  
  INSERT INTO shared_access (owner_id, shared_with_user_id)
  VALUES (auth.uid(), target_user_id)
  RETURNING id INTO new_access_id;
  
  RETURN new_access_id;
END;
$$;
