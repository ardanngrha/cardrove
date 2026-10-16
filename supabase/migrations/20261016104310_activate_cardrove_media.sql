-- Copy the old bucket through the Storage API before applying this migration.
-- Refuse the switch until every original object is present with matching size and MIME type.
DO $$ BEGIN
 IF EXISTS(
  SELECT 1 FROM storage.objects old
  LEFT JOIN storage.objects copied ON copied.bucket_id='cardrove-media' AND copied.name=old.name
  WHERE old.bucket_id='myanki-media' AND
   (copied.id IS NULL OR copied.metadata->>'size' IS DISTINCT FROM old.metadata->>'size'
    OR copied.metadata->>'mimetype' IS DISTINCT FROM old.metadata->>'mimetype')
 ) THEN RAISE EXCEPTION 'Copy myanki-media to cardrove-media with the Storage API before continuing. See docs/DEPLOY.md.'; END IF;
END $$;
ALTER TABLE public.myanki_workspace ALTER COLUMN media_bucket SET DEFAULT 'cardrove-media';
UPDATE public.myanki_workspace SET media_bucket='cardrove-media' WHERE singleton=true;
ALTER POLICY myanki_media_read ON storage.objects
 USING(bucket_id=(SELECT media_bucket FROM public.myanki_workspace WHERE singleton=true) AND (SELECT public.myanki_approved()));
ALTER POLICY myanki_media_upload ON storage.objects
 WITH CHECK(bucket_id=(SELECT media_bucket FROM public.myanki_workspace WHERE singleton=true) AND name ~ '^[a-f0-9]{64}(\.[a-z0-9]{1,10})?$' AND (SELECT public.myanki_approved())
  AND EXISTS(SELECT 1 FROM public.myanki_imports i,jsonb_array_elements(i.manifest) m WHERE i.status='uploading' AND m->>'disk'=objects.name));

CREATE OR REPLACE FUNCTION public.myanki_storage_usage() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('bytes',coalesce(sum((metadata->>'size')::bigint),0),'files',count(*),'limit',900000000)
 FROM storage.objects WHERE bucket_id=(SELECT media_bucket FROM public.myanki_workspace WHERE singleton=true)
$$;
CREATE OR REPLACE FUNCTION public.myanki_existing_media(p_disks text[]) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(name),'[]') FROM storage.objects WHERE bucket_id=(SELECT media_bucket FROM public.myanki_workspace WHERE singleton=true) AND name=ANY(p_disks)
$$;
REVOKE ALL ON FUNCTION public.myanki_storage_usage(),public.myanki_existing_media(text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.myanki_storage_usage(),public.myanki_existing_media(text[]) TO service_role;

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
    IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id=(SELECT media_bucket FROM public.myanki_workspace WHERE singleton=true) AND name=item->>'disk' AND (metadata->>'size')::bigint=(item->>'bytes')::bigint) THEN RAISE EXCEPTION 'Media import belum lengkap.'; END IF;
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
