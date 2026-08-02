<h1 align="center">Moonfin for Roku</h1>
<h3 align="center">Premium Jellyfin client for Roku TV, Roku Streaming Stick, Roku Ultra, and Roku Express devices</h3>

---

<p align="center">
   <img width="4305" height="2659" alt="splash-background" src="https://github.com/user-attachments/assets/c30a3464-6b56-4eef-b1fc-bcc9ca8caddd" />
</p>

[![License](https://img.shields.io/github/license/Moonfin-Client/Roku)](LICENSE)
[![Release](https://img.shields.io/github/v/release/Moonfin-Client/Roku)](https://github.com/Moonfin-Client/Roku/releases)
[![github](https://img.shields.io/github/downloads/Moonfin-Client/Roku/total?logo=github&label=Downloads)](https://github.com/Moonfin-Client/Roku/releases)
[![BuyMeACoffee](https://raw.githubusercontent.com/pachadotdev/buymeacoffee-badges/main/bmc-yellow.svg)](https://www.buymeacoffee.com/moonfin)
[![Discord](https://img.shields.io/badge/Discord-Join%20Us-5865F2?logo=discord&logoColor=white)](https://discord.gg/moonfin)

> **[Back to main Moonfin project](https://github.com/Moonfin-Client)**

Moonfin for Roku is an enhanced fork of the official Jellyfin Roku client, built for people who want the full Moonfin experience on Roku hardware. It shares its look, home screen, and settings vocabulary with the other Moonfin clients, and syncs your preferences through the Moonbase server plugin.

## Features

- **Modern home rows and a modern detail screen**, both on by default. The focused row item grows into a landscape card with metadata and ratings, and detail pages get a cinematic tabbed layout with studio logos, chapters, and an Up Next card. The classic layouts stay selectable.
- **Themes** with built in Moonfin, Neon Pulse, and 8-Bit Hero looks, a community Theme Store, and server-shared themes, all synced across devices.
- **A featured media bar with five styles**: Moonfin, MakD, Banner, Gallery, and Bookshelf, switchable instantly.
- **A home screen full of rows**: Seerr trending and requests, IMDb and TMDB charts, Letterboxd and MDBList lists, Radarr and Sonarr calendars, Favorites, Collections, Genres, Playlists, Audio, Since You Watched, Rewatch, and per-library Recently Released, all orderable and synced.
- **Native Seerr integration** for browsing, discovering, and requesting content in HD or 4K, with smart season selection, optional NSFW filtering, and Seerr results in global search. See [Seerr Setup](https://github.com/Moonfin-Client/Roku/wiki/Seerr-Setup).
- **Multi-server support** with seamless playback across every connected Jellyfin server.
- **Settings sync** through the [Moonfin server plugin](https://github.com/Moonfin-Client/Plugin), covering your theme, layouts, row order, hidden Continue Watching and Next Up items, and much more.
- **Playback done right**: pre-playback track selection, default audio and subtitle languages synced with your server, multi-speed fast forward and rewind at 3x, 15x, and 50x, HDR10+ and Dolby Vision with fallbacks, manual subtitle sync, theme music, and in-app update notifications.
- **A shuffle dialog** with library, genre, and full-random shuffle showing five picks at a time.
- **A tabbed sign-in screen** with inline Quick Connect that's the default when your server supports it.
- **Ratings that follow your sources**, including TMDB episode ratings, driven by the rating sources you pick in the plugin.

The full list is on the [Features](https://github.com/Moonfin-Client/Roku/wiki/Features) wiki page.

## Screenshots

<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/77f53831-ecc7-496a-a438-e2d5c9d21794" />
<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/a801778d-0e23-4a0e-8ebd-864e840e35cd" />
<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/4c42127c-a1a2-4dbf-b606-d9fdce211a90" />
<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/598379be-38bf-4787-9258-7de68b536e98" />

More in the [Screenshots](https://github.com/Moonfin-Client/Roku/wiki/Screenshots) gallery.

**Disclaimer:** Screenshots shown in this documentation feature media content, artwork, and actor likenesses for demonstration purposes only. None of the media, studios, actors, or other content depicted are affiliated with, sponsored by, or endorsing the Moonfin client or the Jellyfin project. All rights to the portrayed content belong to their respective copyright holders. These screenshots are used solely to demonstrate the functionality and interface of the application.

## Installation

Download the latest `.zip` from the [Releases page](https://github.com/Moonfin-Client/Roku/releases) and sideload it through Roku Developer Mode. Moonfin needs Roku OS 9.1 or newer, which covers most Roku devices from 2018 onwards.

Step-by-step sideloading instructions are on [Installation and Sideloading](https://github.com/Moonfin-Client/Roku/wiki/Installation-and-Sideloading).

Seerr is optional and connects through the [Moonfin server plugin](https://github.com/Moonfin-Client/Plugin), so there's nothing to type on the Roku. See [Seerr Setup](https://github.com/Moonfin-Client/Roku/wiki/Seerr-Setup).

## Building

```bash
git clone https://github.com/Moonfin-Client/Roku.git
cd Roku
npm install
npm run build
```

Node.js 16+ and npm are the only prerequisites. The output lands in `out/moonfin-roku-v{version}.zip`. Full details are on [Building from Source](https://github.com/Moonfin-Client/Roku/wiki/Building-from-Source).

## Documentation

The deeper reference material lives in the [Wiki](https://github.com/Moonfin-Client/Roku/wiki):

| Page | What it covers |
|------|----------------|
| [Features](https://github.com/Moonfin-Client/Roku/wiki/Features) | The full feature list, section by section |
| [Installation and Sideloading](https://github.com/Moonfin-Client/Roku/wiki/Installation-and-Sideloading) | Developer Mode, sideloading, and supported devices |
| [Seerr Setup](https://github.com/Moonfin-Client/Roku/wiki/Seerr-Setup) | Connecting Seerr through the Moonfin server plugin |
| [Building from Source](https://github.com/Moonfin-Client/Roku/wiki/Building-from-Source) | Toolchain, build steps, and deploying to a device |
| [Development](https://github.com/Moonfin-Client/Roku/wiki/Development) | Project structure, BrighterScript notes, and developer guidelines |

## Contributing

Contributions are welcome. Check the existing issues first, open an issue before starting a large change, match the existing code style (enforced by `bsfmt.json`), and test on real Roku hardware where you can. Features that would help all Jellyfin users are worth proposing upstream first.

To submit a change, fork the repo, create a feature branch, make your changes with clear commit messages, and open a pull request with a clear description.

## Help translate Moonfin [here](https://translate.moonfin.io/engage/roku/)

<a href="https://translate.moonfin.io/engage/roku/">
  <img
    src="https://translate.moonfin.io/widgets/roku/-/multi-auto.svg"
    alt="Moonfin Roku translation status by language"
  />
</a>

Translations contributed to Moonfin that are universally applicable will be submitted upstream to benefit the entire community.

## Support and Community

- **Issues** for bugs and feature requests: [GitHub Issues](https://github.com/Moonfin-Client/Roku/issues)
- **Discussions** for questions and ideas: [GitHub Discussions](https://github.com/Moonfin-Client/Roku/discussions)
- **Upstream Jellyfin** for server-related questions: [jellyfin.org](https://jellyfin.org)

## Credits

Moonfin for Roku is built upon the excellent work of:

- **[Jellyfin Project](https://jellyfin.org)** for the foundation and upstream codebase
- **[MakD](https://github.com/MakD)** for the original Jellyfin-Media-Bar concept that inspired our featured media bar
- **Jellyfin Roku Contributors** for the original client
- **Moonfin Contributors** for everything they have added to this fork

## License

This project inherits the GPL v2 license from the upstream Jellyfin Roku project. See the [LICENSE](LICENSE) file for details.

---

<p align="center">
   <strong>Moonfin for Roku</strong> is an independent fork and is not affiliated with the Jellyfin project.<br>
   <a href="https://github.com/Moonfin-Client">Back to main Moonfin project</a>
</p>
