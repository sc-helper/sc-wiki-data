import Spritesmith from 'spritesmith';
import type { SpritesmithResult } from 'spritesmith';
import { resolve } from 'path';
import { decodeBLP, getBLPImageData } from 'war3-model';
import { readFile, writeFile } from 'fs/promises';
import { PNG } from 'pngjs';
import { buffer } from 'node:stream/consumers';
import { PassThrough } from 'stream';
import Vinyl from 'vinyl';
import { buffer2webpbuffer } from 'webp-converter';
import { decodeImage, parseDDSHeader } from 'dds-ktx-parser';
import tga2png from 'tga2png';
import { W3File } from './w3file';

export class ImageProcessor {
  constructor(private baseImagesUrl: string, private outputDir: string) {}

  private async getPngBufferFromPathBlp(path: string) {
    const data = decodeBLP((await readFile(path)).buffer);
    const imageData = getBLPImageData(data, 0);

    const png = new PNG({
      width: data.width,
      height: data.height,
      inputHasAlpha: true,
    });

    png.data = Buffer.from(imageData.data.buffer);
    const stream = new PassThrough();
    png.pack().pipe(stream);

    return buffer(stream);
  }

  private async getPngBufferFromPathDds(path: string) {
    const imageBuffer = await readFile(path);
    const imageInfo = parseDDSHeader(imageBuffer);

    if (!imageInfo) return;

    const png = new PNG({
      width: imageInfo.shape.width,
      height: imageInfo.shape.height,
      inputHasAlpha: true,
    });

    png.data = decodeImage(imageBuffer, imageInfo.format, imageInfo.layers[0]);

    const stream = new PassThrough();
    png.pack().pipe(stream);

    return buffer(stream);
  }

  private async getPngBufferFromPath(path: string) {
    const file = new W3File(path, ['blp', 'dds', 'tga'], this.baseImagesUrl);
    switch (file.extension) {
      case 'blp':
        return this.getPngBufferFromPathBlp(file.path);
      case 'dds':
        return this.getPngBufferFromPathDds(file.path);
      case 'tga':
        return tga2png(file.path);
    }
  }

  async processImages(
    images: Record<string, string>,
    /**Without extension */
    outputName: string
  ) {
    try {
      const copies: Record<string, string[]> = {};
      const buffers = await Object.entries(images).reduce(
        async (acc, [name, path], idx, arr) => {
          const [findCopyId] =
            arr.find(([, iPath], i) => path === iPath && i < idx) ?? [];
          if (findCopyId) {
            copies[findCopyId] = [...(copies[findCopyId] ?? []), name];
            return acc;
          }

          const prevAcc = await acc;

          try {
            const imageBuffer = await this.getPngBufferFromPath(path);
            if (imageBuffer) {
              prevAcc[name] = imageBuffer;
            }
          } catch (e) {
            console.warn(`Error while getting image for ${name}: ${path}`);
          }

          return prevAcc;
        },
        Promise.resolve({} as Record<string, Buffer>)
      );

      const sprite = await new Promise<SpritesmithResult<Buffer>>(
        (res, rej) => {
          Spritesmith.run(
            {
              padding: 2,
              src: Object.entries(buffers).map(
                ([name, buffer]) =>
                  new Vinyl({
                    path: `${name}.png`,
                    contents: buffer,
                  })
              ),
            },
            (err, data) => (err ? rej(err) : res(data))
          );
        }
      );

      const webpBuffer = await buffer2webpbuffer(sprite.image, 'png', '-q 75');
      await writeFile(
        resolve(this.outputDir, `${outputName}.webp`),
        webpBuffer
      );

      const shortenCoordinates = Object.entries(sprite.coordinates).reduce(
        (acc, [key, { x, y, width, height }]) => {
          const [id] = key.split('.');
          copies[id]?.forEach((copyId) => {
            acc[copyId] = [x, y, width, height];
          });
          acc[id] = [x, y, width, height];
          return acc;
        },
        {} as Record<
          string,
          [x: number, y: number, width: number, height: number]
        >
      );
      return shortenCoordinates;
    } catch (e) {
      console.log({ images, outputName });
      throw e;
    }
  }
}
