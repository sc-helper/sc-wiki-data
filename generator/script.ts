import { abilitiesParser, unitsParser } from './objects';
import type {
  IRaceData,
  IRawArtifacts,
  IRawPatchData,
  IRawRace,
  IRawUltimates,
  IUnitObject,
} from '../data/types';
import { isNotNil } from '../utils/guards';
import { uniq } from '../utils/array';
import { BaseScriptParser } from './baseScriptParser';

export class Sur5alScriptParser extends BaseScriptParser {
  private alliances = ['nfh1', 'nfr2', 'nfr1', 'ngnh'];
  private scriptVariables = {
    globals: {
      fort: 'OOQ',
      barrack: 'OIQ',
      tower: 'O1Q',
      bonusPicker: 'O2Q',
    },
    raceName: {
      key: 'OQ',
      full: 30,
      short: 38,
    },
    replaceable: {
      key: 'I0Q',
      aura: 1,
      ulti: 5,
      description: 38,
    },
    upgrades: {
      key: 'I2Q',
      melee: '$D',
      range: 17,
      magic: 5,
      armor: 1,
      wall: 9,
      towerUpgrades: [21, 25, 29, 33, 37, 41, 45, 49, 53],
      bonusUpgrades: [61, 65, 69],
    },
    buildings: {
      tower: {
        key: 'I1',
        key2: 1,
      },
      fort: {
        key: 'OI',
        key2: 1,
      },
      barrack: {
        key: 'Q1',
        key2: 1,
      },
    },
    units: {
      key: 1,
      melee: 'QO',
      mage: 'IO',
      range: 'OO',
      siege: 'QI',
      air: 'Q6',
      catapult: 'O6',
    },
    bonuses: 'I7',
    heroes: ['Q2', 'O2', 'I2', 'Q3'],
  };

  private ultimatePicker = 'A0OA';
  private buildingsMap: Record<string, Record<string, string>>;
  private heroReplaceMap: Record<string, Record<string, string>>;
  constructor() {
    super();
    this.buildingsMap = this.getBuildingsMap();
    this.heroReplaceMap = this.prepareHeroesItems();
  }

  getPatchData(): IRawPatchData {
    const pickers = this.getRaceIDs();
    return {
      ultimates: this.getUltimates(),
      artifacts: this.getArtifacts(),
      pickers,
      races: Object.values(pickers)
        .flat()
        .map((raceID) => this.getRaceData(raceID))
        .filter(isNotNil),
      misc: {
        neutrals: this.getNeutrals(),
      },
    };
  }

  private getBuildingsMap() {
    const initCodeBlock = this.script.match(
      /(?<=^function \w{3,5} takes nothing returns nothing$\n)(?:(?:[^function]^.*$)\n)*?^call SetTimeOfDay\(12\.\)$\n(?:(?:^.*$)\n)*?(?=^endfunction$)/im
    )?.[0];

    if (!initCodeBlock) return {};

    return Array.from(
      initCodeBlock.matchAll(
        /^set (?<varName>.*?(?=\[))\[(?<varKey>.*?)\].*?['"](?<varValue>.{4})['"]$/gim
      )
    ).reduce((acc, { groups }) => {
      if (!groups) return acc;
      const { varName, varValue, varKey } = groups;
      if (!(varName in acc)) {
        acc[varName] = {};
      }
      acc[varName][varKey] = varValue;
      return acc;
    }, {} as Record<string, Record<string, string>>);
  }

  public getRaceData(raceID: string) {
    const { raceName, upgrades, buildings, units, globals } =
      this.scriptVariables;

    const checkRaceRegex = new RegExp(
      String.raw`(?<=function )\w*?(?=\s.*\n.*GetSoldUnit\(\)\)=='${raceID})`,
      'gmi'
    );
    const checkRaceFuncNames = Array.from(
      this.script.match(checkRaceRegex) ?? []
    );

    if (!checkRaceFuncNames.length) return;

    const [fortVar, fortId, buildingsKey] =
      checkRaceFuncNames
        .map((checkFuncName) => {
          const setVarRegex = new RegExp(
            String.raw`^if\(${checkFuncName}\(\)\)then$\n^set (?<tempVar1>.*?)=(?<storedVarKey>.*?)$`,
            'm'
          );
          const { tempVar1, storedVarKey } =
            this.script.match(setVarRegex)?.groups ?? {};

          const escapedTempVar1 = tempVar1
            .replace('[', '\\[')
            .replace(']', '\\]');

          const findReplacerRegex = new RegExp(
            String.raw`set (?<fortVar>.*)=ReplaceUnitBJ\(.*?,(?<storedVarName>.*?)\[${escapedTempVar1}\],bj_UNIT_STATE_METHOD_DEFAULTS\)`,
            'm'
          );

          const { fortVar, storedVarName } =
            this.script.match(findReplacerRegex)?.groups ?? {};

          const fortId = this.buildingsMap[storedVarName][storedVarKey];

          if (!fortId || !storedVarKey) return;

          return [fortVar, fortId, storedVarKey];
        })
        .reduce((acc, value) => {
          if (!value) return acc;
          if (
            value[0].includes(`[${this.scriptVariables.buildings.fort.key2}]`)
          )
            return value;
          return acc;
        }) ?? [];

    if (!fortId || !buildingsKey) return;

    const escapedFortVar = fortVar.replace('[', '\\[').replace(']', '\\]');

    const checkRaceFnRegex = new RegExp(
      String.raw`(?<=function ).*?(?=\s.*?$\n^return\(GetUnitTypeId\(${escapedFortVar}\)=='${fortId}'\))`,
      'gmi'
    );

    const checkRaceFn = Array.from(this.script.match(checkRaceFnRegex) ?? [])
      .map((s) => `(?:${s})`)
      .join('|');

    if (!checkRaceFn.length) return;

    const raceUpgradeBlockRegex = new RegExp(
      String.raw`(?<=if\((?:${checkRaceFn})\(\)\)then\n)[\s\S]*?set ${raceName.key}\[${raceName.short}\].*$`,
      'mi'
    );

    const raceUpgradeBlock = this.script.match(raceUpgradeBlockRegex)?.[0];

    if (!raceUpgradeBlock) return;

    const varRegex =
      /^set (?<varName>.*?(?=\[))\[(?<varKey>.*?)\].*?['"](?<varValue>.*?)['"]$/gim;

    const rawRaceData = Array.from(raceUpgradeBlock.matchAll(varRegex)).reduce(
      (acc, { groups }) => {
        if (!groups) return acc;
        const { varName, varKey, varValue } = groups;
        if (!(varName in acc)) {
          acc[varName] = {};
        }
        if (varKey in acc[varName]) {
          return acc;
        }
        acc[varName][varKey] = varValue;
        return acc;
      },
      {} as Record<string, Record<string, string>>
    );

    const hiddenDoomId =
      this.script.match(
        new RegExp(
          String.raw`(?<=^call BlzUnitHideAbility\(${escapedFortVar},['|"]).*?(?=['|"],true\)$)`,
          'i'
        )
      )?.[0] ?? '';

    const auraID =
      rawRaceData[this.scriptVariables.replaceable.key][
        this.scriptVariables.replaceable.aura
      ];
    const auras =
      abilitiesParser.getById(auraID)?.withInstance((data) => {
        return String(data.getValueByKey('pb1')).split(',');
      }) ?? [];
    const ulti =
      rawRaceData[this.scriptVariables.replaceable.key][
        this.scriptVariables.replaceable.ulti
      ];

    const [t1spell, t2spell] = unitsParser
      .getById(fortId)
      ?.withInstance((data) => {
        const skills = data.getArrayValue('abi') ?? [];
        const t1 = skills.find(
          (id) => abilitiesParser.getById(id)?.getValueByKey('hky') === 'Z'
        )!;
        const t2 = skills.find(
          (id) => abilitiesParser.getById(id)?.getValueByKey('hky') === 'X'
        )!;
        return [t1, t2];
      })!;

    const output: IRawRace = {
      id: raceID,
      name: rawRaceData[raceName.key][raceName.full],
      key: rawRaceData[raceName.key][raceName.short].toLocaleLowerCase(),
      bonuses:
        unitsParser
          .getById(this.buildingsMap[globals.bonusPicker][buildingsKey])
          ?.withInstance((instance) =>
            String(instance.getValueByKey('upt') || '')
              .split(',')
              .map((s) => s.trim())
          ) ?? [],
      upgrades: this.scriptVariables.upgrades.towerUpgrades.map(
        (key) => rawRaceData[upgrades.key][key]
      ),
      auras,
      t1spell,
      t2spell,
      magic: rawRaceData[upgrades.key][upgrades.magic],
      baseUpgrades: {
        armor: rawRaceData[upgrades.key][upgrades.armor],
        melee: rawRaceData[upgrades.key][upgrades.melee],
        range: rawRaceData[upgrades.key][upgrades.range],
        wall: rawRaceData[upgrades.key][upgrades.wall],
      },
      heroes: this.scriptVariables.heroes.map(
        (key) => Object.values(rawRaceData[key])[0]
      ),
      buildings: {
        fort: fortId,
        tower: rawRaceData[buildings.tower.key][buildings.tower.key2],
        barrack: rawRaceData[buildings.barrack.key][buildings.barrack.key2],
      },
      towerAbilities:
        unitsParser
          .getById(this.buildingsMap[globals.tower][buildingsKey])
          ?.withInstance((instance) =>
            String(instance.getValueByKey('upt') || '')
              .split(',')
              .map((s) => s.trim())
              .filter((id) =>
                abilitiesParser.getById(id)?.withInstance((abiInstance) => {
                  return (
                    !!abiInstance.getValueByKey('art') &&
                    abiInstance.getValueByKey('ub1') !== 'Fuck You'
                  );
                })
              )
          ) ?? [],
      units: {
        melee: rawRaceData[units.melee][units.key],
        air: rawRaceData[units.air][units.key],
        catapult: rawRaceData[units.catapult][units.key],
        mage: rawRaceData[units.mage][units.key],
        range: rawRaceData[units.range][units.key],
        siege: rawRaceData[units.siege][units.key],
      },
      bonusUpgrades: {},
      bonusHeroes: [],
    };

    this.enrichRaceData(output);
    this.enrichUltiData(output, rawRaceData);

    return output;
  }

  private enrichRaceData(data: IRawRace) {
    data.bonuses.forEach((bonusID) => {
      // di - ragna
      if (bonusID === 'n02Q') {
        data.bonusHeroes.push({
          id: 'U00N',
          slot: 4,
        });
      }
      // wo - wolf
      if (bonusID === 'n00W') {
        data.bonusHeroes.push({
          id: 'N00T',
          slot: 4,
        });
        return;
      }

      const conditionFnNameRegex = new RegExp(
        String.raw`\w+(?= takes nothing returns boolean$\n^return\(GetUnitTypeId\(GetTriggerUnit\(\)\)=='${bonusID}'\)$)`,
        'gmi'
      );

      const conditionFnName = this.script.match(conditionFnNameRegex)?.[0];
      if (!conditionFnName) return;

      const codeBlockIndex = this.script.match(
        new RegExp(String.raw`^if\(${conditionFnName}\(\)\)`, 'mi')
      )?.index;
      if (!codeBlockIndex) return;

      const codeBlock = this.getIfBlockByIndex(codeBlockIndex);

      const heroesPrepared = this.scriptVariables.heroes
        .map((k) => `(?:${k})`)
        .join('|');

      const heroReplace = codeBlock.match(
        new RegExp(
          String.raw`^set (?<heroVar>${heroesPrepared})\[1\].*?['|"](?<heroReplaceId>.*?)['|"].*?$`,
          'mi'
        )
      );

      if (heroReplace) {
        const { heroVar, heroReplaceId } = heroReplace.groups ?? {};
        const slot = this.scriptVariables.heroes.indexOf(heroVar);
        if (slot < 0) return;
        data.bonusHeroes.push({
          id: heroReplaceId,
          slot,
        });
        return;
      }

      const upgradesPrepared = this.scriptVariables.upgrades.bonusUpgrades
        .map((k) => `(?:${k})`)
        .join('|');

      const upgrades = codeBlock.match(
        new RegExp(
          String.raw`(?<=^set ${this.scriptVariables.upgrades.key}\[(?:${upgradesPrepared})\].*?['"])\w+(?=['"]$)`,
          'gmi'
        )
      );

      if (upgrades) {
        const output = Array.from(upgrades).map((upgrId) => {
          const [baseLevel] = this.script.match(
            new RegExp(
              String.raw`(?<=SetPlayerTechResearchedSwap\('${upgrId}',)\d+`,
              'im'
            )
          ) ?? [0];
          return [upgrId, Number(baseLevel)] as [string, number];
        });
        data.bonusUpgrades[bonusID] = output;
        return;
      }
    });
  }

  private getRaceIDs(): Record<string, string[]> {
    const alliancesRegexString = this.alliances
      .map((a) => `(?:${a})`)
      .join('|');

    const racePickersRegex = new RegExp(
      String.raw`^set (?<varName>.*?)=CreateUnit\(.*?,\s?'(?<unitName>${alliancesRegexString})'.*$`,
      'gmi'
    );

    const racePickers = Array.from(
      this.script.matchAll(racePickersRegex)
    ).reduce<Record<string, string>>((acc, { groups }) => {
      if (!groups) return acc;
      const { varName, unitName } = groups;
      acc[unitName] = varName;
      return acc;
    }, {});

    return this.alliances.reduce((acc, allianceID) => {
      const raceAddRegex = new RegExp(
        String.raw`(?<=^call AddUnitToStockBJ\(').*(?=',\s?${racePickers[allianceID]})`,
        'gm'
      );
      acc[allianceID] = Array.from(this.script.match(raceAddRegex) ?? []);
      return acc;
    }, {} as Record<string, string[]>);
  }

  private getUltimates(): IRawUltimates {
    const pickers =
      abilitiesParser.getById(this.ultimatePicker)?.withInstance((instance) => {
        return String(instance.getValueByKey('pb1'))
          .split(',')
          .map((a: string) => a.trim());
      }) ?? [];

    const spells = pickers.reduce((acc, pickerId) => {
      const [funcId] =
        this.script.match(
          new RegExp(
            String.raw`(?<=function )\w+(?= takes nothing returns boolean\nreturn\(GetSpellAbilityId\(\)=='${pickerId}'\)\n)`,
            'm'
          )
        ) ?? [];
      if (!funcId) return acc;
      const ultBlockIndex = this.script.match(
        new RegExp(String.raw`if\(${funcId}\(\)\)then`, 'mi')
      )?.index;
      if (!ultBlockIndex) return acc;
      const setUltiBlock = this.getIfBlockByIndex(ultBlockIndex);
      const ultimates = Array.from(
        setUltiBlock.match(
          /(?<=(?:call UnitAddAbilityBJ\(')|(?:call BlzUnitHideAbility\(GetTriggerUnit\(\),'))\w+(?=')/gm
        ) ?? []
      );
      if (ultimates.length) {
        acc[pickerId] = ultimates;
      }

      return acc;
    }, {} as Record<string, string[]>);

    return {
      pickers,
      spells,
    };
  }

  private getArtifacts(): IRawArtifacts {
    const artiCodeBlocks = Array.from(
      this.script.match(
        /call AddSpecialEffectTargetUnitBJ.+$(?=\n^call RemoveItem\(GetItemOfTypeFromUnitBJ.+$)[\S\s]*?call UnitAddItemByIdSwapped.+$/gm
      ) ?? []
    );

    const combineMap = artiCodeBlocks.reduce((acc, code) => {
      const [resultItem] =
        code.match(/(?<=call UnitAddItemByIdSwapped\(')\w+/) ?? [];
      const neededItems = Array.from(
        code.match(
          /(?<=call RemoveItem\(GetItemOfTypeFromUnitBJ\(GetTriggerUnit\(\),')\w+/gm
        ) ?? []
      );
      if (resultItem && neededItems.length) {
        acc[resultItem] = [neededItems];
      }

      return acc;
    }, {} as Record<string, string[][]>);

    const list = Object.entries(combineMap)
      .flat(3)
      .filter((val, idx, arr) => arr.indexOf(val) === idx);

    return {
      combineMap,
      list,
    };
  }

  private getNeutrals() {
    const variables = Array.from(
      this.script.match(
        /(?<=call SetUnitColor\().+(?=,ConvertPlayerColor\(8\)\))/gm
      ) ?? []
    ).map((s) => `(?:${s})`);
    const regexp = new RegExp(
      String.raw`(?<=set (?:${variables.join('|')})=CreateUnit\(p,')[\w\d]+`,
      'gm'
    );
    return Array.from(this.script.match(regexp) ?? []).filter(
      (id) => !['nmoo'].includes(id)
    );
  }

  private prepareHeroesItems() {
    const codeBlocks = Array.from(
      this.script.match(
        /if\(.+?\(\)\)\s?then\n(?:call SelectHeroSkill.+?$\n)+(?:^.+$\ncall UnitAddItemByIdSwapped.+\n^.+$\n){1,}/gm
      ) ?? []
    );

    return codeBlocks.reduce<Record<string, Record<string, string>>>(
      (acc, block) => {
        const checkHeroFnName = block.match(/(?<=if\()\w+/)?.[0];
        if (!checkHeroFnName) return acc;

        const heroReplaceId = this.script.match(
          new RegExp(
            String.raw`(?<=function ${checkHeroFnName}\s.+\nreturn\s?\(GetUnitTypeId\(GetTriggerUnit\(\)\)==')\w+`,
            'm'
          )
        )?.[0];
        if (!heroReplaceId) return acc;

        const data = Array.from(
          block.matchAll(
            /if\((?<fnName>.+)\(.+\ncall UnitAddItemByIdSwapped\('(?<itemName>\w+)/gm
          )
        ).reduce<Record<string, string>>((acc, { groups }) => {
          if (!groups) return acc;
          const { fnName, itemName } = groups;

          const rawLevel = this.script.match(
            new RegExp(
              String.raw`(?<=function ${fnName}\s.+\n.+>=)(?:(?:\d+)|(?:\$\w+))`
            )
          )?.[0];

          if (!rawLevel || !itemName) return acc;

          const level = rawLevel.startsWith('$')
            ? String(Number(`0x${rawLevel.replace('$', '')}`))
            : String(rawLevel);

          acc[itemName] = level;

          return acc;
        }, {});

        acc[heroReplaceId] = data;

        return acc;
      },
      {
        // Monkey patch for trollings
        U00N: {
          mlst: '2',
          sbch: '3',
          I000: '4',
          gvsm: '5',
          shhn: '6',
          esaz: '7',
        },
        N00T: {
          I000: '2',
          stwa: '3',
          axas: '4',
          shen: '5',
          mlst: '6',
          esaz: '7',
        },
        // Monkey patch for new heroes
        H04G: {
          I005: '4',
          I006: '8',
          I007: '14',
          I008: '20',
        },
      }
    );
  }

  override getHeroItems(heroID: string): Record<string, string> | undefined {
    return this.heroReplaceMap[heroID];
  }

  override getBonusUnit(bonusID: string): string | undefined {
    const triggerFuncName = this.script.match(
      new RegExp(
        String.raw`(?<=function )\w+(?=.+\n.+GetTriggerUnit.+${bonusID}.{1,10}\nendfunction)`,
        'mi'
      )
    )?.[0];
    if (!triggerFuncName) return;

    const replaceBlockIndex = this.script.match(
      new RegExp(String.raw`if\(${triggerFuncName}\(\)\)`, 'mi')
    )?.index;
    if (!replaceBlockIndex) return;

    const codeblock = this.getIfBlockByIndex(replaceBlockIndex);

    const preparedUnits = Object.values(this.scriptVariables.units)
      .map((s) => `(?:${s})`)
      .join('|');

    return codeblock.match(
      new RegExp(
        String.raw`(?<=set (?:${preparedUnits})\[\d\]\s?=\s?['"])\w+`,
        'mi'
      )
    )?.[0];
  }

  override enrichUnitRequires(item: IUnitObject): IUnitObject {
    const conditionFunctions = Array.from(
      this.script.match(
        new RegExp(
          String.raw`(?<=function )\w+(?=.+$\n.*?GetUnitTypeId\(GetEnteringUnit\(\)\)==['"]${item.id})`,
          'gmi'
        )
      ) ?? []
    )
      .filter(isNotNil)
      .filter(uniq);

    conditionFunctions.forEach((fnName) => {
      Array.from(
        this.script.match(
          new RegExp(
            String.raw`(?:(?<=GetPlayerTechCountSimple\(['"])\w+(?=.*?${fnName}\(\)))|(?:(?<=${fnName}\(\).*GetPlayerTechCountSimple\('))\w+`,
            'gi'
          )
        ) ?? []
      ).forEach((upgrade) => (item.upgrades ?? []).push(upgrade));
    });

    item.upgrades = item.upgrades?.filter(uniq);

    return item;
  }

  private interruptTypes = [
    'thunderbolt',
    'entanglingroots',
    'entangle',
    'freezy',
    'freezyon',
    'silence',
    'stop',
  ];

  enrichUltiData(
    input: IRawRace,
    raceData: Record<string, Record<string, string>>
  ) {
    const { key, ulti, description } = this.scriptVariables.replaceable;
    const ultiId = raceData[key][ulti];
    const raceDescription = raceData[key][description];

    input.ultiData = {
      id: ultiId,
      type: 'ultimate',
      name: abilitiesParser.getById(ultiId)?.getName() ?? 'Precision UW',
      hotkey: 'V',
    };
    (() => {
      const ultiConditionCheckFn = this.script.match(
        new RegExp(
          String.raw`\w+(?=\stakes nothing returns boolean\nreturn\(GetSpellAbilityId\(\)=='${ultiId}'\))`,
          'm'
        )
      )?.[0];
      if (!ultiConditionCheckFn) return;
      const playerSetVar = this.script.match(
        new RegExp(
          String.raw`(?<=if\(${ultiConditionCheckFn}\(\).+\nset\s)\w{2,4}\[.+\]`,
          'm'
        )
      )?.[0];
      if (!playerSetVar) return;
      const escapedPlayerSetVar = playerSetVar
        .replaceAll('[', '\\[')
        .replaceAll(']', '\\]')
        .replaceAll('$', '\\$');
      let checkPlayerFn = this.script.match(
        new RegExp(
          String.raw`\w+(?=\stakes nothing returns boolean\nreturn\(${escapedPlayerSetVar}==)`,
          'm'
        )
      )?.[0];
      let unitDamageAbility: string | undefined;
      if (!checkPlayerFn) {
        unitDamageAbility ??= this.script.match(
          new RegExp(
            String.raw`(?<=CreateNUnitsAtLoc.+${escapedPlayerSetVar}.+\n(?:^.+$\n){0,3}call UnitAddAbilityBJ\(')\w+(?=.+\n(?:^.+$\n){0,3}call IssueTargetOrderBJ.+thunderbolt)`,
            'm'
          )
        )?.[0];
        if (!unitDamageAbility) return;
        input.ultiData!.stealInterrupt = true;
      }
      unitDamageAbility ??= this.script.match(
        new RegExp(
          String.raw`(?<=if\(${checkPlayerFn}\(\).+\n(?:^.+$\n){1,10}call UnitAddAbilityBJ\(')\w+`,
          'm'
        )
      )?.[0];
      if (!unitDamageAbility) return;
      abilitiesParser.getById(unitDamageAbility)?.withInstance((instance) => {
        const itemOrder = instance.getValueByKey('ord');
        input.ultiData!.stealInterrupt ??=
          this.interruptTypes.includes(itemOrder);
        const damageTime =
          instance.getValueByKey('dur') ?? instance.getValueByKey('bz1');
        if (damageTime) {
          input.ultiData!.damageTime = damageTime;
        }
      });
    })();

    (() => {
      // TODO: maybe get it from script?
      const manaBurnId = 'A0QV';
      const decoyId = this.script.match(
        new RegExp(
          String.raw`(?<=call UnitAddAbilityBJ\('${manaBurnId}.+\n(?:^.+$\n){0,2}call UnitRemoveAbilityBJ\('${raceDescription}.+\ncall UnitAddAbilityBJ\(')\w+`,
          'm'
        )
      )?.[0];
      if (!decoyId) return;

      (() => {
        const conditionFuncName = this.script.match(
          new RegExp(
            String.raw`\w+(?=\stakes nothing returns boolean\nreturn\(GetSpellAbilityId\(\)=='${decoyId})`,
            'm'
          )
        )?.[0];
        if (!conditionFuncName) return;
        const isScriptedInterrupt = this.script.match(
          new RegExp(
            String.raw`if\(${conditionFuncName}.+\n(?:^.+$\n){1,10}call IssueTargetOrderBJ.+thunderbolt`,
            'm'
          )
        );
        if (isScriptedInterrupt) {
          input.ultiData!.fakeStealInterrupt = true;
        }
      })();

      abilitiesParser.getById(decoyId)?.withInstance((instance) => {
        const itemOrder = instance.getValueByKey('ord');
        input.ultiData!.fakeStealInterrupt ??=
          this.interruptTypes.includes(itemOrder);
      });
    })();
  }
}
