-- Keep workspace operations compatible with the API safe-update guard.
-- Authorization, locks and grants remain unchanged.

CREATE OR REPLACE FUNCTION public.myanki_setup_workspace(p_device uuid,p_owner text,p_name text,p_hash text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(719232);
  IF NOT EXISTS(SELECT 1 FROM public.myanki_devices WHERE id=p_device AND revoked_at IS NULL) THEN RAISE EXCEPTION 'Akses perangkat ditolak.' USING ERRCODE='PT401'; END IF;
  IF EXISTS(SELECT 1 FROM public.myanki_workspace WHERE access_saved) THEN RAISE EXCEPTION 'Workspace sudah disiapkan.' USING ERRCODE='PT409'; END IF;
  IF length(trim(p_owner)) NOT BETWEEN 1 AND 64 OR length(trim(p_name)) NOT BETWEEN 1 AND 64 THEN RAISE EXCEPTION 'Nama harus 1 sampai 64 karakter.'; END IF;
  UPDATE public.myanki_workspace SET owner_name=trim(p_owner),name=trim(p_name) WHERE singleton=true;
  INSERT INTO public.myanki_access(singleton,token_hash) VALUES(true,p_hash)
    ON CONFLICT(singleton) DO UPDATE SET token_hash=excluded.token_hash,rotated_at=now();
END $$;

CREATE OR REPLACE FUNCTION public.myanki_confirm_access(p_device uuid,p_hash text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(719232);
  IF NOT EXISTS(SELECT 1 FROM public.myanki_devices WHERE id=p_device AND revoked_at IS NULL) THEN RAISE EXCEPTION 'Akses perangkat ditolak.' USING ERRCODE='PT401'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.myanki_access WHERE token_hash=p_hash) THEN RAISE EXCEPTION 'Kode sudah diganti. Buat kode baru.' USING ERRCODE='PT409'; END IF;
  UPDATE public.myanki_workspace SET access_saved=true WHERE singleton=true;
END $$;

CREATE OR REPLACE FUNCTION public.myanki_reset_progress(p_confirm text,p_empty jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE total bigint; BEGIN
  PERFORM 1 FROM public.myanki_workspace WHERE name=p_confirm FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nama workspace belum cocok.' USING ERRCODE='PT400'; END IF;
  INSERT INTO public.myanki_progress(card_id,state,due,reps,version)
    SELECT id,p_empty,(extract(epoch FROM now())*1000)::bigint,0,1 FROM public.myanki_cards
    ON CONFLICT(card_id) DO UPDATE SET state=excluded.state,due=excluded.due,reps=0,version=public.myanki_progress.version+1;
  GET DIAGNOSTICS total=ROW_COUNT;
  DELETE FROM public.myanki_reviews WHERE id IS NOT NULL;
  RETURN jsonb_build_object('cards',total);
END $$;

