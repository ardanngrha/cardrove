CREATE VIEW public.myanki_card_detail WITH(security_invoker=true) AS
 SELECT c.*,n.fields,n.tags,n.model_id,n.modified,m.data model,d.name deck_name,p.state,p.version,p.due,p.reps
 FROM public.myanki_cards c JOIN public.myanki_notes n ON n.id=c.note_id
 JOIN public.myanki_models m ON m.id=n.model_id JOIN public.myanki_decks d ON d.id=c.deck_id
 LEFT JOIN public.myanki_progress p ON p.card_id=c.id;
REVOKE ALL ON public.myanki_card_detail FROM anon;
GRANT SELECT ON public.myanki_card_detail TO authenticated,service_role;

CREATE FUNCTION public.myanki_summary() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb;d jsonb;r jsonb;t jsonb;today text;introduced integer;streak integer:=0;cursor_day date; BEGIN
 SELECT settings INTO s FROM public.myanki_workspace;
 today:=to_char(now() AT TIME ZONE(s->>'timezone'),'YYYY-MM-DD');
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.name),'[]') INTO d FROM (
  SELECT d.*,count(c.id)::integer total,count(*) FILTER(WHERE coalesce(p.reps,0)=0 AND NOT c.suspended)::integer new_count,
  count(*) FILTER(WHERE p.due<=(extract(epoch FROM now())*1000)::bigint AND p.reps>0 AND NOT c.suspended)::integer due_count,
  count(*) FILTER(WHERE p.reps>0)::integer studied
  FROM public.myanki_decks d JOIN public.myanki_cards c ON c.deck_id=d.id LEFT JOIN public.myanki_progress p ON p.card_id=c.id GROUP BY d.id
 ) x;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.day),'[]') INTO r FROM (
  SELECT day,count(*)::integer count,sum(elapsed)::bigint elapsed,count(*) FILTER(WHERE rating>1)::integer correct
  FROM public.myanki_reviews WHERE NOT undone GROUP BY day
 ) x;
 SELECT value INTO t FROM jsonb_array_elements(r) WHERE value->>'day'=today;
 SELECT count(*) INTO introduced FROM public.myanki_reviews WHERE NOT undone AND day=today AND (before_state IS NULL OR (before_state->>'reps')::integer=0);
 cursor_day:=today::date;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r) WHERE value->>'day'=cursor_day::text) THEN cursor_day:=cursor_day-1; END IF;
 WHILE EXISTS(SELECT 1 FROM jsonb_array_elements(r) WHERE value->>'day'=cursor_day::text) LOOP streak:=streak+1;cursor_day:=cursor_day-1; END LOOP;
 RETURN jsonb_build_object('settings',s,'decks',d,'reviews',r,'today',coalesce(t,'{"count":0,"elapsed":0,"correct":0}')||jsonb_build_object('introduced',introduced),'streak',streak,'total',(SELECT count(*) FROM public.myanki_cards));
END $$;

CREATE FUNCTION public.myanki_next(p_deck text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb;today text;introduced integer;c jsonb;upcoming bigint; BEGIN
 SELECT settings INTO s FROM public.myanki_workspace;today:=to_char(now() AT TIME ZONE(s->>'timezone'),'YYYY-MM-DD');
 SELECT count(*) INTO introduced FROM public.myanki_reviews WHERE NOT undone AND day=today AND (before_state IS NULL OR (before_state->>'reps')::integer=0);
 SELECT to_jsonb(x) INTO c FROM public.myanki_card_detail x WHERE NOT suspended AND (p_deck IS NULL OR deck_id=p_deck) AND reps>0 AND due<=(extract(epoch FROM now())*1000)::bigint
 ORDER BY CASE WHEN (state->>'state')::integer IN(1,3) THEN 0 ELSE 1 END,due,position LIMIT 1;
 IF c IS NULL AND introduced<(s->>'dailyNew')::integer THEN
  SELECT to_jsonb(x) INTO c FROM public.myanki_card_detail x WHERE NOT suspended AND (p_deck IS NULL OR deck_id=p_deck) AND coalesce(reps,0)=0
  AND NOT EXISTS(SELECT 1 FROM public.myanki_reviews r JOIN public.myanki_cards sibling ON sibling.id=r.card_id WHERE NOT r.undone AND r.day=today AND sibling.note_id=x.note_id AND sibling.id<>x.id)
  ORDER BY position,id LIMIT 1;
 END IF;
 SELECT min(due) INTO upcoming FROM public.myanki_card_detail WHERE NOT suspended AND (p_deck IS NULL OR deck_id=p_deck) AND due>(extract(epoch FROM now())*1000)::bigint;
 RETURN jsonb_build_object('card',c,'nextDue',upcoming,'dailyLimit',introduced>=(s->>'dailyNew')::integer);
END $$;

CREATE FUNCTION public.myanki_browse(p_q text DEFAULT '',p_deck text DEFAULT '',p_page integer DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rows jsonb;total bigint;query text; BEGIN
 query:='%'||replace(replace(replace(left(p_q,200),'\','\\'),'%','\%'),'_','\_')||'%';
 SELECT count(*) INTO total FROM public.myanki_card_detail WHERE (p_deck='' OR deck_id=p_deck) AND (p_q='' OR fields::text ILIKE query ESCAPE '\' OR tags ILIKE query ESCAPE '\');
 SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO rows FROM (SELECT * FROM public.myanki_card_detail WHERE (p_deck='' OR deck_id=p_deck) AND (p_q='' OR fields::text ILIKE query ESCAPE '\' OR tags ILIKE query ESCAPE '\') ORDER BY position,id LIMIT 50 OFFSET greatest(0,least(p_page,100000))*50) x;
 RETURN jsonb_build_object('cards',rows,'total',total);
END $$;
REVOKE ALL ON FUNCTION public.myanki_summary(),public.myanki_next(text),public.myanki_browse(text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.myanki_summary(),public.myanki_next(text),public.myanki_browse(text,text,integer) TO service_role;

CREATE FUNCTION public.myanki_storage_usage() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('bytes',coalesce(sum((metadata->>'size')::bigint),0),'files',count(*),'limit',900000000)
 FROM storage.objects WHERE bucket_id='myanki-media'
$$;
CREATE FUNCTION public.myanki_existing_media(p_disks text[]) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(name),'[]') FROM storage.objects WHERE bucket_id='myanki-media' AND name=ANY(p_disks)
$$;
REVOKE ALL ON FUNCTION public.myanki_storage_usage(),public.myanki_existing_media(text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.myanki_storage_usage(),public.myanki_existing_media(text[]) TO service_role;
