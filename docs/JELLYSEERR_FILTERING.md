# Jellyseerr Content Filtering Implementation

## Overview
Implemented comprehensive content filtering for Jellyseerr discovery screens matching the Android TV implementation. This ensures users don't see:
1. Content already available in their Jellyfin library
2. Blacklisted content (blocked by Jellyseerr admin)
3. Adult/NSFW content (configurable filter)

## Implementation Details

### 1. Data Model Extensions
**File**: `source/utils/JellyseerrUtils.bs` - `CreateMediaContentNode()`

Added parsing for filtering-related fields from Jellyseerr API responses:
- `adult` (Boolean): TMDB's explicit adult content flag
- `mediaInfo.status` (Integer): Jellyseerr availability status
  - 1 = Unknown
  - 2 = Pending request
  - 3 = Processing
  - 4 = Partially Available
  - 5 = Available (in library)
  - 6 = Blacklisted

These fields are stored in content nodes as `adult` and `mediaInfoStatus` for filtering.

### 2. Filtering Functions
**File**: `source/utils/JellyseerrUtils.bs`

#### `IsItemAvailable(item)`
Checks if content is already in the Jellyfin library (status 4 or 5).
- Returns `true` if available, preventing duplicate requests
- Works with both raw API data and processed content nodes

#### `IsItemBlacklisted(item)`
Checks if content has been blacklisted by Jellyseerr admin (status 6).
- Returns `true` if blacklisted
- Prevents users from seeing/requesting blocked content

#### `IsItemNsfw(item)`
Multi-layered NSFW detection matching Android TV implementation:
1. **Explicit Flag Check**: Uses TMDB's `adult` boolean flag
2. **Keyword Detection**: Scans title and overview for NSFW keywords with word-boundary checking

**NSFW Keywords** (case-insensitive, whole word matches):
```
sex, sexual, porn, erotic, nude, nudity, xxx,
adult film, prostitute, stripper, escort, seduction,
affair, threesome, orgy, kinky, fetish, bdsm, dominatrix
```

### 3. User Preference
**File**: `source/utils/JellyseerrUtils.bs`

#### Configuration Storage
- **Registry Key**: `jellyseerr.blockNsfw` (stored as "true"/"false" string)
- **User Settings**: `jellyseerr.blockNsfw` (Boolean)
- **Default Value**: `true` (enabled for safety)

#### API Functions
```brightscript
' Get current filter preference
config = GetJellyseerrConfig()
isEnabled = config.blockNsfw  ' Boolean

' Update filter preference
SetJellyseerrBlockNsfw(true)   ' Enable filtering
SetJellyseerrBlockNsfw(false)  ' Disable filtering
```

### 4. Filter Application
**File**: `components/jellyseerr/JellyseerrDiscoveryScreen.brs` - `onDiscoveryResponse()`

Applied in discovery row loading with three-stage filtering chain:

```brightscript
' Stage 1: Filter already available (status 4 or 5)
if IsItemAvailable(item) then exclude

' Stage 2: Filter blacklisted (status 6)
else if IsItemBlacklisted(item) then exclude

' Stage 3: Filter NSFW (if blockNsfw enabled)
else if blockNsfw and IsItemNsfw(item) then exclude
```

#### Logging & Debugging
The implementation logs detailed filtering statistics:
```
[Jellyseerr] Filtering complete for row 0:
  Original items: 20
  Filtered items: 17
  Blocked (available): 2
  Blocked (blacklisted): 0
  Blocked (NSFW): 1
  Total blocked: 3
```

Each blocked item logs its title and reason:
```
[Jellyseerr] Filtered out: 'Movie Title' - Reason: NSFW content
```

## Usage

### For Users
1. **Default Behavior**: NSFW filtering is **enabled by default**
2. **Configure in Settings**: Use Jellyseerr settings to toggle filtering on/off
3. **Transparent Operation**: Filtered content simply doesn't appear in discovery rows

### For Developers

#### Adding Filter to New Screens
When implementing new Jellyseerr features (search, recommendations, etc.):

```brightscript
' 1. Get filter configuration
config = GetJellyseerrConfig()
blockNsfw = config.blockNsfw

' 2. Apply filters to API results
filteredResults = []
for each item in apiResults
    if not IsItemAvailable(item) and not IsItemBlacklisted(item)
        if not blockNsfw or not IsItemNsfw(item)
            filteredResults.push(item)
        end if
    end if
end for

' 3. Use filtered results for UI
```

#### Testing Filters
1. **Available Filter**: Request content through Jellyseerr, verify it doesn't appear in discovery after becoming available
2. **Blacklist Filter**: Use Jellyseerr web UI to blacklist content, verify it disappears from discovery
3. **NSFW Filter**: 
   - Enable: Adult content should not appear
   - Disable: Adult content should appear
   - Test with known adult titles or keyword matches

## Android TV Compatibility
This implementation matches the Android TV client's filtering behavior:
- ✅ Same keyword list for NSFW detection
- ✅ Same status code interpretation (4/5 = available, 6 = blacklisted)
- ✅ Same filtering order (available → blacklist → NSFW)
- ✅ User-configurable NSFW filtering with same default (enabled)
- ✅ Comprehensive logging for debugging

## Privacy & Safety
- **Default Safe**: NSFW filtering enabled by default protects users
- **User Control**: Adults can disable filtering if desired
- **Transparent**: Clear logging shows what was filtered and why
- **Consistent**: Same filtering across all Jellyseerr features

## Future Enhancements
Potential improvements to consider:
1. **Blacklist API**: Fetch blacklist from Jellyseerr `/api/v1/blacklist` endpoint for client-side caching
2. **Custom Keywords**: Allow users to add custom NSFW keywords
3. **Filter Statistics**: Show "X items filtered" message in UI
4. **Genre Filtering**: Add ability to filter by genre preferences
5. **Rating Filtering**: Filter by MPAA/TV ratings (R, TV-MA, etc.)
