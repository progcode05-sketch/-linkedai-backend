-- Run this in Supabase SQL Editor as a second query

-- Atomic increment function (prevents race conditions)
create or replace function increment_usage(p_user_id uuid, p_month text)
returns void as $$
begin
  insert into public.usage (user_id, month, count, updated_at)
  values (p_user_id, p_month, 1, now())
  on conflict (user_id, month)
  do update set
    count = usage.count + 1,
    updated_at = now();
end;
$$ language plpgsql security definer;
