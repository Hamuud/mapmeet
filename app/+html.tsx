import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/** Server-rendered HTML shell that wraps every route. Runs only at build
 *  time (SSG) — nothing here reaches the client bundle. We use it for
 *  meta tags and a data-URL favicon so `/favicon.ico` doesn't 404. */
const faviconSvg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><text y='52' font-size='56'>🗺️</text></svg>`;
const faviconHref = `data:image/svg+xml;utf8,${encodeURIComponent(faviconSvg)}`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        <meta name="theme-color" content="#0B0B0F" />
        <meta
          name="description"
          content="MapMeet — a live community map. Pin events, see them appear in real time."
        />
        <link rel="icon" type="image/svg+xml" href={faviconHref} />
        <title>MapMeet</title>
        {/* Disables body scroll on iOS Safari — keeps the map's own gestures
            from double-scrolling the page. */}
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
