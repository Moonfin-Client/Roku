<h1 align="center">Moonfin for Roku</h1>
<h3 align="center">Enhanced Jellyfin client for Roku TV, Roku Streaming Stick, and Roku Express devices</h3>

---

<p align="center">
   <img width="4305" height="2659" alt="splash-background" src="https://github.com/user-attachments/assets/8618363e-d982-4828-8274-a2c3c7623ddb" />
</p>

[![License](https://img.shields.io/github/license/Moonfin-Client/Roku)](LICENSE)
[![Release](https://img.shields.io/github/v/release/Moonfin-Client/Roku)](https://github.com/Moonfin-Client/Roku/releases)

<a href="https://www.buymeacoffee.com/moonfin" target="_blank"><img src="https://github.com/user-attachments/assets/fe26eaec-147f-496f-8e95-4ebe19f57131" alt="Buy Me A Coffee" ></a>

> **[← Back to main Moonfin project](https://github.com/Moonfin-Client)**

Moonfin for Roku is an enhanced fork of the official Jellyfin Roku client, optimized for the viewing experience on Roku TV, Roku Streaming Stick, Roku Ultra, and Roku Express devices.

## Features & Enhancements

Moonfin for Roku builds on the solid foundation of Jellyfin with targeted UI and UX improvements:

### Cross-Server Content Playback
- **Unified Library Support** - Seamless playback from multiple Jellyfin servers
- Seamless switching between servers for content playback
- Improved server selection logic

### Jellyseerr & Seerr Integration

Moonfin is the first Roku client with native Jellyseerr and Seerr support.

- Browse trending, popular, and recommended movies/shows and filter content by Series/Movie Genres, Studio, Network, and keywords
- Request content in HD or 4K directly from your Roku
- **NSFW Content Filtering** (optional) using Jellyseerr/TMDB metadata
- Smart season selection when requesting TV shows
- View all your pending, approved, and available requests
- Authenticate using your Jellyfin login (permanent local API key saved)
- Global search includes Jellyseerr results
- Rich backdrop images for a more cinematic discovery experience

> Requires the [Moonfin server plugin](https://github.com/Moonfin-Client/Plugin) for connectivity.

### Plugin Syncpushed
- **Bidirectional Settings Sync** — sync preferences between the app and the Moonfin server plugin
- Settings persist across devices (`PushToServer` / `PullFromServer`)
- **Server-synced ratings**, user preferences, and settings via the [Moonfin server plugin](https://github.com/Moonfin-Client/Plugin)
- Required for Jellyseerr / Seerr connectivity

### Customizable Navigation Bar
- **Toggle buttons** - Show/hide Shuffle, Genres, and Favorites buttons
- **Library row toggle** - Show/hide the entire library button row for a cleaner home screen
- **Shuffle filter** - Choose Movies only, TV Shows only, or Both
- **Pill-shaped design** - Subtle rounded background with better contrast
- Dynamic library buttons that scroll horizontally for 5+ libraries
- Smooth animations and dynamic scaling across Roku TV and Roku Stick devices

### Enhanced Navigation
- **Left Sidebar Navigation** - New sidebar with expandable icons/text
- Quick-access Home and Search buttons
- One-tap shuffle for instant random movie/TV show discovery
- Genres menu for browsing by category
- Dynamic library buttons automatically populate based on your Jellyfin libraries
- One-click navigation to any library or collection directly from the sidebar
- Cleaner icon-based design for frequently used actions

### Featured Media Bar
- Rotating showcase of featured movies and TV shows right on your home screen
- **Profile-aware refresh** - Automatically refreshes content when switching profiles to prevent inappropriate content from appearing on child profiles
- See ratings, genres, runtime, and a quick overview without extra clicks
- Smooth crossfade transitions as items change, with matching backdrop images
- Filter featured content: Movies only, TV Shows only, or both
- Sized for comfortable on-TV readability


### Playback & Media Control
- **Pre-Playback Track Selection** - Choose audio/subtitle tracks before playback starts
- **HDR10+ Support** for HEVC and VP9 video
- **Dolby Vision** with SDR and HDR fallback range types
- **Manual Subtitle Synchronization** — adjust subtitle timing offset during playback
- **Automatic Playback Retry** on buffering or playback failure
- **Live TV Retry with Remux** when direct play fails
- **Theme Music Playback** - Background theme music support for TV shows and movies
- **OTA Update System** - Automatic check for new Moonfin versions with in-app update notifications
- **Updated OSD & Player Styling**:
  - Modernized icon set
  - Improved spacing, padding, and alignment
  - Clearer layering and opacity for better readability
  - UI adjustments to match Moonfin's updated visual theme

### Library Customization
- **Library image orientation** — landscape, portrait, or square grid views

### Improved Details Screen
- Cleaner metadata layout (genres, directors, writers, studios, runtime)
- Circular cast photos for improved readability
- More information fits on screen without clutter
- **Redesigned TV Season Details** — expanded episode views, series name subtitles, play/shuffle/resume buttons
- **Refreshed TV Series screen** — grid-based season layout, dynamic resume buttons
- **Unified detail screens** — movies, series, seasons, and playlists share a consistent architecture
- TV Guide now displays channel logos and titles

### UI Polish
- **Overlay Opacity Control** — adjustable opacity for media bar, navigation bar, and sidebar overlays
- **Overlay Color** — customizable overlay background color
- Item details appear inline within rows
- Focused/unfocused buttons blend better with the UI
- Higher contrast for improved visibility
- Responsive transitions and animations
- Consistent icons and visual styling across the app

## Screenshots

<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/77f53831-ecc7-496a-a438-e2d5c9d21794" />
<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/a801778d-0e23-4a0e-8ebd-864e840e35cd" />
<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/4c42127c-a1a2-4dbf-b606-d9fdce211a90" />
<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/e3172c17-074f-4173-b75b-b8c2f35c97bd" />
<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/598379be-38bf-4787-9258-7de68b536e98" />
<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/859cf1c4-82a5-4a35-ad44-0efe7799cd17" />
<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/f908fc7b-d25b-4401-b8c2-1c6c1338a1be" />

---

**Disclaimer:** Screenshots shown in this documentation feature media content, artwork, and actor likenesses for demonstration purposes only. None of the media, studios, actors, or other content depicted are affiliated with, sponsored by, or endorsing the Moonfin client or the Jellyfin project. All rights to the portrayed content belong to their respective copyright holders. These screenshots are used solely to demonstrate the functionality and interface of the application.

---

## Installation

### Pre-built Releases
Download the latest `.zip` file from the [Releases page](https://github.com/Moonfin-Client/Roku/releases).

**Supported Devices:**
- Roku OS 9.1+ required (most Roku devices from 2018 onwards)
- Roku TV (2018+)
- Roku Streaming Stick (2018+)
- Roku Ultra (all models)
- Roku Express (2019+)

### Jellyseerr / Seerr Setup (Optional)
To enable media discovery and requesting:

1. Install the **Moonfin server plugin** on your Jellyfin server and configure Jellyseerr/Seerr in the plugin settings
2. Install Seerr on your network ([seerr.dev](https://seerr.dev))
3. In Moonfin, go to **Settings → Seerr/Jellyseerr**
4. Enter your Jellyseerr URL (e.g., `http://192.168.1.100:5055`)
5. Authenticate using your Jellyfin credentials
6. Start browsing and requesting media

Your session is saved securely and will reconnect automatically.

### Sideloading Instructions
1. Enable Developer Mode:
   Press **Home** ×3 → **Up** ×2 → **Right** → **Left** → **Right** → **Left** → **Right**
2. Create a developer password
3. Check your Roku's IP (Settings → Network → About)
4. Open `http://YOUR_ROKU_IP` in a browser
5. Log in with your developer password
6. Select the `.zip` build and click **Install**

The app will appear immediately on your home screen.

## Building from Source

### Prerequisites
- Node.js 16+
- npm
- BrighterScript (`npm install -g brighterscript`)

### Steps

1. **Clone the repository:**
```bash
git clone https://github.com/Moonfin-Client/Roku.git
cd Roku
```

2. **Install dependencies:**
```bash
npm install
```

3. **Build:**
```bash
npm run build
```

The output will be in `out/moonfin-roku-v{version}.zip`.

## Development

### Developer Notes
- Written in BrighterScript (transpiles to BrightScript) with SceneGraph XML
- Uses `brighterscript` compiler (`bsc`) via `npm run build`
- Linted with `@rokucommunity/bslint`
- Target resolution: FHD (1920×1080)
- UI changes should be tested on actual Roku devices when possible

## Contributing

We welcome contributions to Moonfin for Roku!

### Guidelines
1. **Check existing issues** - See if your idea/bug is already reported
2. **Discuss major changes** - Open an issue first for significant features
3. **Follow code style** - Match the existing codebase conventions (enforced by `bsfmt.json`)
4. **Test on Roku devices** - Verify changes work on actual Roku hardware
5. **Consider upstream** - Features that benefit all users should go to Jellyfin first!

### Pull Request Process
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes with clear commit messages
4. Test thoroughly on Roku devices
5. Submit a pull request with a detailed description

## Translating

Translations are maintained through the Jellyfin Weblate instance:
- [Jellyfin Roku on Weblate](https://translate.jellyfin.org/projects/jellyfin/jellyfin-roku)

Translations contributed to Moonfin that are universally applicable will be submitted upstream to benefit the entire community.

## Support & Community

- **Issues** - [GitHub Issues](https://github.com/Moonfin-Client/Roku/issues) for bugs and feature requests
- **Discussions** - [GitHub Discussions](https://github.com/Moonfin-Client/Roku/discussions) for questions and ideas
- **Upstream Jellyfin** - [jellyfin.org](https://jellyfin.org) for server-related questions

## Credits

Moonfin for Roku is built upon the excellent work of:

- **[Jellyfin Project](https://jellyfin.org)** - The foundation and upstream codebase
- **[MakD](https://github.com/MakD)** - Original Jellyfin-Media-Bar concept that inspired our featured media bar
- **Jellyfin Roku Contributors** - All the developers who built the original client
- **Moonfin Contributors** - Everyone who has contributed to this fork

## License

This project inherits the GPL v2 license from the upstream Jellyfin Roku project. See the [LICENSE](LICENSE) file for details.

---

<p align="center">
   <strong>Moonfin for Roku</strong> is an independent fork and is not affiliated with the Jellyfin project.<br>
   <a href="https://github.com/Moonfin-Client">← Back to main Moonfin project</a>
</p>
