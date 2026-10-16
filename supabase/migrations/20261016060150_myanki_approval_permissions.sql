-- The helper exposes only the current session's approval status. Anonymous callers need no access.
REVOKE ALL ON FUNCTION public.myanki_approved() FROM anon;
