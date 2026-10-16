CREATE OR REPLACE FUNCTION public.myanki_commit_review(p_device uuid,p_card text,p_version integer,p_operation uuid,p_rating integer,p_at bigint,p_day text,p_elapsed integer,p_state jsonb,p_log jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.myanki_progress;r public.myanki_reviews;current_version integer;s jsonb;introduced integer; BEGIN
  PERFORM pg_advisory_xact_lock(719231);
  -- Serialize by card, including its first review when no progress row exists yet.
  PERFORM 1 FROM public.myanki_cards WHERE id=p_card AND NOT suspended FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kartu tidak ditemukan.'; END IF;
  SELECT * INTO r FROM public.myanki_reviews WHERE operation_id=p_operation;
  IF FOUND THEN
    IF r.card_id<>p_card OR r.device_id<>p_device OR r.rating<>p_rating OR r.before_version<>p_version OR r.undone THEN RAISE EXCEPTION 'ID jawaban sudah digunakan untuk operasi lain.'; END IF;
    RETURN jsonb_build_object('reviewId',r.id,'duplicate',true);
  END IF;
  SELECT * INTO p FROM public.myanki_progress WHERE card_id=p_card;
  current_version:=coalesce(p.version,0);
  IF current_version<>p_version THEN RAISE EXCEPTION 'Kartu sudah berubah di device lain. Muat kartu terbaru.' USING ERRCODE='40001'; END IF;
  IF coalesce(p.reps,0)>0 AND p.due>p_at THEN RAISE EXCEPTION 'Kartu sudah dijadwalkan. Muat kartu terbaru.' USING ERRCODE='40001'; END IF;
  IF coalesce(p.reps,0)=0 THEN
    SELECT settings INTO s FROM public.myanki_workspace;
    SELECT count(*) INTO introduced FROM public.myanki_reviews WHERE NOT undone AND day=p_day AND (before_state IS NULL OR (before_state->>'reps')::integer=0);
    IF introduced >= (s->>'dailyNew')::integer THEN RAISE EXCEPTION 'Batas kartu baru hari ini tercapai.' USING ERRCODE='40001'; END IF;
    IF EXISTS(SELECT 1 FROM public.myanki_reviews rev JOIN public.myanki_cards sibling ON sibling.id=rev.card_id JOIN public.myanki_cards current ON current.id=p_card WHERE NOT rev.undone AND rev.day=p_day AND sibling.note_id=current.note_id AND sibling.id<>p_card) THEN RAISE EXCEPTION 'Kartu saudara sudah dipelajari hari ini.' USING ERRCODE='40001'; END IF;
  END IF;
  INSERT INTO public.myanki_progress VALUES(p_card,p_state,(extract(epoch FROM (p_state->>'due')::timestamptz)*1000)::bigint,(p_state->>'reps')::integer,current_version+1)
  ON CONFLICT(card_id) DO UPDATE SET state=excluded.state,due=excluded.due,reps=excluded.reps,version=excluded.version;
  INSERT INTO public.myanki_reviews(operation_id,card_id,device_id,rating,at,day,elapsed,before_state,before_version,after_version,log)
  VALUES(p_operation,p_card,p_device,p_rating,p_at,p_day,p_elapsed,p.state,current_version,current_version+1,p_log) RETURNING * INTO r;
  RETURN jsonb_build_object('reviewId',r.id,'due',p_state->>'due');
END $$;
