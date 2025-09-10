import type { Units } from './objects';
import type { W3Object } from './utils';
import { isNotNil } from '../utils/guards';
import { hashFromString } from '../utils/string';

export class W3Model {
  public modelHash: string;

  constructor(private instance: W3Object<Units>) {
    const rawName = [
      instance.parser.getModel(instance),
      // TODO: Disabled until render 3D
      // String(instance.getValueByKey('pat') ?? ''),
    ]
      .filter(isNotNil)
      .map((s) =>
        s
          .toLocaleLowerCase()
          .replace(/\.\w{2,}$/, '')
          .replace(/^[\\\/]/, '')
      )
      .join(',');
    this.modelHash = hashFromString(rawName);
  }
}
