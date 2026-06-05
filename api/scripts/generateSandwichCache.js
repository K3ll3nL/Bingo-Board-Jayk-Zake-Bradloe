#!/usr/bin/env node
// Generates client/public/data/sandwichCache.json using the same LP approach
// as iapetos163/sv-sandwich-builder (birbzone).
//
// Uses linear-vars.json (pre-computed LP constraint coefficients) + GLPK LP solver.
// LP relaxation (continuous variables, no branch-and-bound) solves in <10ms per target.
// No combinatorial explosion — runs all 489 targets in ~30 seconds.
//
// Usage:
//   node api/scripts/generateSandwichCache.js
//   node api/scripts/generateSandwichCache.js --dry-run
//   node api/scripts/generateSandwichCache.js --target Encounter:Dragon:1

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../..');

const args = process.argv.slice(2);
const DRY_RUN      = args.includes('--dry-run');
const TARGET_FILTER = args.find(a => a.startsWith('--target='))?.replace('--target=','')
  ?? (args.includes('--target') ? args[args.indexOf('--target')+1] : null);
const OUT_FILE = path.join(ROOT, 'client/public/data/sandwichCache.json');

// ─── Load data ────────────────────────────────────────────────────────────────

const lc         = JSON.parse(fs.readFileSync(path.join(ROOT, 'client/public/data/linear-vars.json'), 'utf8'));
const ingredients = JSON.parse(fs.readFileSync(path.join(ROOT, 'client/public/data/sv-ingredients.json'), 'utf8'));
const optimalTypes = JSON.parse(fs.readFileSync(path.join(ROOT, 'client/public/data/optimal-types.json'), 'utf8'));

// ─── Enums (from iapetos163/src/enum.ts) ─────────────────────────────────────

const Flavor    = { SWEET:0, SALTY:1, SOUR:2, BITTER:3, SPICY:4 };
const MealPower = { EGG:0, CATCH:1, EXP:2, ITEM:3, RAID:4, SPARKLING:5, TITLE:6, HUMUNGO:7, TEENSY:8, ENCOUNTER:9 };
const TypeIndex = { NORMAL:0,FIGHTING:1,FLYING:2,POISON:3,GROUND:4,ROCK:5,BUG:6,GHOST:7,STEEL:8,FIRE:9,WATER:10,GRASS:11,ELECTRIC:12,PSYCHIC:13,ICE:14,DRAGON:15,DARK:16,FAIRY:17 };

const MP_NAMES   = ['Egg','Catch','Exp','Item','Raid','Sparkling','Title','Humungo','Teensy','Encounter'];
const TYPE_NAMES = ['Normal','Fighting','Flying','Poison','Ground','Rock','Bug','Ghost','Steel','Fire','Water','Grass','Electric','Psychic','Ice','Dragon','Dark','Fairy'];
const FLAVOR_NAMES = ['Sweet','Salty','Sour','Bitter','Spicy'];

const rangeFlavors    = [0,1,2,3,4];
const rangeMealPowers = [0,1,2,3,4,5,6,7,8,9];
const rangeTypes      = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17];

// Power name normalisation (UI → MealPower enum)
const POWER_TO_MP = {
  Encounter:MealPower.ENCOUNTER, Egg:MealPower.EGG, Raid:MealPower.RAID,
  Catching:MealPower.CATCH, Catch:MealPower.CATCH, Exp:MealPower.EXP,
  'Item Drop':MealPower.ITEM, Item:MealPower.ITEM, Humungo:MealPower.HUMUNGO,
  Teensy:MealPower.TEENSY, Title:MealPower.TITLE, Sparkling:MealPower.SPARKLING,
};

// ─── Mechanics (from iapetos163/src/mechanics) ────────────────────────────────

const isHerbaMealPower = mp => mp === MealPower.SPARKLING || mp === MealPower.TITLE;
const mealPowerHasType = mp => mp !== MealPower.EGG;

// Flavor profiles per meal power (from iapetos163/src/mechanics/taste.ts)
const FLAVOR_PROFILES_FOR_POWER = {
  [MealPower.EGG]:       [[Flavor.SWEET,Flavor.SALTY],[Flavor.SWEET,Flavor.BITTER]],
  [MealPower.CATCH]:     [[Flavor.SWEET,Flavor.SOUR],[Flavor.SOUR,Flavor.SWEET]],
  [MealPower.EXP]:       [[Flavor.BITTER,Flavor.SALTY],[Flavor.SALTY,Flavor.BITTER]],
  [MealPower.ITEM]:      [[Flavor.BITTER,Flavor.SPICY],[Flavor.BITTER,Flavor.SOUR],[Flavor.BITTER,Flavor.SWEET]],
  [MealPower.RAID]:      [[Flavor.SWEET,Flavor.SPICY],[Flavor.SPICY,Flavor.SWEET]],
  [MealPower.HUMUNGO]:   [[Flavor.SPICY,Flavor.SALTY],[Flavor.SPICY,Flavor.BITTER],[Flavor.SPICY,Flavor.SOUR]],
  [MealPower.TEENSY]:    [[Flavor.SOUR,Flavor.SALTY],[Flavor.SOUR,Flavor.BITTER],[Flavor.SOUR,Flavor.SPICY]],
  [MealPower.ENCOUNTER]: [[Flavor.SALTY,Flavor.SWEET],[Flavor.SALTY,Flavor.SPICY],[Flavor.SALTY,Flavor.SOUR]],
  [MealPower.SPARKLING]: [],
  [MealPower.TITLE]:     [],
};
const getFlavorProfilesForPower = mp => FLAVOR_PROFILES_FOR_POWER[mp] ?? [];

const getFlavorKey = (flavorProfile, mealPowersByPlace) => {
  const [f1,f2] = flavorProfile;
  const nonHerbaMps = mealPowersByPlace.filter(mp => mp !== null && !isHerbaMealPower(mp));
  return `${f1}_${f2}_${nonHerbaMps.join('_')}`;
};

const getRepeatedType = targetPowers => {
  const types = targetPowers.filter(p => mealPowerHasType(p.mealPower)).map(p => p.type);
  if (types.length === 0) return null;
  const first = types[0];
  return types.every(t => t === first) ? first : null;
};

// ─── Target config (from iapetos163/src/search/creative-sandwich/target/target-config.ts)

const configsEqual = (a,b) =>
  a.typeAllocation === b.typeAllocation &&
  a.typePlaceIndex === b.typePlaceIndex &&
  a.mpPlaceIndex   === b.mpPlaceIndex;

const getTargetConfigs = (targetPowers, targetNumHerba) => {
  if (targetNumHerba >= 2) {
    const c = { typeAllocation:'ONE_ONE_ONE' };
    return targetPowers.map(tp => {
      if (tp.mealPower === MealPower.SPARKLING) return [{...c,typePlaceIndex:0,mpPlaceIndex:0}];
      if (tp.mealPower === MealPower.TITLE)     return [{...c,typePlaceIndex:0,mpPlaceIndex:1}];
      return [{...c,typePlaceIndex:0,mpPlaceIndex:2}];
    });
  }
  const repeatedType = getRepeatedType(targetPowers);
  const hasSameTypes  = repeatedType !== null;
  const allSameType   = targetPowers.every(tp => mealPowerHasType(tp.mealPower) && tp.type === repeatedType);
  const hasTitlePower = targetPowers.find(tp => tp.mealPower === MealPower.TITLE);
  const lv2s = targetPowers.filter(tp => tp.level >= 2);
  const lv3s = targetPowers.filter(tp => tp.level >= 3);

  if (targetNumHerba >= 1 && allSameType && targetPowers.length >= 2 && (targetPowers.length >= 3 || !hasTitlePower)) {
    const c = {typeAllocation:'ONE_ONE_ONE',firstTypeGt:480};
    return targetPowers.map(tp => {
      if (tp.mealPower === MealPower.TITLE) return [{...c,typePlaceIndex:0,mpPlaceIndex:1}];
      return [{...c,typePlaceIndex:0,mpPlaceIndex:2},{...c,typePlaceIndex:0,mpPlaceIndex:3}];
    });
  }
  const hasDifferentTypes = targetPowers.length > 1 &&
    targetPowers.some(tp => mealPowerHasType(tp.mealPower) && tp.type !== repeatedType);

  if (targetNumHerba >= 1 && lv3s.length >= 2 && (!hasTitlePower || lv3s.length >= 3) && hasDifferentTypes) {
    const c = {typeAllocation:'ONE_ONE_THREE',firstTypeLte:480,thirdTypeGte:380};
    return targetPowers.map(tp => {
      if (tp.mealPower === MealPower.TITLE) return [{...c,typePlaceIndex:0,mpPlaceIndex:1}];
      if (mealPowerHasType(tp.mealPower) && tp.type !== repeatedType) return [{...c,typePlaceIndex:0,mpPlaceIndex:3}];
      return [{...c,typePlaceIndex:0,mpPlaceIndex:2}];
    });
  }
  if (targetNumHerba >= 1 && lv3s.length >= 1 && hasDifferentTypes) {
    const c = {typeAllocation:'ONE_ONE_THREE',firstTypeLte:480,firstTypeGte:380};
    return targetPowers.map(tp => {
      if (tp.mealPower === MealPower.TITLE) return [{...c,typePlaceIndex:0,mpPlaceIndex:1}];
      if (mealPowerHasType(tp.mealPower) && tp.type !== repeatedType) return [{...c,typePlaceIndex:0,mpPlaceIndex:3}];
      return [{...c,typePlaceIndex:0,mpPlaceIndex:2}];
    });
  }
  if (targetNumHerba >= 1 && lv3s.length >= 2 && (!hasTitlePower || lv3s.length >= 3)) {
    const c = {typeAllocation:'ONE_ONE_THREE',thirdTypeGte:380};
    return targetPowers.map(tp => {
      if (tp.mealPower === MealPower.TITLE) return [{...c,typePlaceIndex:0,mpPlaceIndex:1}];
      return [{...c,typePlaceIndex:0,mpPlaceIndex:2},{...c,typePlaceIndex:0,mpPlaceIndex:3}];
    });
  }
  if (targetNumHerba >= 1 && lv3s.length >= 1) {
    const c = {typeAllocation:'ONE_ONE_THREE',firstTypeGte:380};
    return targetPowers.map(tp => {
      if (tp.mealPower === MealPower.TITLE) return [{...c,typePlaceIndex:0,mpPlaceIndex:1}];
      return [{...c,typePlaceIndex:0,mpPlaceIndex:2},{...c,typePlaceIndex:0,mpPlaceIndex:3}];
    });
  }
  if (targetNumHerba >= 1 && hasSameTypes && lv2s.length >= 3) {
    const c = {typeAllocation:'ONE_ONE_THREE',firstTypeGt:280,thirdTypeGte:280};
    return targetPowers.map(tp => {
      if (tp.mealPower === MealPower.TITLE) return [{...c,typePlaceIndex:0,mpPlaceIndex:1}];
      if (tp.type === repeatedType) return [{...c,typePlaceIndex:0,mpPlaceIndex:2}];
      return [{...c,typePlaceIndex:2,mpPlaceIndex:3}];
    });
  }
  if (targetNumHerba >= 1 && hasSameTypes) {
    const c = {typeAllocation:'ONE_ONE_THREE',firstTypeGt:280};
    return targetPowers.map(tp => {
      if (tp.mealPower === MealPower.TITLE) return [{...c,typePlaceIndex:0,mpPlaceIndex:1}];
      if (tp.type === repeatedType) return [{...c,typePlaceIndex:0,mpPlaceIndex:2}];
      return [{...c,typePlaceIndex:2,mpPlaceIndex:3}];
    });
  }
  if (targetNumHerba >= 1 && hasTitlePower && lv2s.length >= 3) {
    const oot = {typeAllocation:'ONE_ONE_THREE',firstTypeGt:280,thirdTypeGte:280};
    const otw = {typeAllocation:'ONE_THREE_TWO',firstTypeLte:280,thirdTypeGte:280};
    return targetPowers.map(tp => {
      if (tp.mealPower === MealPower.TITLE) return [{...oot,typePlaceIndex:0,mpPlaceIndex:1},{...otw,typePlaceIndex:0,mpPlaceIndex:1}];
      if (!mealPowerHasType(tp.mealPower)) return [{...oot,typePlaceIndex:0,mpPlaceIndex:2},{...oot,typePlaceIndex:2,mpPlaceIndex:3},{...otw,typePlaceIndex:1,mpPlaceIndex:3},{...otw,typePlaceIndex:2,mpPlaceIndex:2}];
      return [{...oot,typePlaceIndex:2,mpPlaceIndex:3},{...otw,typePlaceIndex:1,mpPlaceIndex:3},{...otw,typePlaceIndex:2,mpPlaceIndex:2}];
    });
  }
  if (targetNumHerba >= 1 && hasTitlePower) {
    const oot = {typeAllocation:'ONE_ONE_THREE',firstTypeGt:280};
    const otw = {typeAllocation:'ONE_THREE_TWO',firstTypeLte:280};
    return targetPowers.map(tp => {
      if (tp.mealPower === MealPower.TITLE) return [{...oot,typePlaceIndex:0,mpPlaceIndex:1},{...otw,typePlaceIndex:0,mpPlaceIndex:1}];
      if (!mealPowerHasType(tp.mealPower)) return [{...oot,typePlaceIndex:0,mpPlaceIndex:2},{...oot,typePlaceIndex:2,mpPlaceIndex:3},{...otw,typePlaceIndex:1,mpPlaceIndex:3},{...otw,typePlaceIndex:2,mpPlaceIndex:2}];
      return [{...oot,typePlaceIndex:2,mpPlaceIndex:3},{...otw,typePlaceIndex:1,mpPlaceIndex:3},{...otw,typePlaceIndex:2,mpPlaceIndex:2}];
    });
  }
  if (targetNumHerba >= 1) {
    const lv3c = {typeAllocation:'ONE_ONE_THREE',firstTypeGte:380};
    const lv2c = {typeAllocation:'ONE_ONE_THREE',firstTypeGt:280};
    const otw  = {typeAllocation:'ONE_THREE_TWO',firstTypeLte:280};
    return targetPowers.map(tp => {
      if (tp.level >= 3) return [{...lv3c,typePlaceIndex:0,mpPlaceIndex:2},{...lv3c,typePlaceIndex:2,mpPlaceIndex:3}];
      return [{...lv2c,typePlaceIndex:0,mpPlaceIndex:2},{...lv2c,typePlaceIndex:2,mpPlaceIndex:3},{...otw,typePlaceIndex:1,mpPlaceIndex:3},{...otw,typePlaceIndex:2,mpPlaceIndex:2}];
    });
  }

  // No herba
  if (hasSameTypes && lv2s.length === 1 && lv2s[0].type === repeatedType) {
    const c = {typeAllocation:'ONE_ONE_THREE',firstTypeGte:180,diff105:true};
    return targetPowers.map(tp => {
      if (tp.level >= 2) return [{...c,typePlaceIndex:0,mpPlaceIndex:0}];
      if (tp.type === repeatedType) return [{...c,typePlaceIndex:0,mpPlaceIndex:1}];
      return [{...c,typePlaceIndex:2,mpPlaceIndex:2}];
    });
  }
  if (hasSameTypes && lv2s.length > 0) {
    const c = {typeAllocation:'ONE_ONE_THREE',firstTypeGte:180,diff105:true};
    return targetPowers.map(tp => {
      if (tp.type === repeatedType) return [{...c,typePlaceIndex:0,mpPlaceIndex:0},{...c,typePlaceIndex:0,mpPlaceIndex:1}];
      return [{...c,typePlaceIndex:2,mpPlaceIndex:2}];
    });
  }
  if (hasSameTypes) {
    const oot = {typeAllocation:'ONE_ONE_THREE',firstTypeGt:105,diff105:true};
    const oto = {typeAllocation:'ONE_THREE_ONE',firstTypeLte:105,diff70:true};
    return targetPowers.map(tp => {
      if (tp.type === repeatedType) return [{...oto,typePlaceIndex:0,mpPlaceIndex:0},{...oot,typePlaceIndex:0,mpPlaceIndex:0},{...oto,typePlaceIndex:0,mpPlaceIndex:2},{...oot,typePlaceIndex:0,mpPlaceIndex:1}];
      return [{...oto,typePlaceIndex:2,mpPlaceIndex:1},{...oot,typePlaceIndex:2,mpPlaceIndex:2}];
    });
  }
  const couldHaveSameTypes = targetPowers.some(p => !mealPowerHasType(p.mealPower));
  if (targetPowers.length >= 3 && !couldHaveSameTypes && lv2s.length >= 2) {
    const c = {typeAllocation:'ONE_THREE_TWO',thirdTypeGte:180};
    return targetPowers.map(tp => {
      if (tp.level === 2) return [{...c,typePlaceIndex:0,mpPlaceIndex:0},{...c,typePlaceIndex:2,mpPlaceIndex:1}];
      return [{...c,typePlaceIndex:1,mpPlaceIndex:2}];
    });
  }
  if (targetPowers.length >= 3 && !couldHaveSameTypes && lv2s.length === 1) {
    const c = {typeAllocation:'ONE_THREE_TWO',firstTypeGte:180};
    return targetPowers.map(tp => {
      if (tp.level >= 2) return [{...c,typePlaceIndex:0,mpPlaceIndex:0}];
      return [{...c,typePlaceIndex:1,mpPlaceIndex:2},{...c,typePlaceIndex:2,mpPlaceIndex:1}];
    });
  }
  if (targetPowers.length >= 3 && !couldHaveSameTypes) {
    return targetPowers.map(() => [
      {typeAllocation:'ONE_THREE_TWO',typePlaceIndex:0,mpPlaceIndex:0},
      {typeAllocation:'ONE_THREE_TWO',typePlaceIndex:1,mpPlaceIndex:2},
      {typeAllocation:'ONE_THREE_TWO',typePlaceIndex:2,mpPlaceIndex:1},
    ]);
  }
  if (lv2s.length >= 2) {
    const c = {typeAllocation:'ONE_THREE_TWO',thirdTypeGte:180};
    return targetPowers.map(tp => {
      if (tp.level >= 2) return [{...c,typePlaceIndex:0,mpPlaceIndex:0},{...c,typePlaceIndex:2,mpPlaceIndex:1}];
      return [{...c,typePlaceIndex:1,mpPlaceIndex:2}];
    });
  }
  if (lv2s.length === 1) {
    const otw = {typeAllocation:'ONE_THREE_TWO',firstTypeGte:180};
    const oot = {typeAllocation:'ONE_ONE_THREE',diff105:true};
    return targetPowers.map(tp => {
      if (tp.level >= 2) return [{...otw,typePlaceIndex:0,mpPlaceIndex:0},{...oot,typePlaceIndex:0,mpPlaceIndex:0}];
      return [{...otw,typePlaceIndex:1,mpPlaceIndex:2},{...otw,typePlaceIndex:2,mpPlaceIndex:1},{...oot,typePlaceIndex:0,mpPlaceIndex:1},{...oot,typePlaceIndex:2,mpPlaceIndex:2}];
    });
  }
  const otw = {typeAllocation:'ONE_THREE_TWO'};
  const oot = {typeAllocation:'ONE_ONE_THREE',diff105:true};
  const oto = {typeAllocation:'ONE_THREE_ONE',firstTypeLte:105,diff70:true};
  return targetPowers.map(() => [
    {...otw,typePlaceIndex:0,mpPlaceIndex:0},{...otw,typePlaceIndex:1,mpPlaceIndex:2},{...otw,typePlaceIndex:2,mpPlaceIndex:1},
    {...oto,typePlaceIndex:0,mpPlaceIndex:0},{...oto,typePlaceIndex:0,mpPlaceIndex:2},{...oto,typePlaceIndex:2,mpPlaceIndex:1},
    {...oot,typePlaceIndex:0,mpPlaceIndex:0},{...oot,typePlaceIndex:0,mpPlaceIndex:1},{...oot,typePlaceIndex:2,mpPlaceIndex:2},
  ]);
};

const permutePowerConfigs = (powers, configs) => {
  const recurse = ({powerSelections, powerIndex, typePlaceIndexMapping, firstTypeGte, firstTypeLte, thirdTypeGte}) => {
    if (powers.length <= powerIndex) return [powerSelections];
    const filterConfig = c =>
      (powerSelections.length === 0 || c.typeAllocation === powerSelections[0].typeAllocation) &&
      !powerSelections.some(d => configsEqual(c,d)) &&
      (c.firstTypeGt||0) < firstTypeLte &&
      (c.firstTypeGte||0) <= firstTypeLte &&
      (c.firstTypeLte === undefined || c.firstTypeLte >= firstTypeGte) &&
      (c.thirdTypeGte||0) <= firstTypeLte;
    const nextArgs = c => ({
      powerSelections: [...powerSelections, c],
      powerIndex: powerIndex+1,
      typePlaceIndexMapping,
      firstTypeGte: Math.max(firstTypeGte, (c.firstTypeGt||-1)+1, c.firstTypeGte||0, c.thirdTypeGte||0),
      firstTypeLte: Math.min(firstTypeLte, c.firstTypeLte ?? Infinity),
      thirdTypeGte: Math.max(thirdTypeGte, c.thirdTypeGte||0),
    });
    if (!mealPowerHasType(powers[powerIndex].mealPower)) {
      return configs[powerIndex].filter(filterConfig).flatMap(c => recurse(nextArgs(c)));
    }
    const powerType = powers[powerIndex].type;
    const assignedIdx = typePlaceIndexMapping[powerType];
    const baseFilter = assignedIdx !== undefined
      ? c => filterConfig(c) && c.typePlaceIndex === assignedIdx
      : c => filterConfig(c) && !Object.values(typePlaceIndexMapping).some(pi => c.typePlaceIndex === pi);
    return configs[powerIndex].filter(baseFilter).flatMap(c => {
      const newMapping = assignedIdx !== undefined ? typePlaceIndexMapping : {...typePlaceIndexMapping, [powerType]: c.typePlaceIndex};
      return recurse({...nextArgs(c), typePlaceIndexMapping: newMapping});
    });
  };
  return recurse({powerSelections:[], powerIndex:0, typePlaceIndexMapping:{}, firstTypeGte:0, firstTypeLte:Infinity, thirdTypeGte:0});
};

// Placement helpers
const getTypeTargetsByPlace = (targetPowers, targetPlaceIndices) => {
  const get = pi => {
    const i = targetPlaceIndices.findIndex(x => x === pi);
    return i >= 0 ? targetPowers[i] : null;
  };
  const tp = [get(0), get(1), get(2)];
  return tp.map(p => (p && mealPowerHasType(p.mealPower)) ? p.type : null);
};

const getMealPowerTargetsByPlace = (targetPowers, targetPlaceIndices, firstIndex=0) => {
  const get = pi => {
    const i = targetPlaceIndices.findIndex(x => x === pi);
    return i >= 0 ? (targetPowers[i]?.mealPower ?? null) : null;
  };
  return [get(firstIndex), get(firstIndex+1), get(firstIndex+2)];
};

const fillIn = (arr, selection, fillAll=false) => {
  const res = [...arr];
  let encountered = fillAll;
  for (let i = res.length-1; i >= 0; i--) {
    if (res[i] === null && encountered) {
      res[i] = selection.find(t => !res.some(v => v===t)) ?? null;
    } else if (res[i] !== null) {
      encountered = true;
    }
  }
  if (res[0] === null) res[0] = selection[0];
  return res;
};

// Target selection
const selectInitialTargets = (targetPowers) => {
  let numHerbaTargets = [0];
  if (targetPowers.some(p => p.mealPower === MealPower.SPARKLING)) numHerbaTargets = [2];
  else if (targetPowers.some(p => p.level === 3)) numHerbaTargets = [2,1];
  else if (targetPowers.some(p => p.mealPower === MealPower.TITLE)) numHerbaTargets = [1];
  else if (targetPowers.some(p => p.level === 2)) numHerbaTargets = [1,0];

  return numHerbaTargets.flatMap(numHerba => {
    const targetConfigs = getTargetConfigs(targetPowers, numHerba);
    const configSets = permutePowerConfigs(targetPowers, targetConfigs);

    return configSets.flatMap(configSet => {
      const mpBase = numHerba > 0 ? [MealPower.SPARKLING, MealPower.TITLE] : [];
      const mealPowersByPlaceBase = getMealPowerTargetsByPlace(targetPowers, configSet.map(c=>c.mpPlaceIndex), mpBase.length);
      let mpArrays = [mealPowersByPlaceBase];
      if (mealPowersByPlaceBase[0] === null) {
        mpArrays = rangeMealPowers.filter(mp => !isHerbaMealPower(mp) && !mealPowersByPlaceBase.some(x=>x===mp))
          .map(mpChoice => [mpChoice, mealPowersByPlaceBase[1], mealPowersByPlaceBase[2]]);
      }
      if (mealPowersByPlaceBase[1] === null && mealPowersByPlaceBase[2] !== null) {
        mpArrays = mpArrays.flatMap(arr => rangeMealPowers.filter(mp => !isHerbaMealPower(mp) && !arr.some(x=>x===mp))
          .map(mpChoice => [arr[0], mpChoice, arr[2]]));
      }
      const completeMpArrays = mpArrays.map(arr => [...mpBase, ...arr]);
      const flavorIndependent = targetPowers.every(tp => isHerbaMealPower(tp.mealPower));

      const mpTargets = flavorIndependent
        ? completeMpArrays.map(mealPowersByPlace => ({mealPowersByPlace, boostPower:null}))
        : targetPowers.flatMap(power => {
            const fps = getFlavorProfilesForPower(power.mealPower);
            return fps.flatMap(flavorProfile =>
              completeMpArrays.map(mealPowersByPlace => ({mealPowersByPlace, boostPower:power.mealPower, flavorProfile}))
            );
          });

      const firstTypeGteBase = configSet.reduce((max,c) => Math.max(max, c.firstTypeGt!=null?c.firstTypeGt+1:0, c.firstTypeGte||0, c.thirdTypeGte||0), 0);
      const thirdTypeGte     = configSet.reduce((max,c) => Math.max(max, c.thirdTypeGte||0), 0);
      const firstTypeLte     = configSet.reduce((min,c) => Math.min(min, c.firstTypeLte??Infinity), Infinity);
      const diff70  = configSet.some(c=>c.diff70);
      const diff105 = configSet.some(c=>c.diff105);
      const targetTypes = getTypeTargetsByPlace(targetPowers, configSet.map(c=>c.typePlaceIndex));

      return mpTargets.map(mpt => {
        let fillInTypes = rangeTypes;
        if (mpt.boostPower !== null && mpt.flavorProfile) {
          const key = getFlavorKey(mpt.flavorProfile, mpt.mealPowersByPlace);
          if (optimalTypes[key]) fillInTypes = [...optimalTypes[key], ...fillInTypes];
        }
        const fillInAll = thirdTypeGte > 0;
        const typesByPlace = fillIn(targetTypes, fillInTypes, fillInAll);
        const arbitraryTypePlaceIndices = typesByPlace.map((t,i) => (t !== null && targetTypes[i] === null ? i : -1)).filter(i=>i>=0);

        return {
          powers: targetPowers,
          configSet,
          numHerbaMystica: numHerba,
          typesByPlace,
          arbitraryTypePlaceIndices,
          mealPowersByPlace: mpt.mealPowersByPlace,
          boostPower: mpt.boostPower,
          flavorProfile: mpt.flavorProfile,
          firstTypeGte: firstTypeGteBase,
          thirdTypeGte,
          firstTypeLte,
          diff70,
          diff105,
        };
      });
    });
  });
};

// ─── Model building (from iapetos163/src/search/creative-sandwich/model.ts) ───

const getModel = (target, multiplayer=false) => {
  const {powers, mealPowersByPlace, flavorProfile, numHerbaMystica, boostPower, typesByPlace, firstTypeGte, firstTypeLte, thirdTypeGte, diff70, diff105} = target;
  const piecesConstraints = multiplayer ? lc.constraintSets.multiplayerPieces : lc.constraintSets.singlePlayerPieces;
  const constraints = [];

  if (flavorProfile) {
    const [f1,f2] = flavorProfile;
    constraints.push(lc.constraintSets.flavorValueDifferences[f1][f2]);
    rangeFlavors.forEach(f => {
      if (f !== f1 && f !== f2) constraints.push(lc.constraintSets.flavorValueDifferences[f2][f]);
    });
  }

  const requestedHerbaPower = powers.find(p => isHerbaMealPower(p.mealPower));
  if (requestedHerbaPower) constraints.push(lc.constraints.herbaMealPowerValue);

  const baseMpPlaceIndex = numHerbaMystica > 0 ? 2 : 0;
  const [firstMp, secondMp, thirdMp] = mealPowersByPlace.slice(baseMpPlaceIndex);
  const lastMp = thirdMp ?? secondMp ?? firstMp;

  const setMpDiff = (greater, lesser) => {
    const boostOffset = greater===boostPower ? -100 : lesser===boostPower ? 100 : 0;
    const base = lc.constraintSets.mealPowerValueDifferences[greater][lesser];
    constraints.push({name:base.name, coefficients:base.coefficients, lowerBound:(base.lowerBound??0)+boostOffset});
  };
  if (secondMp != null) setMpDiff(firstMp, secondMp);
  if (secondMp != null && thirdMp != null) setMpDiff(secondMp, thirdMp);
  if (lastMp != null) {
    rangeMealPowers.filter(mp => !isHerbaMealPower(mp) && mp!==firstMp && mp!==secondMp && mp!==lastMp)
      .forEach(mp => setMpDiff(lastMp, mp));
  }

  const [firstType, secondType, thirdType] = typesByPlace;
  const lastType = thirdType ?? secondType ?? firstType;
  if (secondType != null) {
    constraints.push(diff105 ? lc.constraintSets.typeDiff105[firstType][secondType] : lc.constraintSets.typeValueDifferences[firstType][secondType]);
    if (diff70) constraints.push(lc.constraintSets.typeDiff70[firstType][secondType]);
  } else if (diff105 || diff70) {
    rangeTypes.forEach(t => {
      if (t === firstType) return;
      if (diff105) constraints.push(lc.constraintSets.typeDiff105[firstType][t]);
      if (diff70)  constraints.push(lc.constraintSets.typeDiff70[firstType][t]);
    });
  }
  if (secondType != null && thirdType != null) constraints.push(lc.constraintSets.typeValueDifferences[secondType][thirdType]);
  rangeTypes.forEach(t => {
    if (t===firstType || t===secondType || t===lastType) return;
    constraints.push(lc.constraintSets.typeValueDifferences[lastType][t]);
  });

  if (firstTypeGte === firstTypeLte) {
    constraints.push({equals:firstTypeLte, coefficients:lc.coefficientSets.typeValues[firstType]});
  } else if (firstTypeGte > 0 && firstTypeLte < Infinity) {
    constraints.push({upperBound:firstTypeLte, lowerBound:firstTypeGte, coefficients:lc.coefficientSets.typeValues[firstType]});
  } else if (firstTypeLte < Infinity) {
    constraints.push({upperBound:firstTypeLte, coefficients:lc.coefficientSets.typeValues[firstType]});
  } else if (firstTypeGte > 0) {
    constraints.push({lowerBound:firstTypeGte, coefficients:lc.coefficientSets.typeValues[firstType]});
  }
  if (thirdType != null && thirdTypeGte > 0) {
    constraints.push({lowerBound:thirdTypeGte, coefficients:lc.coefficientSets.typeValues[thirdType]});
  }

  return {
    objective: lc.objective,
    constraints: [
      {equals:numHerbaMystica, coefficients:lc.coefficientSets.herba},
      {coefficients:lc.coefficientSets.fillingsTimes12, upperBound:multiplayer?144:72, lowerBound:1},
      {coefficients:lc.coefficientSets.condiments, upperBound:multiplayer?8:4, lowerBound:1},
      flavorProfile ? lc.constraints.specificHerba : lc.constraints.anyHerba,
      ...piecesConstraints,
      ...constraints,
    ],
  };
};

// ─── LP Simplex solver (pure JS, no external deps) ───────────────────────────
// Big-M simplex. Handles ≤, ≥, = constraints correctly.
// Returns { status: 'optimal'|'infeasible', vars: {name:value}, objectiveValue }

function solveLP(model) {
  const varSet = new Set(Object.keys(model.objective.coefficients));
  for (const c of model.constraints) for (const k of Object.keys(c.coefficients)) varSet.add(k);
  const varNames = Array.from(varSet);
  const n0 = varNames.length;

  // Convert each constraint bound into a standard form row
  // type 'le': Ax <= b  → Ax + s = b  (s = slack, s >= 0)
  // type 'ge': Ax >= b  → Ax - s = b  (s = surplus, s >= 0) + artificial
  // type 'eq': Ax  = b                + artificial
  const rows = [];
  for (const c of model.constraints) {
    const {coefficients, upperBound, lowerBound, equals} = c;
    const makeR = () => {
      const r = new Float64Array(n0);
      for (const [nm, coef] of Object.entries(coefficients)) {
        const i = varNames.indexOf(nm);
        if (i >= 0) r[i] = coef;
      }
      return r;
    };
    if (typeof equals === 'number') {
      const r = makeR(), rhs = equals;
      // Ensure RHS >= 0
      if (rhs < 0) { for(let j=0;j<n0;j++) r[j]=-r[j]; rows.push({r, rhs:-rhs, type:'eq'}); }
      else rows.push({r, rhs, type:'eq'});
    } else {
      if (typeof upperBound === 'number') {
        const r = makeR(), rhs = upperBound;
        if (rhs < 0) { for(let j=0;j<n0;j++) r[j]=-r[j]; rows.push({r, rhs:-rhs, type:'ge'}); }
        else rows.push({r, rhs, type:'le'});
      }
      if (typeof lowerBound === 'number') {
        const r = makeR(), rhs = lowerBound;
        if (rhs < 0) { for(let j=0;j<n0;j++) r[j]=-r[j]; rows.push({r, rhs:-rhs, type:'le'}); }
        else rows.push({r, rhs, type:'ge'});
      }
    }
  }

  const m = rows.length;
  // Extra columns: slacks for 'le', surplus+artificial for 'ge', artificial for 'eq'
  const extras = rows.map((row,i) => {
    if (row.type === 'le') return {slack:`_s${i}`, art:null};
    if (row.type === 'ge') return {slack:`_sp${i}`, art:`_a${i}`};
    return {slack:null, art:`_a${i}`};
  });
  const slackNames = extras.map(e => e.slack).filter(Boolean);
  const artNames   = extras.map(e => e.art).filter(Boolean);
  const allNames   = [...varNames, ...slackNames, ...artNames];
  const N = allNames.length;
  const BIG_M = 1e8;

  const T = Array.from({length:m+1}, () => new Float64Array(N+1));
  const basis = new Int32Array(m);

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n0; j++) T[i][j] = rows[i].r[j];
    T[i][N] = rows[i].rhs;
    if (rows[i].type === 'le') {
      const si = allNames.indexOf(extras[i].slack);
      T[i][si] = 1; basis[i] = si;
    } else if (rows[i].type === 'ge') {
      const si = allNames.indexOf(extras[i].slack);
      const ai = allNames.indexOf(extras[i].art);
      T[i][si] = -1; T[i][ai] = 1; basis[i] = ai;
      T[m][ai] = BIG_M;
    } else { // eq
      const ai = allNames.indexOf(extras[i].art);
      T[i][ai] = 1; basis[i] = ai;
      T[m][ai] = BIG_M;
    }
  }

  for (const [nm, coef] of Object.entries(model.objective.coefficients)) {
    const j = allNames.indexOf(nm); if (j >= 0) T[m][j] = coef;
  }
  // Adjust objective for artificial basis vars
  const artStart = n0 + slackNames.length;
  for (let i = 0; i < m; i++) {
    if (basis[i] >= artStart) for (let j = 0; j <= N; j++) T[m][j] -= BIG_M * T[i][j];
  }

  const MAX_ITER = 5000;
  for (let iter = 0; iter < MAX_ITER; iter++) {
    let enter = -1, minVal = -1e-8;
    for (let j = 0; j < N; j++) { if (T[m][j] < minVal) { minVal = T[m][j]; enter = j; } }
    if (enter < 0) break;
    let leave = -1, minRatio = Infinity;
    for (let i = 0; i < m; i++) {
      if (T[i][enter] > 1e-9) {
        const ratio = T[i][N] / T[i][enter];
        if (ratio < minRatio - 1e-9) { minRatio = ratio; leave = i; }
      }
    }
    if (leave < 0) break; // unbounded — shouldn't happen for this problem
    const piv = T[leave][enter];
    for (let j = 0; j <= N; j++) T[leave][j] /= piv;
    for (let i = 0; i <= m; i++) {
      if (i === leave) continue;
      const f = T[i][enter];
      if (Math.abs(f) < 1e-15) continue;
      for (let j = 0; j <= N; j++) T[i][j] -= f * T[leave][j];
    }
    basis[leave] = enter;
  }

  const x = new Float64Array(N);
  for (let i = 0; i < m; i++) x[basis[i]] = Math.max(0, T[i][N]);

  // Infeasibility check: any artificial still in basis with value > 0?
  for (let j = artStart; j < N; j++) if (x[j] > 1e-6) return {status:'infeasible', vars:{}, objectiveValue:Infinity};

  const vars = {};
  for (let j = 0; j < n0; j++) if (x[j] > 1e-9) vars[varNames[j]] = x[j];
  return {status:'optimal', vars, objectiveValue: T[m][N]};
}

const solveModel = async (model) => {
  const result = solveLP(model);
  return result.status === 'optimal' ? {status:2, vars: result.vars} : {status:5, vars:{}};
};

// ─── Result processing ────────────────────────────────────────────────────────

const parseSolution = (solution) => {
  const fillings = [], condiments = [];
  Object.entries(solution.vars || {}).forEach(([id, count]) => {
    if (!count || count < 0.01) return;
    const ing = ingredients.find(i => i.id === id);
    if (!ing) return;
    if (ing.ingredientType === 'filling') {
      const inventoryCount = Math.ceil(count / ing.pieces);
      for (let j = 0; j < inventoryCount; j++) fillings.push(ing);
    } else {
      for (let j = 0; j < Math.round(count); j++) condiments.push(ing);
    }
  });
  return {fillings, condiments};
};

const formatResult = (fillings, condiments) => {
  const numHerba = condiments.filter(c => c.isHerbaMystica).length;
  const totalPieces = fillings.reduce((s,f) => s + (f.pieces||1), 0) + condiments.length;
  return {
    fillings: fillings.map(f => ({name: f.name, pieces: f.pieces||1})),
    condiments: condiments.map(c => c.name),
    numHerba,
    totalPieces,
    // powers computed at display time from stored ingredients
  };
};

// No-good cut: forbid this exact combination of ingredients
const addNoGoodCut = (model, fillings, condiments) => {
  const usedIds = {};
  [...fillings, ...condiments].forEach(ing => { usedIds[ing.id] = (usedIds[ing.id]||0)+1; });
  const n = Object.keys(usedIds).length;
  model.constraints.push({
    upperBound: n - 1,
    coefficients: Object.fromEntries(Object.entries(usedIds).map(([id]) => [id, 1])),
  });
};

// ─── Main search ──────────────────────────────────────────────────────────────

const searchForTarget = async (targetPowers, maxResults=15) => {
  const targets = selectInitialTargets(targetPowers);
  const seen = new Set();
  const results = [];

  for (const target of targets) {
    if (results.length >= maxResults) break;
    const model = getModel(target);

    for (let attempt = 0; attempt < 6; attempt++) {
      if (results.length >= maxResults) break;
      const sol = await solveModel(model);
      if (sol.status !== 2) break; // not optimal

      const {fillings, condiments} = parseSolution(sol);
      if (!fillings.length && !condiments.length) break;

      const key = [...fillings.map(f=>f.id),...condiments.map(c=>c.id)].sort().join('|');
      if (!seen.has(key)) {
        seen.add(key);
        results.push(formatResult(fillings, condiments));
      }
      addNoGoodCut(model, fillings, condiments);
    }
  }
  return results;
};

const allTargets = () => {
  const out = [];
  for (const [mpName, mpVal] of Object.entries(MealPower)) {
    const types = mpVal === MealPower.EGG ? [null] : TYPE_NAMES;
    for (const typeName of types) {
      const typeVal = typeName ? TypeIndex[typeName.toUpperCase()] : null;
      for (const level of [1,2,3]) {
        const key = `${mpName}:${typeName??'none'}:${level}`;
        out.push({key, mealPower:mpVal, type:typeVal, level});
      }
    }
  }
  return out;
};

// ─── Entry point ─────────────────────────────────────────────────────────────

async function main() {
  let targets = allTargets();
  if (TARGET_FILTER) {
    targets = targets.filter(t => t.key === TARGET_FILTER);
    if (!targets.length) { console.error('Unknown target:', TARGET_FILTER); process.exit(1); }
  }

  console.log(`Computing ${targets.length} target(s)…${DRY_RUN?' [DRY RUN]':''}`);

  const cache = {};
  let done = 0, total = 0;

  for (const t of targets) {
    const targetPowers = [{mealPower: t.mealPower, type: t.type, level: t.level}];
    const results = await searchForTarget(targetPowers);
    cache[t.key] = { results, cooccurrences: {} };
    total += results.length;
    done++;
    if (done % 20 === 0 || done === targets.length) {
      const pct = ((done/targets.length)*100).toFixed(1);
      process.stdout.write(`\r[${pct.padStart(5)}%] ${done}/${targets.length} — ${total} sandwiches`);
    }
  }
  console.log();

  if (!DRY_RUN) {
    fs.writeFileSync(OUT_FILE, JSON.stringify(cache));
    const kb = (fs.statSync(OUT_FILE).size/1024).toFixed(0);
    console.log(`Wrote ${OUT_FILE} (${kb} KB)`);
  } else {
    const sample = Object.entries(cache).slice(0,5);
    for (const [k,v] of sample) console.log(` ${k}: ${v.results.length} sandwiches`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
