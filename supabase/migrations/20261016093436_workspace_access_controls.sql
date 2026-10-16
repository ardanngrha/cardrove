-- Additive workspace controls. Preserve deployed technical identifiers.

ALTER TABLE public.myanki_workspace ADD COLUMN owner_name text CHECK(length(owner_name) BETWEEN 1 AND 64);
ALTER TABLE public.myanki_workspace ADD COLUMN access_saved boolean NOT NULL DEFAULT false;
ALTER TABLE public.myanki_workspace ADD COLUMN media_bucket text NOT NULL DEFAULT 'myanki-media';
ALTER TABLE public.myanki_workspace ALTER COLUMN name SET DEFAULT 'Cardrove';
UPDATE public.myanki_workspace SET name='Cardrove' WHERE name='MyAnki';
CREATE TABLE public.myanki_access (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'),
  rotated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.myanki_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.myanki_access FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.myanki_access TO service_role;

CREATE OR REPLACE FUNCTION public.myanki_finish_claim(p_hash text,p_device uuid,p_name text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.myanki_claims; permanent boolean; BEGIN
  PERFORM pg_advisory_xact_lock(719232);
  SELECT EXISTS(SELECT 1 FROM public.myanki_access WHERE token_hash=p_hash) INTO permanent;
  IF NOT permanent THEN
    SELECT * INTO c FROM public.myanki_claims WHERE token_hash=p_hash FOR UPDATE;
    IF NOT FOUND OR c.used_at IS NOT NULL OR c.expires_at<=now() THEN RAISE EXCEPTION 'Kode tidak valid atau sudah kedaluwarsa.' USING ERRCODE='PT403'; END IF;
    IF c.kind='bootstrap' AND EXISTS(SELECT 1 FROM public.myanki_devices WHERE revoked_at IS NULL) THEN RAISE EXCEPTION 'Perangkat pertama sudah terhubung.' USING ERRCODE='PT403'; END IF;
    IF c.kind='pair' AND NOT EXISTS(SELECT 1 FROM public.myanki_devices WHERE id=c.issuer AND revoked_at IS NULL) THEN RAISE EXCEPTION 'Akses pembuat kode sudah dicabut.' USING ERRCODE='PT403'; END IF;
    UPDATE public.myanki_claims SET used_at=now() WHERE token_hash=p_hash;
  END IF;
  INSERT INTO public.myanki_devices(id,name) VALUES(p_device,p_name);
  RETURN jsonb_build_object('ok',true,'kind',CASE WHEN permanent THEN 'access' ELSE c.kind END);
END $$;

CREATE FUNCTION public.myanki_setup_workspace(p_device uuid,p_owner text,p_name text,p_hash text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(719232);
  IF NOT EXISTS(SELECT 1 FROM public.myanki_devices WHERE id=p_device AND revoked_at IS NULL) THEN RAISE EXCEPTION 'Akses perangkat ditolak.' USING ERRCODE='PT401'; END IF;
  IF EXISTS(SELECT 1 FROM public.myanki_workspace WHERE access_saved) THEN RAISE EXCEPTION 'Workspace sudah disiapkan.' USING ERRCODE='PT409'; END IF;
  IF length(trim(p_owner)) NOT BETWEEN 1 AND 64 OR length(trim(p_name)) NOT BETWEEN 1 AND 64 THEN RAISE EXCEPTION 'Nama harus 1 sampai 64 karakter.'; END IF;
  UPDATE public.myanki_workspace SET owner_name=trim(p_owner),name=trim(p_name);
  INSERT INTO public.myanki_access(singleton,token_hash) VALUES(true,p_hash)
    ON CONFLICT(singleton) DO UPDATE SET token_hash=excluded.token_hash,rotated_at=now();
END $$;

CREATE FUNCTION public.myanki_rotate_access(p_device uuid,p_hash text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(719232);
  IF NOT EXISTS(SELECT 1 FROM public.myanki_devices WHERE id=p_device AND revoked_at IS NULL) THEN RAISE EXCEPTION 'Akses perangkat ditolak.' USING ERRCODE='PT401'; END IF;
  INSERT INTO public.myanki_access(singleton,token_hash) VALUES(true,p_hash)
    ON CONFLICT(singleton) DO UPDATE SET token_hash=excluded.token_hash,rotated_at=now();
  DELETE FROM public.myanki_claims WHERE kind='pair' AND used_at IS NULL;
END $$;

CREATE FUNCTION public.myanki_confirm_access(p_device uuid,p_hash text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(719232);
  IF NOT EXISTS(SELECT 1 FROM public.myanki_devices WHERE id=p_device AND revoked_at IS NULL) THEN RAISE EXCEPTION 'Akses perangkat ditolak.' USING ERRCODE='PT401'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.myanki_access WHERE token_hash=p_hash) THEN RAISE EXCEPTION 'Kode sudah diganti. Buat kode baru.' USING ERRCODE='PT409'; END IF;
  UPDATE public.myanki_workspace SET access_saved=true;
END $$;

CREATE FUNCTION public.myanki_reset_progress(p_confirm text,p_empty jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE total bigint; BEGIN
  PERFORM 1 FROM public.myanki_workspace WHERE name=p_confirm FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nama workspace belum cocok.' USING ERRCODE='PT400'; END IF;
  INSERT INTO public.myanki_progress(card_id,state,due,reps,version)
    SELECT id,p_empty,(extract(epoch FROM now())*1000)::bigint,0,1 FROM public.myanki_cards
    ON CONFLICT(card_id) DO UPDATE SET state=excluded.state,due=excluded.due,reps=0,version=public.myanki_progress.version+1;
  GET DIAGNOSTICS total=ROW_COUNT;
  DELETE FROM public.myanki_reviews;
  RETURN jsonb_build_object('cards',total);
END $$;

REVOKE ALL ON FUNCTION public.myanki_setup_workspace(uuid,text,text,text), public.myanki_rotate_access(uuid,text), public.myanki_confirm_access(uuid,text), public.myanki_reset_progress(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.myanki_setup_workspace(uuid,text,text,text), public.myanki_rotate_access(uuid,text), public.myanki_confirm_access(uuid,text), public.myanki_reset_progress(text,jsonb) TO service_role;
