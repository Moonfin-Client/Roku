import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
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

// Execute production functions after BrighterScript transpilation. Only the
// device registry and authentication context are replaced with deterministic fixtures.
const selections = {
    'source/utils/serverCompatibility.bs': null,
    'source/utils/detailCompatibility.bs': null,
    'components/details/detailTrackHost.bs': ['SetUpVideoOptions'],
    'source/enums/VideoType.bs': null,
    'source/enums/MediaStreamType.bs': null,
    'source/utils/embyFeatures.bs': null,
    'components/embyPreview/EmbyPreviewTask.bs': ['loadPreviewData'],
    'components/PlaystateTask.bs': ['closeEmbyPlayback'],
    'components/ItemGrid/LoadVideoContentTask.bs': ['playbackResourceURL', 'resolvePlaybackURL', 'playbackPort', 'normalizedPlaybackPort', 'playbackUsesServerAuth', 'isHTTPStream', 'getTranscodeReasons', 'addVideoContentURL'],
    'components/ItemGrid/LoadItemsTask2.bs': ['getTargetImageURL', 'getTargetServerUrl', 'isUsingRemoteServer'],
    'source/api/userauth.bs': ['passwordLoginRequest', 'validPasswordLogin', 'passwordLoginError'],
    'source/utils/misc.bs': ['isLocalhost', 'isSupportedMediaServer', 'urlCandidates', 'isValid', 'isAllValid', 'isStringEqual', 'isChainValid', 'chainLookupReturn', 'chainLookup', 'isValidAndNotEmpty', 'serverVersionMeetsMinimumRequirements'],
    'source/ShowScenes.bs': ['ServerVersionCheck', 'startDetailExtras'],
    'source/utils/multiserver.bs': ['buildURLForSession', 'buildImageURLForServer'],
    'source/api/Items.bs': ['ItemMetaData'],
    'components/video/VideoPlayerView.bs': ['startEmbyPreview'],
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
process.stdout.write('PASS: sign-in entry wiring (4 checks)\n');

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

const favoriteWrites = await readFile('components/ItemGrid/FavoriteItemsTask.bs', 'utf8');
assert.match(favoriteWrites, /APIRequestForServer\([^]*?"UserFavoriteItems\/" \+ itemId/, 'Remote favorites use the shared request builder');
assert.doesNotMatch(favoriteWrites, /Substitute\([^\n]*favoriteitems|serverData\.serverUrl\s*\+/i, 'Remote favorites don\'t concatenate server URLs');

const playstateWrites = await readFile('components/PlaystateTask.bs', 'utf8');
assert.match(playstateWrites, /APIRequestForServer\([^]*?"UserPlayedItems\/" \+ itemId/, 'Remote playstate writes use canonical routes');
assert.doesNotMatch(playstateWrites, /normalizedUrl \+ "\/Users\//, 'Remote playstate writes do not concatenate legacy routes');

const multiServerUtils = await readFile('source/utils/multiserver.bs', 'utf8');
const imageBuilder = multiServerUtils.match(/function buildImageURLForServer\([^]*?end function/)[0];
assert.match(imageBuilder, /return buildURLForServer\(/, 'Remote images use the shared query-safe builder');

const homeRows = await readFile('components/home/HomeRows.bs', 'utf8');
assert.doesNotMatch(homeRows, /task\.endpoint = "\/Users\/\{userId\}\/(?:Items|Views)/, 'Home multi-server routes stay canonical');
assert.match(homeRows, /task\.endpoint = "\/UserItems\/Resume"/, 'Continue Watching uses the canonical user-items route');
assert.match(homeRows, /task\.endpoint = "\/UserViews"/, 'Library discovery uses the canonical user-views route');
assert.doesNotMatch(homeRows, /baseUrl \+ "\/Items\//, 'Remote row artwork uses the shared builder');

const seerrTask = await readFile('components/seerr/SeerrAPITask.bs', 'utf8');
assert.match(seerrTask, /url = buildServerURL\(serverUrl, targetPath, queryParams\)/, 'Plugin proxy preserves saved server query through shared compositor');

const extrasTask = await readFile('components/extras/LoadExtrasTask.bs', 'utf8');
assert.match(extrasTask, /function multiServerExtrasImageURL\([^]*?return buildURLForServer\(/, 'Remote detail extras images use the shared builder');
assert.doesNotMatch(extrasTask, /normalizedServerUrl \+ "\/Items\//, 'Remote detail extras do not concatenate server URLs');

const seasonResumeCheck = showScenes.match(/function hasSeasonEpisodeToResume\([^]*?end function/)[0];
assert.match(seasonResumeCheck, /return hasResummableEpisode\(seasonID\)/, 'Season Resume requires an actual resumable episode');
assert.doesNotMatch(seasonResumeCheck, /GetEpisodes\(/, 'Unplayed episodes do not masquerade as Resume');

const createSeriesDetails = showScenes.match(/function CreateSeriesDetailsGroup\([^]*?end function/)[0];
assert.doesNotMatch(createSeriesDetails, /displayResumeButton = hasNextUpEpisode/, 'Series Resume is not enabled by Next Up alone');

const seriesRefresh = eventHandlers.match(/sub onRefreshSeriesDetailsDataEvent\(\)[^]*?end sub/)[0];
assert.doesNotMatch(seriesRefresh, /hasNextUpEpisode\(/, 'Series refresh keeps Resume tied to saved progress');

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

process.stdout.write('PASS: Jellyfin review regressions (32 checks)\n');
