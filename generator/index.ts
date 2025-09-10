import './versionSelect';

const ScriptParser = await (async () => {
  if (globalThis.mapVersion === 'oz')
    return import('./ozScript').then(({ OZScriptParser }) => OZScriptParser);
  return import('./script').then(
    ({ Sur5alScriptParser }) => Sur5alScriptParser
  );
})();

import('./parser').then(({ SurvivalChaosParser }) => {
  const scriptParser = new ScriptParser();
  const parser = new SurvivalChaosParser(
    scriptParser,
    globalThis.mapVersion === 'oz'
  );
  parser.generate();
});
