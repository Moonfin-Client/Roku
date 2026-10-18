# QRCode component

Vendored from [jean-guyrivard/QR-Code-generator-brightscript](https://github.com/jean-guyrivard/QR-Code-generator-brightscript)
at commit `9df1c6b`, MIT licensed (see `LICENSE.txt`). It is a BrightScript port by Kevin Hoos, for
Paramount, of [Project Nayuki's QR Code generator](https://www.nayuki.io/page/qr-code-generator-library).

It is a fork of [paramount-engineering/QR-Code-generator-brightscript](https://github.com/paramount-engineering/QR-Code-generator-brightscript),
which was archived in 2026 and has a bug in its `splice` helper that produces invalid codes for any symbol
with alignment patterns. The fork fixes that, so keep it and don't swap back to the original.

Only the files under `components/qrCode/` are used, unchanged. Set the `text` field on a `QRCode` node (a
`Poster`) and it renders a PNG into `tmp:/` and shows it.
