CREATE OR REPLACE FUNCTION public.khata_inventory_post_v1(p jsonb)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$select orbis_khata.inventory_write(p)$function$

