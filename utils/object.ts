export const mapObject = <
  const Obj extends Record<string, unknown>,
  K extends Obj[keyof Obj],
  Q
>(
  data: Obj,
  mapFn: (value: K, key: string) => Q,
  dropUndefined = false
) => {
  return Object.entries(data).reduce((acc, [key, value]) => {
    const calcValue = mapFn(value as K, key);
    if (!dropUndefined || value !== undefined) {
      acc[key as keyof Obj] = calcValue;
    }
    return acc;
  }, {} as Record<keyof Obj, Q>);
};
