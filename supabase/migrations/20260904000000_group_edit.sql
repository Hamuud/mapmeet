-- Let the creator rename a group, change its emoji, or give it a photo.
--
-- A group was named once, at creation, and never again — which is fine
-- for the ten seconds after you make one and wrong for every week
-- after that.

-- Null means "use the emoji". Keeping both columns rather than
-- replacing emoji with a photo: an emoji is one tap and needs no
-- upload, and most groups will never want more than that.
alter table public.group_chats
  add column if not exists avatar_url text;

/*
  Update a group's identity. Creator only.

  Every argument is optional and null means "leave it alone" — except
  the photo, which needs a way to be removed. An empty string clears it,
  since a null there is indistinguishable from "not changing it".

  The rename is announced in the room. A group changing its name under
  the other members with no explanation is the kind of small mystery
  that makes people think something is broken; the emoji and the photo
  are not announced, because they are visible in the header the moment
  you look and do not change what the group IS.
*/
create or replace function public.update_group(
  p_group      uuid,
  p_name       text default null,
  p_emoji      text default null,
  p_avatar_url text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_creator uuid;
  v_old     text;
  v_new     text;
  v_actor   text;
begin
  select creator_id, name into v_creator, v_old
    from public.group_chats where id = p_group;
  if v_creator is null then
    raise exception 'group not found' using errcode = '42704';
  end if;
  if v_creator <> auth.uid() then
    raise exception 'only the group creator can edit the group'
      using errcode = '42501';
  end if;

  v_new := nullif(btrim(coalesce(p_name, '')), '');
  if p_name is not null and v_new is null then
    raise exception 'a group needs a name' using errcode = '22023';
  end if;
  if v_new is not null and char_length(v_new) > 40 then
    raise exception 'that name is too long' using errcode = '22023';
  end if;

  update public.group_chats
     set name       = coalesce(v_new, name),
         emoji      = coalesce(nullif(btrim(coalesce(p_emoji, '')), ''), emoji),
         -- '' clears the photo, null leaves it as it was.
         avatar_url = case
                        when p_avatar_url is null then avatar_url
                        when btrim(p_avatar_url) = '' then null
                        else p_avatar_url
                      end,
         updated_at = now()
   where id = p_group;

  if v_new is not null and v_new is distinct from v_old then
    select display_name into v_actor from public.profiles where id = auth.uid();
    insert into public.group_messages (group_id, sender_id, type, text)
    values (p_group, null, 'system',
            coalesce(v_actor, 'Someone') || ' renamed the group to ' || v_new);
  end if;
end;
$$;

revoke all on function public.update_group(uuid, text, text, text) from public, anon;
grant execute on function public.update_group(uuid, text, text, text) to authenticated;
