<h1 align="center">Moonfin for Roku</h1>
<h3 align="center">Enhanced Jellyfin client for Roku devices</h3>

---

<p align="center">
   <img width="4305" height="2659" alt="splash-background" src="https://github.com/user-attachments/assets/8618363e-d982-4828-8274-a2c3c7623ddb" />
</p>

[![License](https://img.shields.io/github/license/Moonfin-Client/Roku)](LICENSE) 
[![Release](https://img.shields.io/github/v/release/Moonfin-Client/Roku)](https://github.com/Moonfin-Client/Roku/releases)
<a href="https://www.buymeacoffee.com/moonfin" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 30px !important;width: 108 !important;" ></a>

> [← Back to main Moonfin project](https://github.com/Moonfin-Client)

Moonfin for Roku is an enhanced fork of the official Jellyfin Roku client, optimized for the Roku viewing experience with additional features and improvements.

## Features & Enhancements

Moonfin for Roku builds on the solid foundation of Jellyfin with targeted improvements for TV viewing:

### 🎬 Jellyseerr Integration (Beta)

The first and only native Jellyfin Roku client with Jellyseerr support!
- Browse trending, popular, and recommended movies/TV shows from TMDB
- Request content in HD or 4K with a single button press
- **NSFW Content Filtering** - Automatically filters adult content using TMDB flags, keyword detection, and server blacklist integration (configurable in settings)
- Smart season selection for TV shows where you pick exactly which seasons you want
- Track all your requests (pending, approved, available) in one place
- Seamless authentication using your Jellyfin credentials with permanent local API keys
- Global search integration with Jellyseerr results appearing automatically alongside your Jellyfin media
- Beautiful backdrop images for the Jellyseer discovery experience

### 🛠️ Customizable Toolbar
- **Toggle buttons** - Show/hide Shuffle, Genres, and Favorites buttons
- **Library row toggle** - Show/hide the entire library button row for a cleaner home screen
- **Shuffle filter** - Choose Movies only, TV Shows only, or Both
- **Pill-shaped design** - Subtle rounded background with better contrast
- Dynamic library buttons that scroll horizontally for 5+ libraries

### 🎬 Featured Media Bar
- Rotating showcase of 15 random movies and TV shows right on your home screen
- **Profile-aware refresh** - Automatically refreshes content when switching profiles to prevent inappropriate content from appearing on child profiles
- See ratings, genres, runtime, and a quick overview without extra clicks
- Smooth crossfade transitions as items change, with matching backdrop images
- Height and positioning tuned for viewing from the couch

### 🧭 Enhanced Navigation
- Quick access home button (house icon) and search (magnifying glass)
- Shuffle button for instant random movie/TV show discovery
- Genres menu to browse all media by genre in one place
- Dynamic library buttons automatically populate based on your Jellyfin libraries
- One-click navigation to any library or collection directly from the toolbar
- Cleaner icon-based design for frequently used actions

### 🎵 Playback & Media Control
- **Pre-Playback Track Selection** - Choose your preferred audio track and subtitle before playback starts (configurable in settings)
- **Automatic Screensaver Dimming** - Reduces brightness after 90 seconds of playback inactivity to prevent screen burn-in
- **Update System** - Automatic check for new Moonfin versions with in-app update notifications

### 📊 Improved Details Screen
- Metadata organized into clear sections: genres, directors, writers, studios, and runtime
- Cast photos appear as circles for a cleaner look
- Fits more useful information on screen without feeling cramped

### 🎨 UI Polish
- Item details show up right in the row, no need to open every title to see what it is
- Buttons look better when not focused (transparent instead of distracting)
- Better contrast makes text easier to read
- Transitions and animations feel responsive
- Consistent icons and visual elements throughout

## Screenshots

<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/0046f6d0-39f3-4929-932d-48222c21bddb" />
<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/8de0454a-6461-4084-9b34-b8c9e182a2dc" />
<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/16ce1370-35ad-4b0c-815f-fda4809cf889" />
<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/e0561197-5159-408f-a591-eb9a3b39ecc8" />

## Installation

### Pre-built Releases

Download the latest package (`.zip`) from the [Releases page](https://github.com/Moonfin-Client/Roku/releases).

**Supported Devices:**
- All Roku devices (Roku OS 9.0+)
- Roku TV
- Roku Streaming Stick
- Roku Ultra
- Roku Express

### Sideloading Instructions

1. Enable Developer Mode on your Roku:
   - Press **Home** 3 times, **Up** 2 times, **Right**, **Left**, **Right**, **Left**, **Right**
   - Set a developer password when prompted
2. Note your Roku's IP address (Settings → Network → About)
3. Open a web browser and navigate to `http://YOUR_ROKU_IP`
4. Log in with the developer password you created
5. Under "Development Application Installer", browse to the `.zip` file and click **Install**
6. The app will appear on your Roku home screen

### Jellyseerr Setup (Optional)

To enable media discovery and requesting:

1. Install and configure Jellyseerr on your network ([jellyseerr.dev](https://jellyseerr.dev/))
2. In Moonfin, go to **Settings → Jellyseerr**
3. Enter your Jellyseerr server URL (e.g., `http://192.168.1.100:5055`)
4. Click **Connect with Jellyfin** and enter your Jellyfin password
5. Test the connection, then start discovering!

Your session is saved securely and will reconnect automatically.

## Building from Source

### Prerequisites

- Node.js 16+ and npm
- BrighterScript compiler (`npm install -g brighterscript`)
- Basic understanding of Roku SceneGraph/BrightScript

### Steps

1. Clone the repository:
```bash
git clone https://github.com/Moonfin-Client/Roku.git
cd Roku
```

2. Install dependencies:
```bash
npm install
```

3. Build the package:
```bash
npm run build
```

4. The package will be created at `./out/moonfin-roku-v1.0.0.zip`

5. Sideload the package using the instructions above

## Development

### Developer Notes

- Project uses BrighterScript (superset of BrightScript with modern features)
- Build configuration in `bsconfig.json`
- Component architecture follows Roku SceneGraph patterns
- Keep Roku OS compatibility in mind (test on actual devices)
- Follow existing code style and conventions

## Contributing

We welcome contributions to Moonfin for Roku!

### Guidelines

1. **Check existing issues** - See if your idea/bug is already reported
2. **Discuss major changes** - Open an issue first for significant features
3. **Follow code style** - Match the existing codebase conventions (BrighterScript/BrightScript)
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
- **Upstream Jellyfin** - [jellyfin.org](https://jellyfin.org/) for server-related questions

## Credits

Moonfin for Roku is built upon the excellent work of:

- [Jellyfin Project](https://jellyfin.org/) - The foundation and upstream codebase
- **[MakD](https://github.com/MakD)** - Original Jellyfin-Media-Bar concept that inspired our featured media bar
- Jellyfin Roku Contributors - All the developers who built the original client
- Moonfin Contributors - Everyone who has contributed to this fork

## License

This project inherits the GPL v2 license from the upstream Jellyfin Roku project. See the [LICENSE](LICENSE) file for details.

Moonfin for Roku is an independent fork and is not affiliated with the Jellyfin project.

---

[← Back to main Moonfin project](https://github.com/Moonfin-Client)

