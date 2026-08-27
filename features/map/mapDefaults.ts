/** Where the camera sits before the device tells us where the user is —
 *  first launch, location denied, or the permission prompt still open.
 *
 *  Maidan Nezalezhnosti. It used to be Cracow's Rynek, chosen when any
 *  European city would have done; it is Kyiv now because that is where
 *  the events are. A fallback camera pointed at an empty city makes a
 *  working map look broken, and it is the first thing a signed-out
 *  visitor sees. */
export const FALLBACK_CENTER = { latitude: 50.4501, longitude: 30.5234 };
