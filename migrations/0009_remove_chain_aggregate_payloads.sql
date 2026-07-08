DELETE FROM public_route_payloads
WHERE id IN ('chains:explorable', 'home:public-summary')
   OR route_kind IN ('chains', 'home');
