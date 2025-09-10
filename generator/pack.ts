import './versionSelect';
import { resolve } from 'path';
import { rename, readdir, mkdir, readFile, writeFile, rm } from 'fs/promises';
import { input } from '@inquirer/prompts';

const version = await input({
  message: 'Version of packing map',
  transformer: (val) => val.trim(),
});

const inputDir = resolve(process.cwd(), 'dataGenerated');
const outputDir = resolve(
  process.cwd(),
  'data',
  'mapData',
  globalThis.mapVersion,
  version
);

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir);

const files = await readdir(inputDir, {
  encoding: 'utf8',
  withFileTypes: true,
});

const promises = files
  .filter((dirent) => dirent.name !== '.gitkeep')
  .map(async ({ name, parentPath }) => {
    await rename(resolve(parentPath, name), resolve(outputDir, name));
  });

await Promise.all(promises);

// await import('./changelog');
