-- One installation is one private workspace. Device identities share its study state.
CREATE TABLE public.myanki_workspace (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  name text NOT NULL DEFAULT 'MyAnki',
  settings jsonb NOT NULL DEFAULT '{"dailyNew":20,"goal":20,"timezone":"Asia/Jakarta"}',
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.myanki_workspace(singleton) VALUES(true);
CREATE TABLE public.myanki_devices (
  id uuid PRIMARY KEY, name text NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz
);
CREATE TABLE public.myanki_claims (
  token_hash text PRIMARY KEY CHECK(length(token_hash)=64), kind text NOT NULL CHECK(kind IN ('bootstrap','pair')),
  expires_at timestamptz NOT NULL, used_at timestamptz, issuer uuid REFERENCES public.myanki_devices(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.myanki_decks (id text PRIMARY KEY,name text NOT NULL,imported bigint NOT NULL);
CREATE TABLE public.myanki_models (id text PRIMARY KEY,data jsonb NOT NULL);
CREATE TABLE public.myanki_notes (
  id text PRIMARY KEY,model_id text NOT NULL REFERENCES public.myanki_models(id),fields jsonb NOT NULL CHECK(jsonb_typeof(fields)='array'),
  tags text NOT NULL DEFAULT '',modified bigint NOT NULL
);
CREATE TABLE public.myanki_cards (
  id text PRIMARY KEY,note_id text NOT NULL REFERENCES public.myanki_notes(id),deck_id text NOT NULL REFERENCES public.myanki_decks(id),
  ord integer NOT NULL CHECK(ord>=0),suspended boolean NOT NULL DEFAULT false,position integer NOT NULL
);
CREATE INDEX myanki_cards_deck ON public.myanki_cards(deck_id);
CREATE INDEX myanki_cards_note ON public.myanki_cards(note_id);
CREATE TABLE public.myanki_progress (
  card_id text PRIMARY KEY REFERENCES public.myanki_cards(id),state jsonb NOT NULL,
  due bigint NOT NULL,reps integer NOT NULL CHECK(reps>=0),version integer NOT NULL CHECK(version>0)
);
CREATE INDEX myanki_progress_due ON public.myanki_progress(due);
CREATE TABLE public.myanki_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),operation_id uuid NOT NULL UNIQUE,card_id text NOT NULL REFERENCES public.myanki_cards(id),
  device_id uuid NOT NULL REFERENCES public.myanki_devices(id),rating integer NOT NULL CHECK(rating BETWEEN 1 AND 4),
  at bigint NOT NULL,day text NOT NULL,elapsed integer NOT NULL CHECK(elapsed BETWEEN 0 AND 300000),
  before_state jsonb,before_version integer NOT NULL,after_version integer NOT NULL,log jsonb NOT NULL,undone boolean NOT NULL DEFAULT false
);
CREATE INDEX myanki_reviews_day ON public.myanki_reviews(day);
CREATE INDEX myanki_reviews_card ON public.myanki_reviews(card_id);
CREATE INDEX myanki_reviews_latest ON public.myanki_reviews(at DESC);
CREATE TABLE public.myanki_media (name text PRIMARY KEY,disk text NOT NULL,bytes bigint NOT NULL CHECK(bytes>=0),mime text NOT NULL DEFAULT 'application/octet-stream');
CREATE TABLE public.myanki_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),file_hash text NOT NULL UNIQUE,name text NOT NULL,
  status text NOT NULL DEFAULT 'uploading' CHECK(status IN ('uploading','complete','cancelled')),
  summary jsonb NOT NULL DEFAULT '{}',manifest jsonb NOT NULL DEFAULT '[]',created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX myanki_one_import ON public.myanki_imports((true)) WHERE status='uploading';
CREATE TABLE public.myanki_import_chunks (
  import_id uuid NOT NULL REFERENCES public.myanki_imports(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK(kind IN ('models','decks','notes','cards','media')),part integer NOT NULL CHECK(part>=0),data jsonb NOT NULL CHECK(jsonb_typeof(data)='array'),
  PRIMARY KEY(import_id,kind,part)
);

CREATE FUNCTION public.myanki_approved() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM public.myanki_devices WHERE id=auth.uid() AND revoked_at IS NULL)
$$;
REVOKE ALL ON FUNCTION public.myanki_approved() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.myanki_approved() TO authenticated,service_role;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['workspace','devices','claims','decks','models','notes','cards','progress','reviews','media','imports','import_chunks'] LOOP
    EXECUTE format('ALTER TABLE public.myanki_%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.myanki_%I FROM anon,authenticated',t);
    EXECUTE format('GRANT ALL ON public.myanki_%I TO service_role',t);
    IF t NOT IN ('claims','import_chunks') THEN
      EXECUTE format('GRANT SELECT ON public.myanki_%I TO authenticated',t);
      EXECUTE format('CREATE POLICY approved_device_read ON public.myanki_%I FOR SELECT TO authenticated USING ((SELECT public.myanki_approved()))',t);
    END IF;
  END LOOP;
END $$;

INSERT INTO storage.buckets(id,name,public,file_size_limit) VALUES('myanki-media','myanki-media',false,50000000);
CREATE POLICY myanki_media_read ON storage.objects FOR SELECT TO authenticated
USING(bucket_id='myanki-media' AND (SELECT public.myanki_approved()));
CREATE POLICY myanki_media_upload ON storage.objects FOR INSERT TO authenticated
WITH CHECK(bucket_id='myanki-media' AND name ~ '^[a-f0-9]{64}(\.[a-z0-9]{1,10})?$' AND (SELECT public.myanki_approved())
  AND EXISTS(SELECT 1 FROM public.myanki_imports i,jsonb_array_elements(i.manifest) m WHERE i.status='uploading' AND m->>'disk'=objects.name));

-- Privileged mutation functions are called only by the authenticated Edge API.
CREATE FUNCTION public.myanki_finish_claim(p_hash text,p_device uuid,p_name text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.myanki_claims; BEGIN
  SELECT * INTO c FROM public.myanki_claims WHERE token_hash=p_hash FOR UPDATE;
  IF NOT FOUND OR c.used_at IS NOT NULL OR c.expires_at<=now() THEN RAISE EXCEPTION 'Token tidak valid atau sudah dipakai.' USING ERRCODE='P0001'; END IF;
  IF c.kind='bootstrap' AND EXISTS(SELECT 1 FROM public.myanki_devices WHERE revoked_at IS NULL) THEN RAISE EXCEPTION 'Perangkat pertama sudah terhubung.'; END IF;
  IF c.kind='pair' AND NOT EXISTS(SELECT 1 FROM public.myanki_devices WHERE id=c.issuer AND revoked_at IS NULL) THEN RAISE EXCEPTION 'Perangkat pemberi izin sudah dicabut.'; END IF;
  INSERT INTO public.myanki_devices(id,name) VALUES(p_device,p_name);
  UPDATE public.myanki_claims SET used_at=now() WHERE token_hash=p_hash;
  RETURN jsonb_build_object('ok',true,'kind',c.kind);
END $$;

CREATE FUNCTION public.myanki_commit_review(p_device uuid,p_card text,p_version integer,p_operation uuid,p_rating integer,p_at bigint,p_day text,p_elapsed integer,p_state jsonb,p_log jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.myanki_progress;r public.myanki_reviews;current_version integer; BEGIN
  -- Serialize by card, including its first review when no progress row exists yet.
  PERFORM 1 FROM public.myanki_cards WHERE id=p_card AND NOT suspended FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kartu tidak ditemukan.'; END IF;
  SELECT * INTO r FROM public.myanki_reviews WHERE operation_id=p_operation;
  IF FOUND THEN
    IF r.card_id<>p_card OR r.device_id<>p_device OR r.rating<>p_rating OR r.before_version<>p_version THEN RAISE EXCEPTION 'ID jawaban sudah digunakan untuk operasi lain.'; END IF;
    RETURN jsonb_build_object('reviewId',r.id,'duplicate',true);
  END IF;
  SELECT * INTO p FROM public.myanki_progress WHERE card_id=p_card;
  current_version:=coalesce(p.version,0);
  IF current_version<>p_version THEN RAISE EXCEPTION 'Kartu sudah berubah di device lain. Muat kartu terbaru.' USING ERRCODE='40001'; END IF;
  IF coalesce(p.reps,0)>0 AND p.due>p_at THEN RAISE EXCEPTION 'Kartu sudah dijadwalkan. Muat kartu terbaru.' USING ERRCODE='40001'; END IF;
  INSERT INTO public.myanki_progress VALUES(p_card,p_state,(extract(epoch FROM (p_state->>'due')::timestamptz)*1000)::bigint,(p_state->>'reps')::integer,current_version+1)
  ON CONFLICT(card_id) DO UPDATE SET state=excluded.state,due=excluded.due,reps=excluded.reps,version=excluded.version;
  INSERT INTO public.myanki_reviews(operation_id,card_id,device_id,rating,at,day,elapsed,before_state,before_version,after_version,log)
  VALUES(p_operation,p_card,p_device,p_rating,p_at,p_day,p_elapsed,p.state,current_version,current_version+1,p_log) RETURNING * INTO r;
  RETURN jsonb_build_object('reviewId',r.id,'due',p_state->>'due');
END $$;

CREATE FUNCTION public.myanki_undo(p_id uuid,p_empty jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.myanki_reviews;p public.myanki_progress; BEGIN
  PERFORM pg_advisory_xact_lock(719231);
  SELECT * INTO r FROM public.myanki_reviews WHERE NOT undone ORDER BY at DESC,id DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND OR r.id<>p_id THEN RAISE EXCEPTION 'Hanya jawaban terakhir yang bisa dibatalkan.' USING ERRCODE='40001'; END IF;
  SELECT * INTO p FROM public.myanki_progress WHERE card_id=r.card_id FOR UPDATE;
  IF p.version<>r.after_version THEN RAISE EXCEPTION 'Progress sudah berubah.' USING ERRCODE='40001'; END IF;
  UPDATE public.myanki_progress SET state=coalesce(r.before_state,p_empty),due=CASE WHEN r.before_state IS NULL THEN (extract(epoch FROM now())*1000)::bigint ELSE (extract(epoch FROM (r.before_state->>'due')::timestamptz)*1000)::bigint END,
    reps=coalesce((r.before_state->>'reps')::integer,0),version=version+1 WHERE card_id=r.card_id;
  UPDATE public.myanki_reviews SET undone=true WHERE id=r.id;
  RETURN jsonb_build_object('ok',true);
END $$;

CREATE FUNCTION public.myanki_finalize_import(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE i public.myanki_imports;item jsonb;expected bigint;actual bigint; BEGIN
  SELECT * INTO i FROM public.myanki_imports WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Import tidak ditemukan.'; END IF;
  IF i.status='complete' THEN RETURN i.summary || '{"duplicate":true}'::jsonb; END IF;
  IF i.status<>'uploading' THEN RAISE EXCEPTION 'Import sudah dibatalkan.'; END IF;
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
  UPDATE public.myanki_imports SET status='complete' WHERE id=p_id;
  DELETE FROM public.myanki_import_chunks WHERE import_id=p_id;
  RETURN i.summary;
END $$;

REVOKE ALL ON FUNCTION public.myanki_finish_claim(text,uuid,text),public.myanki_commit_review(uuid,text,integer,uuid,integer,bigint,text,integer,jsonb,jsonb),public.myanki_undo(uuid,jsonb),public.myanki_finalize_import(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.myanki_finish_claim(text,uuid,text),public.myanki_commit_review(uuid,text,integer,uuid,integer,bigint,text,integer,jsonb,jsonb),public.myanki_undo(uuid,jsonb),public.myanki_finalize_import(uuid) TO service_role;
