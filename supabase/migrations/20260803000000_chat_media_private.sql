-- =========================================================================
-- MapMeet — chat-media goes private, gated on chat membership
-- =========================================================================
-- Until now chat-media was a PUBLIC bucket: every voice note and photo
-- was fetchable by anyone holding (or guessing) its URL, with no auth.
-- The previous migration stopped enumeration; this one removes public
-- read entirely.
--
--   * bucket flipped to private → /object/public/... stops serving.
--   * chat_media_member(name) — maps an object path back to its chat and
--     asks whether the caller belongs to it:
--         dm/<dm_id>/…      → is_dm_member
--         group/<group_id>/… → is_group_member
--         <event_id>/…       → is_event_member
--   * SELECT policy uses it, so only members can read a chat's media —
--     which is also what authorises createSignedUrl().
--   * INSERT policy tightened the same way: previously ANY authenticated
--     user could upload into ANY chat's folder.
--
-- Clients now store the object PATH in messages.media_url and mint a
-- short-lived signed URL at read time (services/media.service.ts). Rows
-- written before this migration still hold full public URLs; the client
-- strips the prefix, so old media keeps working.
--
-- Idempotent: safe to re-run.
-- =========================================================================

update storage.buckets set public = false where id = 'chat-media';

create or replace function public.chat_media_member(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_folders text[] := storage.foldername(p_name);
  v_depth   int    := coalesce(array_length(v_folders, 1), 0);
  v_id      uuid;
begin
  if auth.uid() is null or v_depth = 0 then
    return false;
  end if;

  if v_folders[1] = 'dm' then
    if v_depth < 2 then return false; end if;
    begin v_id := v_folders[2]::uuid; exception when others then return false; end;
    return public.is_dm_member(v_id, auth.uid());

  elsif v_folders[1] = 'group' then
    if v_depth < 2 then return false; end if;
    begin v_id := v_folders[2]::uuid; exception when others then return false; end;
    return public.is_group_member(v_id, auth.uid());

  else
    -- Event chats key media straight under the event id.
    begin v_id := v_folders[1]::uuid; exception when others then return false; end;
    return public.is_event_member(v_id, auth.uid());
  end if;
end;
$$;

grant execute on function public.chat_media_member(text) to authenticated;

-- Read: members of that chat only (also gates createSignedUrl).
drop policy if exists "public read on chat media" on storage.objects;
drop policy if exists "members read chat media"   on storage.objects;
create policy "members read chat media"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'chat-media' and public.chat_media_member(name));

-- Write: only into a chat you belong to.
drop policy if exists "authenticated upload chat media" on storage.objects;
drop policy if exists "members upload chat media"       on storage.objects;
create policy "members upload chat media"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'chat-media' and public.chat_media_member(name));
