import { readdir, writeFile } from 'fs/promises';
import { resolve } from 'path';
import { ImageProcessor } from './images';

const assetsDir = resolve(process.cwd(), 'assetsGenerator');

const imageProcessor = new ImageProcessor(
  assetsDir,
  resolve(process.cwd(), 'assets')
);

const files = await readdir(assetsDir, { withFileTypes: true });

const data = Object.fromEntries(
  files
    .filter((f) => f.isFile())
    .map(({ name }) => {
      const [key] = name.split('.');
      return [key, name];
    })
);

const coords = await imageProcessor.processImages(data, 'icons');
await writeFile(
  resolve(process.cwd(), 'assets', 'icons.json'),
  JSON.stringify(coords),
  { encoding: 'utf8' }
);
