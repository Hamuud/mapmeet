// MapMeet — the source registry.
//
// ONE list, one line per site. To add a country:
//   1. write `./<site>.ts` exporting an EventSource
//   2. add it here
//   3. insert the matching row into public.event_sources
//      (see supabase/migrations/20260721000000_event_sources.sql — the
//       karabas block is the template)
//
// A source only runs when its row exists AND is enabled, so a country
// can be paused from the database without a redeploy.

import { karabasSource } from './karabas.ts';
import { type EventSource } from './types.ts';

export const SOURCES: EventSource[] = [karabasSource];

export function sourceById(id: string): EventSource | undefined {
  return SOURCES.find((s) => s.id === id);
}
