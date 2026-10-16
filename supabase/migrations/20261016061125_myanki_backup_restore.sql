CREATE TABLE public.myanki_backup_chunks (
 import_id uuid NOT NULL REFERENCES public.myanki_imports(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('progress','reviews')),part integer NOT NULL CHECK(part>=0),data jsonb NOT NULL CHECK(jsonb_typeof(data)='array'),
 PRIMARY KEY(import_id,kind,part)
);
ALTER TABLE public.myanki_backup_chunks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.myanki_backup_chunks FROM anon,authenticated;
GRANT ALL ON public.myanki_backup_chunks TO service_role;
CREATE OR REPLACE FUNCTION public.myanki_finalize_import(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE i public.myanki_imports;item jsonb;expected bigint;actual bigint; BEGIN
  SELECT * INTO i FROM public.myanki_imports WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Import tidak ditemukan.'; END IF;
  IF i.status='complete' THEN RETURN i.summary || '{"duplicate":true}'::jsonb; END IF;
  IF i.status<>'uploading' THEN RAISE EXCEPTION 'Import sudah dibatalkan.'; END IF;
  IF i.summary ? 'backup' AND EXISTS(SELECT 1 FROM public.myanki_cards) THEN RAISE EXCEPTION 'Pemulihan hanya tersedia pada instalasi tanpa kartu.'; END IF;
  FOR item IN SELECT jsonb_build_object('kind',x,'expected',i.summary->>x) FROM unnest(ARRAY['models','decks','notes','cards','media']) x LOOP
    SELECT coalesce(sum(jsonb_array_length(data)),0) INTO actual FROM public.myanki_import_chunks WHERE import_id=p_id AND kind=item->>'kind';
    IF actual<>(item->>'expected')::bigint THEN RAISE EXCEPTION 'Data import belum lengkap: %',item->>'kind'; END IF;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(i.manifest) LOOP
    IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='myanki-media' AND name=item->>'disk' AND (metadata->>'size')::bigint=(item->>'bytes')::bigint) THEN RAISE EXCEPTION 'Media import belum lengkap.'; END IF;
  END LOOP;
  FOR item IN SELECT e FROM public.myanki_import_chunks c,jsonb_array_elements(c.data) e WHERE import_id=p_id AND kind='decks' LOOP
    INSERT INTO public.myanki_decks VALUES(item->>'id',item->>'name',(item->>'imported')::bigint) ON CONFLICT(id) DO UPDATE SET imported=excluded.imported;
  END LOOP;
  FOR item IN SELECT e FROM public.myanki_import_chunks c,jsonb_array_elements(c.data) e WHERE import_id=p_id AND kind='models' LOOP
    INSERT INTO public.myanki_models VALUES(item->>'id',item->'data') ON CONFLICT(id) DO NOTHING;
  END LOOP;
  FOR item IN SELECT e FROM public.myanki_import_chunks c,jsonb_array_elements(c.data) e WHERE import_id=p_id AND kind='notes' LOOP
    INSERT INTO public.myanki_notes VALUES(item->>'id',item->>'model_id',item->'fields',item->>'tags',(item->>'modified')::bigint)
    ON CONFLICT(id) DO UPDATE SET model_id=excluded.model_id,fields=excluded.fields,tags=excluded.tags,modified=excluded.modified WHERE excluded.modified>=myanki_notes.modified;
  END LOOP;
  FOR item IN SELECT e FROM public.myanki_import_chunks c,jsonb_array_elements(c.data) e WHERE import_id=p_id AND kind='cards' LOOP
    INSERT INTO public.myanki_cards VALUES(item->>'id',item->>'note_id',item->>'deck_id',(item->>'ord')::integer,(item->>'suspended')::boolean,(item->>'position')::integer)
    ON CONFLICT(id) DO UPDATE SET deck_id=excluded.deck_id;
  END LOOP;
  FOR item IN SELECT e FROM public.myanki_import_chunks c,jsonb_array_elements(c.data) e WHERE import_id=p_id AND kind='media' LOOP
    INSERT INTO public.myanki_media VALUES(item->>'name',item->>'disk',(item->>'bytes')::bigint,item->>'mime')
    ON CONFLICT(name) DO UPDATE SET disk=excluded.disk,bytes=excluded.bytes,mime=excluded.mime;
  END LOOP;
  IF i.summary ? 'backup' THEN
    FOR item IN SELECT jsonb_build_object('kind',x,'expected',i.summary->>x) FROM unnest(ARRAY['progress','reviews']) x LOOP
      SELECT coalesce(sum(jsonb_array_length(data)),0) INTO actual FROM public.myanki_backup_chunks WHERE import_id=p_id AND kind=item->>'kind';
      IF actual<>(item->>'expected')::bigint THEN RAISE EXCEPTION 'Arsip belum lengkap: %',item->>'kind'; END IF;
    END LOOP;
    FOR item IN SELECT e FROM public.myanki_backup_chunks c,jsonb_array_elements(c.data) e WHERE import_id=p_id AND kind='progress' LOOP
      INSERT INTO public.myanki_progress VALUES(item->>'card_id',item->'state',(item->>'due')::bigint,(item->>'reps')::integer,(item->>'version')::integer);
    END LOOP;
    FOR item IN SELECT e FROM public.myanki_backup_chunks c,jsonb_array_elements(c.data) e WHERE import_id=p_id AND kind='reviews' LOOP
      INSERT INTO public.myanki_reviews(id,operation_id,card_id,device_id,rating,at,day,elapsed,before_state,before_version,after_version,log,undone)
      VALUES((item->>'id')::uuid,(item->>'operation_id')::uuid,item->>'card_id',(i.summary->'backup'->>'deviceId')::uuid,(item->>'rating')::integer,(item->>'at')::bigint,item->>'day',(item->>'elapsed')::integer,nullif(item->'before_state','null'::jsonb),(item->>'before_version')::integer,(item->>'after_version')::integer,item->'log',(item->>'undone')::boolean);
    END LOOP;
    UPDATE public.myanki_workspace SET name=i.summary->'backup'->>'name',settings=i.summary->'backup'->'settings' WHERE singleton;
  END IF;
  UPDATE public.myanki_imports SET status='complete' WHERE id=p_id;
  DELETE FROM public.myanki_import_chunks WHERE import_id=p_id;
  DELETE FROM public.myanki_backup_chunks WHERE import_id=p_id;
  RETURN i.summary;
END $$;


CREATE FUNCTION public.myanki_backup() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
SELECT jsonb_build_object('format','MyAnkiBackup','version',1,'exportedAt',now(),
 'workspace',(SELECT jsonb_build_object('name',name,'settings',settings) FROM public.myanki_workspace),
 'rows',jsonb_build_object(
 'decks',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM public.myanki_decks t),
 'models',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM public.myanki_models t),
 'notes',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM public.myanki_notes t),
 'cards',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM public.myanki_cards t),
 'media',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM public.myanki_media t),
 'progress',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM public.myanki_progress t),
 'reviews',(SELECT coalesce(jsonb_agg(to_jsonb(t)-'device_id'),'[]') FROM public.myanki_reviews t)))
$$;
REVOKE ALL ON FUNCTION public.myanki_backup() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.myanki_backup() TO service_role;
