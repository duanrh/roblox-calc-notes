import { pathToFileURL } from 'node:url';

// Dandy's World Research & Ichor math (zero-dependency Node.js module).
// Data rules: Dandy's World Wiki (Fandom), CC BY-SA 3.0.
// Interactive planner: https://calcdenhq.com/dandys-world/research-unlock-planner/

/**
 * Research % gained on a single floor where the target Twisted spawns.
 * - Normal Toon: +5% encounter + 2 x 1% capsules = 7% max/floor.
 * - Rodger doubles both: +10% encounter + 2 x 2% capsules = 14% max/floor.
 */
export function researchPerFloor(basePct = 7, usingRodger = false) {
  return basePct * (usingRodger ? 2 : 1);
}

/** Number of spawn floors needed to go from `havePct` to `needPct`. */
export function floorsForResearch(havePct, needPct, basePct = 7, usingRodger = false) {
  const left = Math.max(0, needPct - Math.min(havePct, 100));
  return left ? Math.ceil(left / researchPerFloor(basePct, usingRodger)) : 0;
}

/**
 * Ichor earned in one run:
 * - +5 per floor survived up to Floor 15, +6 per floor after Floor 15
 * - +5 per Machine finished
 * - +2 per Research Capsule picked up
 * - +5 per floor an active ability is used (capped at floors survived)
 */
export function ichorPerRun({ floors = 0, machines = 0, capsules = 0, abilityUses = 0 }) {
  const f = Math.max(0, Math.floor(floors));
  const m = Math.max(0, Math.floor(machines));
  const c = Math.max(0, Math.floor(capsules));
  const a = Math.min(Math.max(0, Math.floor(abilityUses)), f);
  return 5 * Math.min(f, 15) + 6 * Math.max(f - 15, 0) + 5 * m + 2 * c + 5 * a;
}

/** Runs needed to farm `remainingIchor` at `perRun` Ichor/run. */
export function runsForIchor(remainingIchor, perRun) {
  if (remainingIchor <= 0) return 0;
  return perRun > 0 ? Math.ceil(remainingIchor / perRun) : Infinity;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log('0% -> 100% Research (normal, 7%/floor):', floorsForResearch(0, 100, 7, false), 'floors');
  console.log('0% -> 100% Research (Rodger, 14%/floor):', floorsForResearch(0, 100, 7, true), 'floors');
  console.log('0% -> 50% Research (Rodger, 14%/floor):', floorsForResearch(0, 50, 7, true), 'floors');
  const sampleRun = ichorPerRun({ floors: 10, machines: 15, capsules: 8, abilityUses: 10 });
  console.log('Sample 10-floor run Ichor:', sampleRun);
  console.log('Runs for Bobette Ichor (2,500):', runsForIchor(2500, sampleRun));
  console.log('Runs for Astro Ichor (5,000):', runsForIchor(5000, sampleRun));
}
