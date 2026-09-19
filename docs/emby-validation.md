# Emby compatibility and validation

## Connecting

Choose **Emby Connect** on the server selection screen to sign in with an Emby
account and select a linked server. Alternatively, select a discovered server or
enter its URL and use a local server account. Emby Connect is also available from
the local Emby sign-in screen. Jellyfin retains its Quick Connect flow.

Emby Connect exchanges the selected server's access key for a local session.
The cloud password and cloud token are not saved. Requests use the destination
server's authentication scheme, user and token; reverse-proxy base paths are retained.

## Server capabilities

Core library browsing, artwork, favorites, search, details and playback work without
the Moonfin server plugin. Emby item IDs and media-source IDs remain separate during
playback, including version selection, resume and chapter starts.

Emby seek previews use `ThumbnailSet` and individual thumbnail images. Intro and
credits segments are adapted from chapter markers. Both require corresponding data
on the server. Missing preview data does not block playback. Stopping playback
releases Emby live streams and encoding sessions.

The Emby edition of [Moonfin Plugin](https://github.com/Moonfin-Client/Plugin)
adds its advertised settings sync, ratings, themes, messages, diagnostics and Seerr
features. The client checks installation and capability flags before enabling
plugin services. Seerr also requires server-side configuration.

Jellyfin-only Quick Connect, media-segment, lyrics and tile-trickplay APIs are not
used for Emby. The Emby implementation follows the corresponding authentication,
library and preview behavior in [Moonfin-Core](https://github.com/Moonfin-Client/Moonfin-Core).

## Automated checks

Use Node.js 24, matching CI:

```sh
npm ci
npm test
npm run lint
npm run build
```

The regression suite transpiles and executes production BrightScript functions.
Registry, device and network responses are deterministic fixtures. Two string
methods missing from the test interpreter use Roku-compatible shims. The suite does
not emulate SceneGraph, live HTTP connections or hardware decoding.

Coverage includes server detection and independent version numbering; active and
remote authentication; Connect login and exchange failure handling; proxy paths;
Emby user-scoped routes; metadata normalization; version selection; signed playback
URLs; credentials restricted to the server origin; chapter markers; thumbnail
selection; and playback resource cleanup. CI runs the suite before packaging.

## Device validation

Sideload testing confirmed Emby Connect login, populated home media, detail-page
loading and video playback. This does not establish every codec, transcoding mode,
server configuration or optional plugin feature. The branch also incorporates
newer upstream detail styles, which need their own device smoke test.

Remaining checks:

| Area | Test cases |
| --- | --- |
| Login | Discovery, local password login, invalid credentials, saved-session restart, account switching |
| Browsing | Movies, series/seasons/episodes, music, search, favorites and all detail styles |
| Playback | Direct play, remux, transcode, resume, seek, version/audio/subtitle changes and subtitle burn-in |
| Server features | Thumbnail previews, intro/credits markers, theme music and Live TV resource cleanup |
| Multiple servers | Mixed Jellyfin/Emby browsing and playback with destination-scoped credentials |
| Plugin | With and without Moonfin installed; settings sync, ratings, messages, themes, diagnostics and Seerr |
| Jellyfin regression | Local login, Quick Connect, playback and plugin features on supported versions |
