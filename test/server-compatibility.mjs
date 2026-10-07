import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm, glob, access, readdir } from 'node:fs/promises';
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
    'source/utils/detailCompatibility.bs': null,
    'source/utils/parentalFilter.bs': null,
    'source/utils/seasonalRow.bs': null,
    'source/utils/seasonalEffects.bs': null,
    'source/utils/liveRecovery.bs': null,
    'source/utils/deviceCapabilities.bs': ['getSubtitleProfiles'],
    'source/utils/seerrMissingCollection.bs': null,
    'source/utils/libraryOrder.bs': null,
    'source/utils/detailSectionLayout.bs': null,
    'components/extras/collectionLookup.bs': ['findParents', 'namedCollection', 'namedFirst', 'membership'],
    'components/details/detailTrackHost.bs': ['SetUpVideoOptions'],
    'source/enums/VideoType.bs': null,
    'source/enums/MediaStreamType.bs': null,
    'source/enums/PlaybackMethod.bs': null,
    'source/enums/SubtitleSelection.bs': null,
    'source/enums/ItemType.bs': null,
    'source/MainEventHandlers.bs': ['isLiveTvChannel'],
    'source/utils/embyFeatures.bs': null,
    'components/embyPreview/EmbyPreviewTask.bs': ['loadPreviewData'],
    'components/PlaystateTask.bs': ['closeEmbyPlayback'],
    'components/captionTask.bs': ['trackAddress'],
    'components/ItemGrid/LoadVideoContentTask.bs': ['playbackResourceURL', 'resolvePlaybackURL', 'playbackPort', 'normalizedPlaybackPort', 'playbackUsesServerAuth', 'isHTTPStream', 'getTranscodeReasons', 'addVideoContentURL', 'addSourceCodecs', 'shouldBurnInSubtitle', 'transcodeCopiesVideo'],
    'components/ItemGrid/LoadItemsTask2.bs': ['getTargetImageURL', 'getTargetServerUrl', 'isUsingRemoteServer'],
    'source/api/userauth.bs': ['passwordLoginRequest', 'validPasswordLogin', 'passwordLoginError'],
    'source/utils/misc.bs': ['isLocalhost', 'isSupportedMediaServer', 'urlCandidates', 'isValid', 'isAllValid', 'isStringEqual', 'isChainValid', 'chainLookupReturn', 'chainLookup', 'isValidAndNotEmpty', 'serverVersionMeetsMinimumRequirements', 'toString', 'getHomeBackdropBlurAmount', 'inArray', 'guidKey', 'isString'],
    'source/ShowScenes.bs': ['ServerVersionCheck', 'startDetailExtras'],
    'source/utils/multiserver.bs': ['buildURLForSession', 'buildImageURLForServer', 'librariesByServer'],
    'source/api/Items.bs': ['ItemMetaData', 'playbackDeviceProfile', 'asksForServerStream'],
    'components/video/VideoPlayerView.bs': ['startEmbyPreview', 'nextTranscodeStep', 'streamSummary', 'liveFallbackMethod', 'liveReResolveRequest', 'liveReconnectingLabel', 'rokuAudioTrack'],
    'components/home/Home.bs': ['blurMatchingLoadWidth'],
    'components/home/HomeRows.bs': ['toNormalizedString'],
    'components/home/LoadItemsTask.bs': ['isPlaylistOrder', 'playableMembers', 'arrangeByStoredOrder', 'oneCardPerSeries', 'seriesCardForLatestItem', 'firstItems', 'chartItemType', 'providerKeys', 'indexByProviderIds'],
    'source/api/Image.bs': ['ImageURL', 'metadataPosterURL'],
    'components/account/AccountDialog.bs': ['accountImageURL'],
    'components/config/SigninScene.bs': ['checkQuickConnectEnabled'],
    'source/utils/parsedUrl.bs': ['ParsedUrl', '__ParsedUrl_ToString'],
    'source/api/baserequest.bs': ['buildParams', 'buildServerURL', 'buildURL', 'buildURLForServer', 'buildAuthHeader', 'buildAuthHeaderForServer', 'APIRequest', 'APIRequestForServer', 'authRequest', 'authRequestForServer', 'setCertificateAuthority', 'getJson', 'postPlaybackInfo', 'requestCanceled'],
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
source += '\n' + (await readFile('source/api/EmbyConnect.bs', 'utf8')).replace(/^import .*$/gm, '').replace(/    function Request\([^]*?    end function/, await readFile('test/emby-connect-transport.bs', 'utf8'));
source += '\n' + await readFile('test/emby-connect.bs', 'utf8');
source += '\n' + await readFile('test/emby-features.bs', 'utf8');
source += '\n' + await readFile('test/emby-media-routes.bs', 'utf8');
source += '\n' + await readFile('test/emby-details.bs', 'utf8');
source += '\n' + await readFile('test/server-compatibility.bs', 'utf8');
source += '\n' + await readFile('test/review-regressions.bs', 'utf8');
source += '\n' + await readFile('test/accent-folding.bs', 'utf8');
source += '\n' + await readFile('test/log-redaction.bs', 'utf8');
source += '\n' + await readFile('test/youtube-trailer.bs', 'utf8');
source += '\n' + await readFile('test/playback-fallback.bs', 'utf8');
source += '\n' + await readFile('test/home-backdrop-blur.bs', 'utf8');
source += '\n' + await readFile('test/subtitle-burn-in.bs', 'utf8');
source += '\n' + await readFile('test/seasonal-row.bs', 'utf8');
source += '\n' + await readFile('test/live-recovery.bs', 'utf8');
source += '\n' + await readFile('test/caption-download.bs', 'utf8');
source += '\n' + await readFile('test/subtitle-profiles.bs', 'utf8');
source += '\n' + (await readFile('components/extras/collectionLookup.bs', 'utf8')).match(/^const MAX_COLLECTIONS = .+$/m)[0];
source += '\n' + await readFile('test/collection-lookup.bs', 'utf8');
source += '\n' + await readFile('test/seerr-missing-collection.bs', 'utf8');
source += '\n' + await readFile('test/collection-row.bs', 'utf8');
source += '\n' + await readFile('test/external-rows.bs', 'utf8');
source += '\n' + await readFile('test/library-order.bs', 'utf8');
source += '\n' + await readFile('test/detail-sections.bs', 'utf8');
source += '\n' + await readFile('test/library-filters.bs', 'utf8');
source += '\n' + await readFile('test/item-menu.bs', 'utf8');
const settingsSyncFile = await readFile('source/utils/settingsSync.bs', 'utf8');
source += '\nnamespace settingsSync\n';
for (const name of ['SubtitleModes', 'PluginToRoku', 'RokuToPlugin']) {
    source += '\n' + settingsSyncFile.match(new RegExp(`^    function ${name}\\([^]*?^    end function`, 'm'))[0];
}
source += '\nend namespace\n';
source += '\n' + await readFile('test/settings-sync-values.bs', 'utf8');
source += '\n' + await readFile('test/seasonal-effects.bs', 'utf8');
source += '\n' + await readFile('test/audio-track.bs', 'utf8');
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

// Verify that the packaged entry screen exposes both routes and wires Connect.
const entry = await readFile('components/config/SetServerScreen.xml', 'utf8');
assert.match(entry, /id="addServerButton"\s+text="Enter Server URL"/);
assert.match(entry, /id="embyConnectButton"\s+text="Emby Connect"/);
assert.match(await readFile('source/ShowScenes.bs', 'utf8'), /if CreateEmbyConnectGroup\(\)/);
assert.match(await readFile('components/embyConnect/EmbyConnectScene.xml', 'utf8'), /extends="SigninScene"/);
const signinShown = (await readFile('components/config/SigninScene.bs', 'utf8')).match(/sub OnScreenShown\([^]*?end sub/)[0];
assert.match(signinShown, /m\.top\.lastFocus\.setFocus\(true\)\s+else if not m\.quickConnectGroup\.visible\s+m\.config\.setFocus\(true\)/, 'Sign-in hands the form focus when Quick Connect has not');
process.stdout.write('PASS: sign-in entry wiring (5 checks)\n');

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
const extrasChanged = buttonHost.match(/sub onDetailExtrasChanged\(\)[^]*?end sub/)[0];
assert.match(extrasChanged, /selectedId = m\.buttonGroups\[previousIndex\]\.id/, 'Async button rebuild remembers logical selection');
assert.match(extrasChanged, /m\.currentButtonIndex = i[^]*?if focusedId <> "" then focusButton\(i\)/, 'Async button rebuild restores index without stealing focus');

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
assert.match(audioPlayerView, /audioArtworkURL\(currentItem[^]*?ImageType\.PRIMARY/, 'Audio artwork uses the queue-item server');

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
    await access(`images/achievements/${target}.png`);
    await assert.rejects(access(`images/achievements/${alias}.png`), undefined, `${alias} shares ${target}.png rather than keeping a copy`);
}
process.stdout.write(`PASS: achievement icon aliases (${iconAliases.length} checks)\n`);

// MaskGroup ignores the tRNS transparency of a grayscale PNG and draws the whole child, so a mask
// needs an alpha channel or a palette.
const maskImages = new Set();
for await (const file of glob('{components,source}/**/*.{bs,xml}')) {
    const code = await readFile(file, 'utf8');
    for (const [, image] of code.matchAll(/maskUri\s*=\s*"pkg:\/(images\/[^"]+\.png)"/g)) maskImages.add(image);
    for (const [, image] of code.matchAll(/"pkg:\/(images\/[^"]*mask[^"]*\.png)"/gi)) maskImages.add(image);
}
assert.ok(maskImages.size > 10, 'The mask scan found the masks');
for (const image of maskImages) {
    const colorType = (await readFile(image))[25];
    assert.ok([3, 4, 6].includes(colorType), `${image} keeps its transparency where MaskGroup reads it`);
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

// A card left in a selection field opens again when a favorite or watched change rewrites it, and
// that rewrite has to leave the card's type alone.
const extrasSelections = [
    ['ModernItemDetails', /sub openSelectedItem\(item as object\)\s+m\.extrasGrid\.selectedItem = item\s+m\.extrasGrid\.selectedItem = invalid/],
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
assert.match(searchTask, /people = startPeopleSearch\(query\)[^]*?searchMedia\(query\)[^]*?publishSearchResults\(results, query, requestToken, false\)[^]*?peopleSearchResults\(people, PEOPLE_TIMEOUT_MS - clock\.TotalMilliseconds\(\)\)/, 'People start before the media search, media is published first and the late wait is bounded');
process.stdout.write('PASS: search people wiring (2 checks)\n');

// Modern and Classic list every collection a film is in
const parentCollection = extrasTask.match(/sub loadParentCollection\([^]*?end sub/)[0];
assert.doesNotMatch(parentCollection, /^\s*return\s*$/m, 'The extras task keeps going after the first collection');
assert.match(await readFile('components/extras/ExtrasRowList.bs', 'utf8'), /for each collectionNode in parentCollectionNodes/, 'Classic draws a row per collection');
assert.match(await readFile('components/details/ModernItemDetails.bs', 'utf8'), /label: tr\("Collections"\), kind: "collections"/, 'Modern puts more than one collection under a Collections tab');
process.stdout.write('PASS: parent collections wiring (3 checks)\n');

// The row's sync keys, layout slot and strict filter live in files the harness cant load
// whole, so they are checked where they are declared.
const settingsSyncSource = await readFile('source/utils/settingsSync.bs', 'utf8');
assert.match(settingsSyncSource, /\{ pluginKey: "seasonalRowEnabled", rokuKey: "seasonal\.row\.enabled", type: "bool" \}/, 'The seasonal switch syncs as a bool');
assert.match(settingsSyncSource, /\{ pluginKey: "seasonalRowCountry", rokuKey: "seasonal\.row\.country", type: "direct" \}/, 'The seasonal country syncs as text');
assert.match(settingsSyncSource, /\{ pluginKey: "seasonalRowHiddenHolidays", rokuKey: "seasonal\.row\.hiddenHolidays", type: "jsonArray" \}/, 'The hidden holidays sync as a list');
assert.match(settingsSyncSource.match(/function GetRowToggleMappings\([^]*?end function/)[0], /"rewatch", "seasonal"/, 'The pulled layout drives the seasonal switch');
const rowLayoutSource = await readFile('source/utils/homeRowLayout.bs', 'utf8');
assert.match(rowLayoutSource, /\{ id: "nextup", label: "Next Up" \},\s*\{ id: "seasonal", label: "Seasonal Row" \}/, 'An unarranged seasonal row sits after Next Up');
assert.match(rowLayoutSource, /seasonal: "seasonal\.row\.enabled"/, 'The seasonal row answers to its own switch');
assert.match(rowLayoutSource.match(/function IsEnabled\([^]*?end function/)[0], /if id = "seasonal" then return homeRowLayout\.RowToggleOn\(id\)/, 'A layout without the seasonal row leaves it to the switch');
const loadItemsSource = await readFile('components/home/LoadItemsTask.bs', 'utf8');
assert.match(loadItemsSource, /startsWith\("plugindynamic:"\)\s+m\.top\.content = parentalControls\.WithoutUnratedOrBlockedItems\(/, 'Chart rows drop unrated titles once a rating is blocked');
assert.match(loadItemsSource, /startsWith\("seerr_"\)\s+m\.top\.content = parentalControls\.WithoutBlockedItems\(/, 'Seerr rows keep the usual filter');
assert.match(loadItemsSource.match(/function loadSeasonalRow\([^]*?end function/)[0], /WithoutBlockedItems\(owned\)[^]*?WithoutUnratedOrBlockedItems\(suggestions\)/, 'Owned titles keep the usual filter and suggestions the strict one');
assert.match(await readFile('components/home/LoadItemsTask.xml', 'utf8'), /<field id="rowKey" type="string"/, 'The row task reports which holiday it loaded');
process.stdout.write('PASS: seasonal row wiring (11 checks)\n');

// A picked collection row asks for its members alone, follows a stored Playlist Order and opens
// a series into its episodes in order when asked
assert.match(loadItemsSource.match(/function loadPickedRow\([^]*?end function/)[0], /else if isStringEqual\(picked\.source, "collections"\)\s+params\.ParentId = itemId\s+items = collectionRowItems\(params, settings\)/, 'A collection is asked for its members without Recursive');
assert.match(loadItemsSource.match(/function collectionRowItems\([^]*?end function/)[0], /\/Moonfin\/Collections\/\$\{params\.ParentId\}\/Order[^]*?Recursive: true,\s+Limit: FLAT_COLLECTION_LIMIT/, 'A stored order reads the collection flat');
assert.match(loadItemsSource.match(/function expandSeriesToEpisodes\([^]*?end function/)[0], /SortBy: "ParentIndexNumber,IndexNumber",\s+SortOrder: "Ascending"/, 'A series opens into its episodes in order');
assert.match(await readFile('settings/settings.json', 'utf8'), /"settingName": "ui\.home\.collectionsRowSortBy"[^]*?"id": "playlistOrder"/, 'Playlist Order is offered for the collection rows');
process.stdout.write('PASS: collection row wiring (4 checks)\n');

// Chart rows match their titles against the library, by provider id on Emby and through a paged
// index of the library's ids on Jellyfin, and a TMDB chart types its titles from its path
assert.match(loadItemsSource.match(/function matchOnEmby\([^]*?end function/)[0], /IncludeItemTypes: "Movie,Series",\s+AnyProviderIdEquals:/, 'Emby filters by provider id on the server');
assert.match(loadItemsSource.match(/function readLibraryIndex\([^]*?end function/)[0], /StartIndex: start,\s+Limit: LIBRARY_INDEX_PAGE[^]*?pageFull = data\.Items\.Count\(\) = LIBRARY_INDEX_PAGE/, 'Jellyfin reads the library a page at a time until a page comes back short');
assert.match(loadItemsSource.match(/function customRowCard\([^]*?end function/)[0], /for each key in providerKeys\(item\)\s+if owned\.DoesExist\(key\)/, 'An owned chart title becomes its library card');
assert.match(loadItemsSource, /if source = "tmdb_chart" then rowType = chartItemType\(chartType\)/, 'A TMDB chart types its titles from the path');
process.stdout.write('PASS: external rows wiring (4 checks)\n');

// Library lists keep each server's order and leave out what an Emby user hid from My Media
assert.match(await readFile('components/tasks/MultiServerTask.bs', 'utf8'), /itemsArray = withoutHiddenViews\(itemsArray, embyHiddenViews\(reqInfo\.userSession\)\)/, 'Multi-server views drop the libraries an Emby user hid');
for (const nav of ['components/Sidebar.bs', 'components/JFOverhang.bs']) {
    const navSource = await readFile(nav, 'utf8');
    assert.match(navSource, /for each lib in librariesByServer\(allLibs\)/, `${nav} keeps each server's library order`);
    assert.doesNotMatch(navSource, /sortLibrariesAlphabetically/, `${nav} no longer sorts libraries A to Z`);
}
assert.match(await readFile('components/Sidebar.bs', 'utf8'), /if isEmbyServer\(\) then views = withoutHiddenViews\(views, chainLookupReturn\(m\.global, "session\.user\.configuration\.MyMediaExcludes", \[\]\)\)/, 'The nav list drops the libraries an Emby user hid');
process.stdout.write('PASS: library order wiring (6 checks)\n');

// Deleting or moving a playlist row names its entry id, which Emby keeps apart from the item's id
assert.match(await readFile('source/api/Items.bs', 'utf8'), /tmp\.playlistItemId = \(item\.LookupCI\("PlaylistItemId"\) \?\? ""\)\.ToStr\(\)/, 'Each playlist row keeps its entry id');
const itemMenuTask = await readFile('components/itemMenu/ItemMenuTask.bs', 'utf8');
assert.match(itemMenuTask, /taskRequest\(`Playlists\/\$\{request\.playlistId\}\/Items`, \{ EntryIds: request\.entryId \}\), "DELETE"\)/, 'The row menu deletes by entry id');
assert.match(itemMenuTask, /taskRequest\(`Playlists\/\$\{request\.playlistId\}\/Items\/\$\{request\.entryId\}\/Move\/\$\{request\.newIndex\.toStr\(\)\}`, \{\}\), "POST"\)/, 'The move names the entry id and where it goes');
const itemMenuHostSource = await readFile('components/itemMenu/itemMenuHost.bs', 'utf8');
assert.match(itemMenuHostSource.match(/sub itemMenuChangePlaylist\([^]*?end sub/)[0], /rows\.removeChildIndex\(from\)[^]*?m\.top\.callFunc\("playlistRowsChanged", target\)[^]*?runItemMenuTask/, 'The row goes before the server answers');
assert.match(itemMenuHostSource.match(/sub onItemMenuPlaylistChanged\([^]*?end sub/)[0], /rows\.insertChild\(row, request\.from\)/, 'And comes back if the server refuses');
assert.match(mainActions, /APIRequest\(`\/Playlists\/\$\{playlistID\}\/Items`, \{ EntryIds: entryID \}\)[^]*?req\.SetRequest\("DELETE"\)/, 'The delete names the entry id');
assert.match(mainActions.match(/sub removeItemFromMyList\([^]*?end sub/)[0], /MainAction\.removeItemFromPlaylist\(playlistID, MainAction\.playlistEntryId\(playlistID, itemID\)\)/, 'My List takes a title out by its entry id too');
assert.match(await readFile('components/music/PlaylistDetails.bs', 'utf8'), /m\.itemList\.content = listData/, 'The playlist screen lists the rows playback reads');
for (const screen of ['components/music/PlaylistDetails.xml', 'components/details/ModernItemDetails.xml', 'components/details/SpotlightItemDetails.xml']) {
    assert.match(await readFile(screen, 'utf8'), /<function name="playlistRowsChanged" \/>/, `${screen} redraws its rows after the menu changes them`);
}
process.stdout.write('PASS: playlist row wiring (11 checks)\n');

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
await access('images/achievements/notifications_active.png');
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
await access('images/icons/friends.png');
await access('images/icons/settings/groups.png');
process.stdout.write('PASS: friends and chat wiring (19 checks)\n');

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
const artwork = ['dot', 'flake', 'leaf', 'leaf-mirror', 'disc', 'glow', 'spark', 'rocket', 'star', 'bat', 'blossom', 'candy', 'bee', 'ghost',
    ...palette('petals').map(color => `petal-${color}`), ...palette('baubles').map(color => `bauble-${color}`)];
assert.deepEqual((await readdir('images/seasonal')).sort(), artwork.map(name => `${name}.png`).sort(), 'Every seasonal image the effects name ships, and nothing else');
await access('images/icons/settings/star_shine.png');
await access('images/icons/settings/blur_on.png');
process.stdout.write('PASS: seasonal effects wiring (10 checks)\n');
