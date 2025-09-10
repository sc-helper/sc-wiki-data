export interface IBaseObject {
  id: string;
  name: string;
  hotkey: string;
  description?: string;
  iconsCount?: number;
  type: string;
}

export interface IRacePickerObject extends IBaseObject {
  type: 'race';
  key: string;
}

export interface IArtifactObject extends IBaseObject {
  type: 'artifact';
  level: number;
}

export interface IUnitObject extends IBaseObject {
  type: 'unit';
  cost: number;
  def: number;
  defType: string;
  hp: number;
  hpReg: number;
  mp: number;
  mpReg: number;
  atk: string;
  atkType: string;
  atkRange: number;
  atkSpeed: number;
  weaponType: string;
  skills?: ISpellObject[];
  upgrades?: string[];
  tags: string[];
  bounty: number;
}

export interface IHeroObject extends Omit<IUnitObject, 'type'> {
  type: 'hero';
  skills: ISpellObject[];
  items?: IArtifactObject[];
  fullName: string;
  stat: 'str' | 'int' | 'agi';
  str: number;
  int: number;
  agi: number;
  strLvl: number;
  intLvl: number;
  agiLvl: number;
}

export interface IUpgradeObject extends IBaseObject {
  type: 'upgrade';
  cost: number[];
  iconsCount?: number;
  timers?: number[];
  spells?: ISpellObject[];
  level?: number;
}

export interface ISpellObject extends IBaseObject {
  type: 'spell';
  cost?: number[];
  cooldown?: number[];
  duration?: number[];
  summonUnit?: IUnitObject[];
  area?: number[];
  targets?: string[];
}

export interface IBonusObject extends IBaseObject {
  type: 'bonus';
  buildingId: string;
  relatedID: string[];
  units?: IUnitObject[];
  spells?: ISpellObject[];
  upgrades?: IUpgradeObject[];
  heroes?: IHeroObject[];
}

export interface IRawPatchData {
  pickers: Record<string, string[]>;
  races: IRawRace[];
  ultimates: IRawUltimates;
  artifacts: IRawArtifacts;
  misc: IRawMiscData;
}

export interface IRawRace extends Pick<IRaceData, 'ultiData'> {
  name: string;
  key: string;
  id: string;
  bonuses: string[];
  upgrades: string[];
  magic: string;
  baseUpgrades: {
    melee: string;
    armor: string;
    range: string;
    wall: string;
  };
  auras: string[];
  t1spell: string;
  t2spell: string;
  heroes: string[];
  buildings: {
    tower: string;
    fort: string;
    barrack: string;
  };
  towerAbilities: string[];
  units: {
    melee: string;
    range: string;
    mage: string;
    siege: string;
    air: string;
    catapult: string;
  };
  bonusUpgrades: Record<string, [id: string, baseLevel: number][]>;
  bonusHeroes: IRawBonusHero[];
}

export interface IRawBonusHero {
  slot: number;
  id: string;
}

export interface IRawUltimates {
  pickers: string[];
  spells: Record<string, string[]>;
}

export interface IRawArtifacts {
  combineMap: Record<string, string[][]>;
  list: string[];
}

export interface IArtifactData {
  items: IArtifactObject[];
  combineMap: Record<string, string[][]>;
}

export interface IBaseUltimateObject extends IBaseObject {
  requires: Record<string, number>;
}

export interface IUltimatesData {
  pickers: IBaseUltimateObject[];
  spells: Record<string, ISpellObject[]>;
  requires: Record<string, string>;
}

export interface IRaceUltimateData extends IBaseObject {
  type: 'ultimate';
  damageTime?: number;
  stealInterrupt?: boolean;
  fakeStealInterrupt?: boolean;
}

export interface IRaceData {
  name: string;
  key: string;
  id: string;
  description: string;
  /** @deprecated Only at old data */
  ultimateId?: string;
  auras: IBaseObject[];
  bonuses: IBonusObject[];
  towerUpgrades: IUpgradeObject[];
  magic: IUpgradeObject[];
  baseUpgrades: {
    melee: IUpgradeObject;
    armor: IUpgradeObject;
    range: IUpgradeObject;
    wall: IUpgradeObject;
  };
  units: {
    melee: IUnitObject;
    range: IUnitObject;
    mage: IUnitObject;
    siege: IUnitObject;
    air: IUnitObject;
    catapult: IUnitObject;
  };
  buildings: {
    fort: IUnitObject;
    tower: IUnitObject;
    barrack: IUnitObject;
  };
  t1spell: ISpellObject;
  t2spell: ISpellObject;
  heroes: Array<IHeroObject>;
  bonusBuildings: IBaseObject[];
  ultiData?: IRaceUltimateData;
}

export type IRaceIcons = Record<
  string,
  [x: number, y: number, width: number, height: number]
>;

export interface IDataFile<T = IRaceData> {
  data: T;
  icons: IRaceIcons;
}

export type IDamageTuple = [
  light: number,
  medium: number,
  heavy: number,
  fortified: number,
  normal: number,
  hero: number,
  divine: number,
  unarmored: number
];

export interface IPatchDamage {
  chaos: IDamageTuple;
  hero: IDamageTuple;
  magic: IDamageTuple;
  normal: IDamageTuple;
  pierce: IDamageTuple;
  siege: IDamageTuple;
  spells: IDamageTuple;
}

export interface IRawMiscData {
  neutrals: string[];
  shrines?: string[];
}

export interface INeutralData extends IBaseObject {
  skills: IBaseObject[];
}

export interface IBounty {
  melee: number;
  range: number;
  mage: number;
  siege: number;
  air: number;
  catapult: number;
  hero: number;
  su: number;
  tower: number;
  fort: number;
  barracks: number[];
  // additional: number[];
  summon: number[];
  // fortSummon: number[];
}

export interface IMiscData {
  neutrals: INeutralData[];
  damage: IPatchDamage;
  shrines?: ISpellObject[];
  bounty: Record<string, IBounty>;
  commonBonuses?: IBonusObject[];
}

interface ObjectsTypeMap {
  spell: ISpellObject;
  hero: IHeroObject;
  unit: IUnitObject;
  upgrade: IUpgradeObject;
  bonus: IBonusObject;
}

export type GetObjectFunction = <T extends keyof ObjectsTypeMap>(
  key: T,
  id: string
) => ObjectsTypeMap[T] | undefined;

export interface IChangelog {
  from: string;
  to: string;
  type: string;
  changes: Record<string, IChangelogRace>;
  newRaces?: IRacePickerObject[];
  ultimates?: {
    pickers: ChangeTuple<WithIconId<IBaseUltimateObject>>[];
    requires: IUltimatesData['requires'];
  };
}

export type ChangeTuple<T> = [
  'replace' | 'change',
  old: T extends object
    ? Partial<T> & Pick<T, 'id' | 'iconId' | 'name' | 'type' | 'hotkey'>
    : T,
  new: T extends object
    ? Partial<T> & Pick<T, 'id' | 'iconId' | 'name' | 'type' | 'hotkey'>
    : T
];
export type WithIconId<T extends IBaseObject> = T & { iconId: string };

export interface IChangelogRace {
  name: string;
  description?: ChangeTuple<string>;
  upgrades?: ChangeTuple<WithIconId<IUpgradeObject>>[];
  heroes?: ChangeTuple<WithIconId<IHeroObject>>[];
  units?: Partial<
    Record<keyof IRaceData['units'], ChangeTuple<WithIconId<IUnitObject>>>
  >;
  bonuses?: ChangeTuple<WithIconId<IBonusObject>>[];
  towerUpgrades?: ChangeTuple<WithIconId<IUpgradeObject>>[];
  auras?: ChangeTuple<WithIconId<IBaseObject>>[];
  magic?: ChangeTuple<WithIconId<IUpgradeObject>>[];
  buildings?: Partial<
    Record<keyof IRaceData['buildings'], ChangeTuple<WithIconId<IUnitObject>>>
  >;
  t1spell?: ChangeTuple<WithIconId<ISpellObject>>;
  t2spell?: ChangeTuple<WithIconId<ISpellObject>>;
}
