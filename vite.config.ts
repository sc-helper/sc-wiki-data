import { defineConfig, Plugin } from 'vite';
import { resolve } from 'path';
import { readdir, writeFile } from 'fs/promises';
import tsconfigPaths from 'vite-tsconfig-paths';
import copy from 'rollup-plugin-copy';
import dts from 'unplugin-dts/vite';

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    dts({
      insertTypesEntry: true,
      exclude: ['**/*.json'],
    }),
    pluginGenerateIndex(),
  ],
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,

    lib: {
      name: 'SCMapData',
      entry: 'data/index.ts',
      formats: ['es'],
      fileName: (format, fileName) => {
        return `${fileName}.mjs`;
      },
    },
    rollupOptions: {
      plugins: [
        copy({
          targets: [{ src: 'data/**/*.webp', dest: 'dist/' }],
          flatten: false,
          hook: 'writeBundle',
        }),
      ],
      output: {
        format: 'esm',
        esModule: true,
        preserveModules: true,
        inlineDynamicImports: false,
        assetFileNames: 'assets/[name].[extname]',
      },
    },
  },
});

function pluginGenerateIndex(): Plugin {
  const filterIndex = (str: string) => str !== 'index.ts';

  const importTypes = {
    races: [
      `import { type IDataFile, type IRacePickerObject } from '@/data/types';`,
      'Record<string, IRacePickerObject[]>',
    ],
    ultimates: [
      `import { type IDataFile, type IUltimatesData } from '@/data/types';`,
      'IUltimatesData',
    ],
    artifacts: [
      `import { type IDataFile, type IArtifactData } from '@/data/types';`,
      'IArtifactData',
    ],
    misc: [
      `import { type IDataFile, type IMiscData } from '@/data/types';`,
      'IMiscData',
    ],
  } as const;

  return {
    name: 'generate-index',
    async buildStart() {
      const entry = resolve(process.cwd(), 'data');
      const mapDataTypes = (await readdir(resolve(entry, 'mapData'))).filter(
        filterIndex
      );
      for (const mapDataType of mapDataTypes) {
        const mapTypeRoot = resolve(entry, 'mapData', mapDataType);
        const mapVersions = (await readdir(mapTypeRoot)).filter(filterIndex);

        const mapDataTypeExportContent = mapVersions
          .map(
            (mapVersion) =>
              `export * as v${mapVersion.replace(
                /\./g,
                ''
              )} from './${mapVersion}';`
          )
          .concat('')
          .join('\n');

        await writeFile(
          resolve(mapTypeRoot, 'index.ts'),
          mapDataTypeExportContent
        );

        for (const mapVersion of mapVersions) {
          const mapVersionRoot = resolve(
            entry,
            'mapData',
            mapDataType,
            mapVersion
          );
          const mapVersionFiles = (
            await readdir(mapVersionRoot, {
              recursive: true,
              withFileTypes: true,
            })
          ).filter((dirent) => {
            return dirent.isFile() && dirent.name.endsWith('.json');
          });
          const outputNames = Array<string>();
          for (const mapFile of mapVersionFiles) {
            const outputName = mapFile.name.replace(/\.json$/, '');
            outputNames.push(outputName);

            const [typeImport, generic] = importTypes[outputName] ?? [
              `import { type IDataFile, type IRaceData } from '@/data/types';`,
              'IRaceData',
            ];

            const fileContent = [
              typeImport,
              `import mapData from './${outputName}.json';`,
              '',
              `const data: IDataFile<${generic}> = mapData`,
              '',
              'export default data',
              '',
            ].join('\n');

            await writeFile(
              resolve(mapFile.parentPath, `${outputName}.ts`),
              fileContent
            );
          }

          const versionOutput = outputNames
            .map(
              (name) =>
                name in importTypes &&
                `export { default as ${name} } from './${name}';`
            )
            .filter(Boolean)
            .concat(`export * from './races';`)
            .concat('')
            .join('\n');

          await writeFile(resolve(mapVersionRoot, 'index.ts'), versionOutput);
        }
      }

      const changeDataTypes = (
        await readdir(resolve(entry, 'changelogs'))
      ).filter(filterIndex);

      for (const changeDataType of changeDataTypes) {
        const changeTypeRoot = resolve(entry, 'changelogs', changeDataType);
        console.log(changeTypeRoot);
        const changeVersions = (await readdir(changeTypeRoot))
          .filter(filterIndex)
          .filter((name) => name.endsWith('.json'));

        const outputNames = Array<string>();
        for (const changelogFile of changeVersions) {
          const outputName = changelogFile.replace(/\.json$/, '');
          outputNames.push(outputName);

          const fileContent = [
            `import { type IDataFile, type IChangelogRace } from '@/data/types';`,
            `import mapData from './${outputName}.json';`,
            '',
            `const data: IDataFile<IChangelogRace> = mapData`,
            '',
            'export default data',
            '',
          ].join('\n');

          await writeFile(
            resolve(changeTypeRoot, `${outputName}.ts`),
            fileContent
          );
        }

        const changeLogOutput = outputNames
          .map(
            (name) =>
              `export { default as v${name
                .replace(/\./g, '')
                .replace('-', 'to')} } from './${name}';`
          )
          .filter(Boolean)
          .concat('')
          .join('\n');

        await writeFile(resolve(changeTypeRoot, 'index.ts'), changeLogOutput);
      }
    },
  };
}
