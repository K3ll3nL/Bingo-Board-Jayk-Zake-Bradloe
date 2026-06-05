#!/usr/bin/env node
// Pre-computes all valid single-target sandwich combinations and stores them in
// the Supabase sandwich_cache table.
//
// Usage:
//   node api/scripts/computeSandwiches.js              # compute everything
//   node api/scripts/computeSandwiches.js --dry-run    # print without writing
//   node api/scripts/computeSandwiches.js --target Encounter:Dragon:1
//   node api/scripts/computeSandwiches.js --power Encounter  # all Encounter targets
//   node api/scripts/computeSandwiches.js --missing   # only targets not yet in DB
//
// Each row stores compact sandwich data (names + piece counts only, not full ingredient
// objects) so the storage footprint stays small (~50-200 bytes per sandwich).

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// ─── Parse args ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN       = args.includes('--dry-run');
const MISSING_ONLY  = args.includes('--missing');
const TARGET_FILTER = args.find(a => a.startsWith('--target='))?.replace('--target=','')
  ?? (args.includes('--target') ? args[args.indexOf('--target')+1] : null);
const POWER_FILTER  = args.find(a => a.startsWith('--power='))?.replace('--power=','')
  ?? (args.includes('--power')  ? args[args.indexOf('--power')+1]  : null);
const OUTPUT_FILE   = args.find(a => a.startsWith('--output='))?.replace('--output=','')
  ?? (args.includes('--output') ? args[args.indexOf('--output')+1] : null);

// ─── Ingredient fetching ──────────────────────────────────────────────────────

const GH_API = 'https://api.github.com/repos/cecilbowen/pokemon-sandwich-simulator/contents/src/data';

async function fetchJSON(filename) {
  const res  = await fetch(`${GH_API}/${filename}`);
  const json = await res.json();
  return JSON.parse(Buffer.from(json.content, 'base64').toString('utf-8'));
}

// ─── Search logic (matches sandwichSearch.worker.js) ─────────────────────────

const MP_NAMES  = ["Egg","Catch","Exp","Item","Raid","Sparkling","Title","Humungo","Teensy","Encounter"];
const TYPE_NAMES= ["Normal","Fighting","Flying","Poison","Ground","Rock","Bug","Ghost","Steel",
  "Fire","Water","Grass","Electric","Psychic","Ice","Dragon","Dark","Fairy"];
const FLAVOR    = {Sweet:0,Salty:1,Sour:2,Bitter:3,Hot:4};
const MP        = Object.fromEntries(MP_NAMES.map((n,i)=>[n,i]));
const TYPE      = Object.fromEntries(TYPE_NAMES.map((n,i)=>[n,i]));
const N_FLAVOR=5, N_MP=10, N_TYPE=18;

const POWER_FULL = {
  Egg:"Egg Power",Catch:"Catching Power",Exp:"Exp. Point Power",Item:"Item Drop Power",
  Raid:"Raid Power",Sparkling:"Sparkling Power",Title:"Title Power",
  Humungo:"Humungo Power",Teensy:"Teensy Power",Encounter:"Encounter Power",
};

const TASTE_MAP = [
  [0,0,1,0,4],[9,9,9,2,9],[1,8,8,8,8],[3,2,3,3,3],[4,7,7,7,7],
];

const POWER_TO_MP = {
  Encounter:'Encounter',Egg:'Egg',Raid:'Raid',Catching:'Catch',Catch:'Catch',Exp:'Exp',
  'Item Drop':'Item',Item:'Item',Humungo:'Humungo',Teensy:'Teensy',Title:'Title',Sparkling:'Sparkling',
};

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

const LVL_GTE={1:0,  2:180,3:380};
const LVL_LT ={1:180,2:380,3:Infinity};

function buildIndex(rawFillings, rawCondiments) {
  function vectors(ing, isFilling) {
    const scale=isFilling?(ing.pieces??1):1;
    const fv=Array(N_FLAVOR).fill(0),tv=Array(N_TYPE).fill(0),mv=Array(N_MP).fill(0);
    for(const{flavor,amount}of ing.tastes??[]){const i=FLAVOR[flavor];if(i!=null)fv[i]+=amount*scale;}
    for(const{type,amount}of ing.types??[]){const i=TYPE[type];if(i!=null)tv[i]+=amount*scale;}
    for(const{type:n,amount}of ing.powers??[]){const i=MP[POWER_TO_MP[n]??n];if(i!=null)mv[i]+=amount*scale;}
    const isHerba=!isFilling&&(ing.name?.toLowerCase().includes('herba')??false);
    if(isHerba){mv[MP.Title]+=10000;mv[MP.Sparkling]+=20000;}
    return{fv,tv,mv,isHerba};
  }
  const fills=rawFillings.map((f,i)=>({...f,varIdx:i,isFilling:true,isHerba:false,...vectors(f,true)}));
  const conds=rawCondiments.map((c,i)=>({...c,varIdx:i,isFilling:false,...vectors(c,false)}));
  return{fills,conds};
}

function buildVec(fillings,condiments){
  const fv=Array(N_FLAVOR).fill(0),tv=Array(N_TYPE).fill(0),mv=Array(N_MP).fill(0);
  for(const f of fillings){
    const pcs=f.selectedPieces??((f.pieces??1)*(f._count??1));
    for(const{flavor,amount}of f.tastes??[]){const i=FLAVOR[flavor];if(i!=null)fv[i]+=amount*pcs;}
    for(const{type,amount}of f.types??[]){const i=TYPE[type];if(i!=null)tv[i]+=amount*pcs;}
    for(const{type:n,amount}of f.powers??[]){const i=MP[POWER_TO_MP[n]??n];if(i!=null)mv[i]+=amount*pcs;}
  }
  for(const c of condiments){
    for(const{flavor,amount}of c.tastes??[]){const i=FLAVOR[flavor];if(i!=null)fv[i]+=amount;}
    for(const{type,amount}of c.types??[]){const i=TYPE[type];if(i!=null)tv[i]+=amount;}
    for(const{type:n,amount}of c.powers??[]){const i=MP[POWER_TO_MP[n]??n];if(i!=null)mv[i]+=amount;}
  }
  const herba=condiments.filter(c=>c.isHerba).length;
  if(herba>=1)mv[MP.Title]+=10000;
  if(herba>=2)mv[MP.Sparkling]+=20000;
  for(let i=0;i<N_TYPE;i++)tv[i]+=20;
  return{fv,tv,mv};
}

function evaluate(fv,tv,mv){
  const rf=fv.map((a,i)=>({f:i,a})).sort((a,b)=>b.a-a.a||a.f-b.f);
  let boosted=null;
  if(rf[0]&&rf[0].a>0){const f1=rf[0].f,f2=(rf[1]&&rf[1].a>0)?rf[1].f:f1;boosted=TASTE_MAP[f1][f2];}
  const adjMv=mv.map((v,i)=>i===boosted?v+100:v);
  const rMP=adjMv.map((a,i)=>({mp:i,a})).sort((a,b)=>b.a-a.a||a.mp-b.mp);
  const rT =tv.map((a,i)=>({t:i,a})).sort((a,b)=>b.a-a.a||a.t-b.t);
  function cT(rt){
    const[A={t:0,a:0},,C={t:2,a:0}]=rt;const fa=A.a,sa=(rt[1]??{a:0}).a;
    if(fa>480)return[A,A,A];if(fa>280||(fa>105&&fa-sa>105))return[A,A,C];
    if(fa<=105&&fa-1.5*sa>=70)return[A,C,A];return[A,C,rt[1]??A];
  }
  function cL(rt){
    const fa=(rt[0]??{a:0}).a,ta=(rt[2]??{a:0}).a;
    if(fa>=460)return[3,3,3];if(fa>=380)return ta>=380?[3,3,3]:[3,3,2];
    if(fa>280)return ta>=180?[2,2,2]:[2,2,1];if(fa>=180)return ta>=180?[2,2,1]:[2,1,1];
    return[1,1,1];
  }
  const aT=cT(rT),aL=cL(rT);
  return rMP.filter(mp=>mp.mp!==MP.Sparkling||mp.a>1000).slice(0,3)
    .filter((mp,i)=>mp.a>0&&aT[i])
    .map((mp,i)=>({
      power:MP_NAMES[mp.mp],fullName:POWER_FULL[MP_NAMES[mp.mp]]||MP_NAMES[mp.mp],
      type:mp.mp===MP.Egg?null:TYPE_NAMES[aT[i].t],level:aL[i],score:mp.a,
    }));
}

function powersMatch(powers,targets){
  return targets.every(tgt=>{
    const mp=POWER_TO_MP[tgt.power]||tgt.power;
    return powers.some(r=>r.power===mp&&(mp==='Egg'||!tgt.type||r.type===tgt.type)&&r.level>=(tgt.level||1));
  });
}

function* combinations(arr,k){if(k===0){yield[];return;}for(let i=0;i<=arr.length-k;i++)for(const r of combinations(arr.slice(i+1),k-1))yield[arr[i],...r];}
function* combinationsWithRep(arr,k){const n=arr.length;if(n===0||k===0){if(k===0)yield[];return;}const idx=new Array(k).fill(0);while(true){yield idx.map(i=>arr[i]);let i=k-1;while(i>=0&&idx[i]===n-1)i--;if(i<0)return;const v=idx[i]+1;for(let j=i;j<k;j++)idx[j]=v;}}

function scoreFilling(f,f1,f2,tIdx,needLevel){
  let s=0;
  if(f1!==null){
    s+=(f.fv[f1]??0)*2;if(f2!==null)s+=(f.fv[f2]??0);
    for(let fl=0;fl<N_FLAVOR;fl++){if(fl!==f1&&fl!==f2)s-=(f.fv[fl]??0)*0.5;}
  }
  if(tIdx!==null){s+=(f.tv[tIdx]??0)*3;if(needLevel>1)s+=(f.tv[tIdx]??0)*2;}
  return s;
}

function scoreCond(c,f1,f2,tIdx){
  let s=0;
  if(f1!==null){
    s+=(c.fv[f1]??0)*2;if(f2!==null)s+=(c.fv[f2]??0);
    for(let fl=0;fl<N_FLAVOR;fl++){if(fl!==f1&&fl!==f2)s-=(c.fv[fl]??0)*0.5;}
  }
  if(tIdx!==null)s+=(c.tv[tIdx]??0)*3;
  return s;
}

function runConfig(fills,nonHerbaConds,herbaPool,config,targets,playerCount,seen,results,MAX_TOTAL){
  const{numHerba,f1,f2,targetTypeIdx,levelGte,levelLt}=config;
  const maxFill=playerCount*6,maxCond=playerCount*4;
  const needLevel=levelGte>=380?3:levelGte>=180?2:1;

  const scoredFills=fills.map(f=>({...f,_score:scoreFilling(f,f1,f2,targetTypeIdx,needLevel)}))
    .filter(f=>f._score>0).sort((a,b)=>b._score-a._score).slice(0,15);
  const scoredConds=nonHerbaConds.map(c=>({...c,_score:scoreCond(c,f1,f2,targetTypeIdx)}))
    .filter(c=>c._score>0).sort((a,b)=>b._score-a._score).slice(0,12);

  const herbaCombos=numHerba===0?[[]]:numHerba===1?herbaPool.map(h=>[h]):[...combinations(herbaPool,2)];

  for(const herbaCombo of herbaCombos){
    if(herbaCombo.length<numHerba||results.length>=MAX_TOTAL)continue;
    const usedCondSlots=maxCond-numHerba;
    for(let total=1;total<=maxFill+usedCondSlots&&results.length<MAX_TOTAL;total++){
      for(let nF=Math.min(maxFill,total);nF>=Math.max(1,total-usedCondSlots)&&results.length<MAX_TOTAL;nF--){
        const nC=total-nF;
        if(nC<(numHerba>=1?0:1)||nC>usedCondSlots)continue;
        for(const fillCombo of combinationsWithRep(scoredFills,nF)){
          if(results.length>=MAX_TOTAL)break;
          const fillings=fillCombo.map(f=>({...f,selectedPieces:f.pieces??1,_count:1}));
          const condSets=nC===0?[[]]:[...combinations(scoredConds,nC)];
          for(const condCombo of condSets){
            if(results.length>=MAX_TOTAL)break;
            const allConds=[...herbaCombo,...condCombo];
            const{fv,tv,mv}=buildVec(fillings,allConds);
            if(targetTypeIdx!==null){
              const tv1=tv[targetTypeIdx];
              if(levelGte>0&&tv1<levelGte)continue;
              if(levelLt<Infinity&&tv1>=levelLt)continue;
            }
            const powers=evaluate(fv,tv,mv);
            if(!powersMatch(powers,targets))continue;
            const key=[...fillings.map(f=>`${f.name}×${f.selectedPieces}`),...allConds.map(c=>c.name)].sort().join('|');
            if(!seen.has(key)){
              seen.add(key);
              const totalPieces=fillings.reduce((s,f)=>s+(f.selectedPieces??f.pieces??1),0)+allConds.length;
              // Compact format for storage: only name + piece count
              results.push({
                fillings:fillings.map(f=>({name:f.name,pieces:f.selectedPieces??f.pieces??1})),
                condiments:allConds.map(c=>c.name),
                powers,numHerba,totalPieces,
              });
            }
          }
        }
      }
    }
  }
}

function findSandwiches(targets,rawFillings,rawCondiments,playerCount=1){
  const normTargets=targets.map(t=>({...t,power:POWER_TO_MP[t.power]||t.power}));
  const{fills,conds}=buildIndex(rawFillings,rawCondiments);
  const herbaPool=conds.filter(c=>c.isHerba),nonHerba=conds.filter(c=>!c.isHerba);

  const hasSparkling=normTargets.some(t=>t.power==='Sparkling');
  const hasTitle=normTargets.some(t=>t.power==='Title');
  const hasLv3=normTargets.some(t=>t.level>=3);
  const hasLv2=normTargets.some(t=>t.level>=2);
  const herbaOptions=hasSparkling?[2]:hasLv3?[2,1]:hasTitle?[1]:hasLv2?[0,1]:[0];

  const primary=normTargets.find(t=>t.power!=='Sparkling'&&t.power!=='Title')??normTargets[0];
  const mpName=primary?.power??null;
  const typeIdx=(primary?.type&&primary.power!=='Egg')?(TYPE[primary.type]??null):null;
  const lv=primary?.level??1;

  // Cap per target — combinationsWithRep generates far more candidates than before.
  // 200 is enough for the UI and keeps memory/storage sane.
  const MAX_TOTAL = 200;
  const seen=new Set(),results=[];

  for(const numHerba of herbaOptions){
    for(const[f1,f2]of(FLAVOR_PROFILES[mpName]??[[null,null]])){
      runConfig(fills,nonHerba,herbaPool,
        {numHerba,f1,f2,targetTypeIdx:typeIdx,levelGte:LVL_GTE[lv]??0,levelLt:LVL_LT[lv]??Infinity},
        normTargets,playerCount,seen,results,MAX_TOTAL);
    }
  }

  results.sort((a,b)=>(a.totalPieces-b.totalPieces)||((a.fillings.length+a.condiments.length)-(b.fillings.length+b.condiments.length)));
  return results;
}

// ─── Co-occurrence extraction ─────────────────────────────────────────────────
// For each sandwich result, record which OTHER power/type/level combos appear
// alongside the primary target in the remaining 2 power slots.
// Stored as { "Exp:Bitter:1": count, "Egg:none:1": count, ... }

function extractCooccurrences(results, primaryKey) {
  const cooc = {};
  for (const r of results) {
    for (const p of r.powers) {
      const key = `${p.power}:${p.type ?? 'none'}:${p.level}`;
      if (key === primaryKey) continue;
      cooc[key] = (cooc[key] ?? 0) + 1;
    }
  }
  return cooc;
}

// ─── Target enumeration ───────────────────────────────────────────────────────

function allTargets() {
  const targets = [];
  const NO_TYPE = new Set(['Egg']);
  const HERBA_ONLY = new Set(['Sparkling', 'Title']);

  for (const power of MP_NAMES) {
    const types = NO_TYPE.has(power) ? [null] : TYPE_NAMES;
    const levels = HERBA_ONLY.has(power) ? [1,2,3] : [1,2,3];
    for (const type of types) {
      for (const level of levels) {
        targets.push({ power, type, level, key: `${power}:${type??'none'}:${level}` });
      }
    }
  }
  return targets;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Fetching ingredient data from cecilbowen/pokemon-sandwich-simulator…');
  const [fillings, condiments] = await Promise.all([
    fetchJSON('fillings.json'),
    fetchJSON('condiments.json'),
  ]);
  console.log(`Loaded ${fillings.length} fillings, ${condiments.length} condiments.`);

  let targets = allTargets();
  console.log(`Total single-target combinations: ${targets.length}`);

  // Filter by --target or --power flags
  if (TARGET_FILTER) {
    targets = targets.filter(t => t.key === TARGET_FILTER);
    console.log(`Filtered to 1 target: ${TARGET_FILTER}`);
  } else if (POWER_FILTER) {
    targets = targets.filter(t => t.power === POWER_FILTER);
    console.log(`Filtered to ${targets.length} targets for power: ${POWER_FILTER}`);
  }

  // If --missing, fetch already-computed keys and skip them
  if (MISSING_ONLY && !DRY_RUN) {
    const { data: existing } = await supabase
      .from('sandwich_cache')
      .select('target')
      .in('target', targets.map(t => t.key));
    const existingKeys = new Set((existing||[]).map(r => r.target));
    const before = targets.length;
    targets = targets.filter(t => !existingKeys.has(t.key));
    console.log(`Skipping ${before - targets.length} already-computed targets.`);
  }

  const mode = OUTPUT_FILE ? `→ ${OUTPUT_FILE}` : DRY_RUN ? '[DRY RUN]' : '→ Supabase';
  console.log(`\nComputing ${targets.length} target(s)… ${mode}\n`);

  let done = 0, hits = 0;
  const BATCH_SIZE = 20;
  const allRows = [];  // accumulated for --output

  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE);
    const rows = [];

    for (const t of batch) {
      const tgt = [{ power: t.power, type: t.type, level: t.level }];
      const results = findSandwiches(tgt, fillings, condiments, 1);
      hits += results.length;

      rows.push({
        target:        t.key,
        results:       results,
        cooccurrences: extractCooccurrences(results, t.key),
        result_count:  results.length,
        computed_at:   new Date().toISOString(),
      });

      done++;
      if (done % 10 === 0 || done === targets.length) {
        const pct = ((done / targets.length) * 100).toFixed(1);
        process.stdout.write(`\r[${pct.padStart(5)}%] ${done}/${targets.length} targets — ${hits} total sandwiches found`);
      }
    }

    if (OUTPUT_FILE) {
      allRows.push(...rows);
    } else if (!DRY_RUN) {
      const { error } = await supabase
        .from('sandwich_cache')
        .upsert(rows, { onConflict: 'target' });
      if (error) console.error('\nSupabase error:', error.message);
    } else {
      for (const r of rows) {
        const coocCount = Object.keys(r.cooccurrences).length;
        console.log(`  ${r.target}: ${r.result_count} sandwiches, ${coocCount} co-occurring powers`);
        if (coocCount > 0) {
          const sorted = Object.entries(r.cooccurrences).sort((a,b) => b[1]-a[1]).slice(0,5);
          for (const [k, n] of sorted) console.log(`    ${k}: ${n} sandwiches`);
        }
      }
    }
  }

  if (OUTPUT_FILE) {
    // Build compact { "Power:Type:Level": { results, cooccurrences } } object
    const combined = {};
    for (const r of allRows) combined[r.target] = { results: r.results, cooccurrences: r.cooccurrences };
    const outPath = path.resolve(OUTPUT_FILE);
    fs.writeFileSync(outPath, JSON.stringify(combined));
    console.log(`\n\nWrote ${outPath} (${(fs.statSync(outPath).size / 1024 / 1024).toFixed(1)} MB)`);
  }

  console.log(`\nDone. ${hits} sandwiches across ${done} targets.`);
}

main().catch(err => { console.error(err); process.exit(1); });
