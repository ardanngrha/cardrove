CREATE OR REPLACE FUNCTION public.myanki_finish_claim(p_hash text,p_device uuid,p_name text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.myanki_claims; BEGIN
  PERFORM pg_advisory_xact_lock(719232);
  SELECT * INTO c FROM public.myanki_claims WHERE token_hash=p_hash FOR UPDATE;
  IF NOT FOUND OR c.used_at IS NOT NULL OR c.expires_at<=now() THEN RAISE EXCEPTION 'Token tidak valid atau sudah dipakai.' USING ERRCODE='P0001'; END IF;
  IF c.kind='bootstrap' AND EXISTS(SELECT 1 FROM public.myanki_devices WHERE revoked_at IS NULL) THEN RAISE EXCEPTION 'Perangkat pertama sudah terhubung.'; END IF;
  IF c.kind='pair' AND NOT EXISTS(SELECT 1 FROM public.myanki_devices WHERE id=c.issuer AND revoked_at IS NULL) THEN RAISE EXCEPTION 'Perangkat pemberi izin sudah dicabut.'; END IF;
  INSERT INTO public.myanki_devices(id,name) VALUES(p_device,p_name);
  UPDATE public.myanki_claims SET used_at=now() WHERE token_hash=p_hash;
  RETURN jsonb_build_object('ok',true,'kind',c.kind);
END $$;
