import type {
  IRawArtifacts,
  IRawBonusHero,
  IRawPatchData,
  IRawRace,
  IRawUltimates,
  IUnitObject,
} from '../data/types';
import { abilitiesParser, unitsParser, upgradesParser } from './objects';
import { mapObject } from '../utils/object';
import { isNotNil } from '../utils/guards';
import { uniq, uniqById } from '../utils/array';
import { getError } from './utils';
import { BaseScriptParser } from './baseScriptParser';

export class OZScriptParser extends BaseScriptParser {
  private pickers = [
    1346978609, 1346978610, 1346978611, 1346978612, 1346978613,
  ];
  private scriptVariables = {
    aura: 'r',
    heroes: ['t', 'i', 'S', 'c'],
    bonusPicker: 'I',
    description: 'k',
    magic: 'N',
    buildings: {
      fort: 'm',
      barrack: 'Q',
      tower: 'U',
    },
    baseUpgrades: {
      melee: 'V',
      armor: 'M',
      range: 'B',
      wall: 'ww',
    },
    units: {
      melee: 'P',
      range: 'A',
      mage: 'D',
      siege: 'H',
      air: 'J',
      catapult: 'K',
    },
    towerUpgrades: ['uw', 'rw', 'sw', 'tw', 'iw', 'Sw', 'cw', 'ow', 'Ow'],
  };

  public getPatchData(): IRawPatchData {
    const pickers = this.getPickers();

    return {
      pickers,
      races: Object.values(pickers).flat().map(this.getRace.bind(this)),
      ultimates: this.getUltimates(),
      artifacts: this.getArtifacts(),
      misc: {
        shrines: this.getShrines(),
        neutrals: this.getNeutrals(),
      },
    };
  }

  private getRace(id: string): IRawRace {
    const numId = this.strToInt(id);
    const findRaceInitBlock = this.script.match(
      new RegExp(
        String.raw`(?:else)?if .{1,6}==.{1,3}.+\n(^.+$\n){0,3}call .{1,6}\(.{1,6},\s?${numId}\)\n(^.+$\n){1,20}call.+UnitRemoveAbility.+${numId}`,
        'm'
      )
    );
    if (!findRaceInitBlock?.index) getError(`get race block ${id}`);

    const raceInitBlock = this.getIfBlockByIndex(findRaceInitBlock.index);

    if (!raceInitBlock) getError(`get race block ${id}`);

    const raceVariables = Array.from(
      raceInitBlock.matchAll(
        /set (?<varName>\w+)(?:\[.+\])?\s?=\s?(?<varValue>.*)$/gim
      )
    ).reduce((acc, { groups }) => {
      if (!groups) return acc;
      const { varName, varValue } = groups;
      acc[varName] = this.intToStr(varValue);
      return acc;
    }, {} as Record<string, string>);

    const key = String(
      raceInitBlock.match(
        /(?:(?<=set (?<var>.{2,6})\s?=\s?['"]).+(?=['"]$\ncall SetPlayerName\(.{2,6},\k<var>\)))|(?:(?<=call SetPlayerName\(.+?,\s?['"])\w+)/im
      )?.[0] || getError(`race ${id} key`)
    )
      .toLocaleLowerCase()
      .replace(/[^\w\-]/g, '_');

    const [t1spell, t2spell] =
      unitsParser
        .getById(raceVariables[this.scriptVariables.buildings.fort])
        ?.withInstance((data) => {
          return data
            .getArrayValue('abi')
            ?.filter(
              (id) =>
                ![
                  raceVariables[this.scriptVariables.aura],
                  raceVariables[this.scriptVariables.description],
                ].includes(id)
            )
            .filter((id) => Boolean(abilitiesParser.getById(id)));
        }) ?? [];

    const raceData = {
      id,
      name: String(abilitiesParser.getById(id)?.getName())
        .replace(/^.*?-\s+/, '')
        .replace(/\[.+\]/, '')
        .trim(),
      key,
      auras:
        abilitiesParser
          .getById(raceVariables[this.scriptVariables.aura])
          ?.getArrayValue('pb1') || getError('get aura'),
      units: mapObject(this.scriptVariables.units, (key) => raceVariables[key]),
      magic: raceVariables[this.scriptVariables.magic],
      buildings: mapObject(
        this.scriptVariables.buildings,
        (key) => raceVariables[key]
      ),
      baseUpgrades: unitsParser
        .getById(raceVariables[this.scriptVariables.buildings.fort])
        ?.withInstance((instance) => {
          const botObjectUpgrades = mapObject(
            this.scriptVariables.baseUpgrades,
            (key) => raceVariables[key]
          );
          const upgradesInstances =
            instance
              .getArrayValue('res')
              ?.map((id) => upgradesParser.getById(id))
              .filter(isNotNil) ?? [];

          const fortInstanceUpgrades = mapObject(
            {
              melee: 'A',
              armor: 'D',
              range: 'S',
              wall: 'F',
            },
            (hotKey) =>
              upgradesInstances.find((i) => i.getValueByKey('hk1') === hotKey)
                ?.id,
            true
          );

          return {
            ...botObjectUpgrades,
            ...fortInstanceUpgrades,
          };
        }),

      upgrades:
        unitsParser
          .getById(raceVariables[this.scriptVariables.buildings.tower])
          ?.getArrayValue('res') ?? [],
      heroes: this.scriptVariables.heroes.map((key) => raceVariables[key]),
      bonuses:
        unitsParser
          .getById(raceVariables[this.scriptVariables.bonusPicker])
          ?.getArrayValue('upt') ?? getError(`getting bonuses ${id}`),
      bonusUpgrades: {},
      t1spell,
      t2spell,
      towerAbilities:
        unitsParser
          .getById(raceVariables[this.scriptVariables.buildings.tower])
          ?.withInstance((instance) =>
            instance.getArrayValue('abi')?.filter((id) =>
              abilitiesParser.getById(id)?.withInstance((abiInstance) => {
                return (
                  !!abiInstance.getValueByKey('art') &&
                  abiInstance.getValueByKey('ub1') !== 'Fuck You'
                );
              })
            )
          ) ?? [],
      bonusHeroes: [],
    } satisfies IRawRace;

    return this.enrichRaceData(raceData);
  }

  private enrichRaceData(data: IRawRace) {
    const heroesPrepares = this.scriptVariables.heroes
      .map((i) => `(?:${i})`)
      .join('|');
    const setHeroRegex = new RegExp(
      String.raw`set (?<heroVar>${heroesPrepares})\[.{2,5}\]\s?=\s?(?<replaceHero>\d{5,})`,
      'g'
    );

    data.bonuses.forEach((bonusID) => {
      const intBonusId = this.strToInt(bonusID);

      const findSetBonusBlock = this.script.match(
        new RegExp(
          String.raw`(?:else)?if .{3,6}\s?==${intBonusId}(?!.*$\n^.+$\nendif)`,
          'mi'
        )
      );
      if (!findSetBonusBlock?.index) {
        // getError(`no bonus block found for ${bonusID}`);
        return;
      }
      const codeBlock = this.getIfBlockByIndex(findSetBonusBlock.index);

      const heroesMatch = Array.from(codeBlock.matchAll(setHeroRegex) ?? []);
      heroesMatch.forEach(({ groups }) => {
        if (!groups) return;
        const { heroVar, replaceHero } = groups;
        if (!heroVar || !replaceHero) return;

        const slot = this.scriptVariables.heroes.indexOf(heroVar);

        const output: IRawBonusHero = {
          id: this.intToStr(replaceHero),
          slot,
        };

        data.bonusHeroes.push(output);
      });

      data.bonusHeroes = data.bonusHeroes.filter(uniqById);

      const setUpgrades = Array.from(
        codeBlock.matchAll(
          /call SetPlayerTechResearched\(.{3,6},(?<research>\d+)(?:,(?<level>\d+))/gim
        )
      );

      const researches = (
        unitsParser.getById(bonusID)?.getArrayValue('res') ?? []
      )
        .filter(isNotNil)
        .map((id) => {
          const setUpgradeLevel = setUpgrades.find(
            ({ groups }) => groups?.research === String(this.strToInt(id))
          )?.groups?.level;
          return [id, Number(setUpgradeLevel ?? 0)] as [string, number];
        });

      if (researches.length > 0) {
        data.bonusUpgrades[bonusID] = researches;
      }
    });

    return data;
  }

  private getPickers() {
    return this.pickers.map(this.intToStr).reduce((acc, pickerId) => {
      acc[pickerId] =
        abilitiesParser.getById(pickerId)?.getArrayValue('pb1') ??
        getError('process pickers');
      return acc;
    }, {} as Record<string, string[]>);
  }

  private getUltimates(): IRawUltimates {
    const codeBlock = this.script.match(
      /(?:(?:call .{3,6}\(.{2,6},\d+,\d+,.+Ulti.+\n(?:set.+\n)?)+)|(?:(?:call .{3,6}\(.{3,6},\d+,\d+\)\n){10,11})/im
    )?.[0];
    if (!codeBlock) getError('getting ulti codeblock');

    const spells = Array.from(
      codeBlock.matchAll(/call .*?(?<picker>\d{5,}),\s?(?<spell>\d{5,})/gim)
    ).reduce((acc, { groups }) => {
      if (!groups) return acc;
      const { picker, spell } = groups;

      try {
        const ultimateCodeBlock = this.getIfBlockByIndex(
          this.script.search(new RegExp(String.raw`if .{3,7}\s?=\s?${picker}`))
        );

        const spells = Array.from(
          ultimateCodeBlock?.match(/(?<=^set .{3,7}=)\d+/gm) ?? []
        ).filter(uniq);

        switch (spells.length) {
          case 1:
            acc[this.intToStr(picker)] = [spell, spells[0]].map(this.intToStr);
            break;
          case 2:
            acc[this.intToStr(picker)] = spells.map(this.intToStr);
            break;
          case 0:
          default:
            acc[this.intToStr(picker)] = [this.intToStr(spell)];
            break;
        }

        return acc;
      } catch (e) {
        acc[this.intToStr(picker)] = [this.intToStr(spell)];
        return acc;
      }
    }, {} as Record<string, string[]>);

    return {
      spells,
      pickers: Object.keys(spells),
    };
  }

  private getShrines() {
    const codeBlock = this.script.match(
      /(?:(?:call .{2,6}\(.+?,(?:\d{6,},)+.*Shrine.*\)$\n){3,})|(?:(?:call .{2,6}\(.{2,6}(?:,\d{9,11}){4,}\)\n){4,})/im
    )?.[0];
    if (!codeBlock) return getError('getting shrine block');
    return Array.from(
      codeBlock.match(/\d{6,}/gm) ?? getError('getting shrine IDs')
    )
      .map(this.intToStr)
      .filter((item, idx, arr) => arr.indexOf(item) === idx);
  }

  private getArtifacts(): IRawArtifacts {
    const combineMap = {
      I034: [['I00E', 'I00F', 'I00G']],
      I70F: [['I00E', 'I00F', 'I00G', 'I034']],
      I03H: [['I00H', 'I00J']],
      I03E: [['I00H', 'I00I']],
      I03J: [['I00H', 'I00K']],
      I03G: [['I00J', 'I00I']],
      I03F: [['I00J', 'I00K']],
      I03I: [['I00K', 'I00I']],
      I03V: [['I03E', 'I03H']],
      I03R: [['I03H', 'I03J']],
      I03S: [['I03H', 'I03I']],
      I03Q: [['I03E', 'I03J']],
      I03T: [['I03E', 'I03I']],
      I03U: [['I03G', 'I03F']],
      I03O: [['I03G', 'I03I']],
      I03M: [['I03G', 'I03H']],
      I03Y: [['I03H', 'I03F']],
      I03K: [['I03G', 'I03E']],
      I03W: [['I03E', 'I03F']],
      I03L: [['I03G', 'I03J']],
      I03N: [['I03F', 'I03I']],
      I03P: [['I03F', 'I03J']],
      I70B: [['I034'], ['I03N'], ['I03U']],
      I70A: [['I034'], ['I03W'], ['I03Q']],
      I70C: [['I034'], ['I03T'], ['I03L']],
      I70E: [['I034'], ['I03Y'], ['I03R']],
      I70D: [['I034'], ['I03S'], ['I03K']],
      I03Z: [['I034'], ['I03P'], ['I03O']],
      I03X: [['I034'], ['I03M'], ['I03V']],
    };

    return {
      combineMap,
      list: Object.entries(combineMap)
        .flat(3)
        .filter((val, idx, arr) => arr.indexOf(val) === idx),
    };
  }

  private getNeutrals() {
    const codeBlock =
      this.script.match(
        /(?<=local integer array (?<varName>.+)\n)(?:^.+$\n){0,6}(?:set \k<varName>.+\n){9,}/gm
      )?.[0] || getError('no neutral blocks found');

    return Array.from(codeBlock.match(/\d{4,}/gm) ?? []).map(this.intToStr);
  }

  private intToStr(input: number | string) {
    let value = Number(input);
    let output = '';
    while (value > 8) {
      const char = value % 256;
      value = (value - char) / 256;
      output = String.fromCharCode(char) + output;
    }
    return output;
  }

  private strToInt(string: string) {
    return Number(
      BigInt(string.charCodeAt(3)) |
        (BigInt(string.charCodeAt(2)) << 8n) |
        (BigInt(string.charCodeAt(1)) << 16n) |
        (BigInt(string.charCodeAt(0)) << 24n)
    );
  }

  override getHeroItems(heroID: string): Record<string, string> | undefined {
    const replaceMatch = this.script.match(
      new RegExp(
        String.raw`(?:else)?if .*?.{2,6}==${this.strToInt(
          heroID
        )} (?:or .{2,6}==\d+ )*then(?=\n(?:^.+$\n){1,20}call UnitAddItem)`,
        'mi'
      )
    );
    const output: Record<string, string> =
      this.getChoosableHeroItems(heroID) ?? {};

    if (!replaceMatch?.index) return output;

    const replaceCodeBlock = this.getIfBlockByIndex(replaceMatch.index);

    let ended = false;

    Array.from(
      replaceCodeBlock.matchAll(
        /if .{2,40}\s?>=(?<level>\d{1,2})\s.+\n(?:^.+$\n){0,20}?(?:call UnitAddItemById\(.{2,6},\s?(?<value>\d+))/gim
      )
    )
      // Костыль для ОЗ версии
      .filter(({ groups }, idx, arr) => {
        if (ended || !groups || !groups.level) return false;
        const isRightOrder =
          Number(groups.level) >= Number(arr[idx - 1]?.groups?.level ?? 0);
        if (!isRightOrder) {
          ended = true;
          return false;
        }
        return true;
      })
      .forEach(({ groups }) => {
        if (!groups) return;
        const { level, value } = groups;
        output[this.intToStr(value)] = level;
      });
    return output;
  }

  getChoosableHeroItems(heroID: string): Record<string, string> | undefined {
    const abilitiesMatch = this.script.match(
      new RegExp(
        String.raw`if GetUnitTypeId\((?<var>.{2,6})\)==${this.strToInt(
          heroID
        )}.+\n.+?GetHeroLevel\(\k<var>\)`
      )
    );
    if (!abilitiesMatch?.index) return;
    const setAbiCodeBlock = this.getIfBlockByIndex(abilitiesMatch.index);

    const match = Array.from(
      setAbiCodeBlock.matchAll(
        /.+GetHeroLevel\(.{2,6}\)>?=(?<level>\d{1,2})/g
      ) ?? []
    );

    const output = Array.from(
      setAbiCodeBlock.matchAll(/.+GetHeroLevel\(.{2,6}\)>?=(?<level>\d{1,2})/g)
    ).reduce((acc, item) => {
      const { level } = item.groups ?? {};
      if (!level || !item.index) return acc;

      const thisLevelCodeBlock = this.getIfBlockByIndex(
        item.index,
        setAbiCodeBlock
      );
      const abilities = Array.from(
        thisLevelCodeBlock.match(/(?<=UnitAddAbility\(.{2,6},)\d+/g) ?? []
      );

      const items = abilities
        .map(
          (abilityID) =>
            this.script.match(
              new RegExp(
                String.raw`(?<=.{2,6}==${abilityID}.+\n(?:^.+$\n){1,12}.+UnitAddItemById\(.{2,6},)\d+`,
                'gm'
              )
            )?.[0]
        )
        .filter(isNotNil);

      items.forEach((itemRawId) => {
        acc[this.intToStr(itemRawId)] = level;
      });

      return acc;
    }, {} as Record<string, string>);
    if (!Object.values(output).length) return;
    return output;
  }

  override getBonusUnit(bonusID: string): string | undefined {
    // Ventyr uniq
    if (bonusID === 'n066') {
      return 'O05N';
    }

    const findBlockIndex = this.script.match(
      new RegExp(
        String.raw`(?:else)?if .{2,6}==${this.strToInt(bonusID)}`,
        'mi'
      )
    )?.index;
    if (!findBlockIndex) return;
    const codeBlock = this.getIfBlockByIndex(findBlockIndex);
    const preparedVars = Object.values(this.scriptVariables.units)
      .map((s) => `(?:${s})`)
      .join('|');
    const found = codeBlock.match(
      new RegExp(
        String.raw`(?<=set (?:${preparedVars})(?:\[w+\])?\s?=\s?)\d+`,
        'mi'
      )
    )?.[0];
    return found ? this.intToStr(found) : undefined;
  }

  override enrichUnitRequires(item: IUnitObject): IUnitObject {
    return item;
  }
}
