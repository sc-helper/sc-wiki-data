import { isNotNil } from './guards';

const collator = new Intl.Collator();

export function uniq<T>(item: T, index: number, array: T[]): boolean {
  return array.indexOf(item) === index;
}

export function uniqById<T extends { id: number | string }>(
  { id }: T,
  index: number,
  array: T[]
): boolean {
  return array.findIndex((item) => item.id === id) === index;
}

export function sortVersion(items: string[]) {
  return items
    .map((ver) => ver.match(/\d+|\w|-/g))
    .filter(isNotNil)
    .sort(([a1, a2, a3], [b1, b2, b3]) => {
      if (a1 !== b1) return collator.compare(b1, a1);
      if (a2 !== b2) return collator.compare(b2, a2);
      if (a3 || b3) return collator.compare(b3 ?? '', a3 ?? '');
      return 0;
    })
    .map((parts) => parts.join('.').replace(/\.(?!\d)/, ''))
    .map((val) => val.replace('-.', '-').replace(/\.(?=\D)/, ''));
}
