// Sandwich search worker — pure JS, no dependencies, runs in < 500ms.
//
// Speed comes from enumerating LP configurations (flavor profiles × herba counts × levels)
// and for each configuration scoring + filtering ingredients down to a small candidate set
// before doing combinatorial enumeration.  This is the same insight as iapetos163/birbzone —
// the LP structure tells us WHICH ingredients are relevant for each configuration.
//
// No WASM / glpk.js needed: the LP gives the search direction, fast JS does the rest.

// ─── Constants ────────────────────────────────────────────────────────────────

const MP_NAMES = ["Egg","Catch","Exp","Item","Raid","Sparkling","Title","Humungo","Teensy","Encounter"];
const TYPE_NAMES = ["Normal","Fighting","Flying","Poison","Ground","Rock","Bug","Ghost","Steel",
  "Fire","Water","Grass","Electric","Psychic","Ice","Dragon","Dark","Fairy"];

const FLAVOR = { Sweet:0, Salty:1, Sour:2, Bitter:3, Hot:4 };
const MP     = Object.fromEntries(MP_NAMES.map((n,i)=>[n,i]));
const TYPE   = Object.fromEntries(TYPE_NAMES.map((n,i)=>[n,i]));
const N_FLAVOR=5, N_MP=10, N_TYPE=18;

const POWER_FULL = {
  Egg:"Egg Power", Catch:"Catching Power", Exp:"Exp. Point Power",
  Item:"Item Drop Power", Raid:"Raid Power", Sparkling:"Sparkling Power",
  Title:"Title Power", Humungo:"Humungo Power", Teensy:"Teensy Power",
  Encounter:"Encounter Power",
};

// Taste map [first_flavor][second_flavor] → MP index
const TASTE_MAP = [
  [0,0,1,0,4],
  [9,9,9,2,9],
  [1,8,8,8,8],
  [3,2,3,3,3],
  [4,7,7,7,7],
];

const POWER_TO_MP = {
  Encounter:'Encounter', Egg:'Egg', Raid:'Raid',
  Catching:'Catch', Catch:'Catch', Exp:'Exp',
  'Item Drop':'Item', Item:'Item',
  Humungo:'Humungo', Teensy:'Teensy', Title:'Title', Sparkling:'Sparkling',
};

// From iapetos163/taste.ts — (primary, secondary) flavor pairs that produce each power
const FLAVOR_PROFILES = {
  Egg:       [[0,1],[0,3]],
  Humungo:   [[4,1],[4,3],[4,2]],
  Teensy:    [[2,1],[2,3],[2,4]],
  Item:      [[3,4],[3,2],[3,0]],
  Encounter: [[1,0],[1,4],[1,2]],
  Exp:       [[3,1],[1,3]],
  Catch:     [[0,2],[2,0]],
  Raid:      [[0,4],[4,0]],
  Title:     [[null,null]],
  Sparkling: [[null,null]],
};

// Level thresholds (first type slot total including base 20)
const LVL_GTE = {1:0,  2:180, 3:380};
const LVL_LT  = {1:180,2:380, 3:Infinity};

// ─── Ingredient preprocessing ─────────────────────────────────────────────────

function buildIndex(rawFillings, rawCondiments) {
  function vectors(ing, isFilling) {
    const scale = isFilling ? (ing.pieces ?? 1) : 1; // per inventory-unit contribution
    const fv=Array(N_FLAVOR).fill(0), tv=Array(N_TYPE).fill(0), mv=Array(N_MP).fill(0);
    for (const {flavor,amount} of ing.tastes??[]) { const i=FLAVOR[flavor];   if(i!=null) fv[i]+=amount*scale; }
    for (const {type, amount} of ing.types?? []) { const i=TYPE[type];        if(i!=null) tv[i]+=amount*scale; }
    for (const {type: n,amount} of ing.powers??[]) {
      const key = POWER_TO_MP[n]??n;
      const i = MP[key]; if(i!=null) mv[i]+=amount*scale;
    }
    // Herba bonuses stored per-unit so buildVectors can just sum them
    const isHerba = !isFilling && (ing.name?.toLowerCase().includes('herba') ?? false);
    if (isHerba) { mv[MP.Title]+=10000; mv[MP.Sparkling]+=20000; }
    return {fv,tv,mv,isHerba};
  }

  const fills = rawFillings.map((f,i) => ({
    ...f, varIdx:i, isFilling:true, isHerba:false,
    ...vectors(f,true),
  }));
  const conds = rawCondiments.map((c,i) => ({
    ...c, varIdx:i, isFilling:false,
    ...vectors(c,false),
  }));
  return {fills, conds};
}

// ─── Mechanics (self-contained, matches main thread) ─────────────────────────

function buildVec(fillings, condiments) {
  const fv=Array(N_FLAVOR).fill(0), tv=Array(N_TYPE).fill(0), mv=Array(N_MP).fill(0);
  for (const f of fillings) {
    const pcs = f.selectedPieces ?? ((f.pieces??1)*(f._count??1));
    for (const {flavor,amount} of f.tastes??[]) { const i=FLAVOR[flavor]; if(i!=null) fv[i]+=amount*pcs; }
    for (const {type, amount} of f.types?? []) { const i=TYPE[type];      if(i!=null) tv[i]+=amount*pcs; }
    for (const {type:n,amount} of f.powers??[]) {
      const i=MP[POWER_TO_MP[n]??n]; if(i!=null) mv[i]+=amount*pcs;
    }
  }
  for (const c of condiments) {
    for (const {flavor,amount} of c.tastes??[]) { const i=FLAVOR[flavor]; if(i!=null) fv[i]+=amount; }
    for (const {type, amount} of c.types?? []) { const i=TYPE[type];      if(i!=null) tv[i]+=amount; }
    for (const {type:n,amount} of c.powers??[]) {
      const i=MP[POWER_TO_MP[n]??n]; if(i!=null) mv[i]+=amount;
    }
  }
  const herba=condiments.filter(c=>c.isHerba).length;
  if(herba>=1) mv[MP.Title]+=10000;
  if(herba>=2) mv[MP.Sparkling]+=20000;
  for(let i=0;i<N_TYPE;i++) tv[i]+=20;
  return {fv,tv,mv};
}

function evaluate(fv,tv,mv) {
  const ranked_f = fv.map((a,i)=>({f:i,a})).sort((a,b)=>b.a-a.a||a.f-b.f);
  let boosted=null;
  if(ranked_f[0]&&ranked_f[0].a>0){
    const f1=ranked_f[0].f, f2=(ranked_f[1]&&ranked_f[1].a>0)?ranked_f[1].f:f1;
    boosted=TASTE_MAP[f1][f2];
  }
  const adjMv=mv.map((v,i)=>i===boosted?v+100:v);
  const rMP=adjMv.map((a,i)=>({mp:i,a})).sort((a,b)=>b.a-a.a||a.mp-b.mp);
  const rT =tv.map((a,i)=>({t:i,a})).sort((a,b)=>b.a-a.a||a.t-b.t);

  function calcTypes(rt){
    const [A={t:0,a:0},,C={t:2,a:0}]=rt;
    const fa=A.a,sa=(rt[1]??{a:0}).a;
    if(fa>480) return[A,A,A];
    if(fa>280||(fa>105&&fa-sa>105)) return[A,A,C];
    if(fa<=105&&fa-1.5*sa>=70) return[A,C,A];
    return[A,C,rt[1]??A];
  }
  function calcLevels(rt){
    const fa=(rt[0]??{a:0}).a,ta=(rt[2]??{a:0}).a;
    if(fa>=460) return[3,3,3];
    if(fa>=380) return ta>=380?[3,3,3]:[3,3,2];
    if(fa>280)  return ta>=180?[2,2,2]:[2,2,1];
    if(fa>=180) return ta>=180?[2,2,1]:[2,1,1];
    return[1,1,1];
  }

  const aT=calcTypes(rT), aL=calcLevels(rT);
  return rMP
    .filter(mp=>mp.mp!==MP.Sparkling||mp.a>1000)
    .slice(0,3)
    .filter((mp,i)=>mp.a>0&&aT[i])
    .map((mp,i)=>({
      power:MP_NAMES[mp.mp],
      fullName:POWER_FULL[MP_NAMES[mp.mp]]||MP_NAMES[mp.mp],
      type:mp.mp===MP.Egg?null:TYPE_NAMES[aT[i].t],
      level:aL[i], score:mp.a,
    }));
}

function powersMatch(powers, targets) {
  return targets.every(tgt=>{
    const mp=POWER_TO_MP[tgt.power]||tgt.power;
    return powers.some(r=>
      r.power===mp&&(mp==='Egg'||!tgt.type||r.type===tgt.type)&&r.level>=(tgt.level||1));
  });
}

// ─── Configuration-aware candidate scoring ────────────────────────────────────
// Score each ingredient for a given (f1, f2, targetTypeIdx) configuration.
// This is the LP dual insight: ingredients that push the active constraints
// the most are the most valuable.

function scoreFilling(f, f1, f2, targetTypeIdx, needLevel) {
  let s = 0;
  // Flavor constraint: need f1 dominant (and f2 second if not null)
  if (f1 !== null) {
    s += (f.fv[f1] ?? 0) * 2;            // want f1 high
    if (f2 !== null) s += (f.fv[f2] ?? 0); // want f2 second
    // Penalise flavours that would compete with f1
    for (let fl=0;fl<N_FLAVOR;fl++) {
      if(fl!==f1&&fl!==f2) s -= (f.fv[fl]??0)*0.5;
    }
  }
  // Type constraint: need targetType dominant
  if (targetTypeIdx !== null) {
    s += (f.tv[targetTypeIdx]??0) * 3;
    if (needLevel > 1) s += (f.tv[targetTypeIdx]??0) * 2; // extra weight for higher levels
  }
  return s;
}

function scoreCond(c, f1, f2, targetTypeIdx) {
  let s = 0;
  if (f1 !== null) {
    s += (c.fv[f1]??0) * 2;
    if (f2 !== null) s += (c.fv[f2]??0);
    for (let fl=0;fl<N_FLAVOR;fl++) {
      if(fl!==f1&&fl!==f2) s -= (c.fv[fl]??0)*0.5;
    }
  }
  if (targetTypeIdx !== null) s += (c.tv[targetTypeIdx]??0) * 3;
  return s;
}

// ─── Combinatorial enumeration ────────────────────────────────────────────────

// Without repetition — used for condiments (each condiment is unique)
function* combinations(arr, k) {
  if(k===0){yield[];return;}
  for(let i=0;i<=arr.length-k;i++)
    for(const r of combinations(arr.slice(i+1),k-1)) yield[arr[i],...r];
}

// With repetition — index-based to avoid array allocation on each recursive call
function* combinationsWithRep(arr, k) {
  const n = arr.length;
  if(n===0||k===0){if(k===0)yield[];return;}
  const idx = new Array(k).fill(0);
  while(true) {
    yield idx.map(i=>arr[i]);
    let i = k-1;
    while(i>=0 && idx[i]===n-1) i--;
    if(i<0) return;
    const v = idx[i]+1;
    for(let j=i;j<k;j++) idx[j]=v;
  }
}

function runConfig(fills, nonHerbaConds, herbaPool, config, targets, playerCount, seen, results, MAX_TOTAL) {
  const {numHerba, f1, f2, targetTypeIdx, levelGte, levelLt} = config;
  const maxFill = playerCount*6, maxCond = playerCount*4;
  const needLevel = levelGte >= 380 ? 3 : levelGte >= 180 ? 2 : 1;

  // Score and rank candidates for this configuration
  const scoredFills = fills
    .map(f=>({...f,_score:scoreFilling(f,f1,f2,targetTypeIdx,needLevel)}))
    .filter(f=>f._score>0)
    .sort((a,b)=>b._score-a._score)
    .slice(0, Math.min(fills.length, 15));

  const scoredConds = nonHerbaConds
    .map(c=>({...c,_score:scoreCond(c,f1,f2,targetTypeIdx)}))
    .filter(c=>c._score>0)
    .sort((a,b)=>b._score-a._score)
    .slice(0, Math.min(nonHerbaConds.length, 12));

  // Herba combinations
  const herbaCombos = numHerba===0 ? [[]]
    : numHerba===1 ? herbaPool.map(h=>[h])
    : [...combinations(herbaPool,2)];

  for (const herbaCombo of herbaCombos) {
    if(herbaCombo.length<numHerba||results.length>=MAX_TOTAL) continue;

    const usedCondSlots = maxCond - numHerba;

    for(let total=1; total<=maxFill+usedCondSlots&&results.length<MAX_TOTAL; total++) {
      for(let nF=Math.min(maxFill,total); nF>=Math.max(1,total-usedCondSlots)&&results.length<MAX_TOTAL; nF--) {
        const nC=total-nF;
        if(nC<(numHerba>=1?0:1)||nC>usedCondSlots) continue;

        for(const fillCombo of combinationsWithRep(scoredFills,nF)) {
          if(results.length>=MAX_TOTAL) break;

          const fillings = fillCombo.map(f=>({...f,selectedPieces:f.pieces??1,_count:1}));
          const condSets = nC===0?[[]]:[...combinations(scoredConds,nC)];

          for(const condCombo of condSets) {
            if(results.length>=MAX_TOTAL) break;

            const allConds = [...herbaCombo,...condCombo];
            const {fv,tv,mv} = buildVec(fillings,allConds);

            // Fast pre-check: does the type vector satisfy the level range?
            if(targetTypeIdx!==null){
              const tv1=tv[targetTypeIdx];
              if(levelGte>0&&tv1<levelGte) continue;
              if(levelLt<Infinity&&tv1>=levelLt) continue;
            }

            const powers = evaluate(fv,tv,mv);
            if(!powersMatch(powers,targets)) continue;

            const key=[
              ...fillings.map(f=>`${f.name}×${f.selectedPieces}`),
              ...allConds.map(c=>c.name)
            ].sort().join('|');

            if(!seen.has(key)){
              seen.add(key);
              const totalPieces=
                fillings.reduce((s,f)=>s+(f.selectedPieces??f.pieces??1),0)+allConds.length;
              results.push({fillings,condiments:allConds,powers,numHerba,totalPieces});
            }
          }
        }
      }
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function findSandwiches(targets, rawFillings, rawCondiments, playerCount) {
  const normTargets = targets.map(t=>({...t,power:POWER_TO_MP[t.power]||t.power}));

  const {fills, conds} = buildIndex(rawFillings, rawCondiments);
  const herbaPool  = conds.filter(c=>c.isHerba);
  const nonHerba   = conds.filter(c=>!c.isHerba);

  const hasSparkling = normTargets.some(t=>t.power==='Sparkling');
  const hasTitle     = normTargets.some(t=>t.power==='Title');
  const hasLv3       = normTargets.some(t=>t.level>=3);
  const hasLv2       = normTargets.some(t=>t.level>=2);
  const hasAnyLevel  = normTargets.some(t=>t.level===null);

  const herbaOptions = hasSparkling?[2]:hasLv3?[2,1]:hasTitle?[1]:hasLv2?[0,1]:[0];
  const levelSets    = hasAnyLevel?[1,2,3]:[...new Set(normTargets.map(t=>t.level??1))];

  const seen    = new Set();
  const results = [];
  const MAX_TOTAL = 60;

  for(const level of levelSets) {
    if(results.length>=MAX_TOTAL) break;

    const levelTargets = normTargets.map(t=>({...t,level:t.level??level}));

    // Find the primary (non-herba) target power to drive flavor+type selection
    const primary = levelTargets.find(t=>t.power!=='Sparkling'&&t.power!=='Title')??levelTargets[0];
    const mpName  = primary?.power??null;
    const typeIdx = (primary?.type&&primary.power!=='Egg') ? (TYPE[primary.type]??null) : null;
    const lv      = primary?.level??1;

    const levelGte = LVL_GTE[lv]??0;
    const levelLt  = LVL_LT[lv]??Infinity;

    const flavorProfiles = FLAVOR_PROFILES[mpName]??[[null,null]];

    for(const numHerba of herbaOptions) {
      if(results.length>=MAX_TOTAL) break;

      for(const [f1,f2] of flavorProfiles) {
        if(results.length>=MAX_TOTAL) break;

        runConfig(
          fills, nonHerba, herbaPool,
          {numHerba,f1,f2,targetTypeIdx:typeIdx,levelGte,levelLt},
          levelTargets, playerCount, seen, results, MAX_TOTAL
        );
      }
    }
  }

  results.sort((a,b)=>
    (a.totalPieces-b.totalPieces)||
    ((a.fillings.length+a.condiments.length)-(b.fillings.length+b.condiments.length))
  );

  return results;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

self.onmessage = function(e) {
  const {targets, fillings, condiments, playerCount, cacheKey} = e.data;
  try {
    const results = findSandwiches(targets, fillings, condiments, playerCount);
    self.postMessage({ok:true, results, cacheKey: cacheKey ?? null});
  } catch(err) {
    self.postMessage({ok:false, error:err.message, cacheKey: null});
  }
};
