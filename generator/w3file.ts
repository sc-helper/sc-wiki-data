import { existsSync } from 'fs';
import { resolve } from 'path';
import { isNotNil } from '../utils/guards';

export class W3File<const E extends String> {
  public path!: string;
  public extension!: E;

  constructor(path: string, extensions: E[], customPath?: string) {
    const nonExtPath = path.replace(/(?=.+)\.[^\.]*$/, '');
    [
      customPath,
      resolve(process.cwd(), 'dataMap', globalThis.mapVersion || 'og'),
      resolve(process.cwd(), 'dataWarcraft'),
    ]
      .filter(isNotNil)
      .forEach((basePath) => {
        if (!!this.path) return;
        for (let i = 0; i < extensions.length; i++) {
          const ext = extensions[i];
          const tmpPath = resolve(basePath, `${nonExtPath}.${ext}`);
          if (existsSync(tmpPath)) {
            this.path = tmpPath;
            this.extension = ext;
            return;
          }
        }
      });
    if (!this.path) {
      getError(`getting file ${path}`);
    }
  }
}

function getError(reason?: string): never {
  throw new Error(`Error while ${reason ?? 'unknown reason'}`);
}
