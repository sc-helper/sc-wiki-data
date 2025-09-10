import './versionSelect';
import { resolve } from 'path';
import { writeFile } from 'fs/promises';

const outputDir = resolve(process.cwd(), 'dataDebug', globalThis.mapVersion);

const { abilitiesParser, itemsParser, unitsParser, upgradesParser } =
  await import('./objects');

const files = [
  ['w3q', upgradesParser],
  ['w3a', abilitiesParser],
  ['w3u', unitsParser],
  ['w3t', itemsParser],
] as const;

files.forEach(async ([newFileName, parser]) => {
  await writeFile(
    resolve(outputDir, `${newFileName}.json`),
    JSON.stringify(parser.data, null, 4),
    { encoding: 'utf8' }
  );
  await writeFile(
    resolve(outputDir, `${newFileName}.formatted.json`),
    JSON.stringify(restore(parser.data), null, 4),
    { encoding: 'utf8' }
  );
});

function restore(data: any) {
  return Object.entries(data).reduce((acc, [key, value]) => {
    if (!Array.isArray(value)) {
      acc[key] = restore(value);
      return acc;
    }

    const output = value.reduce((innerAcc, { id, value }) => {
      if (id in innerAcc) {
        innerAcc[id] = [...[innerAcc[id]].flat(), value];
      } else {
        innerAcc[id] = value;
      }
      return innerAcc;
    }, {} as any);

    acc[key] = output;

    return acc;
  }, {} as any);
}
