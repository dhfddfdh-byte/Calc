// Source-specific history: legacy Elve snapshots and actual observations of the owner's published catalog.
// Retrieval times are not provider publication times.
const keys={elve:{reg:['v','f_v','r_v','fr_v'],neon:['n_v','n_f_v','n_r_v','nfr_v'],mega:['m_v','m_f_v','m_r_v','mfr_v']},amvgg:{reg:['av','af_v','ar_v','afrl_v'],neon:['an_v','an_f_v','an_r_v','anfr_v'],mega:['am_v','am_f_v','am_r_v','amfr_v']}};
const stages=['reg','neon','mega'];
const fields=Object.values(keys).flatMap(x=>stages.flatMap(t=>x[t]));
const number=v=>{if(v===null||v===undefined||String(v).trim()==='')return null;const n=Number(String(v).replace(/,/g,''));return Number.isFinite(n)&&n>0?n:null};
const demand=v=>{const n=number(v);return n!==null&&n<=10?n:null};
const stars=v=>{const n=number(v);return Number.isInteger(n)&&n<=3?n:null};
const norm=n=>String(n??'').normalize('NFKC').trim().toLowerCase();
export function historyTime(v){
 if(typeof v==='number'&&v>=30000&&v<=80000)return Math.round((v-25569)*86400000);
 const ms=Date.parse(String(v??'').trim());return Number.isFinite(ms)?ms:null;
}
export function makeObservation(pets,checkedAt,factor){
 if(!Number.isFinite(checkedAt)||checkedAt<=0||!Array.isArray(pets)||!pets.length)throw Error('Invalid catalog observation');
 const items=Object.create(null);
 for(const p of pets){const k=norm(p.n);if(!k||Object.hasOwn(items,k))continue;items[k]=[...fields.map(f=>number(p[f])),...['d','nd','md'].map(f=>demand(p['_sheet_'+f]??p[f])),...['aDemandN','aDemandNe','aDemandM'].map(f=>stars(p[f])),...['elve_d','elve_nd','elve_md'].map(f=>demand(p[f]))]}
 return {checkedAt,factor:number(factor),items};
}
export function appendObservation(previous,next,limit=12){
 const valid=Array.isArray(previous)?previous.filter(p=>p&&Number.isFinite(p.checkedAt)&&p.items&&typeof p.items==='object'):[];
 const last=valid.at(-1);
 if(last&&next.checkedAt<=last.checkedAt)return valid;
 if(last&&JSON.stringify(last.items)===JSON.stringify(next.items)&&last.factor===next.factor)return valid;
 return [...valid,next].slice(-limit);
}
export function buildSeries(pet,mode,legacy=[],observations=[],providerRows=[],demandSource=mode==='baseless'?'amvgg':'amtv'){
 const stage=stages.includes(pet.type)?pet.type:'reg',i=(pet.f_st?1:0)+(pet.r_st?2:0),stageIndex=stages.indexOf(stage);
 const source=mode==='baseless'?'amvgg':mode==='combined'?'combined':'elve';
 const eKey=keys.elve[stage][i],aKey=keys.amvgg[stage][i],eIndex=fields.indexOf(eKey),aIndex=fields.indexOf(aKey);
 const dKey=['d','nd','md'][stageIndex],name=norm(pet.n),points=new Map();
 if(source==='elve'||demandSource==='amtv')for(const r of legacy){
  if(norm(r.name||r['pet name'])!==name)continue;
  const t=historyTime(r.timestamp||r.date||r.time),v=source==='elve'?number(r[eKey]):null,d=demandSource==='amtv'?demand(r[dKey]):null;
  if(t!==null&&(v!==null||d!==null))points.set(t,{t,value:v,demand:d,origin:'Historical sheet'});
 }
 for(const snap of observations){
  const row=snap.items&&Object.hasOwn(snap.items,name)?snap.items[name]:null,t=snap.checkedAt;
  if(!Array.isArray(row)||!Number.isFinite(t))continue;
  const e=number(row[eIndex]),a=number(row[aIndex]),f=number(snap.factor);
  const v=source==='elve'?e:source==='amvgg'?a:e!==null&&a!==null&&f!==null?(e+a*f)/2:null;
  const d=demandSource==='amvgg'?stars(row[27+stageIndex]):demandSource==='elve'?demand(row[30+stageIndex]):demand(row[24+stageIndex]);
  if(v!==null||d!==null)points.set(t,{t,value:v,demand:d,origin:'Sheet observation'});
 }
 const variantCode=['R0','RF','RR','RFR','N0','NF','NR','NFR','M0','MF','MR','MFR'][stageIndex*4+i];
 const demandCode=demandSource==='amvgg'?['RFR','NFR','MFR'][stageIndex]:['R0','N0','M0'][stageIndex];
 for(const r of providerRows){
  if(norm(r.name||r['pet name'])!==name)continue;
  const t=historyTime(r.timestamp||r.date||r.time);
  if(t===null)continue;
  const provider=r.provider_source;
  const v=provider===source&&r.provider_variant===variantCode&&r.provider_unit===provider+'-sheet'?number(r.provider_value):null;
  const d=provider===demandSource&&r.provider_variant===demandCode?(demandSource==='amvgg'?stars(r.provider_demand):demand(r.provider_demand)):null;
  if(v===null&&d===null)continue;
  const old=points.get(t);
  points.set(t,{t,value:v??old?.value??null,demand:d??old?.demand??null,origin:String(r.provider_origin||'Provider observation')});
 }
 return {source,variant:(stage==='neon'?'N':stage==='mega'?'M':'')+(pet.f_st?'F':'')+(pet.r_st?'R':'')||'Regular',points:[...points.values()].sort((a,b)=>a.t-b.t),demandMax:demandSource==='amvgg'?3:10};
}
export const STORAGE='calc_source_observations_v1';
export function readObservations(storage=localStorage){try{const x=JSON.parse(storage.getItem(STORAGE)||'[]');return Array.isArray(x)?x:[]}catch{return []}}
export function recordObservation(pets,checkedAt,factor,storage=localStorage){
 const next=makeObservation(pets,checkedAt,factor),previous=readObservations(storage),updated=appendObservation(previous,next);
 for(let count=updated.length;count>=1;count--){try{storage.setItem(STORAGE,JSON.stringify(updated.slice(-count)));return true}catch{}}
 return false;
}
