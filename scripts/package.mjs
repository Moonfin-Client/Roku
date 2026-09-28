// Zips the transpiled channel. bsc would leave this to roku-deploy, which stores images as they are
// and only lightly deflates the rest, and that puts the store package over its 4 MB cap.
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';

const stagingDir = 'build/staging';
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const outFile = `out/moonfin-roku-v${version}.zip`;

// Comment lines go blank rather than away, so line numbers in a crash log still match the staged code
function trimScript(text) {
    return text.split('\n').map((line) => {
        const code = line.trimStart();
        return /^('|rem\b)/i.test(code) ? '' : code;
    }).join('\n');
}

// Translator notes are only read on Weblate. An English message that matches its source can go
// too, since tr hands back the source when nothing matches.
function trimTranslations(text, english) {
    text = text
        .replace(/^[ \t]*<extracomment>.*<\/extracomment>\n/gm, '')
        .split('\n').map((line) => line.trimStart()).join('\n');
    if (!english) return text;
    return text.replace(/<message>\n<source>(.*)<\/source>\n<translation>\1<\/translation>\n<\/message>\n/g, '');
}

const zip = new JSZip();
const entries = await readdir(stagingDir, { recursive: true, withFileTypes: true });
const files = entries.filter((entry) => entry.isFile())
    .map((entry) => path.relative(stagingDir, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
    .sort();

for (const file of files) {
    let data = await readFile(path.join(stagingDir, file));
    if (file.endsWith('.brs')) data = trimScript(data.toString('utf8'));
    else if (file.endsWith('.ts')) data = trimTranslations(data.toString('utf8'), file === 'locale/en_US/translations.ts');
    zip.file(file, data);
}

await mkdir(path.dirname(outFile), { recursive: true });
await writeFile(outFile, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } }));
process.stdout.write(`${outFile} (${files.length} files)\n`);
