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

Moonfin for Roku is an enhanced fork of the official Jellyfin Roku client.

---

## Features & Enhancements

Moonfin builds on the official Jellyfin client with new features, navigation, and a new interface.

---

### 🎬 Jellyseerr Integration (Beta)

Moonfin is the first Roku client with native Jellyseerr support.

- Browse trending, popular, and recommended movies/shows  
- Request content in HD or 4K directly from your Roku  
- **NSFW Content Filtering** (optional) using Jellyseerr/TMDB metadata  
- Smart season selection when requesting TV shows  
- View all your pending, approved, and available requests  
- Authenticate using your Jellyfin login (permanent local API key saved)  
- Global search includes Jellyseerr results  
- Rich backdrop images for a more cinematic discovery experience  

---

### 🛠️ Customizable Toolbar

- Show/hide Shuffle, Genres, and Favorites buttons  
- Optionally hide the entire library row for a cleaner home screen  
- Shuffle filter: Movies only, TV only, or both  
- Modern pill-shaped toolbar styling  
- Horizontal scrolling library buttons for setups with many libraries  

---

### 🎬 Featured Media Bar

- Rotating selection of featured movies and TV shows on the home screen  
- Automatically refreshes when switching profiles to keep content kid-safe  
- Includes ratings, genres, and quick-look metadata  
- Smooth transitions with matching backdrops  
- Sized for comfortable on-TV readability  

---

### 🧭 Enhanced Navigation

- Quick-access Home and Search buttons  
- One-tap shuffle for instant discovery  
- Genres menu for browsing by category  
- Dynamic library buttons based on your Jellyfin setup  
- Cleaner icon-based design for frequently-used actions  

---

### 🎵 Playback & Media Control

- **Pre-Playback Track Selection**: Choose audio/subtitle tracks before playback starts  
- **Updated OSD & Player Styling**:  
  - Modernized icon set  
  - Improved spacing, padding, and alignment  
  - Clearer layering and opacity for better readability  
  - UI adjustments to match Moonfin’s updated visual theme  
- **Update System**: Automatic version checks with in-app update notifications  

---

### 📊 Improved Details Screen

- Cleaner metadata layout (genres, directors, writers, studios, runtime)  
- Circular cast photos for improved readability  
- More information fits on screen without clutter  

---

### 🎨 UI Polish

- Item details appear inline within rows  
- Focused/unfocused buttons blend better with the UI  
- Higher contrast for improved visibility  
- Responsive transitions and animations  
- Consistent icons and visual styling across the app  

---

## Screenshots

<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/0046f6d0-39f3-4929-932d-48222c21bddb" />
<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/8de0454a-6461-4084-9b34-b8c9e182a2dc" />
<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/16ce1370-35ad-4b0c-815f-fda4809cf889" />
<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/e0561197-5159-408f-a591-eb9a3b39ecc8" />

---

## Installation

### Pre-built Releases

Download the latest `.zip` file from the [Releases page](https://github.com/Moonfin-Client/Roku/releases).

**Supported Devices**  
- Roku OS 9.1+ required (most Roku devices from 2018 onwards)
- Roku TV (2018+)
- Roku Streaming Stick (2018+)
- Roku Ultra (all models)
- Roku Express (2019+)

---

### Sideloading Instructions

1. Enable Developer Mode:  
   Press **Home** ×3 → **Up** ×2 → **Right** → **Left** → **Right** → **Left** → **Right**  
2. Create a developer password  
3. Check your Roku’s IP (Settings → Network → About)  
4. Open `http://YOUR_ROKU_IP` in a browser  
5. Log in with your developer password  
6. Select the `.zip` build and click **Install**  

The app will appear immediately on your home screen.

---

### Jellyseerr Setup (Optional)

1. Install Jellyseerr on your network  
2. In Moonfin: **Settings → Jellyseerr**  
3. Enter your Jellyseerr URL (`http://SERVER_IP:5055`)  
4. Authenticate using your Jellyfin credentials  
5. Start browsing and requesting media  

Moonfin stores your session securely.

---

## Building from Source

### Requirements

- Node.js 16+  
- npm  
- BrighterScript (`npm install -g brighterscript`)  

### Steps

```bash
git clone https://github.com/Moonfin-Client/Roku.git
cd Roku
npm install
npm run build
