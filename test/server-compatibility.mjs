import assert from 'node:assert/strict';
import { readFile as rawReadFile, writeFile, mkdtemp, rm, glob, access, readdir } from 'node:fs/promises';
const readFile = async (...args) => {
    const res = await rawReadFile(...args);
    return typeof res === 'string' ? res.replace(/\r\n/g, '\n') : res;
};
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';
import bsc from 'brighterscript';
import brs from 'brs';
import bslib from '@rokucommunity/bslib';

// brs predates these two Roku string methods; supply their platform semantics.
const originalGetMethod = brs.types.RoString.prototype.getMethod;
brs.types.RoString.prototype.getMethod = function (name) {
    const method = name.toLowerCase();
    if (method === 'startswith' || method === 'endswith') {
        return new brs.types.Callable(name, {
            signature: {
                args: [new brs.types.StdlibArgument('value', brs.types.ValueKind.String)],
                returns: brs.types.ValueKind.Boolean,
            },
            impl: (_interpreter, value) => brs.types.BrsBoolean.from(
                method === 'startswith' ? this.getValue().startsWith(value.value) : this.getValue().endsWith(value.value)
            ),
        });
    }
    return originalGetMethod.call(this, name);
};

// brs hands ReplaceAll its replacement untouched, where the device reads \1 as a captured group.
const originalRegexMethod = brs.types.RoRegex.prototype.getMethod;
brs.types.RoRegex.prototype.getMethod = function (name) {
    if (name.toLowerCase() !== 'replaceall') return originalRegexMethod.call(this, name);
    return new brs.types.Callable(name, {
        signature: {
            args: [
                new brs.types.StdlibArgument('str', brs.types.ValueKind.String),
                new brs.types.StdlibArgument('replacement', brs.types.ValueKind.String),
            ],
            returns: brs.types.ValueKind.String,
        },
        impl: (_interpreter, str, replacement) => {
            const global = new RegExp(this.jsRegex.source, this.jsRegex.flags.replace('g', '') + 'g');
            return new brs.types.BrsString(str.value.replace(global, replacement.value.replace(/\\(\d)/g, '$$$1')));
        },
    });
};

// Execute production functions after BrighterScript transpilation. Only the
// device registry and authentication context are replaced with deterministic fixtures.
const selections = {
    'source/utils/serverCompatibility.bs': null,
    'source/utils/accentFolding.bs': null,
    'source/utils/libraryFilters.bs': null,
    'source/utils/itemMenu.bs': null,
    'source/utils/logRedaction.bs': null,
    'source/utils/youtubeTrailer.bs': null,
    'source/utils/tmdbReviews.bs': null,
    'source/utils/episodeCast.bs': null,
    'source/utils/detailCompatibility.bs': null,
    'source/utils/parentalFilter.bs': null,
    'source/utils/externalList.bs': null,
    'source/utils/seasonalRow.bs': null,
    'source/utils/galleryGlow.bs': null,
    'source/utils/afterHours.bs': null,
    'source/utils/seasonalEffects.bs': null,
    'source/utils/liveRecovery.bs': null,
    'source/utils/deviceCapabilities.bs': ['getSubtitleProfiles', 'transcodableAudioCodecOf', 'transcodeAudioCodecPicks', 'canTranscodeAudioCodecAway', 'keptAudioCodecs', 'applyTranscodeAudioCodecs'],
    'source/utils/seerrMissingCollection.bs': null,
    'source/utils/settingsIcons.bs': null,
    'source/utils/episodeBrowser.bs': null,
    'source/utils/animeMarkers.bs': null,
    'source/utils/settingsMetrics.bs': null,
    'source/utils/ratingSourceList.bs': null,
    'source/utils/homeRowGroups.bs': null,
    'source/utils/searchGroups.bs': null,
    'source/utils/SeerrUtils.bs': ['SeerrEscapeJsonString', 'SeerrJsonFromPairs', 'SeerrFormatJson', 'SeerrFormatJsonValue', 'SeerrStreamingRegion', 'SeerrStreamingProviders', 'SeerrRequestDownloadSummary', 'SeerrDownloadEntryState', 'SeerrDownloadStateRank', 'SeerrParseTimeLeft', 'SeerrTimeLeftText', 'SeerrDownloadLabel', 'SeerrDownloadLabelParts', 'SeerrDownloadStateWord', 'SeerrDownloadBarColor', 'SeerrDownloadSizeText', 'SeerrByteUnit', 'SeerrScaleBytes', 'SeerrQueueHasWork', 'SeerrDownloadKey', 'SeerrIsNumber', 'isValidStringValue', 'IsSeerrSeriesPart', 'SeerrDownloadIsStuck', 'SeerrArrEntryKey', 'SeerrArrGoneFromQueue', 'SeerrArrQueueHasTitle', 'SeerrArrFlagIs', 'SeerrArrQueueForSeasons', 'SeerrArrNotFoundYet', 'SeerrRequestNotFoundYet', 'SeerrArrReason', 'SeerrArrHealthy', 'SeerrArrServiceName', 'SeerrArrQueuePath', 'SeerrArrRemovePath', 'SeerrIdText', 'SeerrLower', 'SeerrArrQueuePathForDetails', 'SeerrDetailDownload', 'SeerrMediaNotFoundYet', 'SeerrReplaceableDownload'],
    'source/utils/libraryOrder.bs': null,
    'source/utils/detailSectionLayout.bs': null,
    'source/utils/trackLabels.bs': null,
    'source/utils/fileFacts.bs': null,
    'components/personCreditsHost.bs': ['formatPersonDate', 'personAge'],
    'source/utils/detailImages.bs': null,
    'components/details/SpotlightCards.bs': ['spotlightEpisodeSeason', 'spotlightEpisodeOrder', 'spotlightEpisodeFirst', 'spotlightBuilderPersonBackdrops', 'spotlightFirstUnused', 'spotlightBackdropOnlyUrl'],
    'source/utils/playbackFacts.bs': null,
    'source/utils/mediaBadges.bs': null,
    'source/utils/librarySorts.bs': null,
    'source/utils/libraryGroupBy.bs': null,
    'source/utils/libraryCard.bs': null,
    'source/utils/libraryPreview.bs': null,
    'source/utils/homeCards.bs': null,
    'source/utils/calendarEntries.bs': null,
    'source/utils/incompleteRecordings.bs': null,
    'source/utils/favoriteTabs.bs': null,
    'source/utils/homePreview.bs': null,
    'source/utils/remoteSubtitles.bs': null,
    'source/utils/quickConnectUrl.bs': null,
    'source/utils/playlistSortFilter.bs': null,
    'source/utils/collectionSort.bs': null,
    'source/utils/personCredits.bs': null,
    'source/utils/accessSchedule.bs': null,
    'source/utils/musicCategories.bs': null,
    'source/utils/moonbaseInstall.bs': null,
    'source/utils/watchPartyModel.bs': null,
    'components/settings/SettingsLivePreview.bs': ['headerLayout', 'navbarButtons', 'inLibraryOrder', 'optionRange', 'optionsFit', 'playerMoment', 'drawsHomeRows', 'sampleReleaseShows', 'seerrStyleOf', 'homeBlur', 'followerTarget'],
    'components/settings/SettingsPlayerPreview.bs': ['arrangedOsdButtons', 'osdTimeText', 'clockAt', 'subtitleBottom', 'seekBarY', 'timeRowShows', 'promptAt', 'segmentSpan', 'scrubPauses'],
    'components/calendar/calendarHost.bs': ['calendarUsePrefs'],
    'components/settings/settingsEditors.bs': ['editorArrangement'],
    'components/settings/settings.bs': ['settingPath', 'previewSceneTable'],
    'components/details/stage/StageChipRow.bs': ['columnShares'],
    'components/details/QuickLookItemDetails.bs': ['buttonCap'],
    'source/utils/playbackOverlay.bs': null,
    'source/utils/subtitleStyle.bs': null,
    'components/music/musicCategoryHost.bs': ['landingCell', 'enteredCell'],
    'components/extras/collectionLookup.bs': ['findParents', 'namedCollection', 'namedFirst', 'membership'],
    'components/extras/LoadExtrasTask.bs': ['personRoleIn', 'sortedFeatures', 'featureComesFirst'],
    'components/details/detailTrackHost.bs': ['SetUpVideoOptions', 'SetUpAudioOptions', 'detailServerSubtitleIndex', 'audioOrdinal', 'audioStreamPosition'],
    'source/enums/VideoType.bs': null,
    'source/enums/MediaStreamType.bs': null,
    'source/enums/PlaybackMethod.bs': null,
    'source/enums/SubtitleSelection.bs': null,
    'source/enums/ItemType.bs': null,
    'source/enums/PosterLoadStatus.bs': null,
    'source/MainEventHandlers.bs': ['isLiveTvChannel'],
    'source/utils/embyFeatures.bs': null,
    'components/embyPreview/EmbyPreviewTask.bs': ['loadPreviewData'],
    'components/PlaystateTask.bs': ['closeEmbyPlayback', 'closeUnstartedLiveStream'],
    'components/captionTask.bs': ['trackAddress'],
    'components/ItemGrid/LoadVideoContentTask.bs': ['playbackResourceURL', 'resolvePlaybackURL', 'playbackPort', 'normalizedPlaybackPort', 'playbackUsesServerAuth', 'isHTTPStream', 'getTranscodeReasons', 'addVideoContentURL', 'addSourceCodecs', 'shouldBurnInSubtitle', 'transcodeCopiesVideo', 'audioPlaysDirect', 'containersOverlap', 'liveDirectStreamFormat'],
    'components/ItemGrid/LoadItemsTask2.bs': ['getTargetImageURL', 'getTargetServerUrl', 'isUsingRemoteServer'],
    'source/api/userauth.bs': ['passwordLoginRequest', 'validPasswordLogin', 'passwordLoginError', 'signInRefusedMessage', 'AuthenticateViaQuickConnect'],
    'source/utils/config.bs': ['current_user_id', 'get_user_setting', 'settingOr', 'getSavedUsers', 'savedUserFirst'],
    'source/utils/misc.bs': ['normalizeDetailScreenStyleToken', 'isLocalhost', 'isSupportedMediaServer', 'isSiloSystemInfo', 'urlCandidates', 'isValid', 'isAllValid', 'isStringEqual', 'isChainValid', 'chainLookupReturn', 'chainLookup', 'isValidAndNotEmpty', 'serverVersionMeetsMinimumRequirements', 'playlistRenumbersAfterDelete', 'toString', 'isSeerrFilterRow', 'getHomeBackdropBlurAmount', 'getHomeBackdropStyle', 'inArray', 'guidKey', 'isString', 'toBoolean', 'leftPad', 'secondsToHuman', 'isServerDate', 'releaseDay', 'stableSorted', 'arrangeByStoredOrder', 'collectionPlaylist', 'shuffleArray'],
    'source/ShowScenes.bs': ['ServerVersionCheck', 'startDetailExtras'],
    'source/utils/multiserver.bs': ['buildURLForSession', 'buildImageURLForServer', 'librariesByServer'],
    'source/api/Items.bs': ['ItemMetaData', 'playbackDeviceProfile', 'asksForServerStream', 'audioQualityLabel'],
    'components/video/VideoPlayerView.bs': ['startEmbyPreview', 'nextTranscodeStep', 'retryAction', 'streamSummary', 'liveFallbackMethod', 'liveReResolveRequest', 'liveReconnectingLabel', 'rokuAudioTrack'],
    'components/itemMenu/ItemMenuTask.bs': ['playlistRenumbered'],
    'components/home/Home.bs': ['blurMatchingLoadWidth'],
    'components/home/HomeItem.bs': ['onPosterLoadStatusChanged', 'retryPoster'],
    'components/home/HomeRows.bs': ['toNormalizedString'],
    'components/tasks/MultiServerTask.bs': ['withSortFields', 'withField'],
    'components/home/LoadItemsTask.bs': ['isPlaylistOrder', 'playableMembers', 'oneCardPerSeries', 'seriesCardForLatestItem', 'firstItems', 'providerKeys', 'indexByProviderIds', 'getBoolSetting', 'getStringSetting', 'appendRadarrCalendar', 'radarrRowRelease', 'appendSonarrCalendar', 'sonarrRowPicks', 'sonarrEpisodeCode', 'calendarSubtitle', 'sortByCalendarDate', 'rowSortByParam', 'rowSortOrderParam'],
    'components/home/MediaBarTask.bs': ['pickSlides', 'keepSlide', 'filterAndDedupeItems', 'dedupeKeys', 'externalSlideItem', 'addExternalDetails', 'applyExternalDetails', 'filterItemsByExcludedGenres'],
    'source/api/Image.bs': ['ImageURL', 'metadataPosterURL', 'chapterImageURL'],
    'components/account/AccountDialog.bs': ['accountImageURL'],
    'components/config/SigninScene.bs': ['showsQuickConnect'],
    'source/utils/parsedUrl.bs': ['ParsedUrl', '__ParsedUrl_ToString'],
    'source/utils/plexUrls.bs': null,
    'source/api/plex/PlexMapper.bs': null,
    'source/api/baserequest.bs': ['plexServerURL', 'plexAnswer', 'plexAnswered', 'plexAnswerText', 'buildParams', 'buildServerURL', 'buildURL', 'buildURLForServer', 'buildAuthHeader', 'buildAuthHeaderForServer', 'APIRequest', 'APIRequestForServer', 'authRequest', 'authRequestForServer', 'setCertificateAuthority', 'getJson', 'noteAccessRefused', 'noteRefusalIn', 'postPlaybackInfo', 'requestCanceled'],
};
let source = 'namespace bslib\n' + bslib.source + '\nend namespace\n' + await readFile('source/enums/String.bs', 'utf8');
for (const [file, names] of Object.entries(selections)) {
    const text = (await readFile(file, 'utf8')).replaceAll('CreateObject("roUrlTransfer")', 'testUrlTransfer()');
    if (names === null) {
        source += '\n' + text;
    } else {
        for (const name of names) {
            const match = text.match(new RegExp(`^(?:function|sub) ${name}\\([^]*?^end (?:function|sub)`, 'mi'));
            assert.ok(match, `Missing production function ${name}`);
            source += '\n' + match[0];
        }
    }
}
source += '\n' + (await readFile('source/ShowScenes.bs', 'utf8')).match(/^const minimumServerVersion = .+$/m)[0];
source += '\n' + (await readFile('components/details/QuickLookItemDetails.bs', 'utf8')).match(/^const QL_MAX_BUTTONS = .+$/m)[0];
source += '\n' + (await readFile('components/settings/SettingsPlayerPreview.bs', 'utf8')).match(/^const \w+ = .+$/gm).join('\n');
source += '\n' + (await readFile('source/api/EmbyConnect.bs', 'utf8')).replace(/^import .*$/gm, '').replace(/    function Request\([^]*?    end function/, await readFile('test/emby-connect-transport.bs', 'utf8'));
source += '\n' + await readFile('test/emby-connect.bs', 'utf8');
source += '\n' + await readFile('test/emby-features.bs', 'utf8');
source += '\n' + await readFile('test/emby-media-routes.bs', 'utf8');
source += '\n' + await readFile('test/emby-details.bs', 'utf8');
source += '\n' + await readFile('test/server-compatibility.bs', 'utf8');
source += '\n' + await readFile('test/review-regressions.bs', 'utf8');
source += '\n' + await readFile('test/accent-folding.bs', 'utf8');
source += '\n' + await readFile('test/quick-connect-url.bs', 'utf8');
source += '\n' + await readFile('test/sign-in-refused.bs', 'utf8');
source += '\n' + await readFile('test/saved-users.bs', 'utf8');
source += '\n' + await readFile('test/access-schedule.bs', 'utf8');
source += '\n' + await readFile('test/log-redaction.bs', 'utf8');
source += '\n' + await readFile('test/youtube-trailer.bs', 'utf8');
source += '\n' + await readFile('test/playback-fallback.bs', 'utf8');
source += '\n' + await readFile('test/home-backdrop-blur.bs', 'utf8');
source += '\n' + await readFile('test/home-backdrop-style.bs', 'utf8');
source += '\n' + await readFile('test/home-poster-retry.bs', 'utf8');
source += '\n' + await readFile('test/subtitle-burn-in.bs', 'utf8');
source += '\n' + await readFile('test/seasonal-row.bs', 'utf8');
source += '\n' + await readFile('test/after-hours.bs', 'utf8');
source += '\n' + await readFile('test/live-recovery.bs', 'utf8');
source += '\n' + await readFile('test/caption-download.bs', 'utf8');
source += '\n' + await readFile('test/subtitle-profiles.bs', 'utf8');
source += '\n' + (await readFile('components/extras/collectionLookup.bs', 'utf8')).match(/^const MAX_COLLECTIONS = .+$/m)[0];
source += '\n' + await readFile('test/collection-lookup.bs', 'utf8');
source += '\n' + await readFile('test/seerr-missing-collection.bs', 'utf8');
source += '\n' + await readFile('test/seerr-json.bs', 'utf8');
source += '\n' + await readFile('test/collection-row.bs', 'utf8');
source += '\n' + await readFile('test/external-rows.bs', 'utf8');
source += '\n' + await readFile('test/library-order.bs', 'utf8');
source += '\n' + await readFile('test/detail-sections.bs', 'utf8');
source += '\n' + await readFile('test/rating-sources.bs', 'utf8');
source += '\n' + await readFile('test/home-row-groups.bs', 'utf8');
source += '\n' + await readFile('test/home-reload-settings.bs', 'utf8');
source += '\n' + await readFile('test/row-sort-settings.bs', 'utf8');
source += '\n' + await readFile('test/search-groups.bs', 'utf8');
source += '\n' + await readFile('test/settings-metrics.bs', 'utf8');
source += '\n' + await readFile('test/library-filters.bs', 'utf8');
source += '\n' + await readFile('test/library-group-by.bs', 'utf8');
source += '\n' + await readFile('test/library-sorts.bs', 'utf8');
source += '\n' + await readFile('test/item-menu.bs', 'utf8');
source += '\n' + await readFile('test/episode-browser.bs', 'utf8');
source += '\n' + await readFile('test/anime-markers.bs', 'utf8');
// The rest of the poster labels reach for the server and the session
const posterLabelsFile = await readFile('source/utils/posterLabels.bs', 'utf8');
source += '\nnamespace posterLabels\n' + posterLabelsFile.match(/^    const .+$/gm).join('\n') + '\n';
for (const name of ['Context', 'WordSet', 'ItemIdOf', 'Shown', 'Entry', 'SizeFactor', 'Colors', 'ParseHex', 'Luminance', 'Tint']) {
    const match = posterLabelsFile.match(new RegExp(`^    function ${name}\\([^]*?^    end function`, 'm'));
    assert.ok(match, `Missing posterLabels.${name}`);
    source += '\n' + match[0];
}
source += '\nend namespace\n';
source += '\n' + await readFile('test/poster-labels.bs', 'utf8');
source += '\n' + await readFile('test/transcode-audio.bs', 'utf8');
source += '\n' + await readFile('test/person-role.bs', 'utf8');
source += '\n' + await readFile('test/episode-cast.bs', 'utf8');
// The rest of the Plex playback rules reach for the server
const plexPlaybackFile = await readFile('source/api/plex/PlexPlayback.bs', 'utf8');
source += '\n' + plexPlaybackFile.match(/^const PLEX_HLS_AUDIO_CODECS = .+$/m)[0] + '\nnamespace plexPlayback\n';
for (const name of ['Names', 'HlsAudio']) {
    const match = plexPlaybackFile.match(new RegExp(`^    function ${name}\\([^]*?^    end function`, 'm'));
    assert.ok(match, `Missing plexPlayback.${name}`);
    source += '\n' + match[0];
}
source += '\nend namespace\n';
source += '\n' + await readFile('test/plex-mapper.bs', 'utf8');
// The rest of plex.tv goes to the network
const plexTvFile = await readFile('source/api/plexTv.bs', 'utf8');
source += '\n' + plexTvFile.match(/^const PLEX_PORT = .+$/m)[0] + '\nnamespace plexTv\n';
for (const name of ['ConnectionRank', 'ServerFromResource', 'Settled', 'MachineIdOf', 'AddressCandidates']) {
    const match = plexTvFile.match(new RegExp(`^    function ${name}\\([^]*?^    end function`, 'm'));
    assert.ok(match, `Missing plexTv.${name}`);
    source += '\n' + match[0];
}
source += '\nend namespace\n';
source += '\n' + await readFile('test/plex-tv.bs', 'utf8');
// The rest of the guide rules use loops this interpreter cant parse
const liveTvGuideFile = await readFile('source/utils/liveTvGuide.bs', 'utf8');
source += '\n' + liveTvGuideFile.match(/^const GUIDE_MINUTE = .+$/m)[0] + '\nnamespace liveTvGuide\n';
for (const name of ['ParseTime', 'EpisodeTitleOf', 'SeasonEpisodeLabel', 'EpisodeLine', 'HasTimer', 'HasSeriesTimer', 'RecordingMark', 'SeriesChoices', 'SeriesChoiceOf', 'SeriesChoiceFlags', 'IsUpcomingTimer', 'UpcomingTimers', 'TimerFor', 'LiveRecording', 'StartOfDay']) {
    const match = liveTvGuideFile.match(new RegExp(`^    function ${name}\\([^]*?^    end function`, 'm'));
    assert.ok(match, `Missing liveTvGuide.${name}`);
    source += '\n' + match[0];
}
source += '\nend namespace\n';
source += '\n' + await readFile('test/live-tv-guide.bs', 'utf8');
source += '\n' + (await readFile('source/utils/recordAiring.bs', 'utf8')).replace(/^import .*$/gm, '');
source += '\n' + await readFile('test/record-airing.bs', 'utf8');
for (const [file, test] of [['source/utils/heldSeek.bs', 'test/held-seek.bs'], ['source/utils/secondarySubtitle.bs', 'test/secondary-subtitle.bs'], ['source/utils/liveWindow.bs', 'test/live-window.bs'], ['source/utils/subtitleText.bs', 'test/subtitle-text.bs'], ['source/utils/osdControls.bs', 'test/osd-controls.bs']]) {
    source += '\n' + (await readFile(file, 'utf8')).replace(/^import .*$/gm, '') + '\n' + await readFile(test, 'utf8');
}
source += '\n' + await readFile('test/server-date.bs', 'utf8');
source += '\n' + await readFile('test/special-features.bs', 'utf8');
source += '\n' + await readFile('test/spotlight-episodes.bs', 'utf8');
// The rest of the Minimalist rules reach for the server and the session, which these tests don't have
const minimalistRulesFile = await readFile('source/utils/minimalistRules.bs', 'utf8');
source += '\n' + minimalistRulesFile.match(/^const MINIMALIST_(?:TYPES|EPISODE_TYPES) = .+$/gm).join('\n') + '\nnamespace minimalistRules\n';
for (const name of ['Draws', 'ShowsEpisodes', 'ShowsExtrasButton']) {
    const match = minimalistRulesFile.match(new RegExp(`^    function ${name}\\([^]*?^    end function`, 'm'));
    assert.ok(match, `Missing minimalistRules.${name}`);
    source += '\n' + match[0];
}
source += '\nend namespace\n';
source += '\n' + await readFile('test/minimalist-extras.bs', 'utf8');
const settingsSyncFile = await readFile('source/utils/settingsSync.bs', 'utf8');
source += '\nnamespace settingsSync\n' + settingsSyncFile.match(/^    const .+$/gm).join('\n') + '\n';
for (const name of ['SubtitleModes', 'MediaBarSource', 'PluginToRoku', 'RokuToPlugin', 'ImageTypeName', 'EncodeRowImageTypes', 'RowImageTypeKeys', 'DecodeRowImageTypes', 'ProfileNames', 'NormalizeProfile', 'ActiveProfile', 'ProfileTitle', 'ProfilePath', 'ResolvedPath', 'ResetPath', 'ProfilePush', 'ProfileBody', 'DeleteProfile', 'SiloSectionIn', 'SiloSectionOut']) {
    source += '\n' + settingsSyncFile.match(new RegExp(`^    function ${name}\\([^]*?^    end function`, 'm'))[0];
}
source += '\nend namespace\n';
source += '\n' + await readFile('test/settings-sync-values.bs', 'utf8');
source += '\n' + await readFile('test/home-cards.bs', 'utf8');
// Home's rows in the settings preview, without Look, which reads the saved settings
const homeRowsPreviewFile = await readFile('source/utils/homeRowsPreview.bs', 'utf8');
source += '\nnamespace homeRowsPreview\n' + homeRowsPreviewFile.match(/^    const .+$/gm).join('\n') + '\n';
for (const name of ['Arrange', 'Merged', 'WithGenresSort', 'FocusIndex', 'Shows', 'ItemShows', 'SeerrMark', 'Laid', 'CardArt', 'FirstOf', 'CardText']) {
    const match = homeRowsPreviewFile.match(new RegExp(`^    function ${name}\\([^]*?^    end function`, 'm'));
    assert.ok(match, `Missing homeRowsPreview.${name}`);
    source += '\n' + match[0];
}
source += '\nend namespace\n';
source += '\n' + await readFile('test/home-rows-preview.bs', 'utf8');
// The preview stacks Home's rows with the room HomeRows keeps under them
const homeRowsRoom = await readFile('components/home/HomeRows.bs', 'utf8');
for (const [rowsName, previewName] of [['ROW_TITLE_BAND', 'TITLE_BAND'], ['CLASSIC_CAPTION_ROOM', 'CLASSIC_ROOM'], ['MODERN_CAPTION_ROOM', 'MODERN_ROOM'], ['MODERN_INFO_ROOM', 'MODERN_INFO_ROOM'], ['MODERN_RATINGS_ROOM', 'MODERN_RATINGS_ROOM']]) {
    assert.equal(homeRowsPreviewFile.match(new RegExp(`const ${previewName} = (\\d+)`))[1], homeRowsRoom.match(new RegExp(`^const ${rowsName} = (\\d+)`, 'm'))[1], `The preview's ${previewName} is HomeRows' ${rowsName}`);
}
source += '\n' + await readFile('test/calendar-entries.bs', 'utf8');
source += '\n' + await readFile('test/arr-calendar-rows.bs', 'utf8');
source += '\n' + await readFile('test/moonbase-install.bs', 'utf8');
source += '\n' + await readFile('test/watch-party.bs', 'utf8');
source += '\n' + (await readFile('source/utils/keyboardLayouts.bs', 'utf8')).replace(/^import .*$/gm, '');
source += '\n' + await readFile('test/keyboard-layouts.bs', 'utf8');
source += '\n' + await readFile('source/utils/profileCarousel.bs', 'utf8');
source += '\n' + await readFile('test/profile-carousel.bs', 'utf8');
source += '\n' + await readFile('test/settings-sync-profile.bs', 'utf8');
source += '\n' + await readFile('test/seasonal-effects.bs', 'utf8');
source += '\n' + await readFile('test/audio-track.bs', 'utf8');
source += '\n' + await readFile('test/audio-quality.bs', 'utf8');
source += '\n' + await readFile('test/subtitle-selection.bs', 'utf8');
// The registry reads and writes stay out, since this interpreter has no registry, so nothing is
// remembered when a screen asks
const trackMemoryFile = await readFile('source/utils/trackMemory.bs', 'utf8');
source += '\n' + trackMemoryFile.match(/^const TRACK_MEMORY_\w+ = .+$/gm).join('\n') + '\nnamespace trackMemory\n';
for (const name of ['Empty', 'WithPick', 'Take', 'Push', 'Pick', 'RememberedAudio', 'RememberedSubtitle', 'SeriesPref', 'MatchSeries', 'NamedTracks', 'OfType', 'Position', 'StreamWithIndex', 'HasIndex', 'StreamIndex', 'TrackLanguage', 'TrackName', 'SaysForced']) {
    const match = trackMemoryFile.match(new RegExp(`^    (?:function|sub) ${name}\\([^]*?^    end (?:function|sub)`, 'm'));
    assert.ok(match, `Missing trackMemory.${name}`);
    source += '\n' + match[0];
}
source += '\n    function Load() as object\n        return trackMemory.Empty()\n    end function\nend namespace\n';
source += '\n' + await readFile('test/track-memory.bs', 'utf8');
// The PIN decisions without the registry or the server, and with a stand in for the hash, which
// this interpreter has no digest for
for (const [file, constants, space, names, extra] of [
    ['source/utils/pinLockout.bs', /^const PIN_\w+ = .+$/gm, 'pinLockout', ['IsPinShaped', 'Matches', 'RecordRemaining', 'RecordFailure', 'FormatWait', 'TooManyAttempts'], '    function HashPin(pin as string) as string\n        return "#" + pin\n    end function\n'],
    ['source/api/serverPin.bs', /^const SERVER_PIN_\w+ = .+$/gm, 'serverPin', ['VerifyVerdict', 'WriteVerdict', 'Locked', 'IsBoolean', 'ErrorIs'], ''],
    ['source/utils/signInPin.bs', /^const SIGN_IN_\w+ = .+$/gm, 'signInPin', ['NoPin', 'RecordFrom', 'IsEnabled', 'Patched', 'Settled', 'VerifyHere', 'AfterStatus', 'AfterVerify', 'Refusal', 'AfterStore', 'Message', 'AccountKey', 'MarkForgotten', 'TakeForgottenUsername', 'NoteProvedSignIn', 'TakeProvedSignIn', 'TakeForgotten'], '']
]) {
    const text = await readFile(file, 'utf8');
    source += '\n' + text.match(constants).join('\n') + `\nnamespace ${space}\n` + extra;
    for (const name of names) {
        const match = text.match(new RegExp(`^    (?:function|sub) ${name}\\([^]*?^    end (?:function|sub)`, 'm'));
        assert.ok(match, `Missing ${space}.${name}`);
        source += '\n' + match[0];
    }
    source += '\nend namespace\n';
}
source += '\n' + await readFile('test/sign-in-pin.bs', 'utf8');
source += '\n' + await readFile('test/file-facts.bs', 'utf8');
source += '\n' + await readFile('test/playback-facts.bs', 'utf8');
source += '\n' + await readFile('test/favorite-tabs.bs', 'utf8');
source += '\n' + await readFile('test/home-preview.bs', 'utf8');
source += '\n' + await readFile('test/remote-subtitles.bs', 'utf8');
source += '\n' + await readFile('test/playlist-sort-filter.bs', 'utf8');
source += '\n' + await readFile('test/collection-sort.bs', 'utf8');
source += '\n' + await readFile('test/person-credits.bs', 'utf8');
source += '\n' + await readFile('test/spotlight-person.bs', 'utf8');
source += '\n' + await readFile('test/music-categories.bs', 'utf8');
source += '\n' + await readFile('test/incomplete-recordings.bs', 'utf8');
// The rest of the arrangement helpers use loops this interpreter can't parse, and the stand ins in
// test/detail-sections.bs cover them
const buttonLayoutFile = await readFile('source/utils/buttonLayout.bs', 'utf8');
source += '\n' + buttonLayoutFile.match(/^const OSD_\w+ = .+$/gm).join('\n') + '\nnamespace buttonLayout\n' + buttonLayoutFile.match(/^    const OSD_\w+ = .+$/gm).join('\n') + '\n';
for (const name of ['OsdCandidates', 'OsdSecondaryX', 'Ordered', 'Arrange']) {
    const match = buttonLayoutFile.match(new RegExp(`^    function ${name}\\([^]*?^    end function`, 'm'));
    assert.ok(match, `Missing buttonLayout.${name}`);
    source += '\n' + match[0];
}
source += '\nend namespace\n';
source += '\n' + await readFile('test/settings-live-preview.bs', 'utf8');
const moonfinPluginFile = await readFile('source/api/MoonfinPlugin.bs', 'utf8');
source += '\nnamespace moonfinPlugin\n';
for (const name of ['InfoFromPing', 'WithUserToken', 'AreTmdbThumbsAvailable', 'AreTmdbReviewsSupported', 'AreTmdbDetailsSupported', 'GetTmdbId', 'TmdbThumbURL', 'StudioImageURL', 'IsEnabled', 'IncompleteRecordingsSupported', 'CanKeepAsComplete', 'ExtendedCompleteShowingsSupported', 'IsPluginInstalled', 'ParseBoolSetting', 'RatingsSetting', 'RatingsBool', 'IsRatingsEnabled', 'IsEpisodeRatingsEnabled']) {
    const match = moonfinPluginFile.match(new RegExp(`^    function ${name}\\([^]*?^    end function`, 'm'));
    assert.ok(match, `Missing moonfinPlugin.${name}`);
    source += '\n' + match[0];
}
source += '\nend namespace\n';
source += '\n' + await readFile('test/tmdb-thumbs.bs', 'utf8');
source += '\n' + await readFile('test/ratings-scope.bs', 'utf8');
// The rest of the row layout uses loops this interpreter cant parse, and the outside lists only need these
const homeRowLayoutFile = await readFile('source/utils/homeRowLayout.bs', 'utf8');
source += '\nnamespace homeRowLayout\n' + homeRowLayoutFile.match(/^    const .+$/gm).join('\n') + '\n';
for (const name of ['Catalogue', 'Passthrough', 'AsText', 'Sources', 'SourceFor', 'ServerId', 'ServerKey', 'SourceFromId', 'IsOwnServer', 'IsSliderRow', 'RowToggles', 'ReloadsHome']) {
    source += '\n' + homeRowLayoutFile.match(new RegExp(`^    function ${name}\\([^]*?^    end function`, 'm'))[0];
}
source += '\nend namespace\n';
// The merge sort alone, since the rest of the library scope asks the server
const libraryScopeFile = await readFile('source/utils/libraryScope.bs', 'utf8');
source += '\nnamespace libraryScope\n';
for (const name of ['Sorted', 'Before', 'SortSource', 'SortKey', 'PaddedNumbers', 'AsText']) {
    const match = libraryScopeFile.match(new RegExp(`^    function ${name}\\([^]*?^    end function`, 'm'));
    assert.ok(match, `Missing libraryScope.${name}`);
    source += '\n' + match[0];
}
source += '\nend namespace\n';
source += '\n' + await readFile('test/multi-server-sort.bs', 'utf8');
source += '\n' + await readFile('test/media-bar-external.bs', 'utf8');
source += '\n' + (await readFile('source/utils/mediaBarNewRelease.bs', 'utf8')).replace(/^import .*$/gm, '');
source += '\n' + await readFile('test/media-bar-new-release.bs', 'utf8');
source += '\n' + (await readFile('source/utils/seerrSliders.bs', 'utf8')).replace(/^import .*$/gm, '');
source += '\n' + await readFile('test/seerr-sliders.bs', 'utf8');
source += '\n' + (await readFile('source/utils/SeerrUtils.bs', 'utf8')).match(/^const SEERR_(?:MEDIA|REQUEST)_\w+ = .+$/gm).join('\n');
source += '\n' + (await readFile('source/utils/seerrRequestRules.bs', 'utf8')).replace(/^import .*$/gm, '');
source += '\n' + await readFile('test/seerr-requests.bs', 'utf8');
// The whole markdown reader uses loops this interpreter cant parse, and the reviews only need Strip
source += '\nnamespace messageMarkdown\n' + (await readFile('source/utils/messageMarkdown.bs', 'utf8')).match(/^    function Strip\([^]*?^    end function/m)[0] + '\nend namespace\n';
source += '\n' + await readFile('test/tmdb-reviews.bs', 'utf8');
const achievementsModelFile = await readFile('source/utils/achievementsModel.bs', 'utf8');
source += '\nnamespace achievementsModel\n';
for (const name of [
    'IsObject', 'Field', 'AsInt', 'AsString', 'AsBool', 'AsSeconds', 'ScoreForRarity', 'Clamp', 'Ratio', 'MapList', 'ParseBadge', 'RarityRank', 'ParseUnlockToastSettings', 'AllowsRarity', 'FreshUnlocks',
    'SocialAvailable', 'SameUserId', 'ParseSocialUser', 'ParseFriendMedia', 'ParseFriend', 'ParseFriendsList', 'FindUser', 'IsFriend', 'IsPending', 'ParseSocialUsers', 'ParseSocialPrivacy', 'ApplySocialPrivacy',
    'ParseThread', 'ThreadIsPhoto', 'IdList', 'ParseConversation', 'IsGroupOwner', 'IsGroupAdmin', 'IsGroupMember', 'ParseMessage', 'ThreadHasNewFromOthers', 'SocialBadgeCount', 'DisplayNameFor'
]) {
    source += '\n' + achievementsModelFile.match(new RegExp(`^    function ${name}\\([^]*?^    end function`, 'm'))[0];
}
source += '\nend namespace\n';
source += '\n' + await readFile('test/achievement-unlocks.bs', 'utf8');
for (const file of ['source/api/silo/SiloSession.bs', 'source/api/silo/SiloMapper.bs', 'source/api/silo/SiloMediaSources.bs', 'source/api/silo/SiloImages.bs', 'source/api/silo/SiloAccount.bs', 'source/api/silo/SiloPager.bs', 'source/api/silo/SiloCatalog.bs', 'source/api/silo/SiloHome.bs', 'source/api/silo/SiloActions.bs', 'source/api/silo/SiloPlayback.bs', 'source/api/silo/SiloExtras.bs', 'source/api/silo/SiloSeerr.bs', 'source/api/silo/SiloRouter.bs']) {
    source += '\n' + (await readFile(file, 'utf8')).replace(/^import .*$/gm, '');
}
source += '\n' + await readFile('test/silo.bs', 'utf8');
source += '\n' + await readFile('test/friends-chat.bs', 'utf8');
// Keep the SDK callers themselves: only their URL-transfer boundary is a fixture.
const sdk = await readFile('source/api/sdk.bs', 'utf8');
source += '\nnamespace api\nnamespace items\n';
for (const name of ['GetByID', 'GetLocalTrailers', 'GetLatest', 'GetSpecialFeatures', 'GetImageURL']) {
    source += '\n' + sdk.match(new RegExp(`        function ${name}\\([^]*?        end function`))[0];
}
source += '\nend namespace\nend namespace\n';
const directory = await mkdtemp(path.join(tmpdir(), 'moonfin-emby-'));
const program = new bsc.Program({ rootDir: directory, sourceMap: false });
try {
    const input = path.join(directory, 'test.bs');
    const file = program.setFile({ src: input, dest: "source/test.bs" }, source);
    assert.equal(file.getDiagnostics().length, 0, 'Test source must parse');
    program.validate();
    const { code } = await program.getTranspiledFileContents(input);
    const output = path.join(directory, 'test.brs');
    await writeFile(output, code);
    let stdout = '';
    let stderr = '';
    const capture = callback => new Writable({ write(chunk, encoding, done) { callback(chunk.toString()); done(); } });
    await brs.execute([output], {
        root: directory,
        stdout: capture(text => { stdout += text; }),
        stderr: capture(text => { stderr += text; }),
    }).catch(error => { throw new Error(stderr + stdout, { cause: error }); });
    assert.equal(stderr, '', stderr);
    assert.doesNotMatch(stdout, /FAIL:/, stdout);
    assert.match(stdout, /PASS: server compatibility/, stdout);
    process.stdout.write(stdout);
} finally {
    program.dispose();
    await rm(directory, { recursive: true, force: true });
}

// The server list opens Add Server, which offers an address or Emby Connect and shows the server it
// found before anyone signs in
assert.match(await readFile('components/config/SetServerScreen.xml', 'utf8'), /<AddServerDialog id="addServerDialog"/, 'Add Server opens over the server list');
assert.match(await readFile('components/config/SetServerScreen.bs', 'utf8'), /const SERVER_HOLD_SECONDS = 0\.5/, 'Holding OK on a saved server offers to remove it');
const addServerDialog = await readFile('components/login/AddServerDialog.bs', 'utf8');
assert.match(addServerDialog, /m\.top\.embyConnectChosen = true/, 'Add Server offers Emby Connect');
assert.match(addServerDialog, /sub onFoundServerChanged\(\)[^]*?showStep\("found"\)/, 'and shows the server it found');
const serverFlow = await readFile('source/ShowScenes.bs', 'utf8');
assert.match(serverFlow, /else if request\.fromDialog = true[^]*?screen\.foundServer = \{/, 'which the sign in flow answers before opening the server');
assert.match(serverFlow, /if CreateEmbyConnectGroup\(\)/);
assert.match(serverFlow, /if shownUsers > 0\s+goto user_select/, 'Back from sign in returns to the accounts Who\'s watching listed');
assert.match(await readFile('components/embyConnect/EmbyConnectScene.xml', 'utf8'), /extends="SigninScene"/);
process.stdout.write('PASS: sign-in entry wiring (8 checks)\n');

for (const detailStyle of ['components/details/SpotlightItemDetails.bs', 'components/details/MinimalistItemDetails.bs']) {
    const detailSource = await readFile(detailStyle, 'utf8');
    assert.match(detailSource, /sub init\(\)[^]*?m\.trackData = \{\}/, `${detailStyle} initializes shared track state`);
}
const miscSource = await readFile('source/utils/misc.bs', 'utf8');
const probe = miscSource.match(/function probeServerCandidates\([^]*?end function/)[0];
assert.match(probe, /if req\.AsyncGetToString\(\)/, 'Discovery only counts transfers that started');
assert.match(probe, /TotalSeconds\(\) < 45/, 'Discovery keeps a finite late-response window');
assert.match(probe, /wait\(250, port\)/, 'Discovery polls until the bounded deadline');
assert.doesNotMatch(probe, /wait\(0, port\)/, 'Discovery must not wait forever');
assert.match(probe, /GetResponseCode\(\) > 0 then probeState\.answered = true/, 'Discovery notes when the host answered at all');
const infer = miscSource.match(/function inferServerUrl\([^]*?end function/)[0];
assert.match(infer, /if not probeState\.answered then return ""[^]*?urlCandidates\(url, true\)/, 'The /emby pass only runs when the host answered the plain pass');
for (const detailStyle of ['components/details/ItemDetails.bs', 'components/details/ModernItemDetails.bs', 'components/details/NouveauItemDetails.bs', 'components/details/SpotlightItemDetails.bs', 'components/details/MinimalistItemDetails.bs']) {
    const detailSource = await readFile(detailStyle, 'utf8');
    assert.match(detailSource, /trailerAvailable = detailHasTrailer\(itemData\)/, `${detailStyle} counts local trailers as numbers`);
}
const extrasButtonHost = await readFile('components/details/detailButtonHost.bs', 'utf8');
assert.match(extrasButtonHost, /sub onDetailExtrasChanged\(\)[^]*?detailExtrasSignature\(\) = m\.builtExtrasSignature then return/, 'An unchanged trailer and parts answer doesn\'t rebuild the button row');
for (const dataNode of ['components/data/TVEpisodeData.bs', 'components/data/RecordingData.bs']) {
    const dataSource = await readFile(dataNode, 'utf8');
    assert.match(dataSource, /if m\.top\.posterURL = "" then setPoster\(\)/, `${dataNode} keeps the caller's thumbnail`);
}

const eventHandlers = await readFile('source/MainEventHandlers.bs', 'utf8');
const refreshDetails = eventHandlers.match(/sub onRefreshMovieDetailsDataEvent\(\)[^]*?end sub/)[0];
assert.match(refreshDetails, /selectedPartId[^]*?selectedPartId = currentItemID/, 'Only the selected multipart item preserves old extras');
assert.match(refreshDetails, /additionalParts = \{\}[^]*?trailerAvailable = false/, 'Normal item changes clear stale async extras');
assert.match(refreshDetails, /startDetailExtras\(currentScene, itemData\.json, serverData, true\)/, 'Normal item changes restart optional extras');

const screenHost = await readFile('components/details/detailScreenHost.bs', 'utf8');
assert.match(screenHost, /selectedPartId = chainLookupReturn\(m\.top, "selectedPart\.id", ""\)[^]*?if not isValidAndNotEmpty\(selectedPartId\) then return/, 'Clearing multipart selection is safe');
const showScenes = await readFile('source/ShowScenes.bs', 'utf8');
assert.match(showScenes, /if not group\.hasField\("detailExtrasTask"\) then group\.addField/, 'Detail extras task can be restarted on one screen');

const buttonHost = await readFile('components/details/detailButtonHost.bs', 'utf8');
assert.match(buttonHost.match(/sub onDetailExtrasChanged\(\)[^]*?end sub/)[0], /rebuildButtonRow\(\)/, 'A late extras answer rebuilds the button row');
const toggleWatched = buttonHost.match(/sub toggleWatched\(\)[^]*?end sub/)[0];
assert.match(toggleWatched, /itemData\.UserData\.PlaybackPositionTicks = 0[^]*?if hadProgress then rebuildButtonRow\(\)/, 'Marking watched or unwatched drops the Resume button');
const rebuildRow = buttonHost.match(/sub rebuildButtonRow\(\)[^]*?end sub/)[0];
assert.match(rebuildRow, /selectedId = m\.buttonGroups\[previousIndex\]\.id/, 'Async button rebuild remembers logical selection');
assert.match(rebuildRow, /m\.currentButtonIndex = i[^]*?if focusedId <> "" then focusButton\(i\)/, 'Async button rebuild restores index without stealing focus');

const remoteItems = await readFile('source/api/Items.bs', 'utf8');
const remoteMetadata = remoteItems.match(/function ItemMetaDataForServer\([^]*?end function/)[0];
assert.match(remoteMetadata, /serverItemMetadataPath\(id, serverData\.userId, isEmbyServer\(serverData\.serverUrl\)\)/, 'Remote metadata uses server-specific canonical path');
const remotePlaybackInfo = remoteItems.match(/function ItemPostPlaybackInfoForServer\([^]*?end function/)[0];
assert.match(remotePlaybackInfo, /if asksForServerStream\(options, [^\n]*\)\s+(?:'[^\n]*\s+)*params\.EnableDirectPlay = false/, 'Remote Live TV retry disables direct play to request a remux');

const favoriteWrites = await readFile('components/ItemGrid/FavoriteItemsTask.bs', 'utf8');
assert.match(favoriteWrites, /APIRequestForServer\([^]*?"UserFavoriteItems\/" \+ itemId/, 'Remote favorites use the shared request builder');
assert.doesNotMatch(favoriteWrites, /Substitute\([^\n]*favoriteitems|serverData\.serverUrl\s*\+/i, 'Remote favorites don\'t concatenate server URLs');

const playstateWrites = await readFile('components/PlaystateTask.bs', 'utf8');
assert.match(playstateWrites, /APIRequestForServer\([^]*?"UserPlayedItems\/" \+ itemId/, 'Remote playstate writes use canonical routes');
assert.doesNotMatch(playstateWrites, /normalizedUrl \+ "\/Users\//, 'Remote playstate writes do not concatenate legacy routes');
assert.match(playstateWrites, /resp\.AddHeader\("Content-Type", "application\/json"\)\s+code = requestResponse\(resp, "POST", params\)\.status\s+closeEmbyPlayback\(serverData, requestParams, code >= 200 and code < 300\)/, 'A stop the server took isnt followed by a second close of its live stream');
assert.match(await readFile('components/video/VideoPlayerView.bs', 'utf8'), /sendPlaystate\(state, params, state = "stop" and isValidAndNotEmpty\(params\.LiveStreamId\)\)/, 'A live stop goes on a task of its own');

const signOut = (await readFile('source/api/userauth.bs', 'utf8')).match(/sub SignOut\([^]*?end sub/)[0];
assert.match(signOut, /m\.global\.removeField\("collectionOwners"\)/, 'Signing out drops the collections the last account was told about');
const handlers = await readFile('source/MainEventHandlers.bs', 'utf8');
assert.equal(handlers.match(/isLiveTvChannel\((selectedItemType|node\.type)\)/g).length, 3, 'Quick play and both selection paths tune either channel type');
assert.match(await readFile('components/home/HomeRows.bs', 'utf8'), /tr\("Since you watched %1"\)\.Replace\("%1", seedName\)/, 'The Since you watched title is translated whole, so a language can put the title where it reads right');
for (const locale of ['en_US', 'ca', 'de_DE', 'fr', 'fr_CA', 'pt_BR']) {
    assert.match(await readFile(`locale/${locale}/translations.ts`, 'utf8'), /<source>Since you watched %1<\/source>[^]*?<translation>[^<]*%1[^<]*<\/translation>/, `${locale} has the Since you watched title`);
}

assert.match(await readFile('source/utils/settingsSync.bs', 'utf8'), /"kind": "pluginDynamic",\s+"type": "none",\s+"enabled": enabled,\s+"order": order,\s+"serverId": owner,\s+"pluginSource": entry\.source,\s+"pluginSection": section,\s+"pluginAdditionalData": entry\.itemId,\s+"pluginDisplayText": entry\.title\s+\}/, 'A picked row goes to the server with its keys as the other clients spell them');
assert.match(await readFile('components/settings/settings.bs', 'utf8'), /"homeSections": settingsSync\.HomeSectionsPayload\(\),\s+"homeRowOrder": settingsSync\.RowOrderPayload\(\)/, 'The home layout goes to the server under its keys as spelled, since BrightScript lowercases bare keys');
assert.match(await readFile('source/utils/settingsSync.bs', 'utf8'), /pluginKey: "hiddenDetailSectionsTv", rokuKey: "ui\.itemdetail\.hiddenSections", type: "jsonArray"/, 'The hidden detail sections travel with the other clients');

const multiServerUtils = await readFile('source/utils/multiserver.bs', 'utf8');
const imageBuilder = multiServerUtils.match(/function buildImageURLForServer\([^]*?end function/)[0];
assert.match(imageBuilder, /return buildURLForServer\(/, 'Remote images use the shared query-safe builder');

const homeRows = await readFile('components/home/HomeRows.bs', 'utf8');
assert.doesNotMatch(homeRows, /task\.endpoint = "\/Users\/\{userId\}\/(?:Items|Views)/, 'Home multi-server routes stay canonical');
assert.match(homeRows, /task\.endpoint = "\/UserItems\/Resume"/, 'Continue Watching uses the canonical user-items route');
assert.match(homeRows, /task\.endpoint = "\/UserViews"/, 'Library discovery uses the canonical user-views route');
assert.doesNotMatch(homeRows, /baseUrl \+ "\/Items\//, 'Remote row artwork uses the shared builder');

const legacyUserRoute = /["`]\/?Users\/(?:\{0\}|\{userId\}|\$\{[^}]+\})\/(?:Items|Views|FavoriteItems|PlayedItems)\b/i;
let scannedRoutes = 0;
for await (const file of glob('{components,source}/**/*.{bs,xml}')) {
    scannedRoutes++;
    assert.doesNotMatch(await readFile(file, 'utf8'), legacyUserRoute, `${file} uses the flat user routes`);
}
assert.ok(scannedRoutes > 100, 'The route scan found the app sources');

// The device lowercases a bare key in a literal, which the player API turns away, and brs doesnt.
const youtubeSource = await readFile('source/utils/youtubeTrailer.bs', 'utf8');
assert.ok(['"videoId":', '"clientName":', '"clientVersion":', '"contentCheckOk":', '"racyCheckOk":', '["visitorData"]'].every(key => youtubeSource.includes(key)), 'The YouTube request keeps its camelCase keys');

const seerrTask = await readFile('components/seerr/SeerrAPITask.bs', 'utf8');
assert.match(seerrTask, /url = buildServerURL\(serverUrl, targetPath, queryParams\)/, 'Plugin proxy preserves saved server query through shared compositor');

const extrasTask = await readFile('components/extras/LoadExtrasTask.bs', 'utf8');
assert.match(extrasTask, /function multiServerExtrasImageURL\([^]*?return buildURLForServer\(/, 'Remote detail extras images use the shared builder');
assert.doesNotMatch(extrasTask, /normalizedServerUrl \+ "\/Items\//, 'Remote detail extras do not concatenate server URLs');

const itemApi = await readFile('source/api/Items.bs', 'utf8');
for (const name of ['MusicAlbumList', 'AppearsOnList', 'GetSongsByArtist', 'MusicSongList', 'CreateArtistMix']) {
    const fn = itemApi.match(new RegExp(`function ${name}\\([^]*?end function`))[0];
    assert.match(fn, /APIRequest\("Items"/, `${name} uses the flat Jellyfin item route`);
    assert.doesNotMatch(fn, /Users\/\{0\}\/Items/, `${name} does not hard-code a legacy user route`);
}
assert.match(itemApi.match(/function AudioItem\([^]*?end function/)[0], /serverItemMetadataPath\(/, 'Audio metadata uses the server-aware item route');
assert.match(itemApi.match(/function GetIntroVideos\([^]*?end function/)[0], /serverItemMetadataPath\([^]*?\) \+ "\/Intros"/, 'Cinema intros use the server-aware item route');

const sdkSource = await readFile('source/api/sdk.bs', 'utf8');
const localTrailers = sdkSource.match(/function GetLocalTrailers\([^]*?end function/)[0];
assert.match(localTrailers, /APIRequestForServer\(serverData\.serverUrl, userId, serverData\.authToken/, 'Remote local trailers use the item server request');

const mainActions = await readFile('source/MainActions.bs', 'utf8');
const trailerAction = mainActions.match(/sub onTrailerButtonClicked\([^]*?end sub/)[0];
assert.match(trailerAction, /trailerItemId = chainLookupReturn\(itemContent, "id", ""\)/, 'Trailer lookup uses the detail item id');
assert.match(trailerAction, /getServerInfoFromItem\(itemContent\)/, 'Trailer lookup reads the detail item server');
assert.match(trailerAction, /GetLocalTrailers\(trailerItemId, trailerParams, trailerServerData\)/, 'Trailer lookup passes destination server context');
assert.match(trailerAction, /trailer\["_serverUrl"\] = trailerServerData\.serverUrl/, 'Remote trailers keep destination metadata for playback');

const quickplaySource = await readFile('source/utils/quickplay.bs', 'utf8');
const resumeHelper = quickplaySource.match(/sub applyResumeStartingPoint\([^]*?end sub/)[0];
assert.match(resumeHelper, /positionTicks <= 0 then return[^]*?item\.startingPoint = positionTicks/, 'Resume helper only copies positive playback positions');

const seriesLocal = quickplaySource.match(/sub seriesLocal\([^]*?end sub/)[0];
assert.match(seriesLocal, /if quickplayFromResume[^]*?GetResumeItems\([^]*?applyResumeStartingPoint\(data\.Items\[0\]\)/, 'Local series Resume prefers a resumable episode and copies its position');
assert.match(seriesLocal, /GetNextUp\([^]*?if quickplayFromResume then quickplay\.applyResumeStartingPoint\(data\.Items\[0\]\)/, 'Local Next Up fallback preserves a resume position when present');

const seriesRemoteStart = quickplaySource.indexOf('    sub seriesForServer(');
const seriesRemoteEnd = quickplaySource.indexOf("    ' More than one TV Show Series.", seriesRemoteStart);
assert.ok(seriesRemoteStart >= 0 && seriesRemoteEnd > seriesRemoteStart, 'Remote series quick-play block is present');
const seriesRemote = quickplaySource.slice(seriesRemoteStart, seriesRemoteEnd);
assert.match(seriesRemote, /quickplayFromResume[^]*?resumeUrl = "UserItems\/Resume"[^]*?if quickplayFromResume[^]*?APIRequestForServer\([^]*?resumeUrl/, 'Remote series Resume queries the resumable endpoint first');
assert.match(seriesRemote, /applyResumeStartingPoint\(data\.Items\[0\]\)/, 'Remote series Resume copies the saved playback position');

const videoLoader = await readFile('components/ItemGrid/LoadVideoContentTask.bs', 'utf8');
const episodeWindow = videoLoader.match(/sub addNextEpisodesToQueue\([^]*?end sub/)[0];
assert.match(episodeWindow, /if i = targetIndex and isValid\(playingItem\)\s+windowQueue\.push\(playingItem\)/, 'The rebuilt episode queue keeps the playing item and its start position');

const introPlayback = videoLoader.match(/function getIntroVideosForPlayback\([^]*?end function/)[0];
assert.match(introPlayback, /serverItemMetadataPath\([^]*?APIRequestForServer\(/, 'Remote prerolls are requested from the item server');

const additionalPartsPlayback = videoLoader.match(/function getAdditionalPartsForPlayback\([^]*?end function/)[0];
assert.match(additionalPartsPlayback, /APIRequestForServer\([^]*?AdditionalParts[^]*?tagPlaybackServerItems/, 'Remote multipart videos stay on the item server');

const segmentPlayback = videoLoader.match(/function getMediaSegmentsForPlayback\([^]*?end function/)[0];
assert.match(segmentPlayback, /isEmbyServer\(serverData\.serverUrl\) then return invalid[^]*?APIRequestForServer/, 'Remote segment lookup skips Emby and uses the target Jellyfin server');

const episodePlayback = videoLoader.match(/function getShowEpisodesForPlayback\([^]*?end function/)[0];
assert.match(episodePlayback, /targetParams\.UserId = serverData\.userId[^]*?APIRequestForServer[^]*?tagPlaybackServerItems/, 'Remote autoplay episodes keep server metadata');

const nextEpisodeQueue = videoLoader.match(/sub addNextEpisodesToQueue\([^]*?end sub/)[0];
assert.match(nextEpisodeQueue, /ItemMetaDataForServer\(serverData, videoID\)[^]*?getShowEpisodesForPlayback\(showID, urlParams, serverData\)/, 'Remote next-episode queue resolves on the item server');

const finishEpisode = videoLoader.match(/sub addEpisodeToShowAtFinish\([^]*?end sub/)[0];
assert.match(finishEpisode, /ItemMetaDataForServer\(serverData, videoID\)[^]*?getShowEpisodesForPlayback\(showID, urlParams, serverData\)/, 'Remote finish autoplay resolves on the item server');

const preferredAudio = videoLoader.match(/function FindPreferredAudioStream\([^]*?end function/)[0];
assert.match(preferredAudio, /getPlaybackItem\(m\.top\.itemId, playbackServerData\(\)\)/, 'Remote preferred-audio fallback reads metadata from the item server');

const playbackInfoTask = await readFile('components/GetPlaybackInfoTask.bs', 'utf8');
const playbackSessionLookup = playbackInfoTask.match(/function findPlaybackSession\([^]*?end function/)[0];
assert.match(playbackSessionLookup, /APIRequestForServer\(serverUrl, serverUserId, serverAuthToken, "Sessions", \{\}\)[^]*?api\.sessions\.Get\(\{\}\)/, 'Remote playback stats query the item server while local stats keep the active session path');

assert.match(remoteMetadata, /data\.type = "Audio" or data\.type = "AudioBook"[^]*?MusicSongData[^]*?PosterImageForServer/, 'Remote audio metadata uses the same song node path as local playback');

const loadItemsTask = await readFile('components/home/LoadItemsTask.bs', 'utf8');
const remoteAudioStream = loadItemsTask.match(/function loadAudioStreamForServer\([^]*?end function/)[0];
assert.match(remoteAudioStream, /ItemMetaDataForServer\([^]*?ItemPostPlaybackInfoForServer\(/, 'Remote audio stream negotiates playback on the item server');
assert.match(remoteAudioStream, /APIRequestForServer\([^]*?Audio\/[^]*?Lyrics/, 'Remote Jellyfin lyrics use the item server');
assert.match(remoteAudioStream, /authenticatedResourceURL\([^]*?authRequestForServer\(/, 'Remote audio resources carry the owning server authentication');
assert.match(loadItemsTask, /itemsToLoad, "audioStream"[^]*?loadItemsTaskServerData\(\)[^]*?loadAudioStreamForServer/, 'Audio stream task selects the owning server');
assert.match(loadItemsTask, /itemsToLoad, "backdropImage"[^]*?backdropImageForServer/, 'Audio backdrop task selects the owning server');

const audioPlayer = await readFile('components/mediaPlayers/AudioPlayer.bs', 'utf8');
assert.match(audioPlayer, /setTaskServerFromItem\(m\.LoadAudioStreamTask, currentItem\)/, 'Audio player passes queue-item server data to the stream task');
assert.match(audioPlayer, /getServerInfoFromItem\(currentItem\)[^]*?params\.serverData = serverData[^]*?params\.UserId = serverData\.userId/, 'Audio playstate is reported to the owning server');

const audioPlayerView = await readFile('components/music/AudioPlayerView.bs', 'utf8');
assert.match(audioPlayerView, /setTaskServerFromItem\(m\.LoadMetaDataTask, currentItem\)/, 'Audio metadata task follows the queue-item server');
assert.match(audioPlayerView, /setArtwork\(currentItem, itemJson\)[^]*?sub setArtwork\(item as object[^]*?audioArtworkURL\(item, artId, ImageType\.PRIMARY/, 'Audio artwork uses the queue-item server');
assert.match(audioPlayerView, /audioArtworkURL\(queueItem, audioArtId\(itemJson\)/, 'Up Next thumbnails use each queue item server');

const detailApiTask = await readFile('components/JellyfinAPITask.bs', 'utf8');
assert.match(detailApiTask, /request\.serverData[^]*?APIRequestForServer\(serverData\.serverUrl, serverData\.userId, serverData\.authToken/, 'Detail API task can target the item server');
assert.match(detailApiTask, /LookupCI\("UserId"\)[^]*?targetParams\.UserId = serverData\.userId/, 'Remote detail requests replace active-session user ids');

const detailActions = await readFile('source/utils/detailActions.bs', 'utf8');
assert.match(detailActions, /function withDetailActionServer\([^]*?getServerInfoFromItem\(m\.top\.itemContent\)[^]*?serverIdentityKey\([^]*?request\.serverData = serverData/, 'Detail rating and delete actions carry the item server context, but not for the signed-in server');
assert.match(detailActions, /task\.request = withDetailActionServer\(request\)/, 'Detail action tasks use the item server wrapper');

const itemMenuHost = await readFile('components/itemMenu/itemMenuHost.bs', 'utf8');
assert.match(itemMenuHost, /itemMenuShowIdentify\([^]*?itemMenuServer\(subject\.json\)[^]*?itemMenuDialog\.serverData = serverData[^]*?itemMenuShowArtwork\([^]*?itemMenuServer\(subject\.json\)[^]*?itemMenuDialog\.serverData = serverData/, 'Artwork and identify dialogs inherit the remote item server');

const artworkDialog = await readFile('components/ArtworkPickerDialog.bs', 'utf8');
assert.match(artworkDialog, /serverData: m\.top\.serverData[^]*?RemoteImages[^]*?serverData: m\.top\.serverData[^]*?RemoteImages\/Download/, 'Artwork requests stay on the item server');

const identifyDialog = await readFile('components/IdentifyDialog.bs', 'utf8');
assert.match(identifyDialog, /serverData: m\.top\.serverData[^]*?Items\/RemoteSearch[^]*?serverData: m\.top\.serverData[^]*?Items\/RemoteSearch\/Apply/, 'Identify requests stay on the item server');

process.stdout.write('PASS: Jellyfin review regressions (65 checks)\n');

// Names that share a glyph share one file, so every alias needs its target and no file of its own.
const achievementIcons = await readFile('source/utils/achievementsIcons.bs', 'utf8');
const iconAliases = [...achievementIcons.matchAll(/"([a-z0-9_]+)": "([a-z0-9_]+)"/g)];
assert.ok(iconAliases.length > 0, 'Achievement icon aliases are listed');
for (const [, alias, target] of iconAliases) {
    await access(`images/achievements/${target}.webp`);
    await assert.rejects(access(`images/achievements/${alias}.webp`), undefined, `${alias} shares ${target}.webp rather than keeping a copy`);
}
process.stdout.write(`PASS: achievement icon aliases (${iconAliases.length} checks)\n`);

// MaskGroup ignores the tRNS transparency of a grayscale PNG and draws the whole child, so a mask
// needs an alpha channel or a palette. A WebP mask carries its alpha flag in the header, the
// extended format in its flags byte and the lossless one next to its size.
const hasAlpha = (data, image) => {
    if (!image.endsWith('.webp')) return [3, 4, 6].includes(data[25]);
    const chunk = data.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return (data[20] & 0x10) !== 0;
    if (chunk === 'VP8L') return ((data.readUInt32LE(21) >>> 28) & 1) === 1;
    return false;
};
const maskImages = new Set();
for await (const file of glob('{components,source}/**/*.{bs,xml}')) {
    const code = await readFile(file, 'utf8');
    for (const [, image] of code.matchAll(/maskUri\s*=\s*"pkg:\/(images\/[^"]+\.(?:png|webp))"/g)) maskImages.add(image);
    for (const [, image] of code.matchAll(/"pkg:\/(images\/[^"]*mask[^"]*\.(?:png|webp))"/gi)) maskImages.add(image);
}
assert.ok(maskImages.size > 10, 'The mask scan found the masks');
for (const image of maskImages) {
    assert.ok(hasAlpha(await readFile(image), image), `${image} keeps its transparency where MaskGroup reads it`);
}
process.stdout.write(`PASS: mask image formats (${maskImages.size} checks)\n`);

// Every details style fills its pickers before a reload returns early, so the lists are there on a
// first visit, and each style takes in a subtitle downloaded from it.
const detailStyles = ['ItemDetails', 'ModernItemDetails', 'MinimalistItemDetails', 'NouveauItemDetails', 'SpotlightItemDetails'];
for (const detailStyle of detailStyles) {
    const detailSource = await readFile(`components/details/${detailStyle}.bs`, 'utf8');
    assert.match(detailSource, /then SetUpTrackOptions\(itemData\)\s+if m\.loadStatus = ViewLoadStatus\.RELOAD/, `${detailStyle} fills the track pickers before a reload returns`);
    assert.match(detailSource, /subtitleDownloadDialog\.observeField\("downloadedIndex", "onSubtitleDownloaded"\)/, `${detailStyle} picks up a downloaded subtitle`);
}
process.stdout.write(`PASS: detail track pickers (${detailStyles.length * 2} checks)\n`);

// A subtitle pick lasts as long as the audio pick, and a chapter played from details keeps it.
const queueClear = (await readFile('components/manager/QueueManager.bs', 'utf8')).match(/^sub clear\(\)[^]*?^end sub/m)[0];
assert.match(queueClear, /if not m\.bypassNextPreferredAudioTrackIndexReset and not m\.bypassNextPreferredSubtitleTrackReset\s+m\.preferredSubtitleTrack = \{\}/, 'Clearing the queue keeps the subtitle pick wherever it keeps the audio pick');
const sceneManagerSource = await readFile('components/data/SceneManager.bs', 'utf8');
const pickResets = sceneManagerSource.match(/callFunc\("setPreferredAudioTrackIndex", -1\)\s+m\.global\.queueManager\.callFunc\("setPreferredAudioTrackName", string\.EMPTY\)\s+m\.global\.queueManager\.callFunc\("setPreferredSubtitleTrack", \{\}\)/g) ?? [];
assert.equal(pickResets.length, 2, 'Entering a details screen or leaving to anything else resets the subtitle pick with the audio pick');
const chapterPlays = { ModernItemDetails: 'onChapterSelected', NouveauItemDetails: 'playFromChapter', SpotlightItemDetails: 'onModalChapterChosen' };
for (const [detailStyle, handler] of Object.entries(chapterPlays)) {
    const body = (await readFile(`components/details/${detailStyle}.bs`, 'utf8')).match(new RegExp(`^sub ${handler}\\([^]*?^end sub`, 'm'))[0];
    assert.match(body, /callFunc\("bypassNextPreferredSubtitleTrackReset"\)\s+m\.global\.queueManager\.callFunc\("clear"\)/, `${detailStyle} keeps the subtitle pick when a chapter plays`);
}
const loadVideoSource = await readFile('components/ItemGrid/LoadVideoContentTask.bs', 'utf8');
assert.match(loadVideoSource, /shouldBurnInSubtitle\(video\.SelectedSubtitle\)\s+m\.playbackInfo = getPlaybackInfo\(video\.id, mediaSourceId, audio_stream_idx, requestedSubtitleIndex,/, 'A burn in asks the server for the track that will play');
process.stdout.write(`PASS: subtitle pick lifetime (${Object.keys(chapterPlays).length + 3} checks)\n`);

// The Spotlight File Details card, Playlist Order card and version badge follow the synced section switches.
const spotlightCards = await readFile('components/details/SpotlightCards.bs', 'utf8');
assert.match(spotlightCards.match(/^function spotlightBuilderFileDetailsCard\(\)[^]*?^end function/m)[0], /if not detailSectionLayout\.Shows\("mediaInfo"\) then return invalid/, 'Hiding Media info hides the File Details card');
assert.match(spotlightCards.match(/^function spotlightBuilderPlaylistOrderCard\(\)[^]*?^end function/m)[0], /if not detailSectionLayout\.Shows\("playlistOrder"\) then return invalid/, 'Hiding Playlist Order hides the Playlist Order card');
assert.match((await readFile('components/details/SpotlightItemDetails.bs', 'utf8')).match(/^sub updateVersionBadge\(\)[^]*?^end sub/m)[0], /detailSectionLayout\.Shows\("versionBadge"\)/, 'Hiding the version badge hides it');
process.stdout.write('PASS: spotlight sections (3 checks)\n');

// A card left in a selection field opens again when a favorite or watched change rewrites it, and
// that rewrite has to leave the card's type alone.
const extrasSelections = [
    ['ModernItemDetails', /sub openSelectedItem\(item as object\)[^]*?end if\s+m\.extrasGrid\.selectedItem = item\s+m\.extrasGrid\.selectedItem = invalid/],
    ['SpotlightItemDetails', /m\.extrasGrid\.selectedItem = item\s+m\.extrasGrid\.selectedItem = invalid/],
];
for (const [detailStyle, clearsSelection] of extrasSelections) {
    const detailSource = await readFile(`components/details/${detailStyle}.bs`, 'utf8');
    assert.match(detailSource, clearsSelection, `${detailStyle} clears the extras grid selection after handing it over`);
    assert.doesNotMatch(detailSource.replace(clearsSelection, ''), /m\.extrasGrid\.selectedItem = (?!invalid)/, `${detailStyle} has no other extras grid selection left set`);
}
const sectionModal = await readFile('components/details/SpotlightSectionModal.bs', 'utf8');
const modalHandOvers = [...sectionModal.matchAll(/m\.top\.(sectionItemSelected|studioChosen|extraChosen|menuRequested) = item\s+m\.top\.(\w+) = invalid/g)];
assert.equal(modalHandOvers.length, 5, 'The Spotlight section popup clears every card it hands to the page');
for (const [, field, cleared] of modalHandOvers) assert.equal(cleared, field, `The Spotlight section popup clears ${field} itself`);
const applyToNode = (await readFile('source/utils/userDataSync.bs', 'utf8')).match(/function ApplyToNode\([^]*?end function/)[0];
assert.match(applyToNode, /cardType = node\.type\s+node\.json = updated\s+if isValid\(cardType\) then node\.type = cardType/, 'A user data change keeps the type a card was built with');
process.stdout.write(`PASS: card selections (${extrasSelections.length * 2 + modalHandOvers.length + 2} checks)\n`);

// Only a transcode the task asked to burn in drops the player's own subtitle tracks
assert.match(videoLoader, /and shouldBurnInSubtitle\(video\.SelectedSubtitle\)[^]*?emptySubtitleProfiles: true[^]*?video\.subtitlesBurnedIn = true/, 'The task only marks a transcode burned in when it asked for that');
assert.doesNotMatch(await readFile('components/video/VideoPlayerView.bs', 'utf8'), /playback\.subs\.burnin/, 'The player goes by what the task burned in, not the setting');
process.stdout.write('PASS: subtitle burn-in wiring (2 checks)\n');

// Every load goes through one place, so a load still out is set aside rather than ignoring the RUN
const playerView = await readFile('components/video/VideoPlayerView.bs', 'utf8');
assert.equal(playerView.match(/m\.LoadMetaDataTask\.control = TaskControl\.RUN/g).length, 1, 'Only runLoad starts the load task');
assert.match(playerView, /isValid\(m\.liveChannel\) and isStringEqual\(m\.liveChannel\.id, m\.channelSwitch\.target\.Id\)/, 'A channel switch succeeds on the channel that came back');
assert.match(videoLoader, /if m\.top\.abandoned\s+releaseAbandonedLiveStream\(loaded\)\s+return\s+end if\s+m\.top\.content = \[loaded\]/, 'A load the player set aside closes its stream instead of handing it over');
process.stdout.write('PASS: live load wiring (3 checks)\n');

// Picking an episode from the player's browser reports the old one stopped and resumes the pick
const episodePick = playerView.match(/sub onEpisodePicked\([^]*?end sub/)[0];
assert.match(episodePick, /ReportPlayback\("stop"\)\s+m\.top\.unobserveField\("state"\)/, 'Switching episodes reports the old one stopped before the state observer comes off');
assert.match(episodePick, /startingPoint = episodeBrowser\.ResumeTicks\(episode\)[^]*?callFunc\("push", episode\)/, 'The picked episode carries its resume point into the queue');
assert.match(await readFile('source/utils/buttonLayout.bs', 'utf8'), /id: "episodes", nodeId: "showEpisodes"/, 'The player offers the Episodes button');
assert.match(await readFile('components/video/OSD.bs', 'utf8'), /buttonLayout\.OsdCandidates\(m\.top\.hasChapters, m\.top\.hasEpisodes, m\.top\.hasSubtitles, m\.top\.hasPeople, m\.top\.canFavorite\)/, 'from the same list the settings preview draws');
assert.match(await readFile('source/utils/buttonLayout.bs', 'utf8'), /id: "chapters"[^]*?id: "episodes"[^]*?id: "subtitles"/, 'Episodes sits between Chapters and Subtitles in Player Buttons');
// Every setting that changes how subtitles look shows on the Player preview, and the style rows reach their own screen
const settingsScreen = await readFile('components/settings/settings.bs', 'utf8');
const previewTable = settingsScreen.match(/function previewSceneTable\(\)[^]*?end function/)[0];
const subtitleLooks = [...(await readFile('settings/settings.json', 'utf8')).matchAll(/"settingName": "(playback\.subs\.(?:custom|style\.\w+))"/g)].map(match => match[1]);
assert.ok(subtitleLooks.length >= 22, 'The subtitle style settings are found');
for (const key of subtitleLooks) assert.ok(previewTable.includes(`"${key}": "player"`), `${key} shows on the Player preview`);
// The skip button and the end of episode settings show on the Player preview, which pins its prompts
// where the player does
for (const key of ['playback.mediasegments.intro', 'playback.mediasegments.outro', 'playback.mediasegments.countdown', 'playback.nextupbehavior', 'playback.nextuptimeout', 'playback.showNextAirDate', 'playback.replaceskipoutrowithnextup', 'playback.trickplay.pauseWhileScrubbing']) {
    assert.ok(previewTable.includes(`"${key}": "player"`), `${key} shows on the Player preview`);
}
const playerPreviewSource = await readFile('components/settings/SettingsPlayerPreview.bs', 'utf8');
for (const name of ['OVERLAY_EDGE', 'OVERLAY_BOTTOM', 'SKIP_PROMPT_TOP']) {
    assert.equal(playerPreviewSource.match(new RegExp(`^const ${name} = (\\d+)`, 'm'))[1], playerView.match(new RegExp(`^const ${name} = (\\d+)`, 'm'))[1], `The preview's ${name} is the player's`);
}
const styleRows = settingsScreen.match(/Left\(item\.settingName \?\? "", (\d+)\) = "(playback\.subs\.style\.)"/);
assert.equal(Number(styleRows[1]), styleRows[2].length, 'The style rows are matched on their whole prefix');
const episodeOverlay = await readFile('components/video/EpisodeBrowserOverlay.bs', 'utf8');
const episodeOverlayXml = await readFile('components/video/EpisodeBrowserOverlay.xml', 'utf8');
assert.match(episodeOverlayXml, /<DetailTabBar id="seasonBar" visible="false" escapeLeft="true" \/>/, 'The episode browser picks seasons on the shared tab bar');
assert.match(episodeOverlayXml, /id="scrim"[^>]*color="#0000008A"/, 'The episode browser dims the video like the other dialogs');
assert.doesNotMatch(episodeOverlay, /Press BACK to close/, 'The episode browser has no close hint');
assert.match(episodeOverlay, /requestMarker[^]*?pillSize = "compact"/, 'The episode browser rows carry their anime markers');
assert.match(playerView, /m\.episodeOverlay\.logoUri = osdLogo\.uri/, 'The episode browser header is the series logo');
process.stdout.write('PASS: episode browser wiring (9 checks)\n');
const chapterOverlay = await readFile('components/video/ChapterListOverlay.bs', 'utf8');
assert.match(chapterOverlay, /key = KeyCode\.LEFT[^]*?m\.focusIndex--[^]*?key = KeyCode\.RIGHT[^]*?m\.focusIndex\+\+/, 'The chapter row moves with Left and Right');
assert.doesNotMatch(chapterOverlay, /KeyCode\.(UP|DOWN)/, 'Up and Down stay in the chapter row');
assert.match(chapterOverlay, /return key <> KeyCode\.PLAY/, 'Play and pause still reach the player under the chapter row');
assert.match(chapterOverlay, /visual\.thumb\.uri = "" and visual\.thumbUrl <> "" and i >= m\.scrollCol - THUMB_MARGIN/, 'Chapter images load only near the visible cards');
assert.match(playerView, /thumbUrl: chapterImageURL\(m\.top\.id, i, m\.chapters\[i\]\.LookupCI\("ImageTag"\), serverBase, authToken\)/, 'Each chapter card gets its image from the item it plays');
assert.match(await readFile('components/details/ModernItemDetails.bs', 'utf8'), /chapterImageURL\(itemId, i, ch\.LookupCI\("ImageTag"\), serverBase, authToken\)/, 'Modern builds chapter images with the same helper as the player');
assert.match(chapterOverlay, /createChild\("ScrollingLabel"\)[^]*?if focused then repeatCount = -1/, 'A long chapter name scrolls on the focused card only');
process.stdout.write('PASS: chapter row wiring (7 checks)\n');
const osdFile = await readFile('components/video/OSD.bs', 'utf8');
assert.match(osdFile, /sub resetFocusToDefaultButton\(\)[^]*?else\s+focusOnSeekbar\(\)/, 'The controls open on the seek bar, as Core\'s do');
assert.match(osdFile, /sub moveAlongRow\([^]*?focusControlGroup\("secondary", 0\)/, 'Right runs from the transport buttons onto the rest of the row');
assert.match(playerView, /if key = KeyCode\.OK\s+if not stateAllowsOSD\(\) then return true\s+handleVideoPlayPauseAction\(\)\s+showOSD\(\)/, 'OK with the controls hidden plays or pauses and brings them up');
assert.match(playerView, /openControlMenu\("showSpeedMenu"[^]*?openControlMenu\("showQualityMenu"/, 'Speed and Bitrate open in the track pickers\' panel');
assert.match(await readFile('components/manager/ViewCreator.bs', 'utf8'), /callFunc\("showControlsOn", "showAudioMenu"\)[^]*?callFunc\("showControlsOn", "showSubtitleMenu"\)/, 'The audio and subtitle pickers hand back to their buttons');
process.stdout.write('PASS: player controls wiring (5 checks)\n');

// Every row on the Calendar screen that the calendar draws moves the preview to it, week start on the month
// grid. The release types are shared with the Upcoming Movies row and the select action only acts on a
// press, so those leave it alone. Card image only shows for the style that draws it
const findCalendarPage = (nodes) => {
    for (const node of nodes) {
        if (node.requires === 'calendar' && node.children) return node;
        const found = node.children && findCalendarPage(node.children);
        if (found) return found;
    }
    return null;
};
const calendarRows = findCalendarPage(JSON.parse(await readFile('settings/settings.json', 'utf8'))).children.filter(row => row.settingName);
assert.ok(calendarRows.length >= 17, 'The Calendar settings are found');
for (const { settingName } of calendarRows) {
    const shared = settingName.startsWith('calendar.radarr.show') || settingName === 'calendar.selectAction';
    assert.equal(previewTable.includes(`"${settingName}": "calendar"`), !shared, `${settingName} ${shared ? 'leaves the preview where it is' : 'shows on the Calendar preview'}`);
}
assert.equal(calendarRows.find(row => row.settingName === 'calendar.imageType').requires, 'setting:calendar.style=countdown', 'Card image only shows with the Countdown style');
process.stdout.write(`PASS: calendar preview scenes (${calendarRows.length + 2} checks)\n`);

// The library rows move the preview to the library copy, the music style stays put, the chip comes
// last, and the copy never takes focus, runs the loading spinner or writes anything global
const libraryRows = ['ui.library.style', 'ui.library.groupItemsIntoCollections', 'ui.library.showMediaDetails', 'ui.library.cardTitles', 'ui.library.showBackdrops', 'libraryPosterOrientation'];
for (const key of libraryRows) assert.ok(previewTable.includes(`"${key}": "library"`), `${key} shows on the Library preview`);
assert.ok(previewTable.includes('"ui.library.musicStyle": "library"'), 'The music library style draws the music library on the same scene');
assert.match(settingsScreen, /if sceneId = "library" then shown = m\.hasVideoLibrary or m\.hasMusicLibrary/, 'The chip shows with a video or a music library');
assert.match(settingsScreen, /const PREVIEW_SCENES = \[[^\]]*"calendar", "library"\]/, 'The Library chip comes last, after Calendar');
const libraryCopy = await readFile('components/settings/SettingsLibraryPreview.bs', 'utf8') + await readFile('components/settings/settingsMusicPreview.bs', 'utf8');
assert.doesNotMatch(libraryCopy, /setFocus|takeFocus|LoadingSpinner|m\.global\.\w+\s*=|addFields|callFunc\("(?:pushScene|popScene)/, 'The library copies take no focus and change nothing global');
const musicRows = await readFile('components/settings/SettingsMusicTask.bs', 'utf8');
assert.doesNotMatch(musicRows, /AlbumArtists|"MusicArtist"|IsFavorite/, 'The music copies only ask for the rows their first screen shows');
// An assocarray field nobody set reads back as invalid on the device, so the copy falls back to an empty page while it loads
assert.match(libraryCopy, /page = m\.top\.page \?\? \{\}/, 'The library copy draws its loading state without a page');
process.stdout.write(`PASS: library preview scene (${libraryRows.length + 6} checks)\n`);

const animeTask = await readFile('components/anime/AnimeMarkersTask.bs', 'utf8');
assert.equal((animeTask.match(/labelStyle = body\.LookupCI\("labelStyle"\)|labelStyle: body\.LookupCI\("labelStyle"\)/g) || []).length, 2, 'Both marker answers carry the admin\'s label style');
process.stdout.write('PASS: anime marker label style (1 check)\n');

// A custom subtitle track downloads on the task's own thread, never in an observer the render thread runs
const captionTask = await readFile('components/captionTask.bs', 'utf8');
const loadTrack = captionTask.match(/sub loadTrack\(\)[^]*?end sub/)[0];
assert.match(captionTask, /m\.top\.functionName = "loadTrack"/, 'The caption task runs its download as a task');
assert.doesNotMatch(captionTask, /[^c]GetToString\(\)/, 'No caption download waits on the server');
assert.equal((captionTask.match(/CreateObject\("roUrlTransfer"\)/g) || []).length, (loadTrack.match(/CreateObject\("roUrlTransfer"\)/g) || []).length, 'The caption transfer is only made inside the task');
process.stdout.write('PASS: caption download wiring (3 checks)\n');

// Media results reach the screen before people, which get their own request with a limit
const itemsSearch = (await readFile('source/api/Items.bs', 'utf8')).match(/function searchViaItems\([^]*?end function/)[0];
assert.doesNotMatch(itemsSearch, /persons/i, 'The items search no longer waits on people');
const searchTask = await readFile('components/search/SearchTask.bs', 'utf8');
assert.match(searchTask, /people = startPeopleSearch\(query\)[^]*?searchMedia\(query, m\.top\.liveTv\)[^]*?publishSearchResults\(results, query, requestToken, false\)[^]*?peopleSearchResults\(people, PEOPLE_TIMEOUT_MS - clock\.TotalMilliseconds\(\)\)/, 'People start before the media search, media is published first and the late wait is bounded');
process.stdout.write('PASS: search people wiring (2 checks)\n');

// Modern and Classic list every collection a film is in
const parentCollection = extrasTask.match(/sub loadParentCollection\([^]*?end sub/)[0];
assert.doesNotMatch(parentCollection, /^\s*return\s*$/m, 'The extras task keeps going after the first collection');
assert.match(await readFile('components/extras/ExtrasRowList.bs', 'utf8'), /for each collectionNode in parentCollectionNodes/, 'Classic draws a row per collection');
assert.match(await readFile('components/details/ModernItemDetails.bs', 'utf8'), /label: tr\("Collections"\), kind: "collections"/, 'Modern puts more than one collection under a Collections tab');
process.stdout.write('PASS: parent collections wiring (3 checks)\n');

// A collection's playlist sorts, each collection row leads with its collection, and a show looks its collections up
assert.match(await readFile('components/details/detailCollectionHost.bs', 'utf8'), /function collectionQueue\(\) as object\s+return collectionSort\.Apply\(collectionPlaylist\(collectionMembers\(\)\)/, 'Play, Shuffle and the playlist rows all follow the order picked');
assert.match(parentCollection, /parentNode\.appendChild\(collectionCard\(collection\)\)\s+for each item in/, 'Each collection row leads with the collection itself');
assert.match(extrasTask, /itemKind = "series"\) and not hidden\.DoesExist\("collections"\) then loadParentCollection/, 'A show looks up the collections it is in');
assert.match(extrasTask, /seerrMissingCollection\.SlotByRelease\(parentalControls\.WithoutBlockedItems\(held\), missing\)/, 'A collection\'s own page slots its missing titles in by release');
assert.match(await readFile('components/details/SpotlightItemDetails.bs', 'utf8'), /itemType = "series"\) and detailSectionLayout\.Shows\("collections"\) then mode = "parents"/, 'So does Spotlight');
assert.match(await readFile('components/details/ModernItemDetails.bs', 'utf8'), /TAB_RANK_STUDIOS = 5\n[^]*?TAB_RANK_PLAYLIST = 6\nconst TAB_RANK_CHAPTERS = 7/, 'Modern puts the Playlist tab after Studios and before Chapters');
assert.match(await readFile('components/details/SpotlightCards.bs', 'utf8'), /items = s\.collectionQueue[^]*?headerAction: \{ label: s\.collectionSortLabel \}/, 'Spotlight\'s playlist order lists the sorted queue under a sort button');
assert.match(await readFile('source/utils/nouveauLayout.bs', 'utf8'), /NOUVEAU_SECTION_EXTRAS\)\s+if state\.parentCollectionCount > 0 and state\.itemType <> "boxset" then sections\.push\(NOUVEAU_SECTION_PARENT_COLLECTIONS\)\s+if IncludesDiscovery/, 'Nouveau puts the collection rails after the extras and before discovery, never on a collection');
process.stdout.write('PASS: collection sort wiring (8 checks)\n');

// The row's sync keys, layout slot and strict filter live in files the harness cant load
// whole, so they are checked where they are declared.
const settingsSyncSource = await readFile('source/utils/settingsSync.bs', 'utf8');
assert.match(settingsSyncSource, /\{ pluginKey: "seasonalRowEnabled", rokuKey: "seasonal\.row\.enabled", type: "bool" \}/, 'The seasonal switch syncs as a bool');
assert.match(settingsSyncSource, /\{ pluginKey: "seasonalRowCountry", rokuKey: "seasonal\.row\.country", type: "direct" \}/, 'The seasonal country syncs as text');
assert.match(settingsSyncSource, /\{ pluginKey: "seasonalRowHiddenHolidays", rokuKey: "seasonal\.row\.hiddenHolidays", type: "jsonArray" \}/, 'The hidden holidays sync as a list');
assert.match(settingsSyncSource, /\{ pluginKey: "seasonalRowAllYear", rokuKey: "seasonal\.row\.allYear", type: "bool" \}/, 'Show All Year syncs as a bool');
assert.match(settingsSyncSource.match(/function GetRowToggleMappings\([^]*?end function/)[0], /"rewatch", "seasonal"/, 'The pulled layout drives the seasonal switch');
const rowLayoutSource = await readFile('source/utils/homeRowLayout.bs', 'utf8');
assert.match(rowLayoutSource, /\{ id: "nextup", label: "Next Up" \},\s*\{ id: "seasonal", label: "Seasonal Row" \}/, 'An unarranged seasonal row sits after Next Up');
assert.match(rowLayoutSource, /seasonal: "seasonal\.row\.enabled"/, 'The seasonal row answers to its own switch');
assert.match(rowLayoutSource.match(/function IsEnabled\([^]*?end function/)[0], /if id = "seasonal" then return homeRowLayout\.RowToggleOn\(id\)/, 'A layout without the seasonal row leaves it to the switch');
const loadItemsSource = await readFile('components/home/LoadItemsTask.bs', 'utf8');
assert.match(loadItemsSource, /startsWith\("plugindynamic:"\)\s+m\.top\.content = posterLabels\.Attach\(parentalControls\.WithoutUnratedOrBlockedItems\(/, 'Chart rows drop unrated titles once a rating is blocked');
assert.match(loadItemsSource, /startsWith\("seerr_"\)\s+m\.top\.content = parentalControls\.WithoutBlockedItems\(/, 'Seerr rows keep the usual filter');
assert.match(loadItemsSource.match(/function loadSeasonalRow\([^]*?end function/)[0], /WithoutBlockedItems\(owned\)[^]*?WithoutUnratedOrBlockedItems\(suggestions\)/, 'Owned titles keep the usual filter and suggestions the strict one');
assert.match(loadItemsSource.match(/function loadSeasonalRow\([^]*?end function/)[0], /seasonalRow\.ALL_YEAR_SETTING, false\) then params\.allYear = "true"/, 'Show All Year asks the plugin for a row outside the holiday dates');
assert.match(await readFile('components/home/LoadItemsTask.xml', 'utf8'), /<field id="rowKey" type="string"/, 'The row task reports which holiday it loaded');
assert.match(await readFile('components/settings/settings.bs', 'utf8'), /settingName = seasonalRow\.ALL_YEAR_SETTING then m\.homeRowsSwitched = true/, 'Switching Show All Year lays Home out again');
process.stdout.write('PASS: seasonal row wiring (14 checks)\n');

// After Hours opens after seven presses of Version, and every sprite, image and sound it names by
// string ships in the package
const aboutScreen = await readFile('components/settings/settings.bs', 'utf8');
assert.match(aboutScreen, /title: "Version",[^}]*afterHours: true/, 'The Version row in About counts presses toward After Hours');
assert.match(aboutScreen, /if isValid\(selectedItem\.afterHours\)\s+pressVersion\(\)/, 'and OK on it is a press');
const arcadeKit = await readFile('components/afterHours/arcadeKit.bs', 'utf8');
const arcadeArt = [...arcadeKit.match(/function ahArtTable\(\)[^]*?end function/)[0].matchAll(/^\s+(\w+): \[/gm)].map((match) => match[1]);
const arcadeFiles = await Promise.all(['bufferRun.bs', 'fastForward.bs', 'cableCrawl.bs', 'caseStack.bs', 'pixelPurge.bs', 'AfterHours.bs'].map((name) => readFile(`components/afterHours/${name}`, 'utf8')));
const arcadeImages = [arcadeKit, ...arcadeFiles].join('\n').matchAll(/ahImage\([^,]+, "(\w+)",|AH_ART \+ "(\w+)\.webp"/g);
const afterHoursImages = [...arcadeArt, ...[...arcadeImages].map((match) => match[1] ?? match[2]),
    ...['buffer-run', 'fast-forward', 'cable-crawl', 'case-stack', 'pixel-purge'].map((id) => `thumb_${id}`),
    ...['blue', 'purple', 'coral'].map((color) => `marquee_${color}`),
    ...[0, 1, 2].flatMap((tone) => [0, 1, 2, 3, 4, 5].map((seed) => `block${tone}${seed}`)), 'keyframe1', 'keyframe2', 'keyframe3'];
const castSprites = [...(await readFile('source/utils/afterHours.bs', 'utf8')).match(/function Cast\(id as string\)[^]*?end function/)[0].matchAll(/\["(\w+)", "/g)].map((match) => match[1]);
assert.equal(castSprites.length, 31, 'How to play lists every enemy, obstacle and powerup');
for (const name of [...afterHoursImages, ...castSprites]) await access(`images/afterHours/${name}.webp`);
for (const name of castSprites) assert.ok(arcadeArt.includes(name), `${name} is in the sprite table`);
const arcade = await readFile('components/afterHours/AfterHours.bs', 'utf8');
for (const [, name] of arcade.match(/function soundLengths\(\)[^]*?end function/)[0].matchAll(/(\w+): \d+/g)) await access(`sounds/afterHours/${name}.wav`);
await access('sounds/afterHours/menu-loop.mp3');
assert.match(arcade, /const AH_VOICES = 4/, 'After Hours plays four sounds at most, since the firmware refuses a sixth');
assert.match(arcade.match(/sub showMenu\(\)[^]*?end sub/)[0], /warmDemo\(\)/, 'The menu demo starts a couple of seconds into a run');
assert.match(await readFile('bsconfig.json', 'utf8'), /"sounds\/\*\*\/\*\.\*"/, 'The sounds folder ships');
process.stdout.write(`PASS: After Hours wiring (${afterHoursImages.length} images)\n`);

// Watching Now row wiring
assert.match(settingsSyncSource, /\{ pluginKey: "mdblistWatchingNowEnabled", rokuKey: "mdblist\.watchingnow\.enabled", type: "bool" \}/, 'The watching now switch syncs as a bool');
assert.match(settingsSyncSource.match(/function GetRowToggleMappings\([^]*?end function/)[0], /"mdblist_watching_now"/, 'The pulled layout drives the watching now switch');
assert.match(rowLayoutSource, /\{ id: "mdblist_watching_now", label: "Watching on MDBList" \}/, 'The catalogue offers the watching now row');
assert.match(rowLayoutSource, /mdblist_watching_now: "mdblist\.watchingnow\.enabled"/, 'The watching now row answers to its own switch');
assert.match(rowLayoutSource.match(/function IsEnabled\([^]*?end function/)[0], /if id = "mdblist_watching_now" then return homeRowLayout\.RowToggleOn\(id\)/, 'A layout without the watching now row leaves it to the switch');
assert.match(loadItemsSource.match(/function loadWatchingNowRow\([^]*?end function/)[0], /WithoutUnratedOrBlockedItems\(results\)/, 'Watching now row applies unrated and blocked filters');
assert.match(loadItemsSource.match(/function loadWatchingNowRow\([^]*?end function/)[0], /APIRequest\("\/Moonfin\/MdbList\/WatchingNow", \{ profile: "tv" \}\)/, 'Watching now asks with the tv profile');
assert.match(loadItemsSource.match(/function customRowCard\([^]*?end function/)[0], /if not isValidAndNotEmpty\(tmdbId\) and not isValidAndNotEmpty\(imdbId\) then return invalid/, 'Chart titles with only an IMDb id keep their card');
const watchingNowRows = await readFile('components/home/HomeRows.bs', 'utf8');
assert.match(watchingNowRows.match(/sub onWatchingNowRefreshFired\([^]*?end sub/)[0], /kidsMode\.Enabled\(\) or /, 'Kids Mode stops the watching now refresh');
assert.match(watchingNowRows.match(/sub onWatchingNowRefreshFired\([^]*?end sub/)[0], /activeScene\.isSubType\("VideoPlayerView"\) then return/, 'The watching now refresh waits out the video player, as in Core');
assert.match(watchingNowRows.match(/sub updateCustomDynamicRowItems\([^]*?end sub/)[0], /if homeRowIndexById\(rowId\) >= 0 then return/, 'A failed or empty refresh keeps the watching now cards up, as in Core');
assert.match(loadItemsSource.match(/function loadWatchingNowRow\([^]*?end function/)[0], /customRowCard\(item, \{\}\)/, 'Watching now cards are outside titles, as in Core');
assert.match(await readFile('components/home/Home.xml', 'utf8'), /rowTitleComponentName="HomeRowTitle"/, 'Home rows draw their titles with the row title component');
assert.match(await readFile('source/utils/misc.bs', 'utf8'), /if isSeerrFilterRow\(rowId\) or inArray\(\["mdblist_watching_now", "watch_parties", "studios", "audio", "resumeaudio"\], rowId\) then return false/, 'Watching now keeps its wide cards in modern rows, as do Watch Parties, Seerr\'s browse rows, Studios and audio rows');
assert.match((await readFile('components/settings/settings.bs', 'utf8')).match(/sub dismissPanel\([^]*?end sub/)[0], /if m\.homeRowsSwitched = true[^]*?behind\.callFunc\("reload"\)/, 'Closing settings reloads Home after a row is switched on or off');
process.stdout.write('PASS: watching now row wiring (15 checks)\n');

// Home stays loaded behind Settings, so every setting that decides which rows Home builds, or what
// goes in them, has Settings tell Home to build its rows again when it closes
const reloadSettings = await readFile('components/settings/settings.bs', 'utf8');
const quotedNames = (name) => [...homeRowLayoutFile.match(new RegExp(`function ${name}\\([^]*?end function`))[0].matchAll(/"([\w.]+)"/g)].map((match) => match[1]);
const reloadList = quotedNames('ReloadsHome');
const reloadCovered = [...reloadList, ...quotedNames('RowToggles')];
const reloadSettingsTree = JSON.parse(await readFile('settings/settings.json', 'utf8'));
const settingNames = new Set();
const homeRowSections = ['Home Row Toggles', 'IMDb Lists', 'TMDB Lists', 'Seerr Lists', 'Upcoming Calendars'];
const homeRowSettingNames = [];
const sectionsFound = new Set();
(function walk(node) {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    if (node.settingName) settingNames.add(node.settingName);
    if (homeRowSections.includes(node.title) && Array.isArray(node.children)) {
        sectionsFound.add(node.title);
        for (const child of node.children) if (child.settingName) homeRowSettingNames.push(child.settingName);
    }
    Object.values(node).forEach(walk);
})(reloadSettingsTree);
assert.equal(sectionsFound.size, homeRowSections.length, 'Every Home row section is found in settings.json');
for (const name of homeRowSettingNames) assert.ok(reloadCovered.includes(name), `${name} has Home build its rows again`);
for (const name of reloadList) assert.ok(settingNames.has(name), `${name} is a setting in settings.json`);
for (const name of ['onKeyGridSubmit', 'boolSettingChanged', 'applyRadioChoice']) {
    assert.match(reloadSettings.match(new RegExp(`sub ${name}\\([^]*?^end sub`, 'm'))[0], /if homeRowLayout\.ReloadsHome\(selectedSetting\.settingName\) then m\.homeRowsSwitched = true/, `${name} has Home build its rows again for a Home row setting`);
}
assert.match(reloadSettings.match(/sub saveHomeRowLayout\([^]*?end sub/)[0], /m\.homeRowsSwitched = true/, 'Saving the Rows layout has Home build its rows again');
assert.match(reloadSettings.match(/sub dismissPanel\([^]*?end sub/)[0], /commitOpenEditor\(\)[^]*?if m\.homeRowsSwitched = true/, 'The Rows editor is saved before Settings decides whether Home builds its rows again');
// A refresh skips a row that was switched off without taking it away, so Settings over another screen asks for a reload
assert.match(reloadSettings.match(/sub dismissPanel\([^]*?end sub/)[0], /if m\.homeRowsSwitched = true[^]*?behind\.callFunc\("reload"\)\s+else[^]*?m\.global\.homeNeedsReload = true\s+end if/, 'Closing Settings over another screen has Home build its rows again once it shows');
assert.match(await readFile('source/Main.bs', 'utf8'), /homeNeedsReload: false,/, 'The pending Home reload starts off');
const homeShown = (await readFile('components/home/Home.bs', 'utf8')).match(/sub OnScreenShown\([^]*?^end sub/m)[0];
assert.match(homeShown, /needsRowReload = chainLookupReturn\(m\.global, "homeNeedsReload", false\)\s+if needsRowReload then m\.global\.homeNeedsReload = false\s+if not m\.isFirstRun/, 'Home clears the pending reload when it shows, first run included');
assert.match(homeShown, /if needsRowReload[^]*?reload\(\)\s+else if not _isReturning or needsPlaybackRefresh\s+refresh\(\)/, 'Home builds its rows from scratch for the pending reload instead of refreshing them');
process.stdout.write(`PASS: Home reload settings wiring (${homeRowSettingNames.length + reloadList.length + 10} checks)\n`);

// A picked collection row asks for its members alone, follows a stored Playlist Order and opens
// a series into its episodes in order when asked
assert.match(loadItemsSource.match(/function loadPickedRow\([^]*?end function/)[0], /else if isStringEqual\(picked\.source, "collections"\)\s+params\.ParentId = itemId\s+items = collectionRowItems\(params, settings\)/, 'A collection is asked for its members without Recursive');
assert.match(loadItemsSource.match(/function collectionRowItems\([^]*?end function/)[0], /\/Moonfin\/Collections\/\$\{params\.ParentId\}\/Order[^]*?Recursive: true,\s+Limit: FLAT_COLLECTION_LIMIT/, 'A stored order reads the collection flat');
assert.match(loadItemsSource.match(/function expandSeriesToEpisodes\([^]*?end function/)[0], /SortBy: "ParentIndexNumber,IndexNumber",\s+SortOrder: "Ascending"/, 'A series opens into its episodes in order');
assert.match(await readFile('settings/settings.json', 'utf8'), /"settingName": "ui\.home\.collectionsRowSortBy"[^]*?"id": "playlistOrder"/, 'Playlist Order is offered for the collection rows');
process.stdout.write('PASS: collection row wiring (4 checks)\n');

// The Collections and Audio rows take their sort and sort order from Row Options, or from another client
const rowSortSettings = JSON.parse(await readFile('settings/settings.json', 'utf8'));
const rowSortSetting = (name) => {
    let found;
    (function walk(node) {
        if (found || !node || typeof node !== 'object') return;
        if (node.settingName === name) found = node;
        else Object.values(node).forEach(walk);
    })(rowSortSettings);
    return found;
};
const optionIds = (name) => rowSortSetting(name).options.map((option) => option.id).join(',');
assert.equal(rowSortSetting('ui.home.collectionsRowSortOrder').default, 'ascending', 'Collections stay ascending until another order is picked');
assert.equal(optionIds('ui.home.collectionsRowSortOrder'), 'ascending,descending', 'Collections offer both orders under the names the plugin syncs');
assert.equal(rowSortSetting('ui.home.audioRowsSortBy').default, 'name', 'Audio goes by name until another sort is picked, like Core');
assert.equal(optionIds('ui.home.audioRowsSortBy'), 'name,dateAdded,premiereDate,runtime,random', 'Audio offers the sorts Core offers, under the names the plugin syncs');
assert.equal(rowSortSetting('ui.home.audioRowsSortOrder').default, 'ascending', 'Audio goes ascending until another order is picked, like Core');
assert.equal(optionIds('ui.home.audioRowsSortOrder'), 'ascending,descending', 'Audio offers both orders');
const rowOptionGroups = (await readFile('components/settings/settings.bs', 'utf8'));
assert.match(rowOptionGroups, /title: "AUDIO", settings: takeSettings\(configTree, \["ui\.home\.displayAudioRows", "ui\.home\.audioRowsSortBy", "ui\.home\.audioRowsSortOrder"\]\)/, 'The audio sort settings sit under the Audio row in Row Options');
assert.match(rowOptionGroups, /title: "COLLECTIONS", settings: takeSettings\(configTree, \["ui\.home\.displayCollectionsRows", "ui\.home\.collectionsRowSortBy", "ui\.home\.collectionsRowSortOrder",/, 'The Collections sort order sits under its sort in Row Options');
for (const [pluginKey, rokuKey] of [['collectionsRowSortOrder', 'ui.home.collectionsRowSortOrder'], ['audioRowsSortBy', 'ui.home.audioRowsSortBy'], ['audioRowsSortOrder', 'ui.home.audioRowsSortOrder']]) {
    assert.ok(settingsSyncSource.includes(`{ pluginKey: "${pluginKey}", rokuKey: "${rokuKey}", type: "direct" }`), `${rokuKey} syncs with the plugin as ${pluginKey}`);
}
assert.match(loadItemsSource.match(/function collectionRowItems\([^]*?end function/)[0], /params\.SortBy = rowSortByParam\(sortBy\)\s+params\.SortOrder = rowSortOrderParam\(getStringSetting\(settings, "ui\.home\.collectionsRowSortOrder", "ascending"\)\)/, 'A collection row is asked for in its sort order, and a stored Playlist Order is left as stored');
assert.match(loadItemsSource.match(/function loadCollections\([^]*?end function/)[0], /SortOrder: rowSortOrderParam\(getStringSetting\(settings, "ui\.home\.collectionsRowSortOrder", "ascending"\)\)/, 'The Collections row is asked for in its sort order');
const audioRow = loadItemsSource.match(/function loadAudio\(\)[^]*?end function/)[0];
assert.match(audioRow, /SortBy: rowSortByParam\(getStringSetting\(settings, "ui\.home\.audioRowsSortBy", "name"\)\)/, 'The Audio row is asked for in its sort');
assert.match(audioRow, /DateCreated,PremiereDate,SortName",/, 'The Audio row asks for what a list joined from several libraries is sorted on');
assert.match(loadItemsSource.match(/function loadCollections\([^]*?end function/)[0], /DateCreated,PremiereDate,SortName",/, 'So does the Collections row');
assert.match(audioRow, /SortOrder: rowSortOrderParam\(getStringSetting\(settings, "ui\.home\.audioRowsSortOrder", "ascending"\)\)/, 'The Audio row is asked for in its sort order');
process.stdout.write('PASS: Collections and Audio row sort settings wiring (17 checks)\n');

// Chart rows match their titles against the library, by provider id on Emby and through a paged
// index of the library's ids on Jellyfin, and a TMDB chart types its titles from its path
assert.match(loadItemsSource.match(/function matchOnEmby\([^]*?end function/)[0], /IncludeItemTypes: "Movie,Series",\s+AnyProviderIdEquals:/, 'Emby filters by provider id on the server');
assert.match(loadItemsSource.match(/function readLibraryIndex\([^]*?end function/)[0], /StartIndex: start,\s+Limit: LIBRARY_INDEX_PAGE[^]*?pageFull = data\.Items\.Count\(\) = LIBRARY_INDEX_PAGE/, 'Jellyfin reads the library a page at a time until a page comes back short');
assert.match(loadItemsSource.match(/function customRowCard\([^]*?end function/)[0], /for each key in providerKeys\(item\)\s+if owned\.DoesExist\(key\)/, 'An owned chart title becomes its library card');
assert.match(loadItemsSource, /if source = "tmdb_chart" then rowType = externalList\.ChartItemType\(chartType\)/, 'A TMDB chart types its titles from the path');
assert.match(loadItemsSource.match(/function loadCustomDynamicList\([^]*?end function/)[0], /APIRequest\("\/Moonfin\/CustomRows\/Items", externalList\.Localized\(/, 'A custom row asks for the device language');
assert.match(await readFile('components/home/MediaBarTask.bs', 'utf8'), /APIRequest\("\/Moonfin\/CustomRows\/Items", externalList\.Localized\(query\)\)/, 'An outside list on the media bar asks for it too');
process.stdout.write('PASS: external rows wiring (6 checks)\n');

// Library lists keep each server's order and leave out what an Emby user hid from My Media
assert.match(await readFile('components/tasks/MultiServerTask.bs', 'utf8'), /itemsArray = withoutHiddenViews\(itemsArray, embyHiddenViews\(userSession\)\)/, 'Multi-server views drop the libraries an Emby user hid');
for (const nav of ['components/Sidebar.bs', 'components/JFOverhang.bs']) {
    const navSource = await readFile(nav, 'utf8');
    assert.match(navSource, /for each lib in librariesByServer\(allLibs\)/, `${nav} keeps each server's library order`);
    assert.doesNotMatch(navSource, /sortLibrariesAlphabetically/, `${nav} no longer sorts libraries A to Z`);
}
assert.match(await readFile('components/Sidebar.bs', 'utf8'), /if isEmbyServer\(\) then views = withoutHiddenViews\(views, chainLookupReturn\(m\.global, "session\.user\.configuration\.MyMediaExcludes", \[\]\)\)/, 'The nav list drops the libraries an Emby user hid');
process.stdout.write('PASS: library order wiring (6 checks)\n');

// A list joined from several servers is sorted again, with each server asked for the values it sorts on
const multiServerTaskSource = await readFile('components/tasks/MultiServerTask.bs', 'utf8');
assert.match(multiServerTaskSource, /sortsJoinedList = sessions\.count\(\) > 1 and LCase\(endpoint\) = "\/items"/, 'Only a list joined from several servers on the route that sorts by SortBy is sorted again');
assert.match(multiServerTaskSource, /params = withProviderIds\(params\)\s+if sortsJoinedList then params = withSortFields\(params\)/, 'A list that is sorted again asks for the values it is sorted by');
assert.match(multiServerTaskSource, /if sortsJoinedList then results = libraryScope\.Sorted\(results, params\)/, 'A list joined from several servers is sorted again');
process.stdout.write('PASS: multi-server sort wiring (3 checks)\n');

// Deleting or moving a playlist row names its entry id, which Emby keeps apart from the item's id
assert.match(await readFile('source/api/Items.bs', 'utf8'), /tmp\.playlistItemId = \(item\.LookupCI\("PlaylistItemId"\) \?\? ""\)\.ToStr\(\)/, 'Each playlist row keeps its entry id');
const itemMenuTask = await readFile('components/itemMenu/ItemMenuTask.bs', 'utf8');
assert.match(itemMenuTask, /taskRequest\(`Playlists\/\$\{request\.playlistId\}\/Items`, \{ EntryIds: request\.entryId \}\), "DELETE"\)/, 'The row menu deletes by entry id');
assert.match(itemMenuTask, /taskRequest\(`Playlists\/\$\{request\.playlistId\}\/Items\/\$\{request\.entryId\}\/Move\/\$\{request\.newIndex\.toStr\(\)\}`, \{\}\), "POST"\)/, 'The move names the entry id and where it goes');
const itemMenuHostSource = await readFile('components/itemMenu/itemMenuHost.bs', 'utf8');
assert.match(itemMenuHostSource.match(/sub itemMenuChangePlaylist\([^]*?end sub/)[0], /rows\.removeChildIndex\(from\)[^]*?m\.top\.callFunc\("playlistRowsChanged", target\)[^]*?runItemMenuTask/, 'The row goes before the server answers');
assert.match(itemMenuHostSource.match(/sub onItemMenuPlaylistChanged\([^]*?end sub/)[0], /rows\.insertChild\(row, request\.from\)/, 'And comes back if the server refuses');
assert.match(mainActions, /APIRequest\(`\/Playlists\/\$\{playlistID\}\/Items`, \{ EntryIds: entryID \}\)[^]*?requestResponse\(req, "DELETE"\)/, 'The delete names the entry id');
assert.match(mainActions.match(/sub removeItemFromMyList\([^]*?end sub/)[0], /MainAction\.removeItemFromPlaylist\(playlistID, MainAction\.playlistEntryId\(playlistID, itemID\)\)/, 'My List takes a title out by its entry id too');
const playlistViewHost = await readFile('components/music/playlistViewHost.bs', 'utf8');
assert.match(playlistViewHost.match(/function playlistViewRows\([^]*?end function/)[0], /m\.top\.activeTracks = shownRows\s+return shownRows/, 'A playlist screen shows the rows playback reads');
assert.match(await readFile('components/music/PlaylistDetails.bs', 'utf8'), /m\.itemList\.content = playlistViewRows\(rows\)/, 'The classic playlist screen lists them');
assert.match(await readFile('components/details/ModernItemDetails.bs', 'utf8'), /m\.trackGrid\.content = playlistViewRows\(m\.musicList\)/, 'So does the modern one');
assert.match(await readFile('components/details/SpotlightItemDetails.bs', 'utf8'), /shown = playlistViewRows\(rows\)\.getChildren\(-1, 0\)/, 'And Spotlight');
for (const screen of ['components/music/PlaylistDetails.xml', 'components/details/ModernItemDetails.xml', 'components/details/SpotlightItemDetails.xml']) {
    const xml = await readFile(screen, 'utf8');
    assert.match(xml, /<function name="playlistRowsChanged" \/>/, `${screen} redraws its rows after the menu changes them`);
    assert.match(xml, /<field id="activeTracks" type="node" \/>/, `${screen} hands playback the rows it shows`);
}
process.stdout.write('PASS: playlist row wiring (17 checks)\n');

// A playlist's sort and filters reach what plays, the menu and the request that feeds them
const mainEventHandlers = await readFile('source/MainEventHandlers.bs', 'utf8');
for (const handler of ['onPlaylistItemSelectedEvent', 'onPlaylistPlayAllEvent', 'onPlaylistShuffleEvent']) {
    assert.match(mainEventHandlers.match(new RegExp(`sub ${handler}\\([^]*?end sub`))[0], /tracksNode = screenContent\.activeTracks \?\? screenContent\.listData/, `${handler} plays the rows that show`);
}
assert.match(await readFile('source/api/Items.bs', 'utf8'), /"Fields": "DateCreated,SortName"/, 'The playlist rows carry what Date Added and Name sort by');
assert.match(playlistViewHost.match(/function playlistViewRowOptions\([^]*?end function/)[0], /if not playlistViewInOrder\(\)\s+options\.playlist\.first = true\s+options\.playlist\.last = true/, 'A row only moves where the playlist order shows');
assert.match(playlistViewHost.match(/sub playlistViewRedraw\([^]*?end sub/)[0], /"moreActionsButton" then moreIndex = i\s+end for\s+if index < 0 then index = moreIndex/, 'A redraw goes back to More Actions when the button sits behind it');
assert.match(await readFile('components/itemMenu/itemMenuDetailHost.bs', 'utf8'), /playlistViewRowMarked\(action, card, menuJson\)/, 'A row the menu marks keeps the change for the filters');
for (const screen of ['components/details/ModernItemDetails.bs', 'components/details/SpotlightItemDetails.bs']) {
    assert.match(await readFile(screen, 'utf8'), /sub handleScreenButtonAction\(action as string\)\s+if playlistViewAction\(action\) then return/, `${screen} hands a playlist's buttons to the shared actions`);
}
process.stdout.write('PASS: playlist sort and filter wiring (9 checks)\n');

// Unlock notifications only run against a plugin that serves them, read in the background for as
// long as the account is signed in, and follow the switch on the achievements screen straight away
const achievementsApi = await readFile('source/api/Achievements.bs', 'utf8');
assert.match(achievementsApi.match(/function Probe\([^]*?end function/)[0], /features = GetMap\("admin\/ui-features"\)[^]*?unlockToastsEnabled: isValid\(features\) and/, 'Unlock notifications are only on when the plugin says it serves them');
const readUnlocks = achievementsApi.match(/function ReadUnlocks\([^]*?end function/)[0];
assert.match(readUnlocks, /if not toastSettings\.enabled\s+' [^\n]*\s+state\.cursor = ""\s+return invalid/, 'Switched off, nothing is read and the cursor starts again');
assert.match(readUnlocks, /if now <> "" then state\.cursor = now\s+if cursor = "" then return invalid/, 'The first read only records the server clock');
assert.match(achievementsApi.match(/function SaveUnlockToasts\([^]*?end function/)[0], /preferences = GetMap\([^]*?preferences\.AddReplace\("EnableUnlockToasts", enabled\)\s+written = Post\(`users\/\$\{userId\}\/preferences`, 400, preferences\)/, 'The switch writes over a fresh copy of the preferences');
const mainSource = await readFile('source/Main.bs', 'utf8');
assert.match(mainSource, /app_start:\s+stopAchievementsPoll\(\)/, 'The reads stop on the way out of an account');
assert.match(mainSource, /startServerMessages\(\)\s+startAchievementsPoll\(\)/, 'And start once the next one is in');
assert.match(mainSource.match(/sub onAchievementUnlocks\([^]*?end sub/)[0], /if unlocks\.muteDuringPlayback and isVideoPlaying\(\) then return/, 'Unlocks are held back during playback when the user asked');
const pollTask = await readFile('components/achievements/AchievementsPollTask.bs', 'utf8');
assert.match(pollTask, /m\.global\.observeFieldScoped\("unlockToastSettings", port\)[^]*?achievements\.AdoptUnlockSettings\(unlockState, msg\.getData\(\)\)/, 'The reads take the settings the switch saved');
assert.match(await readFile('components/achievements/AchievementsScreen.bs', 'utf8'), /m\.global\.unlockToastSettings = result\.settings/, 'The switch hands its saved settings over');
assert.match(await readFile('components/BaseScene.xml', 'utf8'), /<NotificationBanner id="notificationBanner" \/>/, 'The banner sits on the scene');
await access('images/achievements/notifications_active.webp');
process.stdout.write('PASS: achievement unlock wiring (11 checks)\n');

// Friends and chat ride the same reads as the unlocks, every 30 seconds or every 10 with a chat
// open, and only where the plugin has them switched on
assert.match(achievementsApi.match(/function Probe\([^]*?end function/)[0], /friendsEnabled: achievementsModel\.Field\(config, "FriendsEnabled"\) <> false/, 'The probe reads whether friends are on');
assert.match(achievementsApi.match(/function Post\([^]*?end function/)[0], /method = "POST" as string\) as object[^]*?req\.SetRequest\(method\)/, 'Writes can delete and patch as well as post');
assert.match(achievementsApi.match(/function Social\([^]*?end function/)[0], /written = Post\(`users\/\$\{userId\}\/\$\{path\}`, 429, sent, method\)/, 'The rate limit reads as a refusal with its own wording');
assert.match(achievementsApi.match(/function FetchServerUsers\([^]*?end function/)[0], /directory = Request\(`users\/\$\{userId\}\/directory`\)[^]*?ParseSocialUsers\(getJson\(APIRequest\("\/Users"\)\)\)/, 'People come from the plugin directory, falling back to /Users');
assert.match(achievementsApi.match(/function FetchAttachment\([^]*?end function/)[0], /req\.GetToFile\(path\) <> 200/, 'A photo is saved to a file with the token on the request');
assert.match(achievementsApi.match(/function SaveSocialPrivacy\([^]*?end function/)[0], /preferences = GetMap\([^]*?ApplySocialPrivacy\(preferences, privacy\)/, 'Privacy writes over a fresh copy of the preferences');
assert.match(pollTask, /if socialOn then readSocial\(\)/, 'The friends and chats are read with the unlocks');
assert.match(pollTask.match(/sub readSocial\([^]*?end sub/)[0], /m\.global\.social = \{[^}]*\}\s+if incoming\.count\(\) > 0 then m\.top\.incoming = incoming/, 'What the read found is shared and new messages are passed on');
assert.match(mainSource.match(/sub onChatMessages\([^]*?end sub/)[0], /get_user_setting_bool\("friends\.muteChatBanners", true\) and isVideoPlaying\(\) then return/, 'Chat banners are held back during playback unless the user turned that off');
const friendsXml = await readFile('components/friends/FriendsScreen.xml', 'utf8');
assert.match(friendsXml, /<Timer id="chatTimer" duration="10" repeat="true" \/>/, 'An open chat asks for new messages every 10 seconds');
const friendsScreen = await readFile('components/friends/FriendsScreen.bs', 'utf8');
assert.match(friendsScreen.match(/sub leaveView\([^]*?end sub/)[0], /m\.chatTimer\.control = "stop"\s+requestSocial\(\{ kind: "openConversation", conversationId: "" \}\)/, 'Leaving a chat stops its reads and lets its banners through again');
for (const nav of ['components/JFOverhang.bs', 'components/Sidebar.bs']) {
    const navSource = await readFile(nav, 'utf8');
    assert.match(navSource, /if not kids and m\.friendsButtonEnabled and socialAvailable\(\) then m\.navItems\.push\(m\.friendsItem\)/, `${nav} shows the Friends button only where it can open`);
    assert.match(navSource, /else if item\.id = "friends"\s+m\.global\.sceneManager\.callFunc\("friends"\)/, `${nav} opens friends from the button`);
}
const settingsSource = await readFile('components/settings/settings.bs', 'utf8');
assert.match(settingsSource, /if requirement = "social" then return achievements\.SocialAvailable\(\)/, 'The friends settings only show where friends are on');
assert.match(await readFile('settings/settings.json', 'utf8'), /"settingName": "navbar\.show_friends",[^}]*"requires": "social"/, 'The Friends button setting follows them');
await access('images/icons/friends.webp');
const glyphTable = await readFile('source/utils/settingsGlyphs.bs', 'utf8');
const glyphNames = [...glyphTable.matchAll(/^\s+"([a-z0-9_]+)":\s+&h[0-9A-F]+/gm)].map(match => match[1]);
assert.ok(glyphNames.includes((await readFile('settings/settings.json', 'utf8')).match(/"settingName": "navbar\.show_friends",\s+"glyph": "([a-z0-9_]+)"/)[1]), 'The Friends button setting draws its glyph');
process.stdout.write('PASS: friends and chat wiring (19 checks)\n');
assert.match(settingsSource, /if requirement = "liveTv" then return libraryOrder\.HasLiveTv\(libraryOrder\.Loaded\(\)\)/, 'The Live TV button setting goes by the libraries the bar loaded');
assert.match(await readFile('settings/settings.json', 'utf8'), /"settingName": "navbar\.show_livetv",[^}]*"requires": "liveTv"/, 'and only shows where one of them is Live TV');
process.stdout.write('PASS: Live TV button setting (2 checks)\n');

// The seasonal effects sync under Core's names, run only while home is on screen, and draw
// from images that all ship with the app
assert.match(settingsSyncSource, /\{ pluginKey: "seasonalSurprise", rokuKey: "seasonal\.surprise", type: "seasonalEffect" \}/, 'The seasonal effect syncs under Core\'s name');
assert.match(settingsSyncSource, /\{ pluginKey: "seasonalDensity", rokuKey: "seasonal\.density", type: "seasonalDensity" \}/, 'The density syncs under Core\'s name');
const homeSource = await readFile('components/home/Home.bs', 'utf8');
assert.match(homeSource.match(/sub OnScreenShown\([^]*?end sub/)[0], /m\.seasonalEffects\.callFunc\("play"\)/, 'The effect runs while home is shown');
assert.match(homeSource.match(/sub OnScreenHidden\([^]*?end sub/)[0], /m\.seasonalEffects\.callFunc\("halt"\)/, 'The effect holds still while home is covered');
assert.match(await readFile('components/home/Home.xml', 'utf8'), /<SeasonalEffects id="seasonalEffects" \/>\s*<\/children>/, 'The effect draws over everything on the home screen');
const settingsTree = JSON.parse(await readFile('settings/settings.json', 'utf8'));
const findSetting = (nodes, name) => {
    for (const node of nodes) {
        if (node.settingName === name) return node;
        const found = node.children && findSetting(node.children, name);
        if (found) return found;
    }
    return null;
};
const effectsSource = await readFile('source/utils/seasonalEffects.bs', 'utf8');
const listed = (name) => [...effectsSource.match(new RegExp(`function ${name}\\(\\) as object\\s+return \\[([^\\]]*)\\]`))[1].matchAll(/"([^"]+)"/g)].map(match => match[1]);
assert.deepEqual(findSetting(settingsTree, 'seasonal.surprise').options.map(option => option.id).sort(), listed('Effects').sort(), 'The setting offers every effect');
assert.deepEqual(findSetting(settingsTree, 'seasonal.density').options.map(option => option.id), listed('Densities'), 'The setting offers every density');
const palette = (name) => [...effectsSource.match(new RegExp(`${name}: \\[("#[^\\]]*)\\]`))[1].matchAll(/"#([0-9a-f]{6})"/g)].map(match => match[1]);
const followerSource = await readFile('components/seasonal/SeasonalFollower.bs', 'utf8');
const followerArt = [...new Set([...followerSource.matchAll(/"(follower-[A-Za-z-]+)"/g)].map(match => match[1]))];
const artwork = ['dot', 'flake', 'leaf', 'leaf-mirror', 'disc', 'glow', 'spark', 'rocket', 'star', 'bat', 'blossom', 'candy', 'bee', 'ghost', 'heart', 'egg', 'lantern',
    ...followerArt, ...palette('petals').map(color => `petal-${color}`), ...palette('baubles').map(color => `bauble-${color}`)];
assert.deepEqual((await readdir('images/seasonal')).sort(), artwork.map(name => `${name}.webp`).sort(), 'Every seasonal image the effects and followers name ships, and nothing else');
const followerStyles = followerSource.match(/function followerStyles\(\) as object\s+return \{([^]*?)\n    \}/)[1];
const effectFollowers = effectsSource.match(/function FollowerStyles\(effect as string\) as object\s+styles = \{([^]*?)\n        \}/)[1];
for (const [, style] of effectFollowers.matchAll(/"(\w+)"/g)) {
    assert.match(followerStyles, new RegExp(`^\\s+${style}: \\{`, 'm'), `The ${style} follower is drawn`);
}
assert.ok(glyphNames.includes(findSetting(settingsTree, 'seasonal.surprise').glyph), 'The seasonal effect draws its glyph');
assert.ok(glyphNames.includes(findSetting(settingsTree, 'seasonal.density').glyph), 'The density draws its glyph');
process.stdout.write('PASS: seasonal effects wiring (12 checks)\n');

// The effect previews over Home while its own rows have focus and goes with them, the follower lands on
// Home's focused card while its switch has focus, and only one effect runs at a time since Home's stops
// under Settings
for (const key of ['seasonal.surprise', 'seasonal.density', 'seasonal.follower']) assert.ok(previewTable.includes(`"${key}": "home"`), `${key} shows on the Home preview`);
const effectPreview = await readFile('components/settings/SettingsLivePreview.bs', 'utf8');
assert.match(effectPreview, /inArray\(\["seasonal\.surprise", "seasonal\.density"\], state\.focusedSetting\)/, 'The effect only runs while one of its rows has focus');
assert.match(effectPreview, /m\.effect\.callFunc\("halt"\)\s+m\.effect = invalid\s+end if\s+m\.holder\.removeChildrenIndex/, 'The preview stops its effect before it takes it away');
const effectRunner = await readFile('components/seasonal/SeasonalEffects.bs', 'utf8');
assert.match(effectRunner.match(/sub preview\([^]*?end sub/)[0], /unobserveFieldScoped\("overlaySettingsChanged"\)[^]*?runEffect\(effect, density, tried\.follow = true and isValid\(tried\.target\)\)/, 'The preview effect stops listening for saves and builds followers only where it\'s told they land');
assert.match(homeSource.match(/sub onSettingsOpen\([^]*?end sub/)[0], /settingsOpen = true\s+m\.seasonalEffects\.callFunc\("halt"\)[^]*?isSameNode\(m\.top\) then m\.seasonalEffects\.callFunc\("play"\)/, "Home's effect stops under Settings and comes back once it closes over Home");
// The stage's frame shows only along its edges, so it's clipped to bands there rather than redrawn over the whole stage on every frame of an effect
assert.doesNotMatch(await readFile('components/settings/SettingsLivePreview.xml', 'utf8'), /stage24/, 'No stage frame image spans the whole stage');
assert.match(effectPreview, /clip\.clippingRect = band[^]*?stage24cover[^]*?stage24s2/, 'The stage corners and line are drawn in clipped bands');
// The preview's particles hold still while the remote is in use, through the same hold home uses on a low end device
assert.match(effectRunner.match(/sub preview\([^]*?end sub/)[0], /m\.holdsOnAnyTier = true/, 'The preview effect holds on any device');
assert.match(effectRunner.match(/sub hold\([^]*?end sub/)[0], /m\.tier <> "low" and not m\.holdsOnAnyTier/, 'Through the one hold home uses');
assert.match(effectPreview.match(/sub redraw\([^]*?end sub/)[0], /m\.effect\.callFunc\("hold"\)/, 'Every change on the remote holds the preview effect');
process.stdout.write('PASS: seasonal effect preview (12 checks)\n');

// Sync follows the profile picked on this device, which stays local, and the panel that picks it
// loads, saves and resets on a task
const syncSource = await readFile('source/utils/settingsSync.bs', 'utf8');
const syncFunction = (name) => syncSource.match(new RegExp(`^    (?:function|sub) ${name}\\([^]*?^    end (?:function|sub)`, 'm'))[0];
assert.match(syncFunction('PullFromServer'), /FetchResolvedProfile\(settingsSync\.ActiveProfile\(\)\)/, 'A pull reads the profile in use');
assert.doesNotMatch(syncSource, /Settings\/(?:Profile|Resolved)\/tv/, 'No route names the TV profile outright');
assert.match(syncFunction('ProfileBody'), /FormatJson\(\{ "profile": profileData, "clientId": "roku" \}\)/, 'The push body keeps its keys\' case on the device');
assert.doesNotMatch(syncFunction('GetMappings'), /plugin\.syncProfile/, 'The picked profile never syncs');
assert.match(syncSource, /pluginKey: "tmdbApiKey"[^}]*receiveOnly: true/, 'The TMDB key is never saved back or reset');
assert.match(syncFunction('FullProfile'), /profileData\["seerrRows"\][^]*profileData\["homeSections"\][^]*profileData\["homeRowOrder"\]/, 'A save carries the Seerr rows and the whole home layout');
const syncTask = await readFile('components/settings/SettingsSyncTask.bs', 'utf8');
for (const name of ['loadProfile', 'saveProfile', 'resetProfile']) assert.match(syncTask, new RegExp(`^sub ${name}\\(\\)`, 'm'), `The task can ${name}`);
assert.match(syncTask.match(/sub resetProfile\([^]*?end sub/)[0], /DeleteProfile[^]*RestoreLocalDefaults\(\)\s+settingsSync\.PullFromServer\(\)/, 'A reset clears the server, then this device, then reads the profile again');
assert.match(settingsSource, /selectedItem\.settingName = "plugin\.syncProfiles"\s+showSettingsSyncPanel\(\)/, 'The sync entry opens the panel');
assert.match(settingsSource, /takeSettings\(configTree, \["plugin\.enabled", "plugin\.syncProfiles"\]\)\s+'[^\n]*\s+takeSettingByName\(configTree, "plugin\.settingsSync"\)/, 'Settings Sync lists the plugin switch and the panel, and the sync switch stays out of the list');
const syncEntry = findSetting(settingsTree, 'plugin.syncProfiles');
assert.equal(syncEntry.type, '', 'The sync entry opens a panel rather than holding a value');
assert.equal(findSetting(settingsTree, 'plugin.settingsSync').default, 'true', 'The sync switch keeps its default');
for (const glyph of ['extension', 'public', 'desktop_windows', 'phone_iphone', 'tv', 'cloud_download', 'cloud_upload', 'restart_alt']) {
    assert.ok(glyphNames.includes(glyph), `The sync panel draws ${glyph}`);
}
assert.match(syncFunction('GetMappings'), /\{ pluginKey: "libraryStyle", rokuKey: "ui\.library\.style", type: "direct" \}/, 'The library style syncs under Core\'s name');
assert.match(syncFunction('GetMappings'), /\{ pluginKey: "musicLibraryStyle", rokuKey: "ui\.library\.musicStyle", type: "direct" \}/, 'The music library style syncs under the profile\'s name');
const musicStyle = findSetting(settingsTree, 'ui.library.musicStyle');
assert.equal(musicStyle.default, 'immersive', 'Immersive is the music library default');
assert.deepEqual(musicStyle.options.map(option => option.id), ['classic', 'quickAccess', 'immersive'], 'The music styles keep the values the profile stores');
assert.match(syncFunction('GetMappings'), /\{ pluginKey: "keyboardStyle", rokuKey: "ui\.keyboard\.style", type: "keyboardStyle" \}/, 'The keyboard style syncs under the profile\'s name');
const keyboardStyle = findSetting(settingsTree, 'ui.keyboard.style');
assert.equal(keyboardStyle.default, 'docked', 'Docked is the keyboard default');
const keyboardSource = await readFile('components/keyboards/TVKeyboard.bs', 'utf8');
assert.match(keyboardSource, /settingOr\(KB_STYLE_SETTING, "docked"\)/, 'The keyboard falls back to the default the setting shows');
assert.match(keyboardSource, /if entry = "IME"\s+openStylePicker\(\)/, 'The keyboard key opens the style picker');
assert.match(keyboardSource, /if m\.pickingStyle\s+pickStyle\(value\)/, 'Picking a style saves it and switches the keyboard');
assert.deepEqual(keyboardStyle.options.map(option => option.id), ['native', 'classic', 'glass', 'docked'], 'The keyboard styles keep the values the profile stores');
assert.match(settingsSource, /input = takeSettings\(configTree, \["ui\.keyboard\.style"\]\)[^]*generalChildren\.push\(settingsSection\("Input"\)\)\s+generalChildren\.Append\(input\)/, 'Keyboard Style sits under General > Input');
assert.match(syncFunction('GetMappings'), /\{ pluginKey: "dateFormat", rokuKey: "ui\.dateFormat", type: "dateFormat" \}/, 'The date format syncs under the profile\'s name');
const dateFormat = findSetting(settingsTree, 'ui.dateFormat');
assert.equal(dateFormat.default, 'system', 'Locale Default is the date format default');
assert.deepEqual(dateFormat.options.map(option => option.id), ['system', 'monthDay', 'dayMonth'], 'The date formats keep the values the profile stores');
assert.match(settingsSource, /clock = takeSettings\(configTree, \["ui\.showClock", "playback\.use24hourclock", "ui\.dateFormat"\]\)/, 'Date Format sits with the clock settings');
const styleStrings = await readFile('locale/en_US/translations.ts', 'utf8');
for (const name of ['Video Library Style', 'Docked', 'Show', 'Display', 'Music Library Style', 'Quick Access', 'Immersive', 'Keyboard Style', 'Native', 'Classic', 'Glass', 'Input']) assert.match(styleStrings, new RegExp(`<source>${name}</source>`), `${name} is translated`);
for (const name of ['Date Format', 'Locale Default', 'Month / Day (Nov 10)', 'Day / Month (10 Nov)']) assert.ok(styleStrings.includes(`<source>${name}</source>`), `${name} is translated`);
process.stdout.write('PASS: settings sync profiles (53 checks)\n');

// Every glyph a setting names is in the icon font, and the font and its table cover the same characters
const settingsJsonText = await readFile('settings/settings.json', 'utf8');
assert.doesNotMatch(settingsJsonText, /"icon": "[^"]*\.png"/, 'No setting still points at an icon image');
const namedGlyphs = new Set([...settingsJsonText.matchAll(/"glyph": "([a-z0-9_]+)"/g)].map(match => match[1]));
for (const glyph of namedGlyphs) assert.ok(glyphNames.includes(glyph), `The icon font has ${glyph}`);
const aboutGlyphs = [...settingsSource.matchAll(/aboutLink\(\{[^}]*glyph: "([a-z0-9_]+)"/g)].map(match => match[1]);
assert.ok(aboutGlyphs.length > 0, 'About lists its links');
for (const glyph of aboutGlyphs) assert.ok(glyphNames.includes(glyph), `The About link draws ${glyph}`);
const iconFont = await readFile('fonts/SettingsIcons.ttf');
const tableCount = iconFont.readUInt16BE(4);
let fontCodes = 0;
for (let i = 0; i < tableCount; i++) {
    const record = 12 + i * 16;
    if (iconFont.toString('latin1', record, record + 4) === 'OS/2') {
        const os2 = iconFont.readUInt32BE(record + 8);
        fontCodes = iconFont.readUInt16BE(os2 + 66) - iconFont.readUInt16BE(os2 + 64) + 1;
    }
}
assert.equal(fontCodes, glyphNames.length, 'The glyph table and the icon font cover the same characters');
const iconGlyphs = new Set([...(await readFile('source/utils/settingsIcons.bs', 'utf8')).matchAll(/(?::|\?\?)\s*"([a-z0-9_]+)"/g)].map(match => match[1]));
for (const glyph of iconGlyphs) assert.ok(glyphNames.includes(glyph), `The icon font has ${glyph}, fallbacks included`);
process.stdout.write(`PASS: settings glyphs (${namedGlyphs.size + aboutGlyphs.length + iconGlyphs.size + 3} checks)\n`);

// Show Libraries Individually syncs, shows only with the libraries button on, and puts the same
// library list in the nav with each button holding its own library
const listHolding = (nodes, name) => nodes.some(item => item.settingName === name) ? nodes : nodes.map(node => node.children && listHolding(node.children, name)).find(Boolean);
const navChildren = listHolding(settingsTree, 'navbar.show_libraries');
const librariesAt = navChildren.findIndex(item => item.settingName === 'navbar.show_libraries');
const individually = navChildren[librariesAt + 1];
assert.equal(individually.settingName, 'navbar.show_libraries_individually', 'The switch sits right after Show Libraries in Toolbar');
assert.deepEqual([individually.default, individually.glyph, individually.requires], ['false', navChildren[librariesAt].glyph, 'setting:navbar.show_libraries'], 'It starts off, shares the icon and only shows with the libraries button on');
assert.match(syncFunction('GetMappings'), /\{ pluginKey: "showLibrariesIndividually", rokuKey: "navbar\.show_libraries_individually", type: "bool" \}/, 'It syncs under the profile\'s name');
const navStrings = await readFile('locale/en_US/translations.ts', 'utf8');
for (const text of [individually.title, individually.description]) assert.ok(navStrings.includes(`<source>${text}</source>`), `${text} is translated`);
for (const nav of ['components/Sidebar.bs', 'components/JFOverhang.bs']) {
    const navSource = await readFile(nav, 'utf8');
    assert.match(navSource, /libraries = individually \? m\.libraryButtons : m\.libraryItems/, `${nav} draws the buttons from the libraries entry's own list`);
    assert.match(navSource, /else if isValid\(item\.lib\)\s+[^\n]*\n\s+m\.top\.librarySelected = libraryNodeFor\(item\.lib\)/, `${nav} opens the library the button holds`);
    assert.doesNotMatch(navSource, /getLibraryDataIndex/, `${nav} never finds a library by its id alone`);
}
process.stdout.write('PASS: libraries individually wiring (11 checks)\n');

// Sign in and the Settings connection test build the plugin record through one builder, so a
// test connection keeps every flag sign in reads, the thumbs one among them
const pluginApiSource = await readFile('source/api/MoonfinPlugin.bs', 'utf8');
assert.match(pluginApiSource.match(/function InfoFromPing\([^]*?end function/)[0], /tmdbThumbsSupported: result\.tmdbThumbsSupported \?\? false/, 'The plugin record keeps the thumbs flag');
const signInPing = (await readFile('source/utils/session.bs', 'utf8')).match(/sub CheckPluginStatus\(\)[^]*?end sub/)[0];
assert.match(signInPing, /pluginInfo = moonfinPlugin\.InfoFromPing\(result, displayName\)/, 'Sign in builds the plugin record with the shared builder');
const settingsPing = settingsSource.match(/sub onPluginPingComplete\(\)[^]*?end sub/)[0];
assert.match(settingsPing, /pluginInfo = moonfinPlugin\.InfoFromPing\(result, displayName\)/, 'The connection test builds the same plugin record');
assert.doesNotMatch(settingsPing, /tmdbAvailable:/, 'The connection test has no hand built copy of the record to fall behind');
assert.match(await readFile('components/tasks/PluginPingTask.bs', 'utf8'), /result\.addReplace\("seerrDisplayName", moonfinPlugin\.SeerrDisplayName\(\)\)/, 'The connection test keeps the Seerr name');

// Discover follows the home rows style, and its modern card leads with the plugin's thumb
const discoverSource = await readFile('components/seerr/SeerrDiscoveryScreen.bs', 'utf8');
assert.match(discoverSource, /m\.modernRows = isModernHomeRows\(\)\s+m\.modernFocusCard = m\.top\.findNode\("modernFocusCard"\)/, 'Discover reads the home rows style');
assert.match(discoverSource, /if m\.modernRows then applyModernLayout\(\)/, 'Only modern rows change Discover\'s layout');
assert.match(discoverSource.match(/function discoverCardUris\([^]*?end function/)[0], /TmdbThumbURL\(item\.mediaType, item\.tmdbId\)[^]*?\[item\.backdropUrl, item\.hdPosterUrl\]/, 'The card tries the thumb, then the backdrop, then the poster');
assert.match(discoverSource, /details\.mediaType = entry\.mediaType/, 'A request card takes its media type from the request');
assert.match(await readFile('components/seerr/SeerrDiscoveryScreen.xml', 'utf8'), /<ModernFocusCard id="modernFocusCard"/, 'Discover hosts the shared card');
assert.match(await readFile('components/home/Home.xml', 'utf8'), /<ModernFocusCard id="modernFocusCard" translation="\[111, 225\]"/, 'Home hosts the shared card where its own used to be');

// Settings are stored flat, so a dotted path that splits the key never finds Prefer Thumbnails
const homeRowsSource = await readFile('components/home/HomeRows.bs', 'utf8');
assert.doesNotMatch(miscSource, /"user\.settings\.ui\.home\.preferThumbnails"/, 'Prefer Thumbnails is read by its flat key');
assert.match(miscSource, /chainLookupReturn\(m\.global\.session, "user\.settings\.`ui\.home\.preferThumbnails`", false\)/, 'Prefer Thumbnails has one reader');
// Every row's cards take Core's sizes and the art for the row's image type in one place
assert.doesNotMatch(homeRowsSource, /usePoster = not prefersThumbnails\(\)|imageWidth = row\.imageWidth/, 'No row picks its own card size or art');
assert.match(homeRowsSource.match(/sub layOutRow\([^]*?end sub/)[0], /imageType = homeCards\.RowImageType\(rowId, musicRow\)/, 'A Classic row takes its image type');
assert.match(homeRowsSource.match(/sub layOutRow\([^]*?end sub/)[0], /row\.modernCards = modern and not musicRow and useModernCardsForRow\(rowId\)/, 'Music rows keep square cards that never widen in Modern');
assert.match(homeRowsSource.match(/sub setRowItemSize\([^]*?end sub/)[0], /heights\.push\(ROW_TITLE_BAND \+ room \+ row\.cursorSize\[1\]\)[^]*?if FormatJson\(heights\) <> FormatJson\(m\.top\.rowHeights\) then m\.top\.rowHeights = heights/, 'and each row is as tall as its tallest card, written only when it changes');
assert.match(await readFile('components/home/HomeItem.bs', 'utf8'), /isStringEqual\(itemData\.type, ItemType\.EPISODE\) and not prefersThumbnails\(\) then wide\.Reverse\(\)/, 'Prefer Thumbnails picks an episode\'s own image over its series\' art');
const homeData = await readFile('components/data/HomeData.bs', 'utf8');
assert.match(homeData, /sub setTitledThumb\([^]*?m\.top\.thumbnailURL = thumbUrl\s+m\.top\.widePosterURL = thumbUrl/, 'The titled thumb leads a card\'s wide art');
assert.doesNotMatch(homeData.match(/sub setTitledThumb\([^]*?end sub/)[0], /backdropURL/, 'The page behind a card keeps the plain backdrop');
process.stdout.write('PASS: tmdb thumbs wiring (18 checks)\n');

// The focused card's preview: the mode and the audio switch sit under Home Screen for modern rows
// and sync with the plugin, every way off the screen stops it, the controller never reports
// playback, and the corner piece keeps its transparency where the device reads it
const previewSettings = await readFile('settings/settings.json', 'utf8');
assert.match(previewSettings, /"title": "Media Preview",[^{}]*"settingName": "ui\.home\.mediaPreviewMode",\s+"glyph": "play_circle",\s+"requires": "setting:ui\.home\.rowsStyle!=v1",\s+"type": "radio",\s+"default": "media",\s+"options": \[\s+\{\s+"title": "Off",\s+"id": "off"\s+\},\s+\{\s+"title": "Media Preview",\s+"id": "media"\s+\},\s+\{\s+"title": "Trailer Preview",\s+"id": "trailer"\s+\}\s+\]/, 'Media Preview is a Home Screen choice of off, clip or trailer for modern rows');
assert.doesNotMatch(previewSettings, /"settingName": "ui\.home\.episodePreviewEnabled"/, 'The old switch has no row of its own, the choice writes it');
assert.match(previewSettings, /"settingName": "ui\.home\.previewAudioEnabled",\s+"glyph": "volume_up",\s+"requires": "setting:ui\.home\.rowsStyle!=v1&&setting:ui\.home\.episodePreviewEnabled",\s+"type": "bool",\s+"default": "true"/, 'Preview Audio follows Media Preview, on by default');
assert.match(settingsSyncSource, /\{ pluginKey: "episodePreviewEnabled", rokuKey: "ui\.home\.episodePreviewEnabled", type: "bool" \}/, 'The Media Preview switch syncs with the plugin');
assert.match(settingsSyncSource, /\{ pluginKey: "mediaPreviewMode", rokuKey: "ui\.home\.mediaPreviewMode", type: "direct" \}/, 'The Media Preview mode syncs with the plugin');
assert.match(settingsSyncSource, /\{ pluginKey: "previewAudioEnabled", rokuKey: "ui\.home\.previewAudioEnabled", type: "bool" \}/, 'Preview Audio syncs with the plugin');
const previewSettingsScreen = await readFile('components/settings/settings.bs', 'utf8');
assert.match(previewSettingsScreen, /homeLooks = takeSettings\(configTree, \[[^\]]*"ui\.home\.mediaPreviewMode", "ui\.home\.previewAudioEnabled"[^\]]*\]\)/, 'Both preview settings sit in the Home Screen Looks group');
const previewChoice = previewSettingsScreen.match(/sub applyRadioChoice\([^]*?^end sub/m)[0];
assert.match(previewChoice, /if isStringEqual\(selectedSetting\.settingName, "ui\.home\.mediaPreviewMode"\) then dependsOn = "ui\.home\.episodePreviewEnabled"\s+if isStringEqual\(selectedSetting\.settingName, "ui\.home\.backdropStyle"\) then dependsOn = "ui\.home\.showBackdrop"\s+if dependsOn <> ""\s+switchOn = "true"\s+if isStringEqual\(selectedValue, "off"\) then switchOn = "false"\s+set_user_setting\(dependsOn, switchOn\)\s+syncSettingToServer\(dependsOn, switchOn\)/, 'Picking a preview mode or a backdrop style writes and syncs its switch too');
assert.match(previewChoice, /refreshDependentRows\(selectedSetting\.settingName, dependsOn\)/, 'Preview Audio comes and goes with the switch the choice wrote');
assert.equal((previewSettingsScreen.match(/"ui\.home\.mediaPreviewMode"\) then (?:currentValue|selectedValue) = homePreview\.Mode\(m\.global\.session\.user\.settings\)/g) ?? []).length, 2, 'The row and the picker show the mode that plays');
const previewStrings = await readFile('locale/en_US/translations.ts', 'utf8');
for (const name of ['Media Preview', 'Preview Audio', 'Trailer Preview', 'Off']) assert.match(previewStrings, new RegExp(`<source>${name}</source>`), `${name} is translated`);
const previewDescription = previewSettings.match(/"description": "([^"]*)",\s+"settingName": "ui\.home\.mediaPreviewMode"/)[1];
assert.ok(previewStrings.includes(`<source>${previewDescription}</source>`), 'The Media Preview description is translated');
const previewHome = await readFile('components/home/Home.bs', 'utf8');
assert.match(previewHome, /^import "pkg:\/components\/home\/modernPreview\.bs"$/m, 'Home runs the preview controller in its own scope');
assert.match(previewHome.match(/sub OnScreenHidden\([^]*?end sub/)[0], /stopPreview\(\)/, 'A screen pushed over Home stops the preview');
assert.match(previewHome.match(/sub hideModernFocusCard\([^]*?end sub/)[0], /^\s*stopPreview\(\)/m, 'Taking the card down stops the preview first');
assert.match(previewHome.match(/sub onHomeRowsFocusChanged\([^]*?end sub/)[0], /if not m\.homeRows\.isInFocusChain\(\)\s+stopPreview\(\)\s+return/, 'Focus leaving the rows stops the preview');
assert.match(previewHome.match(/sub onItemDetailsLoaded\([^]*?end sub/)[0], /m\.previewDetails = json/, 'The details a card already fetched feed its preview');
const previewController = await readFile('components/home/modernPreview.bs', 'utf8');
assert.match(await readFile('components/home/Home.bs', 'utf8'), /observeFieldScoped\("settingsOpen", "onSettingsOpen"\)[^]*?sub onSettingsOpen\(\)\s+onPreviewSettingsOpen\(\)/, 'Home watches the settings overlay');
assert.match(previewController.match(/sub onPreviewSettingsOpen\([^]*?end sub/)[0], /settingsOpen = true[^]*?stopPreview\(\)/, 'Opening settings stops the preview');
assert.match(previewController.match(/sub onHomeRowsQuickPlay\([^]*?end sub/)[0], /stopPreview\(\)/, 'The Play key stops the preview before the player comes');
assert.doesNotMatch(previewController, /playstateTask|Sessions\/Playing/, 'A preview never reports playback');
assert.match(previewController.match(/sub previewOnFocus\([^]*?end sub/)[0], /mode = homePreview\.Mode\(m\.global\.session\.user\.settings\)\s+if itemId = "" or itemId = m\.previewUnavailableId or mode = "off"/, 'A card asks the mode helper whether anything plays');
assert.doesNotMatch(previewController + previewHome, /episodePreviewEnabled/, 'Nothing reads the old switch on its own');
assert.match(previewController.match(/sub onPreviewAnswer\([^]*?end sub/)[0], /else if isValidAndNotEmpty\(answer\.videoId\)\s+m\.previewTask = CreateObject\("roSGNode", "TrailerPreviewTask"\)\s+m\.previewTask\.request = \{ requestId: m\.previewRequestId, videoId: answer\.videoId, index: 0, captions: false \}/, 'A YouTube trailer is resolved by the media bar\'s trailer task');
assert.match(previewController.match(/sub startPreviewFrom\([^]*?end sub/)[0], /start = 0\s+if m\.previewMode <> "trailer" then start = homePreview\.StartSeconds/, 'A trailer starts from the top');
assert.match(previewController.match(/sub onPreviewPosition\([^]*?end sub/)[0], /if m\.previewVideo\.position <= m\.previewMovedFrom then return\s+m\.previewPhase = "playing"\s+playCap = homePreview\.PlayCapSeconds\(m\.previewMode\)\s+if playCap > 0\s+startPreviewTimer\(playCap\)\s+else\s+m\.previewTimer\.control = "stop"\s+end if\s+m\.modernFocusCard\.callFunc\("revealPreview"\)/, 'The card only shows the video once its position moves, and only a clip has a cap');
assert.match(previewController.match(/sub previewOnFocus\([^]*?end sub/)[0], /if isValid\(homePreview\.OutsideTrailerQuery\(item\.json\)\)\s+mode = "trailer"\s+else if not homePreview\.IsLibraryItem\(item\.json\)/, 'An outside title plays its trailer in either mode');
assert.match(previewController.match(/sub onPreviewDwell\([^]*?end sub/)[0], /if isValid\(outsideQuery\)\s+request = \{ requestId: m\.previewRequestId, details: outsideQuery \}/, 'An outside title asks for its details and nothing else');
const previewTaskSource = await readFile('components/home/HomePreviewTask.bs', 'utf8');
assert.match(previewTaskSource.match(/sub resolveTrailer\([^]*?end sub/)[0], /^\s+if isValid\(request\.details\)\s+resolveOutsideTrailer\(request\.details, answer\)\s+return\s+end if/m, 'An outside title skips every server item lookup');
assert.match(previewTaskSource.match(/sub resolveOutsideTrailer\([^]*?end sub/)[0], /if not moonfinPlugin\.AreTmdbDetailsSupported\(\) then return\s+found = homePreview\.DetailsTrailerSource\(requestResponse\(APIRequest\("\/Moonfin\/Tmdb\/Details", query\)/, 'The trailer comes from the plugin\'s TMDB details, only where the plugin offers them');
assert.doesNotMatch(previewController.match(/sub onPreviewVideoState\([^]*?end sub/)[0], /revealPreview/, 'The playing state alone never reveals the video');
assert.match(await readFile('components/home/Home.xml', 'utf8'), /<Timer id="previewTimer"/, 'Home carries the preview timer');
const previewCard = await readFile('components/home/ModernFocusCard.xml', 'utf8');
assert.equal((previewCard.match(/pkg:\/images\/previewCorner\.webp/g) ?? []).length, 4, 'The card draws four corner pieces');
assert.doesNotMatch(previewCard, /scale="\[-/, 'The corners turn rather than mirror, since a negative scale never mirrors');
for (const name of ['mountPreview', 'revealPreview', 'unmountPreview']) assert.match(previewCard, new RegExp(`<function name="${name}"`), `The card offers ${name}`);
const previewCardSource = await readFile('components/home/ModernFocusCard.bs', 'utf8');
assert.match(previewCardSource.match(/^sub hideCard\(\)[^]*?^end sub/m)[0], /^\s*unmountPreview\(\)/m, 'Hiding the card takes the preview down first');
assert.doesNotMatch(await readFile('components/seerr/SeerrDiscoveryScreen.bs', 'utf8'), /mountPreview/, 'Discover never mounts a preview');
const corner = await readFile('images/previewCorner.webp');
assert.ok(hasAlpha(corner, 'images/previewCorner.webp'), 'The corner piece keeps its transparency where the device reads it');
// A lossless WebP packs its width and height, less one, into 14 bits each after the signature
const cornerBits = corner.readUInt32LE(21);
assert.equal((cornerBits & 0x3fff) + 1, 8, 'The corner piece is 8 wide');
assert.equal(((cornerBits >>> 14) & 0x3fff) + 1, 8, 'The corner piece is 8 high');
assert.ok(corner.length < 1024, 'The corner piece is small');
process.stdout.write('PASS: home preview wiring (46 checks)\n');

// The Home Screen Backdrop is a choice of off, full screen, corner or top that writes the old
// switch too, and Home reads both through one helper
assert.match(previewSettings, /"title": "Home Screen Backdrop",\s+"settingName": "ui\.home\.backdropStyle",\s+"glyph": "image",\s+"type": "radio",\s+"default": "fullScreen",\s+"options": \[\s+\{\s+"title": "Off",\s+"id": "off"\s+\},\s+\{\s+"title": "Full Screen",\s+"id": "fullScreen"\s+\},\s+\{\s+"title": "Corner",\s+"id": "corner"\s+\},\s+\{\s+"title": "Top",\s+"id": "top"\s+\}\s+\]/, 'Home Screen Backdrop is a choice of off, full screen, corner or top');
assert.doesNotMatch(previewSettings, /"settingName": "ui\.home\.showBackdrop"/, 'The old backdrop switch has no row of its own, the choice writes it');
assert.match(settingsSyncSource, /\{ pluginKey: "homeBackdropEnabled", rokuKey: "ui\.home\.showBackdrop", type: "bool" \}/, 'The backdrop switch syncs with the plugin');
assert.match(settingsSyncSource, /\{ pluginKey: "homeBackdropStyle", rokuKey: "ui\.home\.backdropStyle", type: "direct" \}/, 'The backdrop style syncs with the plugin');
assert.equal((previewSettingsScreen.match(/"ui\.home\.backdropStyle"\) then (?:currentValue|selectedValue) = getHomeBackdropStyle\(m\.global\.session\.user\.settings\)/g) ?? []).length, 2, 'The row and the picker show the style Home draws');
assert.doesNotMatch(previewHome, /"ui\.home\.showBackdrop"/, 'Home never reads the old backdrop switch on its own');
assert.match(previewHome, /maskUri = "pkg:\/images\/backdropCornerMask\.png"/, 'The corner backdrop fades out through its mask');
assert.match(previewHome, /maskUri = "pkg:\/images\/backdropTopMask\.webp"/, 'The top backdrop fades out through its mask');
for (const name of ['Full Screen', 'Corner', 'Top']) assert.match(previewStrings, new RegExp(`<source>${name}</source>`), `${name} is translated`);
// The settings preview draws the style behind its rows through Home's helper and masks, and draws a tried style with its switch
assert.ok(previewTable.includes('"ui.home.backdropStyle": "home"') && previewTable.includes('"ui.home.showBackdrop": "home"'), 'The backdrop style and its switch show on the Home preview');
assert.match(previewSettingsScreen, /if m\.tryKey = "ui\.home\.backdropStyle" then values\["ui\.home\.showBackdrop"\] = \(values\[m\.tryKey\] <> "off"\)\.ToStr\(\)/, 'A tried style is drawn with the switch it saves');
const rowsPreview = await readFile('components/setup/SetupHomeRowsPreview.bs', 'utf8');
assert.ok(rowsPreview.includes('"pkg:/images/backdropCornerMask.png"') && rowsPreview.includes('"pkg:/images/backdropTopMask.webp"'), 'The preview fades its backdrop through Home\'s masks');
assert.match(await readFile('components/setup/SetupDetailPreview.bs', 'utf8'), /sub drawBackdrop\(pal as object\)\s+if m\.live and not m\.pageLayout\.showBackdrop then return/, 'Every detail style drops its picture when the switch is off');
assert.match(await readFile('components/details/detailMetadataHost.bs', 'utf8'), /sub setBackdropImage\(itemData as object\)[^]*?backdropPoster\.visible = get_user_setting_bool\("ui\.itemdetail\.showBackdrop", true\)/, 'The detail screens that share the backdrop setter drop their picture when the switch is off');
process.stdout.write('PASS: home backdrop style wiring (16 checks)\n');

// Continue Watching and Next Up cards play on select through one check the press and the card menu share
assert.match(homeRowsSource.match(/function playsOnSelect\([^]*?end function/)[0], /if rowId <> "resume" and rowId <> "nextup" then return false\s+return isStringEqual\(get_user_setting\("ui\.home\.continueWatchingDefaultAction"\), "play"\)/, 'Only Continue Watching and Next Up rows play on select, and only when the setting says play');
assert.match(homeRowsSource.match(/sub itemSelected\(\)[^]*?end sub/)[0], /if isValid\(item\) and playsOnSelect\(m\.top\.rowItemSelected\[0\]\)/, 'A press checks the row it was made on');
assert.match(homeSource, /showItemMenu\(focusedItem, \{ playImmediately: m\.homeRows\.callFunc\("playsOnSelect", m\.homeRows\.rowItemFocused\[0\]\) \}\)/, 'The card menu asks the same check for the focused row');
assert.match(await readFile('components/home/HomeRows.xml', 'utf8'), /<function name="playsOnSelect" \/>/, 'Home can call the check');
process.stdout.write('PASS: play on select wiring (4 checks)\n');

// The server's answer to /Users/Me decides whether an access schedule has closed
const scheduleTask = await readFile('components/accessSchedule/AccessScheduleTask.bs', 'utf8');
assert.match(scheduleTask, /if not exempt and entries\.Count\(\) > 0 then refused = accessSchedule\.RefusedBy\(requestResponse\(APIRequest\("Users\/Me"\), "GET"\)\.status\)/, 'Only a user with a schedule who isnt an administrator asks the server');
const scheduleWatcher = await readFile('components/accessSchedule/AccessScheduleWatcher.bs', 'utf8');
assert.match(scheduleWatcher, /status = accessSchedule\.Status\(m\.entries, refused, day, secondOfDay\)/, 'The server answer decides whether the user is blocked');
assert.match(scheduleWatcher, /sub onRefused\(\)(?:\s+'[^\n]*)*\s+if m\.top\.userId = "" or m\.top\.blocked then return/, 'A refused request starts no look while blocked, and asks for another while one is under way');
assert.match(scheduleWatcher, /if result\.ok[^]*?else(?:\s+'[^\n]*)*\s+startTimer\(RETRY_SECONDS\)/, 'A failed read keeps the last answer and asks again');
assert.match(scheduleWatcher, /if m\.exempt then return\s+delay = POLL_SECONDS\s+if m\.entries\.Count\(\) = 0 then delay = IDLE_SECONDS/, 'An administrator isnt polled and a user without a schedule is polled every 15 minutes');
process.stdout.write('PASS: access schedule wiring (5 checks)\n');

// The library header, its dialogs and its settings: Home goes home, the display choices sync, and
// a removed card leaves every view of it
const libraryScene = await readFile('components/Libraries/VisualLibraryScene.bs', 'utf8');
const libraryXml = await readFile('components/Libraries/VisualLibraryScene.xml', 'utf8');
assert.match(libraryScene.match(/function onToolbarKey\([^]*?end function/)[0], /if index = FOCUS_HOME\s+reclaimResources\(\)\s+m\.global\.sceneManager\.callFunc\("goHome"\)/, 'Home goes home rather than back');
assert.match(libraryScene.match(/sub focusFirstPage\(\)[^]*?end sub/)[0], /m\.openedOnHome = true\s+focusToolbarItem\(FOCUS_HOME\)/, 'The screen opens on Home');
for (const icon of ['home', 'sort', 'category_outlined', 'shuffle', 'settings']) {
    assert.match(libraryXml, new RegExp(`<LibraryHeaderButton id="\\w+Button" icon="${icon}" />`), `Classic draws ${icon} from the icon font`);
}
for (const glyph of ['home', 'sort', 'category_outlined', 'filter_list', 'shuffle', 'settings', 'grid_view', 'expand_more', 'expand_less']) {
    assert.ok(glyphNames.includes(glyph), `The icon font has ${glyph}`);
}
assert.match(libraryXml, /<LibrarySortDialog id="displayDialog" visible="false" \/>\s+<LibrarySortDialog id="groupDialog" visible="false" \/>/, 'Display and Group By use the sort dialog\'s list');
assert.doesNotMatch(libraryXml, /LibrarySettingsDialog/, 'The cycling settings dialog is gone');
assert.match(libraryScene, /title: tr\("Group By"\),\s+closeOnPick: true,/, 'A Group By pick closes its dialog');
assert.match(await readFile('components/ItemGrid/LoadItemsTask2.bs', 'utf8'), /Fields: "[^"]*Genres, Studios"/, 'Items carry the genres and studios Group By reads');
assert.match(await readFile('components/ItemGrid/LoadItemsTask2.bs', 'utf8'), /Fields: "[^"]*ProductionYear, OfficialRating, CommunityRating, CriticRating, Status[^"]*"/, 'Items carry the year, ratings and status Emby leaves off unless asked');
assert.match(settingsSyncSource, /\{ pluginKey: "libraryCardTitles", rokuKey: "ui\.library\.cardTitles", type: "bool" \}/, 'Titles Under Posters syncs under Core\'s name');
assert.match(settingsSyncSource, /\{ pluginKey: "libraryPosterSize", rokuKey: "ui\.library\.posterSize", type: "direct" \}/, 'The library poster size syncs under Core\'s name');
assert.match(settingsSyncSource, /\{ pluginKey: "playlistPosterSize", rokuKey: "ui\.library\.playlistPosterSize", type: "direct" \}/, 'The playlist poster size syncs under Core\'s name');
assert.match(settingsSyncSource, /\{ pluginKey: "posterSize", rokuKey: "ui\.posterSize", type: "direct" \}/, 'Card Size syncs both ways under Core\'s name');
assert.match(settingsSyncSource, /\{ pluginKey: "homeImageTypeContinueWatching", rokuKey: "ui\.home\.rowImageType\.resume", type: "imageType" \}/, 'Continue Watching\'s image type syncs on its own key');
assert.match(settingsSyncSource, /\{ pluginKey: "homeRowsImageTypeOverride", rokuKey: "ui\.home\.rowsImageTypeOverride", type: "bool", receiveOnly: true \}/, 'The type for every row only arrives');
assert.equal(findSetting(settingsTree, 'ui.library.cardTitles').default, 'true', 'Titles Under Posters starts on');
assert.equal(findSetting(settingsTree, 'itemgrid.forgetFilters'), null, 'Forget Filters is gone');
assert.doesNotMatch(mainSource, /clearOldLibraryFilters/, 'Filters are no longer wiped at start');
assert.match(mainEventHandlers.match(/sub removeFromLibraryGrid\([^]*?end sub/)[0], /screen\.callFunc\("removeItem", itemId\)/, 'A library takes a removed card out of its own views');
assert.equal((mainEventHandlers.match(/removeFromLibraryGrid\(activeScene, itemID\)/g) ?? []).length, 2, 'Deleting a playlist and leaving My List both use it');
for (const name of ['Group By', 'Decade (Year)', 'Jump to letter', 'Scroll Direction', 'Poster Size', 'Playlist Types', 'Folder View', 'Titles Under Posters', 'Folders First', 'Like', 'Dislike', 'All Libraries']) {
    assert.match(styleStrings, new RegExp(`<source>${name.replace(/[()]/g, '\\$&')}</source>`), `${name} is translated`);
}
process.stdout.write('PASS: library screen wiring (41 checks)\n');

// Home rows and the media bar each have their own ratings settings, which sync under the profile's
// names and start where the global ones do, except Home's labels, which start off, and the badges,
// which start on because Home and the media bar always drew them before they had a setting
const ratingsGlobals = { enabled: 'plugin.mdblist.enabled', ratingSources: 'plugin.mdblist.ratingSources', episodeRatings: 'plugin.tmdb.episodeRatings', showRatingNames: 'plugin.mdblist.showRatingNames', showRatingBadges: 'plugin.mdblist.showRatingBadges' };
const ratingsServerKeys = {
    home: { enabled: 'homeRowsMdblistEnabled', ratingSources: 'homeRowsMdblistRatingSources', episodeRatings: 'homeRowsTmdbEpisodeRatingsEnabled', showRatingNames: 'homeRowsMdblistShowRatingNames', showRatingBadges: 'homeRowsMdblistShowRatingBadges' },
    mediaBar: { enabled: 'mediaBarMdblistEnabled', ratingSources: 'mediaBarMdblistRatingSources', showRatingNames: 'mediaBarMdblistShowRatingNames', showRatingBadges: 'mediaBarMdblistShowRatingBadges' },
};
const mediaBarRatingsGate = 'setting:ui.home.mediaBarMode!=bookshelf&&setting:ui.home.mediaBarMode!=aya&&setting:ui.home.mediaBarMode!=off';
for (const [scope, keys] of Object.entries(ratingsServerKeys)) {
    for (const [name, pluginKey] of Object.entries(keys)) {
        const rokuKey = `ui.${scope}.ratings.${name}`;
        const type = name === 'ratingSources' ? 'jsonArray' : 'bool';
        const keepLocal = name === 'ratingSources' ? ', emptyKeepsLocal: true' : '';
        assert.ok(settingsSyncSource.includes(`{ pluginKey: "${pluginKey}", rokuKey: "${rokuKey}", type: "${type}"${keepLocal} }`), `${rokuKey} syncs as ${pluginKey}`);
        const setting = findSetting(settingsTree, rokuKey);
        const global = findSetting(settingsTree, ratingsGlobals[name]);
        assert.ok(setting, `${rokuKey} has a row`);
        assert.equal(setting.type, global.type, `${rokuKey} is the same kind of row as the global one`);
        const expected = name === 'showRatingBadges' ? 'true' : scope === 'home' && name === 'showRatingNames' ? 'false' : global.default;
        assert.equal(setting.default, expected, `${rokuKey} starts where it should`);
        if (scope === 'mediaBar') assert.equal(setting.requires, mediaBarRatingsGate, `${rokuKey} only shows for the styles that draw ratings`);
    }
}
assert.equal(findSetting(settingsTree, 'ui.mediaBar.ratings.episodeRatings'), null, 'The media bar has no episode ratings');
assert.match(syncFunction('PullFromServer'), /if not isValid\(pluginValue\) then continue for\s+if chainLookupReturn\(mapping, "emptyKeepsLocal", false\) and type\(pluginValue\) = "roArray" and pluginValue\.Count\(\) = 0 then continue for/, 'An empty surface list from the server keeps the list on the device');
const ratingsSettingsScreen = await readFile('components/settings/settings.bs', 'utf8');
assert.match(ratingsSettingsScreen, /homeChildren\.push\(settingsSection\("Ratings"\)\)\s+homeChildren\.Append\(homeRatings\)/, 'Home Screen has a Ratings section');
assert.match(ratingsSettingsScreen, /isStringEqual\(selectedItem\.type, "ratingSources"\)\s+openEditor\("ratingSources", selectedItem\)/, 'Every Rating Sources row opens the editor');
for (const [file, scope] of [['components/home/Home.bs', 'home'], ['components/home/MediaBar.bs', 'mediaBar'], ['components/home/GalleryItem.bs', 'mediaBar']]) {
    const text = await readFile(file, 'utf8');
    assert.doesNotMatch(text, /IsRatingsEnabled\(\)|IsEpisodeRatingsEnabled\(\)|IsRatingSourceEnabled\("\w+"\)|plugin\.mdblist|plugin\.tmdb\.episodeRatings/, `${file} never reads the global ratings settings`);
    assert.match(text, new RegExp(`StyleRatingsRow\\([^,]+, "${scope}"\\)`), `${file} styles its ratings from its own settings`);
}
assert.match(await readFile('components/home/Home.bs', 'utf8'), /m\.homeRatingsTask\.scope = "home"/, 'Home asks for its own sources');
assert.match(await readFile('components/home/MediaBar.bs', 'utf8'), /m\.mediaBarRatingsTask\.scope = "mediaBar"/, 'The media bar asks for its own sources');
assert.match(await readFile('components/tasks/FetchRatingsTask.bs', 'utf8'), /data: moonfinPlugin\.BuildDisplayRatings\(fetched, scope\)/, 'The cache keeps what the plugin sent, and each surface picks its own sources from it');
process.stdout.write('PASS: ratings settings per surface wiring\n');

// The classic info area takes 320 from y 120 and ends above the rows at 450, with the overview's
// three lines 36 apart, and classic cards carry a second line of text, so their rows are taller
const classicHomeXml = await readFile('components/home/Home.xml', 'utf8');
const classicHomeSource = await readFile('components/home/Home.bs', 'utf8');
assert.match(classicHomeXml, /<Group id="detailsSection" translation="\[111, 120\]">/, 'The info area starts below the top nav');
const overviewTop = Number(classicHomeSource.match(/const OVERVIEW_TOP = (\d+)/)[1]);
const overviewLine = Number(classicHomeSource.match(/const OVERVIEW_LINE_HEIGHT = (\d+)/)[1]);
assert.equal(120 + overviewTop + 3 * overviewLine, 440, 'Three overview lines end above the rows');
assert.match(classicHomeSource, /m\.homeRows\.translation = m\.modernHomeRows \? \[111, 170\] : \[111, 450\]/, 'The rows stay at 450');
assert.match(await readFile('components/home/HomeRows.bs', 'utf8'), /const CLASSIC_CAPTION_ROOM = 118\s+const MODERN_CAPTION_ROOM = 123\s+const MODERN_INFO_ROOM = 292/, 'Rows keep room under the cards for three caption lines, and Modern rows for the focused card\'s details');
assert.match(classicHomeXml, /<RatingsRow id="homeRatings"[^>]*singleLine="true"/, 'Home shows its ratings as single line chips');
process.stdout.write('PASS: classic home info area wiring\n');

// Home and the media bar
assert.match(await readFile('source/utils/misc.bs', 'utf8'), /defaultPadding = 360/, 'Modern rows default to the smallest padding');
assert.match(await readFile('source/utils/misc.bs', 'utf8'), /return \(padding - 10\) \* 2/, 'Classic rows sit 10 closer');
const mediaBarTaskWiring = await readFile('components/home/MediaBarTask.bs', 'utf8');
assert.match(mediaBarTaskWiring, /while running\.count\(\) < 6 and nextSource < parentIds\.count\(\) and items\.count\(\) < m\.top\.featuredCount \* 2/, 'The media bar reads six sources at a time and stops at twice what it shows');
assert.match(mediaBarTaskWiring, /pool = readSources\(shuffleArray\(parentIds\), query, excludedGenreNames\)/, 'It reads its sources in a shuffled order');
assert.match(mediaBarTaskWiring, /parentIds = filterIdsBySelection\(libraryIds, selectedLibraryIds\)\s+parentIds\.append\(selectedCollectionIds\)/, 'Every source reads the picked libraries and collections together');
for (const file of ['components/JFOverhang.bs', 'components/Sidebar.bs']) {
    assert.match(await readFile(file, 'utf8'), /callFunc\("getActiveScene"\)\?\.subtype\(\), "Home"\)\s+m\.top\.itemSelected = "homeAgain"/, `${file} tells Home it was pressed on Home`);
}
assert.match(await readFile('components/home/Home.bs', 'utf8'), /selectedItem = "homeAgain"\s+m\.homeRows\.callFunc\("updateHomeRows"\)\s+if isValid\(m\.mediaBar\) then m\.mediaBar\.callFunc\("drawNewSet"\)/, 'Home pressed on Home draws a new media bar set');
const mediaBarWiring = await readFile('components/home/MediaBar.bs', 'utf8');
assert.match(mediaBarWiring, /if newSet and allItems\.count\(\) = 0 then return/, 'An empty new set keeps the one showing');
assert.match(mediaBarWiring, /if item\.id <> m\.failedBannerId then art = bannerArtUrl\(item\)/, 'Banner art that failed falls back to the backdrop');
const homeRowsWiring = await readFile('components/home/HomeRows.bs', 'utf8');
assert.match(homeRowsWiring, /m\.emptySections\[sectionTitle\] = true/, 'A section that comes back empty is remembered');
assert.equal((homeRowsWiring.match(/if not sectionExists\(sectionName\) and not knownEmpty\(sectionName\)/g) || []).length, 12, 'Every placeholder skips a section known to be empty');
assert.match(homeRowsWiring, /const EAGER_SECTION_COUNT = 8\s+const NEAR_ROWS_ABOVE = 2\s+const NEAR_ROWS_BELOW = 5\s+const LATE_ROW_LOADS = 3/, 'Picked rows past the first eight wait for focus to come near');
assert.match(homeRowsWiring, /if holdsBack\(i, sectionName\)\s+holdBack\(sectionName\)/, 'Held back rows only get a placeholder');
const syncWiring = await readFile('source/utils/settingsSync.bs', 'utf8');
for (const key of ['imdb', 'tmdb', 'seerr']) {
    assert.match(syncWiring, new RegExp(`\\{ pluginKey: "${key}RowsSortBy", rokuKey: "${key}\\.rowsSortBy", type: "direct" \\}`), `The ${key} sort syncs`);
    assert.match(syncWiring, new RegExp(`\\{ pluginKey: "${key}RowsSortOrder", rokuKey: "${key}\\.rowsSortOrder", type: "direct" \\}`), `The ${key} sort order syncs`);
}
assert.match(syncWiring, /if source = "seerr" then return settingsSync\.SliderRowFromSection\(section, serverKey\)/, 'A Seerr slider section from the server becomes a slider row');
assert.match(syncWiring, /if not homeRowLayout\.IsSliderRow\(id\) then order\.push\(id\)/, 'Slider rows stay out of the flat order');
process.stdout.write('PASS: home and media bar wiring\n');

// Seerr requests
assert.match(await readFile('components/home/LoadItemsTask.bs', 'utf8'), /if endpoint = "\/api\/v1\/media" then found = hydrateRecentlyAdded\(found\)/, 'Recently Added cards take their titles and art from the details');
const seasonDetailsWiring = await readFile('components/tvshows/SeasonDetails.bs', 'utf8');
assert.match(seasonDetailsWiring, /loadSeerrBlock\(json\)/, 'A season page looks its series up in Seerr');
assert.match(seasonDetailsWiring, /if Left\(action, 5\) = "seerr"/, 'and hands its Seerr buttons to the request flow');
assert.match(await readFile('source/utils/seerrDetailHost.bs', 'utf8'), /initialSeason/, 'Report Issue starts on the season or episode it was opened from');
assert.match(await readFile('source/utils/seerrButtons.bs', 'utf8'), /seerrRequestRules\.Cancelable\(requests, true, CanManageRequests\(permissions\), CurrentSeerrUserId\(\)\)/, 'Cancel only shows for a request the viewer can take back');
assert.match(await readFile('source/utils/seerrButtons.bs', 'utf8'), /seerrButtons\.Entry\("seerrManage", "[^"]+", tr\("Get a different release"\), "seerrDifferentRelease"\)/, 'Get a different release rides in the Manage Requests slot, so the synced arrangement needs no new id');
assert.match(await readFile('components/details/detailButtonHost.bs', 'utf8'), /seerrButtons\.Candidates\(m\.seerrDetails, seerrMediaType\(\), seerrSwapQueue\(\)\)/, 'The detail row hands the arr queue to its Seerr buttons');
assert.match(await readFile('source/utils/seerrDetailHost.bs', 'utf8'), /function seerrSwapQueue\(\) as dynamic\n    if isValid\(m\.seerrSeries\) then return invalid\n    if IsSeerrSeriesPart\(seerrItemJson\(\)\) then return invalid/, 'Only the title\'s own page offers a release swap, never a season or episode page');
assert.match(await readFile('components/seerr/SeerrAPITask.bs', 'utf8'), /if usePluginRoot then urlTransfer\.RetainBodyOnError\(true\)/, 'A plugin endpoint keeps its error body, so a swap can tell a download already gone from a failure');
assert.match(await readFile('components/seerr/SeerrRequestsScreen.bs', 'utf8'), /sub loadArrQueues\(entries as object\)\n    ' [^\n]+\n    if m\.tab = "issues" then return/, 'The Issues tab reads no arr queues');
assert.match(await readFile('source/api/MoonfinPlugin.bs', 'utf8'), /arrQueueAvailable: result\.arrQueueAvailable \?\? false/, 'Ping keeps whether Moonbase reads the arr queue, false on older plugins');
const browseWiring = await readFile('components/seerr/SeerrGenreBrowseScreen.bs', 'utf8');
assert.match(browseWiring, /const SEERR_POSTER_SIZE_SETTING = "ui\.seerr\.posterSize"/, 'The browse screen keeps a poster size of its own');
assert.doesNotMatch(syncWiring, /ui\.seerr\.posterSize/, 'and it stays on the device');
assert.match(browseWiring, /libraryCard\.PosterSize\(get_user_setting\(SEERR_POSTER_SIZE_SETTING\), library\)/, 'It follows the library size until one is picked');
assert.match(discoverSource, /posterSize = libraryCard\.PosterSize\(invalid, get_user_setting\("ui\.posterSize"\)\)/, 'Discover follows the account\'s poster size, with Grandparents drawn as Extra Large');
assert.match(browseWiring, /CanRequestMovies\(permissions\) and requestable/, 'Request Collection only shows when a film can still be asked for');
assert.match(browseWiring, /"sortBy": sortValue\(\)/, 'Browse quotes sortBy, since a bare key reaches Seerr lowercased on the device');
const requestsWiring = await readFile('components/seerr/SeerrRequestsScreen.bs', 'utf8');
assert.match(requestsWiring, /if status = SEERR_REQUEST_PENDING and m\.canManageRequests then return \["approve", "decline"\]/, 'A moderator answers a pending request from its poster');
assert.match(requestsWiring, /chainLookupReturn\(entry, "requestedBy\.id", -1\) = m\.seerrUserId then return \["cancel"\]/, 'and anyone else can take back their own');
process.stdout.write('PASS: Seerr request wiring\n');

// Details
const trackHostWiring = await readFile('components/details/detailTrackHost.bs', 'utf8');
assert.match(trackHostWiring, /trackMemory\.RememberedSubtitle\(trackMemory\.Load\(\)/, 'The details screen shows a remembered subtitle as chosen');
assert.match(trackHostWiring, /SetDefaultAudioTrack\(itemData, false\)/, 'and a new version starts from the server\'s audio rather than a remembered one');
assert.match(trackHostWiring, /rememberTrack\("audio", m\.top\.selectedAudioStreamIndex\)/, 'An audio pick on details is remembered');
assert.match(await readFile('components/manager/ViewCreator.bs', 'utf8'), /trackMemory\.Remember\(m\.view\.videoId, m\.view\.showID, "subtitle"/, 'and so is a subtitle pick in the player');
assert.match(await readFile('components/ItemGrid/LoadVideoContentTask.bs', 'utf8'), /not rememberedSubtitle and toBoolean/, 'A remembered subtitle isn\'t dropped by the text only setting');
assert.match(await readFile('source/ShowScenes.bs', 'utf8'), /if itemType = "playlist" then return "ModernItemDetails"/, 'A playlist opens in Modern under every style but Classic');
assert.match(await readFile('source/ShowScenes.bs', 'utf8'), /if isStringEqual\(style, "stage"\)[^]*?minimalistRules\.Draws\(itemType\) then return "StageItemDetails"\s+return "ModernItemDetails"/, 'Stage draws the video pages and hands the rest to Modern');
assert.match(await readFile('source/utils/SeerrUtils.bs', 'utf8'), /if style = "stage" then return "StageItemDetails"/, 'A title only in Seerr opens in Stage too');
assert.match(await readFile('source/ShowScenes.bs', 'utf8'), /if isStringEqual\(style, "premiere"\)[^]*?minimalistRules\.Draws\(itemType\) then return "PremiereItemDetails"\s+return "ModernItemDetails"/, 'Premiere draws the video pages and hands the rest to Modern');
assert.match(await readFile('source/utils/SeerrUtils.bs', 'utf8'), /if style = "premiere" then return "PremiereItemDetails"/, 'A title only in Seerr opens in Premiere too');
assert.match(await readFile('source/ShowScenes.bs', 'utf8'), /if isStringEqual\(style, "frost"\)[^]*?minimalistRules\.Draws\(itemType\) then return "FrostItemDetails"\s+return "ModernItemDetails"/, 'Frost draws the video pages and hands the rest to Modern');
assert.match(await readFile('source/utils/SeerrUtils.bs', 'utf8'), /if style = "frost" then return "FrostItemDetails"/, 'A title only in Seerr opens in Frost too');
assert.match(await readFile('source/ShowScenes.bs', 'utf8'), /if isStringEqual\(style, "quickLook"\)[^]*?minimalistRules\.Draws\(itemType\) and not \(isValid\(top\) and top\.isSubtype\("QuickLookItemDetails"\)\) then return "QuickLookItemDetails"\s+return "ModernItemDetails"/, 'Quick Look draws Stage\'s pages in its drawer, and what the drawer opens and every other page is Modern');
assert.match(await readFile('source/utils/SeerrUtils.bs', 'utf8'), /if style = "quickLook" then return "QuickLookItemDetails"/, 'A title only in Seerr opens in the drawer too');
assert.match(await readFile('components/data/SceneManager.bs', 'utf8'), /if not drawsOverScene\(newGroup\) then currentGroup\.visible = false/, 'The screen under the drawer stays showing');
for (const file of ['ModernItemDetails', 'SpotlightItemDetails', 'MinimalistItemDetails']) {
    assert.match(await readFile(`components/details/${file}.bs`, 'utf8'), /if picksItemOnScreen\(/, `${file} plays the episode on screen when it's picked from its own list`);
}
assert.match(await readFile('components/extras/ExtrasRowList.bs', 'utf8'), /m\.top\.playOnScreen = true/, 'and so does the Classic episode row');
assert.match(await readFile('components/details/detailButtonHost.bs', 'utf8'), /if itemType <> "episode" and itemType <> "season" then return invalid/, 'A season leads back to its series too');
const seasonWiring = await readFile('components/tvshows/SeasonDetails.bs', 'utf8');
assert.match(seasonWiring, /buttonLayout\.Arrange\(offered, m\.global\.session\.user\.settings\[DETAIL_ORDER_SETTING\], m\.global\.session\.user\.settings\[DETAIL_HIDDEN_SETTING\]\)/, 'The Classic season row follows the button order and hidden buttons');
assert.match(seasonWiring, /buttonLayout\.CountSplit\(configs\.count\(\)/, 'and the button count');
assert.match(seasonWiring, /action: "goToSeries"/, 'and offers Go to Series');
assert.equal((await readFile('source/ShowScenes.bs', 'utf8')).match(/group\.itemContent = seasonMetaData\n    group\.objects/g)?.length, 2, 'Both Classic season paths hand the season over before its episodes');
assert.match(await readFile('components/details/detailButtonHost.bs', 'utf8'), /button\.id <> "extrasButton" then exit for/, 'Extras never folds behind More');
assert.match(syncWiring, /\{ pluginKey: "personPageSortOption", rokuKey: "ui\.itemdetail\.personSortOption", type: "direct" \}/, 'The person page sort follows the account');
assert.match(syncWiring, /\{ pluginKey: "personPageGroupItems", rokuKey: "ui\.itemdetail\.personGroupItems", type: "bool" \}/, 'and so does grouping repeated roles');
const personShowScenes = await readFile('source/ShowScenes.bs', 'utf8');
assert.match(personShowScenes, /screen = detailScreenComponent\("person"\)\s+if screen <> "ItemDetails"/, 'A person opens in the chosen detail style, with Classic keeping its own screen');
const personButtonHost = await readFile('components/details/detailButtonHost.bs', 'utf8');
assert.match(personButtonHost, /= "person" and \(personDisplayForKids or not kidsMode\.Enabled\(\)\)\s+arranged = withPersonDisplay\(arranged\)/, 'A person page puts Display beside Favorite, outside Kids Mode except on Nouveau');
assert.match(personButtonHost, /if buttonAction = "personDisplay"\s+handleScreenButtonAction\(buttonAction\)\s+return/, 'and Display opens without the page reloading after');
assert.match(await readFile('components/details/NouveauItemDetails.bs', 'utf8'), /addArrangedButtons\(\[favoriteCandidate\([^\n]*\)\], true\)/, 'Nouveau keeps Display in Kids Mode');
const personHost = await readFile('components/personCreditsHost.bs', 'utf8');
assert.match(personHost, /entries = personCredits\.SortCards\(entries, personCredits\.SortOption\(\)\)/, 'The library filmography follows the Display sort');
assert.match(personHost, /personCredits\.SortCredits\(personCredits\.Shaped\(usable, isCrew, group\), option\)/, 'and Seerr credits are grouped and sorted the same way');
assert.match(personHost, /if followsDisplay\s+option = personCredits\.SortOption\(\)\s+group = personCredits\.GroupsRoles\(\)/, 'A person drawn from Seerr alone keeps every credit by title');
assert.match(await readFile('components/PersonDetails.bs', 'utf8'), /shownSeerrCredits\(response\.data, m\.top\.seerrPersonId = ""\)/, 'and the Classic screen tells the two apart');
const modernPerson = await readFile('components/details/ModernItemDetails.bs', 'utf8');
assert.match(modernPerson, /if isPerson\(\)\s+renderPersonContent\(itemData\)\s+return/, 'A person on the Modern page skips everything a playable title loads');
assert.match(modernPerson, /if isPerson\(\)\s+addArrangedButtons\(\[favoriteCandidate\(m\.top\.itemContent\.json\)\]\)\s+return true/, 'and its row is Favorite and Display');
assert.match(modernPerson, /pushSection\(filmography\.movies, [^\n]*tr\("Movies"\)[^\n]*\n\s+if filmography\.series\.count\(\) > 0 then pushSection\(filmography\.series, [^\n]*tr\("TV Shows"\)/, 'Its tabs are Movies and TV Shows');
for (const file of ['ModernItemDetails', 'SpotlightItemDetails', 'NouveauItemDetails', '../PersonDetails']) {
    assert.match(await readFile(`components/details/${file}.bs`, 'utf8'), /if personDisplayOpen\(\) then return true/, `${file} leaves the keys to the Display dialog while it's up`);
}
const spotlightPerson = await readFile('components/details/SpotlightItemDetails.bs', 'utf8');
assert.match(await readFile('components/details/SpotlightCards.bs', 'utf8'), /else if itemType = "person"\s+return \["filmography", "appearances", "crew"\]/, 'A Spotlight person gets Filmography, Appearances and Crew cards');
assert.match(spotlightPerson, /if isPerson\(\)\s+addArrangedButtons\(\[favoriteCandidate\(m\.top\.itemContent\.json\)\]\)\s+return true/, 'with Favorite and Display beside it');
assert.match(spotlightPerson, /if not isPerson\(\) or isValidAndNotEmpty\(itemData\.BackdropImageTags\) then setBackdropImage/, 'A person never gets their headshot as a backdrop');
assert.match(await readFile('components/seerr/SeerrPoster.bs', 'utf8'), /if itemData\.hasField\("seerrCredit"\) then credit = itemData\.seerrCredit/, 'A Seerr credit card names the part under the title');
process.stdout.write('PASS: details wiring\n');

// Libraries, sign in and accounts
assert.match(await readFile('components/itemMenu/ItemMenuTask.bs', 'utf8'), /op = "hideFromResume"[^]*?UserItems\/\$\{itemId\}\/HideFromResume`, \{ UserId: taskUserId\(\), Hide: "true" \}\), "POST"\)/, 'Emby hides an item from resume through its own route');
assert.match(await readFile('components/itemMenu/itemMenuHost.bs', 'utf8'), /if response\.success and response\.request\.op = "played" then itemMenuPatchUserData/, 'and keeps the progress it showed');
const calendarTask = await readFile('components/home/LoadItemsTask.bs', 'utf8');
assert.match(calendarTask, /day = calendarEntries\.DayOfText\(when\)\s+if day >= today/, 'A Radarr release stays on the row through its own day');
assert.match(calendarTask, /start = calendarEntries\.DateText\(calendarEntries\.TodayNumber\(\) - 1\)/, 'and the calendar is read from a day early, so all of today comes back in any time zone');
assert.match(await readFile('components/genres/GenresScreen.bs', 'utf8'), /allServers: genreData\.unified = true/, 'A merged genre opens on every server');
assert.match(libraryScene, /if m\.top\.genreFilter\.allServers = true\s+m\.loadItemsTask\.allServers = true\s+m\.loadItemsTask\.genreNames/, 'asking each one by name');
assert.match(libraryScene, /server = libraryServer\(\)\s+m\.loadItemsTask\.serverUrl = server\.serverUrl/, 'A library from another server is read from that server');
assert.match(await readFile('components/ItemGrid/LoadItemsTask2.bs', 'utf8'), /serverParams\.StartIndex = offsets\[key\] \?\? 0[^]*?m\.top\.serverOffsets = offsets/, 'and each server pages on from its own last page');
const pinGateFlow = await readFile('source/ShowScenes.bs', 'utf8');
assert.match(pinGateFlow, /record = signInPin\.Refresh\(before\)\s+signInPin\.SaveIfChanged\(userId, before, record\)\s+if not signInPin\.IsEnabled\(record\) then return "passed"/, 'The PIN gate asks the server before it shows');
assert.match(pinGateFlow, /if password <> "" then signInPin\.NoteProvedSignIn/, 'A password sign in proves who the account is');
assert.match(pinGateFlow, /forgottenName = signInPin\.TakeForgottenUsername\(m\.global\.session\.server\.url\)/, 'and Forgot PIN lands on that sign in');
assert.match(await readFile('source/Main.bs', 'utf8'), /if pinGate = "forgot"[^]*?unset_setting\("active_user"\)[^]*?goto app_start/, 'Forgot PIN signs the account out to sign in again');
const pinSettings = await readFile('components/settings/settings.bs', 'utf8');
assert.match(pinSettings, /if selectedSetting\.settingName = SIGN_IN_PIN_ENABLED_KEY\s+if signInPin\.IsEnabled\(signInPinRecord\(\)\)\s+openSignInPinFlow\("disable"\)/, 'Turning the PIN off asks for it first');
assert.doesNotMatch(pinSettings, /lockBehindPin/, 'and turning it on no longer locks the app straight away');
process.stdout.write('PASS: libraries and sign in wiring\n');

const guideSource = await readFile('components/liveTv/guide/LiveTvGuide.bs', 'utf8');
const guideDialog = guideSource.match(/sub openProgramDialog\([^]*?end sub/)[0];
assert.match(guideDialog, /id: "record"[^]*id: "seriesSettings"[^]*id: "recordSeries"[^]*id: "favorite"[^]*id: "watch"[^]*id: "close"/, 'The program dialog keeps Record, Series Settings, Record Series, Favorite, Watch and Close in order');
assert.match(guideDialog, /if seriesTimer and not timer and not ended then note = tr\("The series recording will skip this showing"\)/, 'A showing the series rule passes over says so');
assert.match(guideSource.match(/sub onDialogAction\([^]*?end sub/)[0], /if not liveTvGuide\.HasTimer\(program\)\s+recordProgram\(program\)/, 'Record on a program with no timer goes through the Record prompt');
const playerSource = await readFile('components/video/VideoPlayerView.bs', 'utf8');
assert.match(playerSource.match(/sub recordAiringProgram\([^]*?end sub/)[0], /CreateObject\("roSGNode", "RecordAiring"\)/, 'The player records through the same Record prompt');
assert.match(playerSource.match(/sub onPrewarmLoaded\([^]*?end sub/)[0], /tag\.cold = true and tag\.revision <> m\.recordingRevision then refreshCarouselRecordings\(\)/, 'A recording changed during the carousel\'s first load is read again');
assert.match((await readFile('components/video/OSD.bs', 'utf8')).match(/function liveCandidates\([^]*?end function/)[0], /if m\.top\.recordable[^]*"record"[^]*"info"/, 'The live row puts Record before Info while the program airs');
const recordingsSource = await readFile('components/liveTv/recordings/LiveTvRecordings.bs', 'utf8');
assert.match(recordingsSource.match(/function applyTimers\([^]*?end function/)[0], /if read < m\.timerReads\.applied then return false/, 'An older schedule read cant replace a newer one');
assert.match(recordingsSource, /else if response\.kind = "cancelTimer"\s+'[^\n]*\s+m\.timerReads\.started\+\+\s+m\.timerReads\.applied = m\.timerReads\.started/, 'A read started before a cancel cant bring the timer back');
assert.match((await readFile('source/api/Items.bs', 'utf8')).match(/function searchMedia\([^]*?end function/)[0], /if includePrograms\s+liveTv = api\.items\.Get\(\{[^}]*"IncludeItemTypes": "LiveTvProgram"/, 'Search only asks for Live TV programs when it is told to');
assert.match((await readFile('components/search/SearchResults.bs', 'utf8')).match(/sub onViewsLoaded\([^]*?end sub/)[0], /isStringEqual\(view\.LookupCI\("CollectionType"\), "livetv"\) then m\.searchTask\.liveTv = true/, 'Search adds Live TV programs only on a server with a Live TV library');
process.stdout.write('PASS: Live TV recording wiring (10 checks)\n');

// Held seeking, the second subtitle track and live rewind
const heldPlayer = await readFile('components/video/VideoPlayerView.bs', 'utf8');
assert.match(heldPlayer, /seconds = hold\.direction \* heldSeek\.SecondsFor\(hold\.base, hold\.count\)/, 'A held key steps by the growing hold step');
assert.match(heldPlayer, /function onKeyEvent\(key as string, press as boolean\) as boolean\s+'[^\n]*\s+if not press and \(key = KeyCode\.LEFT or key = KeyCode\.RIGHT\) then endHeldSeek\(\)/, 'and lets go when the key comes up, before anything else can take the release');
assert.match(heldPlayer, /custom = m\.global\.session\.user\.settings\["playback\.subs\.custom"\] = true or m\.top\.secondarySubtitleIndex >= 0/, 'A second track has the player draw the first one too');
assert.match(heldPlayer, /if secondary\s+m\.subtitleOffsetOverlay\.limit = SECONDARY_DELAY_LIMIT_MS/, 'The offset panel stops the second track five seconds out');
assert.match(await readFile('components/manager/ViewCreator.bs', 'utf8'), /if m\.view\.callFunc\("offersSecondarySubtitles"\)\s+m\.subtitleSelector\.mode = "slot"/, 'The Subtitles button asks which track first while a second one is on offer');
const subtitleSettings = await readFile('components/settings/settings.bs', 'utf8');
assert.match(subtitleSettings, /"playback\.subs\.language", "playback\.subs\.secondary\.enabled", "playback\.subs\.secondary\.language", "playback\.subs\.fallbackLanguage"/, 'The secondary settings sit after the default language');
assert.match(heldPlayer, /m\.liveWindow = liveWindow\.WindowFor\(m\.top\.duration\)/, 'A live stream works out its rewind window from the duration');
assert.match(heldPlayer, /sub jumpToLive\(\)[^]*?m\.top\.seek = 999999/, 'Jump to Live seeks past the end, which Roku holds at its live point');
process.stdout.write('PASS: held seek, secondary subtitle and live rewind wiring (8 checks)\n');

// Back from Watch Parties goes one step: settings stays open under the screen, and the screen leaves
// the stack before it says it closed, so settings takes focus after the screen under it has
const partySettings = await readFile('components/settings/settings.bs', 'utf8');
const partyScreen = await readFile('components/watchParty/WatchPartiesScreen.bs', 'utf8');
assert.match(partySettings, /selectedItem\.settingName = "watchParty\.open"\s+openWatchParties\(\)/, 'Open Watch Parties keeps settings open');
assert.doesNotMatch(partySettings.match(/sub openWatchParties\(\)[^]*?end sub/)[0], /dismissPanel/, 'and doesn\'t dismiss it');
assert.match(partySettings, /sub onWatchPartiesClosed\(event as object\)[^]*?m\.top\.visible = true[^]*?m\.settingsMenu\.setFocus\(true\)/, 'Closing the screen brings settings back on its row');
assert.match(partyScreen, /sub closeScreen\(\)\s+m\.global\.sceneManager\.callFunc\("popScene"\)\s+m\.top\.closed = true/, 'The screen pops itself before it says it closed');
assert.match(partyScreen, /if key = KeyCode\.BACK\s+closeScreen\(\)\s+return true/, 'BACK on the room list closes it');
assert.match(partyScreen, /if key = KeyCode\.BACK then closeScreen\(\)/, 'and so does BACK in the lobby');
process.stdout.write('PASS: Watch Parties back navigation (6 checks)\n');

// A party's item plays alone, focus after Remove and Back, and the screen's keyboard handing focus back
const partyPlayer = await readFile('components/video/VideoPlayerView.bs', 'utf8');
assert.match(partyPlayer, /if queuePos = 0 and queueCount <= 1 and not wpActive\(\)/, 'A party player doesn\'t queue the season around its episode');
assert.match(await readFile('components/ItemGrid/LoadVideoContentTask.bs', 'utf8'), /if isValid\(video\.showID\) and not partyItem/, 'and the load doesn\'t queue the next episodes for it');
assert.match((await readFile('components/watchParty/WatchPartyPanel.bs', 'utf8')).match(/sub runAction\([^]*?end sub/)[0], /act\("remove", "Remove", \{ "member_id": arg \}\)\s+'[^\n]*\s+wpRowsPark\("people"\)/, 'Remove parks focus on the people heading');
assert.match(partyScreen, /if isReturning then m\.wpRows\.focus = -1/, 'Back from the player starts the lobby on its first button');
assert.match(partyScreen.match(/sub releaseKeyboard\(\)[^]*?end sub/)[0], /m\.top\.setFocus\(true\)/, 'The screen takes focus back when its keyboard closes');
process.stdout.write('PASS: Watch Parties player and focus wiring (5 checks)\n');

// The watchlist pages by Seerr's titles alone, however many library titles lead it on Silo, and names its shows
const favoritesTask = await readFile('components/favorites/LoadFavoritesTask.bs', 'utf8');
const watchlistPage = favoritesTask.match(/function watchlistPage\([^]*?end function/)[0];
assert.match(watchlistPage, /fetched: 0, lastPage: true \}/, 'Library titles don\'t count toward the next watchlist page');
assert.match(watchlistPage, /result\.fetched = answer\.results\.count\(\)/, 'Only Seerr\'s titles do');
assert.match(watchlistPage, /if isValid\(answer\.totalPages\) then result\.lastPage = page >= answer\.totalPages/, 'A page knows whether another follows');
assert.match(favoritesTask, /function loadedThrough\([^]*?if page\.lastPage and startIndex \+ page\.fetched < page\.total then return page\.total - startIndex/, 'and the last one makes the tab whole, so page 1 and the library\'s titles aren\'t asked for again');
assert.match(favoritesTask, /fetched\.watchlist = loadedThrough\(page, 0\)/);
assert.match(favoritesTask, /\{ watchlist: loadedThrough\(page, startIndex\) \}/);
assert.match(watchlistPage, /if isSiloServer\(\)\s+for each node in siloWatchlistNodes\(\)\s+if page = 1 then nodes\.push\(node\)/, 'Every page leaves out what the library already shows, though only the first shows it');
assert.match(await readFile('components/favorites/FavoritesScreen.bs', 'utf8'), /if pageFetched = 0 then m\.counts\[tabKey\] = m\.fetchedByTab\[tabKey\]/, 'An empty tab page ends paging');
assert.match(favoritesTask.match(/function watchlistNode\([^]*?end function/)[0], /if title = "" then title = toString\(item\.LookupCI\("name"\) \?\? ""\)/, 'A show on the watchlist takes its name when its title comes back empty');
process.stdout.write('PASS: Favorites watchlist paging and names (5 checks)\n');
