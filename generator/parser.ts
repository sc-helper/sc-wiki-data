import {
  Abilities,
  abilitiesParser,
  itemsParser,
  unitsParser,
  Upgrades,
  upgradesParser,
} from './objects';
import { getError, W3Object } from './utils';
import { hotkeys } from '../utils/constants';
import { uniqById } from '../utils/array';
import { ImageProcessor } from './images';
import { writeFile, readFile } from 'fs/promises';
import { resolve } from 'path';
import type {
  IArtifactData,
  IArtifactObject,
  IBaseUltimateObject,
  IBonusObject,
  IBounty,
  IDamageTuple,
  IDataFile,
  IMiscData,
  INeutralData,
  IPatchDamage,
  IRaceData,
  IRacePickerObject,
  IRawPatchData,
  IRawRace,
  ISpellObject,
  IUltimatesData,
} from '../data/types';
import { isNotNil } from '../utils/guards';
import { mapObject } from '../utils/object';
import capitalize from 'lodash/capitalize';
import { W3Model } from './model';
import type { BaseScriptParser } from './baseScriptParser';

const outputDir = resolve(process.cwd(), 'dataGenerated');

const imgProcessor = new ImageProcessor(
  resolve(process.cwd(), 'dataMap'),
  outputDir
);

export class SurvivalChaosParser {
  private data: IRawPatchData;
  constructor(private parser: BaseScriptParser, private isOZ = false) {
    this.data = parser.getPatchData();
  }

  private races: IRaceData[] = [];

  async generate() {
    await this.parseRaces();
    await this.parseUltimates();
    await this.parseArtifacts();
    await this.parseMisc();
  }

  private get pickersParser() {
    return this.isOZ ? abilitiesParser : unitsParser;
  }

  private async parseRaces() {
    const racesMap = this.data.pickers;

    const imagePaths = Object.values(racesMap)
      .flat()
      .reduce((acc, raceID) => {
        const raceDesc = this.pickersParser.getById(raceID);
        if (!raceDesc) return acc;
        const path = raceDesc.getIcon();
        if (path) {
          acc[raceID] = path;
        }
        return acc;
      }, {} as Record<string, string>);

    const racesData = await Object.keys(racesMap).reduce(
      async (allianceAcc, allianceID) => {
        const prevAllianceAcc = await allianceAcc;
        const allianceName =
          this.pickersParser.getById(allianceID)?.getName() ?? '';
        prevAllianceAcc[allianceName] = await racesMap[allianceID].reduce(
          async (racesAcc, raceId) => {
            const prevRacesAcc = await racesAcc;

            const raceObj = this.pickersParser.getById(raceId);

            const description = this.isOZ
              ? raceObj?.getName() + '<br/>' + raceObj?.getValueByKey('ub1')
              : raceObj?.getValueByKey('tub');
            const rawRaceData = this.data.races.find(({ id }) => id === raceId);
            if (!rawRaceData) return prevRacesAcc;
            const [raceData, raceIcons] = this.tokenizeRaceData(
              rawRaceData,
              description
            );

            await this.writeData(raceData.key, raceData, raceIcons, 'races');

            this.races.push(raceData);

            prevRacesAcc.push({
              type: 'race',
              id: raceId,
              description,
              key: raceData.key,
              name: raceData.name,
              hotkey: raceObj?.getValueByKey('hot'),
            });

            return prevRacesAcc;
          },
          Promise.resolve([]) as Promise<IRacePickerObject[]>
        );
        return prevAllianceAcc;
      },
      Promise.resolve({}) as Promise<Record<string, IRacePickerObject[]>>
    );

    await this.writeData('races', racesData, imagePaths);
  }

  private tokenizeRaceData(data: IRawRace, description: string) {
    const icons: Record<string, string> = {};

    abilitiesParser.getById(data.ultiData?.id ?? '')?.withIcon(icons);

    const output: IRaceData = {
      id: data.id,
      key: data.key,
      name: data.name,
      description,
      bonusBuildings: data.bonuses
        .map((id) => unitsParser.getById(id))
        .filter(isNotNil)
        .map((i) => ({
          type: 'building',
          id: new W3Model(i).modelHash,
          name: i.getName(),
          hotkey: '',
        }))
        .filter(({ id }, i, arr) => arr.findIndex((i) => i.id === id) === i),
      auras: data.auras
        .map((auraId, idx) =>
          abilitiesParser
            .getById(auraId)
            ?.withIcon(icons)
            .withInstance((instance) => ({
              type: 'aura',
              id: auraId,
              name: instance.getName(),
              description: instance.getValueByKey('ub1'),
              hotkey: hotkeys[idx],
            }))
        )
        .filter(isNotNil),
      bonuses: data.bonuses
        .map((bonusID) => this.getBonus(bonusID, icons))
        .filter(isNotNil),
      towerUpgrades: data.upgrades
        .map((upgradeID) => upgradesParser.getById(upgradeID))
        .filter(isNotNil)
        .map((i) => i.withIcon(icons).parser.getUpgradeObject(i, icons))
        .map((item) => {
          // Remove last grade
          item.cost.splice(-1, 1);
          item.timers?.splice(-1, 1);
          return item;
        }),
      ...mapObject(
        { t1spell: data.t1spell, t2spell: data.t2spell },
        (id) =>
          abilitiesParser
            .getById(id)
            ?.withIcon(icons)
            .withInstance((instance) =>
              instance.parser.getSpellObject(instance)
            )!
      ),
      buildings: mapObject(data.buildings, (id) =>
        unitsParser
          .getById(id)!
          .withIcon(icons)
          .withInstance((i) =>
            this.parser.enrichUnitRequires(i.parser.getUnitObject(i))
          )
      ),
      heroes: data.heroes
        .map((heroId) => unitsParser.getById(heroId))
        .filter(isNotNil)
        .map((s, idx) =>
          s.withIcon(icons).withInstance((i) => ({
            ...i.parser.getHeroObject(i),
            hotkey: hotkeys[idx],
          }))
        )
        .concat(
          data.bonusHeroes
            .map(({ id, slot }) => {
              const instance = unitsParser.getById(id);
              if (!instance) return;
              instance.withIcon(icons);
              const itemsRaw = this.parser.getHeroItems(id);
              const items: IArtifactObject[] | undefined = !itemsRaw
                ? undefined
                : Object.entries(itemsRaw)
                    .map(([id, level]) => {
                      const instance = itemsParser.getById(id);
                      if (!instance) return;
                      instance.withIcon(icons);
                      return {
                        ...instance.parser.getArtifactObject(instance),
                        level: Number(level),
                      };
                    })
                    .filter(isNotNil);
              return {
                ...instance.parser.getHeroObject(instance),
                hotkey: hotkeys[slot],
                items,
              };
            })
            .filter(isNotNil)
        ),
      magic: upgradesParser
        .getById(data.magic)
        ?.withIcon(icons)
        .withInstance((instance) => {
          const { cost, iconsCount, ...rest } =
            instance.parser.getUpgradeObject(instance, icons);

          return Array.from({ length: instance.getMaxLevel() }, (_, idx) => {
            const level = idx + 1;
            return {
              ...rest,
              name: instance.getValueByKey('tp1', level) ?? rest.name,
              description:
                instance.getValueByKey('ub1', level) ?? rest.description,
              cost: [cost[idx]],
              iconsCount,
              level,
              spells: abilitiesParser
                .getIdsByValue('req', instance.id)
                .map((id) => abilitiesParser.getById(id))
                .filter(isNotNil)
                .map((s) => s.withIconSilent(icons).parser.getSpellObject(s)),
            };
          });
        })!,
      baseUpgrades: mapObject(data.baseUpgrades, (id) =>
        upgradesParser
          .getById(id)!
          .withIcon(icons)
          .withInstance((i) => i.parser.getUpgradeObject(i, icons))
      ),
      units: mapObject(
        data.units,
        (unitID) =>
          unitsParser
            .getById(unitID)
            ?.withIcon(icons)
            .withInstance((i) =>
              this.parser.enrichUnitRequires(i.parser.getUnitObject(i))
            )!
      ),
      ultiData: data.ultiData,
    };

    if (output.towerUpgrades.length !== data.upgrades.length) {
      const notFound = data.upgrades.filter(
        (upgrId) => !output.towerUpgrades.some(({ id }) => id === upgrId)
      );

      getError(`upgrades ${notFound.join(',')} for race ${data.name}`);
    }

    return [output, icons] as const;
  }

  private async parseArtifacts() {
    const { combineMap, list } = this.data.artifacts;

    const icons = {} as Record<string, string>;

    const items: IArtifactObject[] = list.map(
      (artId) =>
        itemsParser
          .getById(artId)
          ?.withIcon(icons)
          .withInstance((instance) => {
            let level =
              instance.getValueByKey('lvo') ?? instance.getValueByKey('lev');
            // OZ fix
            if (instance.id === 'I034') {
              level = 2;
            }
            return {
              ...instance.parser.getArtifactObject(instance),
              level,
            };
          })!
    );

    await this.writeData<IArtifactData>(
      'artifacts',
      {
        items,
        combineMap,
      },
      icons
    );
  }

  private async parseUltimates() {
    const rawData = this.data.ultimates;

    const icons: Record<string, string> = {};
    const requires: Record<string, string> = {};

    const getItemRequires = (data: W3Object) => {
      const reqIdArr = data.getArrayValue('req') ?? [];
      const reqValArr = data.getArrayValue('rqa')?.map(Number) ?? [];

      return reqIdArr.reduce((acc, id, idx) => {
        if (!(id in requires)) {
          const name = String(upgradesParser.getById(id)?.getRawValue('nam', 1))
            .replace(/\(.*?\)/g, '')
            .replace(/lv\d+/gm, '')
            .trim();
          requires[id] = name;
        }
        acc[id] = reqValArr[idx] ?? 0;
        return acc;
      }, {} as Record<string, number>);
    };

    const pickers: IBaseUltimateObject[] = rawData.pickers.map(
      (pickerID) =>
        abilitiesParser
          .getById(pickerID)
          ?.withIcon(icons)
          .withInstance((instance) => ({
            type: 'ultiPicker',
            id: pickerID,
            name: instance.getValueByKey('tp1') ?? instance.getName(),
            description: instance.getValueByKey('ub1'),
            hotkey: instance.getValueByKey('hky'),
            requires: getItemRequires(instance),
          }))!
    );

    const spells: Record<string, ISpellObject[]> = mapObject(
      rawData.spells,
      (spells) =>
        spells
          .map((spellId) => abilitiesParser.getById(spellId))
          .filter(isNotNil)
          .map((i) => i.withIcon(icons).parser.getSpellObject(i))
    );

    await this.writeData<IUltimatesData>(
      'ultimates',
      {
        pickers,
        spells,
        requires,
      },
      icons
    );
  }

  private async parseMisc() {
    const [shrines, shrineIcons] = this.parseShrines();
    const [neutrals, neutralIcons] = this.parseNeutrals();
    const [commonBonuses, commonBonusesIcons] = this.getCommonBonuses();

    const data: IMiscData = {
      damage: await this.getDamage(),
      shrines,
      neutrals,
      bounty: this.getBounty(),
      commonBonuses,
    };

    await this.writeData('misc', data, {
      ...shrineIcons,
      ...neutralIcons,
      ...commonBonusesIcons,
    });
  }

  private parseNeutrals(): [INeutralData[], Record<string, string>] {
    const icons: Record<string, string> = {};
    const neutrals: INeutralData[] = this.data.misc.neutrals
      .map((neutralId) =>
        unitsParser.getById(neutralId)?.withInstance((neutralInstance) => ({
          type: 'neutral',
          id: neutralInstance.id,
          name: neutralInstance.getName(),
          hotkey: '',
          skills:
            neutralInstance
              .getArrayValue('abi')
              ?.map((id) => abilitiesParser.getById(id))
              .filter(isNotNil)
              .map((instance) => {
                instance.withIcon(icons);
                return {
                  type: 'neutralSpell',
                  id: instance.id,
                  name: instance.getName().replace(/\(\w+\)$/, ''),
                  description: instance
                    .getAllValuesByKey(
                      'ub1',
                      ({ level }) => level > 0 && level <= 3
                    )
                    .map(String)
                    .join('<hr/>'),
                  hotkey: instance.getValueByKey('hky'),
                };
              }) ?? [],
        }))
      )
      .filter(isNotNil);

    return [neutrals, icons];
  }

  private parseShrines() {
    const icons: Record<string, string> = {};
    const shrines = this.data.misc.shrines
      ?.map((shrineSkillId) => abilitiesParser.getById(shrineSkillId))
      .filter(isNotNil)
      .map((i) => i.withIcon(icons).parser.getSpellObject(i));

    return [shrines, icons] as const;
  }

  private async getDamage(): Promise<IPatchDamage> {
    const miscData: Record<string, string> = Object.fromEntries(
      (
        await readFile(
          resolve(
            process.cwd(),
            'dataMap',
            globalThis.mapVersion ?? 'og',
            'war3mapMisc.txt'
          ),
          'utf8'
        )
      )
        .replace(/\r\n/g, '\n')
        .split('\n')
        .filter((s) => s.includes('='))
        .map((s) => s.split('='))
    );

    return (
      [
        'chaos',
        'hero',
        'magic',
        'normal',
        'pierce',
        'siege',
        'spells',
      ] as Array<keyof IPatchDamage>
    ).reduce((acc, key) => {
      const rawDamage = (miscData[`DamageBonus${capitalize(key)}`] ?? '').split(
        ','
      );
      rawDamage.length = 8;
      acc[key] = rawDamage.map((val) => {
        const numberValue = Number(val ?? '1.00');
        if (isNaN(numberValue)) return 100;
        return Number(((numberValue || 1) * 100).toFixed());
      }) as IDamageTuple;
      return acc;
    }, {} as IPatchDamage);
  }

  private getBounty(): Record<string, IBounty> {
    const getPointById = (id: string) => {
      const value =
        unitsParser
          .getById(id)
          ?.withInstance((instance) => instance.parser.getPoints(instance)) ??
        '0';
      return value;
    };

    return Object.fromEntries(
      this.races.map((raceData) => {
        const barracksIDs = [raceData.buildings.barrack.id];

        let [lowerBarrack] = unitsParser.findIDByKey(
          'upt',
          raceData.buildings.barrack
        );
        while (!!lowerBarrack) {
          barracksIDs.unshift(lowerBarrack);
          [lowerBarrack] = unitsParser.findIDByKey('upt', lowerBarrack);
        }
        let nextBarrack = unitsParser
          .getById(raceData.buildings.barrack.id)
          ?.getValueByKey('upt');
        while (!!nextBarrack) {
          barracksIDs.push(nextBarrack);
          nextBarrack = unitsParser.getById(nextBarrack)?.getValueByKey('upt');
        }

        const summon = [
          raceData.t1spell.summonUnit,
          raceData.t2spell.summonUnit,
          raceData.magic.map(({ spells }) =>
            spells?.map(({ summonUnit }) => summonUnit)
          ),
          raceData.towerUpgrades.map(({ spells }) =>
            spells?.map(({ summonUnit }) => summonUnit)
          ),
        ]
          .flat(5)
          .filter(isNotNil)
          .filter(uniqById)
          .map(({ bounty }) => bounty);

        return [
          raceData.id,
          {
            ...mapObject(raceData.units, ({ bounty }) => bounty),
            barracks: barracksIDs.map((id) => getPointById(id)),
            hero: raceData.heroes[0].bounty,
            su: raceData.heroes[3].bounty,
            tower: raceData.buildings.tower.bounty,
            fort: raceData.buildings.fort.bounty,
            summon,
          },
        ] as const;
      })
    );
  }

  private getCommonBonuses() {
    const tempDisable = true;
    if (this.isOZ || tempDisable) return [undefined, {}] as const;

    const raceData = Object.fromEntries(
      this.data.races.map(({ id: raceId, bonuses }) => {
        const bonusData = Object.fromEntries(
          bonuses
            .map((id) => unitsParser.getById(id))
            .filter(isNotNil)
            .map((instance) => [instance.id, instance.getArrayValue('abi')])
        );

        return [raceId, bonusData];
      })
    );

    const abilityMap = new Map<string, { bonusID: string; raceID: string }[]>();

    for (const [raceID, bonuses] of Object.entries(raceData)) {
      for (const [bonusID, abilityIDs] of Object.entries(bonuses)) {
        if (abilityIDs?.length ?? 9 > 6) continue;
        const key = JSON.stringify(abilityIDs);
        if (!abilityMap.has(key)) {
          abilityMap.set(key, []);
        }
        abilityMap.get(key)!.push({ bonusID, raceID });
      }
    }

    const result: string[] = [];

    for (const entries of abilityMap.values()) {
      const uniqueRaceIDs = new Set(entries.map((entry) => entry.raceID));

      if (uniqueRaceIDs.size > 1) {
        result.push(entries[0].bonusID);
      }
    }

    const icons: Record<string, string> = {};

    const data = result.map((id) => this.getBonus(id)).filter(isNotNil);

    return [data, icons] as const;
  }

  private getBonus(
    bonusID: string,
    icons?: Record<string, string>
  ): IBonusObject | undefined {
    const instance = unitsParser.getById(bonusID);
    if (!instance) return;

    instance.withIcon(icons ?? {});

    const relatedID = upgradesParser.getIdsByValue('req', bonusID);

    const unitReplace = unitsParser
      .getById(this.parser.getBonusUnit(bonusID) ?? '')
      ?.withIcon(icons ?? {})
      .withInstance((s) =>
        this.parser.enrichUnitRequires(s.parser.getUnitObject(s))
      );

    const rawSpells = instance
      .getArrayValue('abi')
      ?.map((id) => abilitiesParser.getById(id))
      .filter(isNotNil);

    const output = {
      type: 'bonus' as const,
      id: bonusID,
      name: instance.getValueByKey('tip'),
      hotkey: instance.getValueByKey('hot'),
      description: instance.getValueByKey('tub'),
      buildingId: new W3Model(instance).modelHash,
      relatedID,
      units: unitReplace ? [unitReplace] : undefined,
      spells:
        rawSpells && rawSpells.length > 1
          ? rawSpells.map((s) =>
              s.withIconSilent(icons ?? {}).parser.getSpellObject(s)
            )
          : undefined,
      upgrades: instance
        .getArrayValue('res')
        ?.map((i) => upgradesParser.getById(i))
        .filter(isNotNil)
        .map((i) => i.withIcon(icons ?? {}).parser.getUpgradeObject(i, icons)),
    };

    return output;
  }

  private async writeData<T>(
    name: string,
    data: T,
    icons: Record<string, string>,
    dir?: string
  ) {
    const iconsCoors = await imgProcessor.processImages(icons, name);

    const output: IDataFile<T> = {
      data,
      icons: iconsCoors,
    };

    await writeFile(
      resolve(...[outputDir, dir].filter(isNotNil), `${name}.json`),
      JSON.stringify(output),
      { encoding: 'utf8' }
    );
  }
}
