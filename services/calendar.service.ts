import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

import { eventStart } from '@/utils/eventTime';
import {
  buildIcs,
  calendarLocation,
  calendarTitle,
  eventEnd,
  icsFilename,
  type CalendarEventInput,
} from '@/utils/ics';

// expo-calendar is loaded lazily, exactly like expo-notifications in
// push.service. Every build shipped so far predates this dependency, and
// a static import would crash bundle eval on the installed dev client
// and TestFlight build. With the lazy require the app keeps working and
// calendar sync simply no-ops until the next native build.
type CalendarModule = typeof import('expo-calendar');

function calendarNativeAvailable(): boolean {
  try {
    return !!requireOptionalNativeModule('ExpoCalendar');
  } catch {
    return false;
  }
}

function loadCalendar(): CalendarModule | null {
  if (Platform.OS === 'web') return null;
  if (!calendarNativeAvailable()) return null;
  try {
    return require('expo-calendar') as CalendarModule;
  } catch {
    return null;
  }
}

/** Whether writing to the device calendar is possible in this build at
 *  all — false on web, and on any native build made before the
 *  dependency landed. Screens use it to hide the toggle rather than
 *  offer something that silently does nothing. */
export function calendarSupported(): boolean {
  return loadCalendar() !== null;
}

/** Ask for write access. Returns false when the user declines, and on
 *  the builds where the module isn't there. */
export async function requestCalendarAccess(): Promise<boolean> {
  const Calendar = loadCalendar();
  if (!Calendar) return false;
  const existing = await Calendar.getCalendarPermissionsAsync();
  if (existing.granted) return true;
  if (!existing.canAskAgain) return false;
  const asked = await Calendar.requestCalendarPermissionsAsync();
  return asked.granted;
}

export async function hasCalendarAccess(): Promise<boolean> {
  const Calendar = loadCalendar();
  if (!Calendar) return false;
  return (await Calendar.getCalendarPermissionsAsync()).granted;
}

/** Which calendar we write into.
 *
 *  The default one, deliberately — "add it to my calendar" means the
 *  calendar they already look at, which on both platforms is usually the
 *  Google or iCloud account they have synced. Creating a private MapMeet
 *  calendar would be tidier for us and invisible to them.
 *
 *  iOS hands us a default directly. Android has no such concept, so we
 *  take the primary account calendar, then any writable one, and only
 *  give up if the device genuinely has nowhere to put an event. */
async function resolveCalendarId(): Promise<string | null> {
  const Calendar = loadCalendar();
  if (!Calendar) return null;

  if (Platform.OS === 'ios') {
    try {
      const def = await Calendar.getDefaultCalendarAsync();
      if (def?.allowsModifications) return def.id;
    } catch {
      // Falls through to the scan below.
    }
  }

  const calendars = await Calendar.getCalendarsAsync(
    Calendar.EntityTypes.EVENT,
  );
  const writable = calendars.filter((c) => c.allowsModifications);
  if (writable.length === 0) return null;

  const primary = writable.find(
    (c) => (c as { isPrimary?: boolean }).isPrimary,
  );
  return (primary ?? writable[0])!.id;
}

/** Create the entry and return the device-local calendar event id, or
 *  null if we couldn't. */
export async function addEvent(e: CalendarEventInput): Promise<string | null> {
  const Calendar = loadCalendar();
  if (!Calendar) return null;
  const start = eventStart(e);
  if (!start) return null;
  const calendarId = await resolveCalendarId();
  if (!calendarId) return null;

  try {
    return await Calendar.createEventAsync(calendarId, {
      title: calendarTitle(e),
      startDate: start,
      endDate: eventEnd(start),
      location: calendarLocation(e),
      notes: e.description?.trim() || undefined,
      // No alarm on purpose. MapMeet already pushes an hour before, and
      // two notifications for one coffee is how an app gets muted.
      alarms: [],
      timeZone: undefined, // device zone, matching how the app reads the time
    });
  } catch {
    return null;
  }
}

/** Push changed details onto an entry the user already has. Returns
 *  false if it has gone (deleted by hand), so the caller can forget it
 *  or recreate. */
export async function updateEvent(
  calendarEventId: string,
  e: CalendarEventInput,
): Promise<boolean> {
  const Calendar = loadCalendar();
  if (!Calendar) return false;
  const start = eventStart(e);
  if (!start) return false;
  try {
    await Calendar.updateEventAsync(calendarEventId, {
      title: calendarTitle(e),
      startDate: start,
      endDate: eventEnd(start),
      location: calendarLocation(e),
      notes: e.description?.trim() || undefined,
    });
    return true;
  } catch {
    return false;
  }
}

/** Remove an entry. Succeeds quietly when it is already gone — the user
 *  deleting it themselves is a normal thing to have happened. */
export async function removeEvent(calendarEventId: string): Promise<void> {
  const Calendar = loadCalendar();
  if (!Calendar) return;
  try {
    await Calendar.deleteEventAsync(calendarEventId);
  } catch {
    /* already gone */
  }
}

/** Web's version of "add to calendar": hand the browser an .ics.
 *
 *  Opens in Google Calendar, Apple Calendar and Outlook alike, and the
 *  stable UID means importing the same event twice updates it rather
 *  than duplicating it. */
export function downloadIcs(e: CalendarEventInput): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const blob = new Blob([buildIcs(e)], {
    type: 'text/calendar;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = icsFilename(e);
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the download a tick to start before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
