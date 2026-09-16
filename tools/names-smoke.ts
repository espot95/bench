import { generateWorld } from '../src/generation/generate-world.js';
import { createRng } from '../src/rng/rng.js';
const world = generateWorld(createRng(42));
for (const l of world.leagues) {
  const names = l.clubIds.map((id) => {
    const c = world.clubs.get(id)!;
    return `${c.name} [${c.shortName}]`;
  });
  console.log(`== ${l.name} (${names.length})`);
  console.log(names.join(' | '));
}
const all = [...world.clubs.values()];
const dupN = all.length - new Set(all.map((c) => c.name)).size;
const dupS = all.length - new Set(all.map((c) => c.shortName)).size;
console.log('duplicati nomi:', dupN, '· duplicati sigle:', dupS);
