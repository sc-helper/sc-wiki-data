import type {
  IArtifactObject,
  IBaseObject,
  IBonusObject,
  IHeroObject,
  ISpellObject,
  IUnitObject,
  IUpgradeObject,
} from '../data/types';

export function isNotNil<T>(
  val: T | null | undefined
): val is Exclude<T, null | undefined> {
  return typeof val === 'number' || val === false || !!val;
}

export function isBaseObject(val: any): val is IBaseObject {
  return 'id' in val;
}

export function isArtifactObject(val: IBaseObject): val is IArtifactObject {
  return val.type === 'artifact';
}

export function isUnitObject(val: IBaseObject): val is IUnitObject {
  return val.type === 'unit';
}

export function isHeroObject(val: IBaseObject): val is IHeroObject {
  return val.type === 'hero';
}

export function isUpgradeObject(val: IBaseObject): val is IUpgradeObject {
  return val.type === 'upgrade';
}

export function isSpellObject(val: IBaseObject): val is ISpellObject {
  return val.type === 'spell';
}

export function isBonusObject(val: IBaseObject): val is IBonusObject {
  return val.type === 'bonus';
}
