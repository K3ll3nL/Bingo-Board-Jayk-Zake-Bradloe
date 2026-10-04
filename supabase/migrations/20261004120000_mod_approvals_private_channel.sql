-- Private Realtime channel for the moderator approvals queue.
--
-- The header badge and the Approvals page used to listen on the PUBLIC
-- 'approvals-updates' broadcast topic, which anyone holding the anon key can join.
-- They now join the private topic 'mod-approvals' (client: { config: { private: true } }),
-- and Realtime evaluates this SELECT policy at join time. Only rows in
-- public.moderators may listen. Moderator ids are Supabase auth user ids.
--
-- The API sends with the service role (bypasses RLS), so no INSERT policy is
-- needed and clients cannot publish to this topic.
--
-- 'approvals-updates' stays public for the OBS approvals overlay, which
-- authenticates with an API key rather than a Supabase session and so cannot pass
-- an RLS check. It carries only an empty "queue changed" ping.

drop policy if exists "moderators can listen to mod-approvals" on realtime.messages;

create policy "moderators can listen to mod-approvals"
on realtime.messages
for select
to authenticated
using (
  (select realtime.topic()) = 'mod-approvals'
  and realtime.messages.extension = 'broadcast'
  and exists (
    select 1 from public.moderators m
    where m.id = (select auth.uid())
  )
);
