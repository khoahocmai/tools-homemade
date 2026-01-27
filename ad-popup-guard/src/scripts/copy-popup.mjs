import { mkdir, cp } from "node:fs/promises";

await mkdir("dist/src/popup", { recursive: true });

// copy popup files sang đúng chỗ extension đang chạy
await cp("src/popup/popup.html", "dist/src/popup/popup.html", { force: true });
await cp("src/popup/popup.js", "dist/src/popup/popup.js", { force: true });
await cp("src/popup/popup.css", "dist/src/popup/popup.css", { force: true });
await cp("manifest.json", "dist/manifest.json", { force: true });
