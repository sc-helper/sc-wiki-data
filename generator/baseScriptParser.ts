import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { IRaceData, IRawPatchData, IUnitObject } from '../data/types';

export abstract class BaseScriptParser {
  protected script: string;

  constructor() {
    this.script = readFileSync(
      resolve(
        process.cwd(),
        'dataMap',
        globalThis.mapVersion ?? 'og',
        'war3map.j'
      ),
      {
        encoding: 'utf8',
      }
    ).replace(/(\r\n)|\r/g, '\n');
  }

  abstract getPatchData(): IRawPatchData;

  abstract getBonusUnit(bonusID: string): string | undefined;
  abstract enrichUnitRequires(item: IUnitObject): IUnitObject;
  abstract getHeroItems(heroID: string): Record<string, string> | undefined;

  protected getIfBlockByIndex(cursorPosition: number, text = this.script) {
    const isIf = text.startsWith('if', cursorPosition);
    const isElseif = text.startsWith('elseif', cursorPosition);

    if (!isIf && !isElseif) {
      throw new Error('Start position not ar if/elseif block');
    }

    let depth = 0;
    let i = cursorPosition + (isIf ? 2 : isElseif ? 6 : 4);

    while (i < text.length) {
      if (text.startsWith('if', i)) {
        depth++;
        i += 2;
      } else if (text.startsWith('else', i)) {
        if (depth <= 0) {
          return text.slice(cursorPosition, i);
        }
        i += text.startsWith('elseif', i) ? 6 : 4;
      } else if (text.startsWith('endif', i)) {
        if (depth <= 0) {
          return text.slice(cursorPosition, i + 5);
        }
        depth--;
        i += 5;
      } else if (text.startsWith('endfunction', i)) {
        return text.slice(cursorPosition, i);
      } else {
        i++;
      }
    }

    return text.slice(cursorPosition);
  }
}
