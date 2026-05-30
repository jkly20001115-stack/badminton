drop policy if exists "match_results_public_insert" on public.match_results;

create policy "match_results_public_insert"
on public.match_results
for insert
to anon, authenticated
with check (
  mode in ('single', 'multi')
  and winner_side in ('A', 'B')
  and games_a between 0 and 2
  and games_b between 0 and 2
  and (
    (winner_side = 'A' and games_a = 2)
    or (winner_side = 'B' and games_b = 2)
  )
  and final_points_a between 0 and 15
  and final_points_b between 0 and 15
  and jsonb_typeof(set_scores) = 'array'
  and jsonb_array_length(set_scores) between 2 and 3
  and (duration_seconds is null or duration_seconds between 0 and 7200)
  and length(coalesce(player_a_name, '')) <= 18
  and length(coalesce(player_b_name, '')) <= 18
  and length(coalesce(winner_name, '')) <= 18
);
