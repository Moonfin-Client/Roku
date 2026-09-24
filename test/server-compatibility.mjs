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
    'components/ItemGrid/LoadVideoContentTask.bs': ['playbackResourceURL', 'resolvePlaybackURL', 'playbackPort', 'playbackUsesServerAuth', 'isHTTPStream', 'getTranscodeReasons', 'addVideoContentURL'],
    'components/ItemGrid/LoadItemsTask2.bs': ['getTargetImageURL', 'getTargetServerUrl', 'isUsingRemoteServer'],
    'source/api/userauth.bs': ['passwordLoginRequest', 'validPasswordLogin', 'passwordLoginError'],
    'source/utils/misc.bs': ['isLocalhost', 'isSupportedMediaServer', 'urlCandidates', 'isValid', 'isAllValid', 'isStringEqual', 'isChainValid', 'chainLookupReturn', 'chainLookup', 'isValidAndNotEmpty', 'serverVersionMeetsMinimumRequirements'],
    'source/ShowScenes.bs': ['ServerVersionCheck', 'startDetailExtras'],
    'source/utils/multiserver.bs': ['buildURLForSession'],
    'source/api/Items.bs': ['ItemMetaData'],
    'components/video/VideoPlayerView.bs': ['startEmbyPreview'],
    'source/api/Image.bs': ['ImageURL', 'metadataPosterURL'],
    'components/account/AccountDialog.bs': ['accountImageURL'],
    'components/config/SigninScene.bs': ['checkQuickConnectEnabled'],
    'source/utils/parsedUrl.bs': ['ParsedUrl', '__ParsedUrl_ToString'],
    'source/api/baserequest.bs': ['buildParams', 'buildURL', 'buildURLForServer', 'buildAuthHeader', 'buildAuthHeaderForServer', 'APIRequest', 'APIRequestForServer', 'authRequest', 'authRequestForServer', 'setCertificateAuthority', 'getJson', 'postPlaybackInfo', 'requestCanceled'],
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
assert.match(probe, /wait\(0, port\)/, 'Discovery should accept late server responses');
assert.doesNotMatch(probe, /totalseconds\(\) < 15/, 'Discovery must not restore the 15 second cap');
process.stdout.write('PASS: Jellyfin review regressions (4 checks)\n');
