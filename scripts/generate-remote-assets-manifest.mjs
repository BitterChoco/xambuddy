import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const assetsRoot = path.join(projectRoot, "assets");
const sourceRoots = [
  path.join(assetsRoot, "game"),
  path.join(assetsRoot, "sound"),
];
const additionalFiles = [path.join(assetsRoot, "images", "background_1.png")];
const bundledFiles = new Set([
  path.join(assetsRoot, "images", "loading_screen.jpg"),
  path.join(
    assetsRoot,
    "sound",
    "turning_pages-lantern-in-the-glade-600973.mp3",
  ),
]);
const version = process.argv[2];
if (!version) {
  throw new Error(
    "Pass a new asset release version, for example: node scripts/generate-remote-assets-manifest.mjs 1.0.2",
  );
}
const supportedExtensions = new Set([
  ".aac",
  ".flac",
  ".jpg",
  ".jpeg",
  ".json",
  ".md",
  ".m4a",
  ".mp3",
  ".ogg",
  ".png",
  ".wav",
  ".webp",
]);

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(absolutePath)));
    } else if (
      supportedExtensions.has(path.extname(entry.name).toLowerCase())
    ) {
      files.push(absolutePath);
    }
  }

  return files;
}

const files = [
  ...(await Promise.all(sourceRoots.map((root) => collectFiles(root)))).flat(),
  ...additionalFiles,
]
  .filter((file) => !bundledFiles.has(file))
  .sort((left, right) => left.localeCompare(right));
const manifestFiles = await Promise.all(
  files.map(async (absolutePath) => {
    const [contents, fileStats] = await Promise.all([
      readFile(absolutePath),
      stat(absolutePath),
    ]);
    return {
      path: path.relative(assetsRoot, absolutePath).split(path.sep).join("/"),
      size: fileStats.size,
      sha256: createHash("sha256").update(contents).digest("hex"),
    };
  }),
);

manifestFiles.sort((left, right) => left.path.localeCompare(right.path));

console.log(
  JSON.stringify(
    {
      schemaVersion: 1,
      version,
      files: manifestFiles,
    },
    null,
    2,
  ),
);
