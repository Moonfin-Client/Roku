// Zips the transpiled channel. bsc would leave this to roku-deploy, which stores images as they are
// and only lightly deflates the rest, and that puts the store package over its 4 MB cap.
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';

const stagingDir = 'build/staging';
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const outFile = `out/Moonfin_Roku_v${version}.zip`;

// Comment lines go blank rather than away, so line numbers in a crash log still match the staged code
function trimScript(text) {
    return text.split('\n').map((line) => {
        const code = line.trimStart();
        return /^('|rem\b)/i.test(code) ? '' : code;
    }).join('\n');
}

// Translator notes are only read on Weblate. A message left untranslated, or translated to its own
// source, can go too, since tr hands back the source when nothing matches.
function trimTranslations(text) {
    return text
        .replace(/^[ \t]*<extracomment>.*<\/extracomment>\n/gm, '')
        .split('\n').map((line) => line.trimStart()).join('\n')
        .replace(/<message>\n<source>(.*)<\/source>\n<translation(?: type="unfinished")?>(?:\1)?<\/translation>\n<\/message>\n/g, '');
}

// Inline script keeps its lines, since a crash log counts them
function trimMarkup(text) {
    if (text.includes('<![CDATA[')) return text;
    return text.replace(/<!--[^]*?-->/g, '').split('\n').map((line) => line.trim()).filter((line) => line !== '').join('\n');
}

const zip = new JSZip();
const entries = await readdir(stagingDir, { recursive: true, withFileTypes: true });
const files = entries.filter((entry) => entry.isFile())
    .map((entry) => path.relative(stagingDir, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
    .sort();

for (const file of files) {
    let data = await readFile(path.join(stagingDir, file));
    if (file.endsWith('.brs')) data = trimScript(data.toString('utf8'));
    else if (file.endsWith('.ts')) data = trimTranslations(data.toString('utf8'));
    else if (file.endsWith('.xml')) data = trimMarkup(data.toString('utf8'));
    else if (file.endsWith('.json')) data = JSON.stringify(JSON.parse(data.toString('utf8')));
    zip.file(file, data, { createFolders: false });
}

await mkdir(path.dirname(outFile), { recursive: true });
await writeFile(outFile, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } }));
process.stdout.write(`${outFile} (${files.length} files)\n`);
