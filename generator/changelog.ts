import './versionSelect';
import { extraHotKeys, hotkeys } from '../utils/constants';
import { sortVersion, uniq } from '../utils/array';
import { isNotNil, isUpgradeObject } from '../utils/guards';
import { resolve } from 'path';
import { readdir, mkdir, readFile, writeFile } from 'fs/promises';
import type {
  IChangelog,
  IRaceData,
  ChangeTuple,
  IUnitObject,
  IUpgradeObject,
  IHeroObject,
  IBonusObject,
  IBaseObject,
  IChangelogRace,
  WithIconId,
  IRaceIcons,
  IUltimatesData,
} from '../data/types';
import { customAlphabet } from 'nanoid';
import { alphanumeric } from 'nanoid-dictionary';
import pick from 'lodash/pick';
import keyBy from 'lodash/keyBy';
import values from 'lodash/values';
import omitBy from 'lodash/omitBy';
import isEmpty from 'lodash/isEmpty';
import isEqual from 'lodash/isEqual';
import pickBy from 'lodash/pickBy';
import isObject from 'lodash/isObject';
import forEach from 'lodash/forEach';
import reduce from 'lodash/reduce';
import mapValues from 'lodash/mapValues';

import { buffer2webpbuffer } from 'webp-converter';
import Vinyl from 'vinyl';
import Spritesmith, { type SpritesmithResult } from 'spritesmith';
import sharp from 'sharp';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const nanoid = customAlphabet(alphanumeric, 6);

const getPath = (...args: string[]) =>
  resolve(process.cwd(), 'data', 'mapData', globalThis.mapVersion, ...args);

const dataDir = getPath();
const dirDirents = await readdir(dataDir, { withFileTypes: true });

const outputDir = resolve(
  process.cwd(),
  'data',
  'changelogs',
  globalThis.mapVersion
);

await mkdir(outputDir, { recursive: true });

const existsLogs = await readdir(outputDir);

const versions = sortVersion(
  dirDirents
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name)
);

type CompareObjects = IBaseObject &
  IUnitObject &
  IUpgradeObject &
  IHeroObject &
  IBonusObject;

const filesToSkip = ['misc', 'artifacts', 'ultimates', 'races', 'index'];
const compareKeys: Array<keyof CompareObjects> = [
  // Common
  //'description', - handle it separately
  'name',
  // Upgrades
  'cost',
  // Units
  'cost',
  'def',
  'atk',
  'hp',
  'bounty',
];

class ChangelogGenerator {
  private changelog: IChangelog;
  private races = Array<string>();
  private currentRace!: {
    oldIcons: Record<string, unknown>;
    newIcons: Record<string, unknown>;
    id: string;
  };

  private imagesMap = {
    old: {} as Record<string, Record<string, string>>,
    new: {} as Record<string, Record<string, string>>,
  };

  private imageBuffers: Record<string, Buffer> = {};

  constructor(public newVersion: string, public oldVersion: string) {
    this.changelog = {
      from: this.oldVersion,
      to: this.newVersion,
      type: globalThis.mapVersion,
      changes: {},
    };
  }
  get fileName() {
    return `${this.oldVersion}-${this.newVersion}.json`;
  }
  get imageName() {
    return `${this.oldVersion}-${this.newVersion}.webp`;
  }

  private async prepareRaces() {
    const newRaces = (await readdir(getPath(this.newVersion, 'races')))
      .map((f) => f.replace(/\..+/, ''))
      .filter((f) => !filesToSkip.includes(f))
      .filter(uniq);
    const oldRaces = (await readdir(getPath(this.oldVersion, 'races')))
      .map((f) => f.replace(/\..+/, ''))
      .filter((f) => !filesToSkip.includes(f))
      .filter(uniq);
    await newRaces
      .filter((r) => !oldRaces.includes(r))
      .reduce(async (acc, raceKey) => {
        await acc;
        const raceContent = await readFile(
          getPath(this.newVersion, 'races', `${raceKey}.json`),
          'utf8'
        );
        const raceData: IRaceData = JSON.parse(raceContent).data;
        if (!this.changelog.newRaces) this.changelog.newRaces = [];
        this.changelog.newRaces.push({
          id: raceData.id,
          name: raceData.name,
          key: raceData.key,
          description: raceData.description,
          type: 'race',
          hotkey: '',
        });
      }, Promise.resolve());

    this.races = oldRaces;
  }

  private async processUltimates() {
    const oldUltimatesFile = JSON.parse(
      await readFile(getPath(this.oldVersion, `ultimates.json`), 'utf8')
    );
    const newUltimatesFile = JSON.parse(
      await readFile(getPath(this.newVersion, `ultimates.json`), 'utf8')
    );

    const oldRaceContent: IUltimatesData = oldUltimatesFile.data;
    const newRaceContent: IUltimatesData = newUltimatesFile.data;
    const oldRaceIcons: IRaceIcons = oldUltimatesFile.icons;
    const newRaceIcons: IRaceIcons = newUltimatesFile.icons;

    this.currentRace = {
      id: 'ultimates',
      oldIcons: oldRaceIcons,
      newIcons: newRaceIcons,
    };

    const pickers = this.handleArrayByHotkey(
      oldRaceContent.pickers,
      newRaceContent.pickers
    );
    if (!pickers.length) return;

    this.changelog.ultimates = {
      pickers,
      requires: {
        ...oldRaceContent.requires,
        ...newRaceContent.requires,
      },
    };

    await this.processImages('ultimates', oldRaceIcons, newRaceIcons);
  }

  async generate() {
    if (existsLogs.includes(this.fileName)) return;
    await this.prepareRaces();

    for (const race of this.races) {
      await this.processRace(race);
    }

    await this.processUltimates();

    const icons = await this.generateSprite();

    await writeFile(
      resolve(outputDir, this.fileName),
      JSON.stringify({
        data: this.changelog,
        icons,
      })
    );
  }

  private async generateSprite() {
    if (!Object.keys(this.imageBuffers).length) return {};

    const copies: Record<string, string[]> = {};

    const preparedBuffers = Object.entries(this.imageBuffers).reduce(
      (acc, [id, buffer], idx, arr) => {
        const [findCopyId] =
          arr.find(([, iBuffer], i) => {
            const img1 = PNG.sync.read(buffer);
            const img2 = PNG.sync.read(iBuffer);
            const { width, height } = img1;
            const diffRaw = pixelmatch(
              img1.data,
              img2.data,
              null,
              width,
              height,
              { threshold: 0.3 }
            );
            return i < idx && diffRaw / (width * height) < 0.05;
          }) ?? [];

        if (findCopyId) {
          copies[findCopyId] = [...(copies[findCopyId] ?? []), id];
          return acc;
        }

        acc[id] = buffer;
        return acc;
      },
      {} as Record<string, Buffer>
    );

    const sprite = await new Promise<SpritesmithResult<Buffer>>((res, rej) => {
      Spritesmith.run(
        {
          padding: 2,
          src: Object.entries(preparedBuffers).map(
            ([name, buffer]) =>
              new Vinyl({
                path: `${name}.png`,
                contents: buffer,
              })
          ),
        },
        (err, data) => (err ? rej(err) : res(data))
      );
    });

    const webpBuffer = await buffer2webpbuffer(sprite.image, 'png', '-q 75');
    await writeFile(resolve(outputDir, this.imageName), webpBuffer);
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
  }

  private compareDescription<T extends { description?: string }>(
    oldObj: T,
    newObj: T
  ) {
    if (
      !oldObj.description ||
      !newObj.description ||
      isEqual(oldObj.description, newObj.description)
    ) {
      return [false, null, null] as const;
    }
    const oldTextParts = oldObj.description.split(/<br\s?\/?>/gm);
    const newTextParts = newObj.description.split(/<br\s?\/?>/gm);

    const replaceTags = (text: string, className: string) =>
      text.replace(
        /(?<open><[^>]+?>)?(?<content>[^<]*)(?<close><\/.+)?/m,
        (...args) => {
          const { open = '', content = '', close = '' } = args.pop() ?? {};
          return `${open}<span class="diff ${className}">${content}</span>${close}`;
        }
      );
    const wrapAdded = (text: string) => replaceTags(text, 'added');
    const wrapRemoved = (text: string) => replaceTags(text, 'removed');

    const oldText = oldTextParts
      .map((row) => {
        if (!newTextParts.includes(row)) {
          return wrapRemoved(row);
        }
        return row;
      })
      .join('<br/>');

    const newText = newTextParts
      .map((row) => {
        if (!oldTextParts.includes(row)) {
          return wrapAdded(row);
        }
        return row;
      })
      .join('<br/>');

    return [true, oldText, newText] as const;
  }

  private compare<T extends IBaseObject>(
    oldObj: T,
    newObj: T
  ): ChangeTuple<WithIconId<T>> | null {
    if (!oldObj || !newObj) return null;
    const type = oldObj.id === newObj.id ? 'change' : ('replace' as const);
    const oldOutputObj = pick(oldObj, ['id', 'name', 'type', 'hotkey']) as any;
    const newOutputObj = pick(newObj, ['id', 'name', 'type', 'hotkey']) as any;
    oldOutputObj.iconId = nanoid();
    newOutputObj.iconId = nanoid();
    let [output, oldText, newText] = this.compareDescription(oldObj, newObj);

    if (oldText || newText) {
      oldOutputObj.description = oldText;
      newOutputObj.description = newText;
    }

    compareKeys.forEach((key) => {
      if (!isEqual(oldObj[key], newObj[key])) {
        output = true;
        oldOutputObj[key] = oldObj[key];
        newOutputObj[key] = newObj[key];
      }
    });

    if (!output) return null;

    const oldIconId = this.getIconId(oldObj, this.currentRace.oldIcons);
    const newIconId = this.getIconId(newObj, this.currentRace.newIcons);
    if (!oldIconId || !newIconId) return null;

    this.imagesMap.old[this.currentRace.id] = {
      ...(this.imagesMap.old[this.currentRace.id] ?? {}),
      [oldIconId]: oldOutputObj.iconId,
    };
    this.imagesMap.new[this.currentRace.id] = {
      ...(this.imagesMap.new[this.currentRace.id] ?? {}),
      [newIconId]: newOutputObj.iconId,
    };

    return [type, oldOutputObj, newOutputObj];
  }

  private handleArrayByHotkey<T extends IBaseObject>(oldObj: T[], newObj: T[]) {
    let oldMap = keyBy(oldObj, 'id');
    let newMap = keyBy(newObj, 'id');

    let oldDiffValues = values(oldMap);
    let newDiffValues = values(newMap);

    const output = Array<Exclude<ReturnType<typeof this.compare>, null>>();

    const process = () => {
      Object.keys(oldMap).forEach((key) => {
        const oldObj = oldMap[key];
        const newObj = newMap[key];
        if (!newObj || !oldObj) return null;
        delete oldMap[key];
        delete newMap[key];
        const result = this.compare(oldObj, newObj);
        if (result) {
          output.push(result);
        }
      });

      oldDiffValues = values(oldMap);
      newDiffValues = values(newMap);
      if (oldDiffValues.length !== newDiffValues.length) {
        console.log(oldMap, newMap);
        throw new Error('Alarm! Some strange shit is going on here!!!!');
      }
      return !oldDiffValues.length && !newDiffValues.length;
    };

    const done = process();
    if (done) return output;

    oldMap = keyBy(oldMap, 'hotkey');
    newMap = keyBy(newMap, 'hotkey');

    process();

    oldDiffValues.forEach((oldObj, idx) => {
      const newObj = newDiffValues[idx];
      if (!newObj || !oldObj) return null;
      const result = this.compare(oldObj, newObj);
      if (result) {
        newObj.hotkey = extraHotKeys[idx];
        oldObj.hotkey = extraHotKeys[idx];
        output.push(result);
      }
    });

    return output;
  }

  private handleArrayByIdx<T extends IBaseObject>(oldObj: T[], newObj: T[]) {
    return oldObj
      .map((oldObjValue, idx) => {
        const newObjValue = newObj[idx];
        if (!newObjValue) return null;
        return this.compare(oldObjValue, newObjValue);
      })
      .filter(isNotNil);
  }

  private async processRace(raceId: string) {
    const oldRaceFile = JSON.parse(
      await readFile(
        getPath(this.oldVersion, 'races', `${raceId}.json`),
        'utf8'
      )
    );
    const newRaceFile = JSON.parse(
      await readFile(
        getPath(this.newVersion, 'races', `${raceId}.json`),
        'utf8'
      )
    );

    const oldRaceContent: IRaceData = oldRaceFile.data;
    const newRaceContent: IRaceData = newRaceFile.data;
    const oldRaceIcons: IRaceIcons = oldRaceFile.icons;
    const newRaceIcons: IRaceIcons = newRaceFile.icons;

    this.currentRace = {
      id: raceId,
      oldIcons: oldRaceIcons,
      newIcons: newRaceIcons,
    };

    const raceChangelog = omitBy(
      {
        name: newRaceContent.name,
        description: (() => {
          const [, oldText, newText] = this.compareDescription(
            oldRaceContent,
            newRaceContent
          );
          if (oldText && newText) return ['change', oldText, newText] as const;
        })(),
        upgrades: this.handleArrayByHotkey(
          values(oldRaceContent.baseUpgrades),
          values(newRaceContent.baseUpgrades)
        ),
        auras: this.handleArrayByIdx(
          oldRaceContent.auras,
          newRaceContent.auras
        ),
        bonuses: this.handleArrayByHotkey(
          oldRaceContent.bonuses,
          newRaceContent.bonuses
        ),
        heroes: this.handleArrayByIdx(
          oldRaceContent.heroes,
          newRaceContent.heroes
        ),
        units: pickBy(
          mapValues(oldRaceContent.units, (oldUnit, type) => {
            return this.compare(
              oldUnit,
              newRaceContent.units[type as keyof IRaceData['units']]
            );
          }),
          Boolean
        ),
        magic: this.handleArrayByIdx(
          oldRaceContent.magic.map((magic, idx) => ({
            ...magic,
            hotkey: hotkeys[idx],
          })),
          newRaceContent.magic.map((magic, idx) => ({
            ...magic,
            hotkey: hotkeys[idx],
          }))
        ),
        towerUpgrades: this.handleArrayByHotkey(
          oldRaceContent.towerUpgrades,
          newRaceContent.towerUpgrades
        ),
        buildings: pickBy(
          mapValues(oldRaceContent.buildings, (oldUnit, type) => {
            return this.compare(
              oldUnit,
              newRaceContent.buildings[type as keyof IRaceData['buildings']]
            );
          }),
          Boolean
        ),
        t1spell: this.compare(oldRaceContent.t1spell, newRaceContent.t1spell),
        t2spell: this.compare(oldRaceContent.t2spell, newRaceContent.t2spell),
      } satisfies IChangelogRace,
      isEmpty
    ) as unknown as IChangelogRace;

    if (Object.keys(raceChangelog).length <= 1) return;

    this.changelog.changes[raceId] = raceChangelog;

    await this.processImages(raceId, oldRaceIcons, newRaceIcons);
  }

  private getIconId(
    obj: IBaseObject | IUpgradeObject,
    icons: Record<string, unknown>
  ) {
    if (isUpgradeObject(obj)) {
      const maybeId = `${obj.id}-${obj.level}`;
      if (maybeId in icons) return maybeId;
    }
    if (obj.id in icons) return obj.id;
    return Array.from(
      { length: obj.iconsCount ?? 1 },
      (_, idx) => `${obj.id}-${idx + 1}`
    ).find((key) => key in icons);
  }

  private async processImages(
    raceId: string,
    oldMap: IRaceIcons,
    newMap: IRaceIcons
  ) {
    const outputPath = resolve(process.cwd(), 'temp');
    await mkdir(outputPath, { recursive: true });

    await reduce(
      this.imagesMap,
      async (acc, raceMap, type) => {
        await acc;
        if (type !== ('old' as const) && type !== ('new' as const)) return;

        const imageIdMap = raceMap[raceId];

        const patchDir = type === 'new' ? this.newVersion : this.oldVersion;

        const imagePath = getPath(patchDir, 'races', `${raceId}.webp`);

        const raceImageBuffer = await readFile(imagePath).catch(() =>
          readFile(getPath(patchDir, `${raceId}.webp`))
        );

        await reduce(
          imageIdMap,
          async (acc, customId, origId) => {
            await acc;

            const shape = (type === 'new' ? newMap : oldMap)[origId];
            if (!shape) return;
            const [left, top, width, height] = shape;

            const buffer = await sharp(raceImageBuffer)
              .extract({ left, top, width, height })
              .png()
              .toBuffer();

            this.imageBuffers[customId] = buffer;
          },
          Promise.resolve()
        );
      },
      Promise.resolve()
    );
  }
}

await versions.reduce(async (acc, version, idx, arr) => {
  await acc;
  const newVersion = arr[idx - 1];
  if (!newVersion) return;

  const generator = new ChangelogGenerator(newVersion, version);
  try {
    await generator.generate();
  } catch (e) {
    console.error(
      `Error while generating changelog from ${version} to ${newVersion}`,
      e
    );
  }
}, Promise.resolve());
