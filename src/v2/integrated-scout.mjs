import {parseListings,matchInventory,normalizePetName,petKey} from './scout.mjs';
import {evaluateTrade,variantKey,makeMarket,resolveMetric} from './market.mjs';
import {trackerSettings,activeListings} from './tracker.mjs';
import {CONFIG} from './config.mjs';
const sites={elve:'https://elvebredd.com/trade-center',amvgg:'https://amvgg.com/trades'};
const labels={R0:'Regular',RF:'F',RR:'R',RFR:'FR',N0:'Neon',NF:'NF',NR:'NR',NFR:'NFR',M0:'Mega',MF:'MF',MR:'MR',MFR:'MFR'};
export function decodeVariant(name,variant='Reg'){
 const v=String(variant).toUpperCase().trim(),code=({REG:'R0',NORMAL:'R0',F:'RF',R:'RR',FR:'RFR',N:'N0',NEON:'N0',M:'M0',MEGA:'M0'})[v]||v;
 if(!Object.hasOwn(labels,code)||typeof name!=='string')throw Error('Invalid pet or variant');
 const p={name:name.trim(),type:code[0]==='N'?'neon':code[0]==='M'?'mega':'reg',fly:code.slice(1).includes('F'),ride:code.slice(1).includes('R')};petKey(p);return p;
}
export function importScout(raw,source,now=Date.now()){
 const payload=typeof raw==='string'?JSON.parse(raw):raw,rows=Array.isArray(payload)?payload:payload?.listings;
 if(!Array.isArray(rows)||rows.length>5000)throw Error('Expected an array of up to 5,000 listings');
 const unique=new Map();
 for(const [i,t] of rows.entries()){
  if(!t||typeof t!=='object')throw Error('Invalid listing');
  const s=t.source||source;if(!Object.hasOwn(sites,s))throw Error('Unsupported provider');
  const items=a=>{if(!Array.isArray(a))throw Error('Invalid trade side');return a.map(p=>p.type!==undefined?p:decodeVariant(p.name,p.variant))};
  const record={source:s,id:String(t.id||t.listingId||'import-'+now+'-'+i),observedAt:t.observedAt||new Date(now).toISOString(),expiresAt:t.expiresAt??null,requesting:items(t.requesting||t.lf),offering:items(t.offering)};
  const key=JSON.stringify([s,record.id]);if(!unique.has(key))unique.set(key,{record,username:typeof t.username==='string'?t.username.slice(0,100):''});
 }
 return parseListings([...unique.values()].map(x=>x.record)).map(t=>({...t,username:unique.get(JSON.stringify([t.source,t.id])).username,verified:false}));
}
export function reserveInventory(inventory,pending){
 const counts=new Map();
 for(const p of pending){const k=petKey(p);counts.set(k,(counts.get(k)||0)+1)}
 return inventory.map(p=>{const k=petKey(p),n=counts.get(k)||0;if(p.locked||p.reserved)return p;if(n){counts.set(k,n-1);return {...p,reserved:true}}return p});
}
export function scoreScout(t,inventory,lookup,settings){
 const match=matchInventory(inventory,t.requesting);
 const metrics=a=>a.map(p=>lookup(p,t.source)||{value:null,unit:null,demand:null,stale:true});
 const give=metrics(t.requesting),receive=metrics(t.offering),v=evaluateTrade(give,receive);
 const gain=v.verdict==='unknown'?null:v.ratio*100,loss=v.giveDemand==null||v.receiveDemand==null?null:v.giveDemand-v.receiveDemand;
 const meets=match.affordable&&gain!==null&&gain+1e-9>=settings.minProfit&&loss!==null&&loss<=settings.maxDemandLoss+1e-9&&receive.every(p=>Number.isFinite(p.demand)&&p.demand>=settings.minReceiveDemand);
 return {t,match,v,gain,loss,meets,verifiedWin:meets&&t.verified===true&&[...give,...receive].every(p=>p.stale===false)};
}
const mounted=new WeakMap();
export function mountScout(root,bridge){
 if(mounted.has(root)){mounted.get(root)();return}
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n};
 const button=(text,fn)=>{const n=el('button',text,'nav-btn');n.type='button';n.onclick=fn;return n};
 const panel=()=>el('section',undefined,'scout-v2-panel');
 const row=()=>el('div',undefined,'scout-v2-controls');
 const input=(type,value)=>{const n=el('input');n.type=type;if(value!==undefined)n.value=value;return n};
 const select=opts=>{const n=el('select');for(const [v,l] of opts){const o=el('option',l);o.value=v;n.append(o)}return n};
 const label=(text,n)=>{const l=el('label');l.append(el('span',text),n);return l};
 let prefs;try{prefs=trackerSettings(JSON.parse(localStorage.getItem('calc_tracker_settings')||'{}'))}catch{prefs=trackerSettings()}
 let imports=[],live=[],market=null,timer=null,busy=false,limit=40;
 const configured=!!CONFIG.listingsUrl&&!!CONFIG.marketUrl;
 const head=panel(),status=el('p','','scout-v2-muted');status.setAttribute('role','status');
 head.append(el('h2','Trade Scout'),el('p','Find offers using your existing inventory and demand settings.'),status);
 const links=row();for(const [s,l] of [['amvgg','AMVGG'],['elve','Elvebredd']]){const a=el('a','Open '+l,'nav-btn');a.href=sites[s];a.target='_blank';a.rel='noopener noreferrer';links.append(a)}
 const start=button('Enable tracker',()=>{if(!configured){window.openCompanionSetup();return}if(timer!==null){clearInterval(timer);timer=null;start.textContent='Enable tracker';return}start.textContent='Disable tracker';void refresh();timer=setInterval(refresh,300000)});
 links.append(start,button('Refresh offers',()=>void refresh()));head.append(links);
 const filter=panel(),controls=row();filter.append(el('h3','Filters'),controls);
 const source=select([['all','Both sites'],['amvgg','AMVGG'],['elve','Elvebredd']]),query=input('search');query.placeholder='Pet or trader';
 const owned=input('checkbox');owned.checked=prefs.inventoryOnly;
 const wins=input('checkbox'),active=input('checkbox');
 const profit=input('number',prefs.minProfit),loss=input('number',prefs.maxDemandLoss),demand=input('number',prefs.minReceiveDemand);
 profit.min=5;profit.max=10000;loss.min=0;loss.max=1;loss.step=.1;demand.min=0;demand.max=10;demand.step=.5;
 controls.append(label('Site',source),label('Search',query),label('Minimum profit %',profit),label('Maximum demand loss',loss),label('Minimum received demand',demand),label('My inventory only',owned),label('Matches thresholds only',wins),label('Verified active only',active));
 const intake=panel(),details=el('details');details.append(el('summary','Add or import an offer'));
 const site=select([['amvgg','AMVGG'],['elve','Elvebredd']]),give=el('textarea'),receive=el('textarea');give.rows=3;receive.rows=3;give.placeholder='Kangaroo | FR';receive.placeholder='Turtle | FR';
 const file=input('file');file.accept='.json,application/json';const paste=el('textarea');paste.rows=3;paste.placeholder='Paste listing JSON';
 const msg=el('p','','scout-v2-muted');msg.setAttribute('role','status');
 const lines=s=>s.split(/\n/).map(x=>x.trim()).filter(Boolean).map(x=>{const [name,variant='Reg']=x.split('|').map(v=>v.trim());return decodeVariant(name,variant)});
 function add(rows){const by=new Map(imports.map(t=>[JSON.stringify([t.source,t.id]),t]));for(const t of rows)by.set(JSON.stringify([t.source,t.id]),t);imports=[...by.values()].slice(-5000);limit=40;render()}
 function importText(text){try{add(importScout(text,site.value));msg.textContent='Offers added. Availability is not verified.'}catch(e){msg.textContent=e.message}}
 details.append(el('p','Enter one pet per line: name | variant (Reg, F, R, FR, NFR, MFR, etc.). Repeat lines for quantity.'),label('Provider',site),label('You give',give),label('You receive',receive),button('Add offer',()=>{try{const t={source:site.value,id:'manual-'+crypto.randomUUID(),observedAt:new Date().toISOString(),requesting:lines(give.value),offering:lines(receive.value)};add(importScout([t],site.value));give.value=receive.value='';msg.textContent='Offer added'}catch(e){msg.textContent=e.message}}),el('p','Or import a listing export (JSON).'),file,paste,button('Import JSON',()=>importText(paste.value)),button('Clear imported offers',()=>{imports=[];render()}),msg);
 file.onchange=async()=>{const f=file.files[0];if(f){if(f.size>5*1024*1024){msg.textContent='File too large';return}try{importText(await f.text())}catch(e){msg.textContent=e.message}}};
 intake.append(details);
 const results=panel(),count=el('h3','Offers'),cards=el('div');results.append(count,cards);
 const more=button('Show more',()=>{limit+=40;render()});results.append(more);
 root.replaceChildren(head,filter,intake,results);
 const name=p=>p.name+' · '+labels[variantKey(p.type,p.fly,p.ride)];
 function settings(){return trackerSettings({minProfit:Number(profit.value),maxDemandLoss:Number(loss.value),minReceiveDemand:Number(demand.value),inventoryOnly:owned.checked})}
 function lookup(p,s,verified){if(verified&&market){const id=normalizePetName(p.name),v=variantKey(p.type,p.fly,p.ride),value=resolveMetric(market,id,v,s,'value'),d=resolveMetric(market,id,v,'amtv','demand');return {value:value.value,unit:value.unit,demand:d.value,stale:value.stale||d.stale||value.value===null||d.value===null}}return bridge.lookup(p,s)}
 function render(){
  try{prefs=settings();try{localStorage.setItem('calc_tracker_settings',JSON.stringify(prefs))}catch{}
   const inv=reserveInventory(bridge.inventory(),bridge.pending()),now=Date.now(),q=query.value.trim().toLowerCase();
   const blocked=bridge.blocked();
   const current=activeListings(live,now).map(t=>({...t,verified:true}));
   const all=[...current,...imports.filter(t=>!t.expiresAt||Date.parse(t.expiresAt)>now)];
   const seen=new Set(),ranked=[];
   for(const t of all){const k=JSON.stringify([t.source,t.id]);if(seen.has(k))continue;seen.add(k);
    if(source.value!=='all'&&source.value!==t.source||active.checked&&!t.verified||blocked.has((t.username||'').toLowerCase())||q&&![t.username,...t.requesting.map(p=>p.name),...t.offering.map(p=>p.name)].join(' ').toLowerCase().includes(q))continue;
    const s=scoreScout(t,inv,(p,provider)=>lookup(p,provider,t.verified),prefs);
    if(owned.checked&&!s.match.affordable||wins.checked&&!s.meets)continue;ranked.push(s)
   }
   ranked.sort((a,b)=>Number(b.verifiedWin)-Number(a.verifiedWin)||Number(b.meets)-Number(a.meets)||(b.gain??-Infinity)-(a.gain??-Infinity));
   count.textContent=ranked.length+' matching offers';cards.replaceChildren();more.hidden=ranked.length<=limit;
   for(const r of ranked.slice(0,limit)){
    const card=el('article',undefined,'scout-v2-offer'),heading=row();heading.append(el('strong',r.t.source==='elve'?'Elvebredd':'AMVGG'),el('span',r.t.verified?'Verified active':'Unverified import','scout-v2-muted'));card.append(heading);
    if(r.t.username)card.append(el('p',r.t.username));
    card.append(el('p','You give: '+r.t.requesting.map(name).join(' + ')),el('p','You receive: '+r.t.offering.map(name).join(' + ')),el('strong',r.gain===null?'Value unavailable':(r.gain>=0?'+':'')+r.gain.toFixed(1)+'% estimated profit'),el('p',r.loss===null?'Demand unavailable':'Demand change: '+(-r.loss).toFixed(2)),el('p',r.match.affordable?'Inventory match':r.match.missing.length+' missing or unavailable pet(s)'),el('p',r.verifiedWin?'Verified match':r.meets?'Meets thresholds · verify current offer':'Does not meet all thresholds','scout-v2-muted'));
    const buttons=row(),a=el('a','Review on website','nav-btn');a.href=sites[r.t.source];a.target='_blank';a.rel='noopener noreferrer';buttons.append(a,button('Open in calculator',()=>bridge.open(r.t)));card.append(buttons);cards.append(card);
   }
   if(!ranked.length)cards.append(el('p','No matching offers. Add an offer or adjust your filters.','scout-v2-muted'));
   if(!configured)status.textContent='Live feeds not connected · '+inv.filter(p=>!p.locked&&!p.reserved).length+' eligible inventory pets. Manual comparison available.';
  }catch(e){status.textContent=e.message;cards.replaceChildren();more.hidden=true}
 }
 async function json(url){const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password)throw Error('HTTPS feed required');const r=await fetch(u,{credentials:'omit',redirect:'error',cache:'no-cache',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Feed HTTP '+r.status);return r.json()}
 async function refresh(){
  if(!configured){render();return}if(busy)return;busy=true;status.textContent='Checking verified offers…';
  try{const [feed,values]=await Promise.all([json(CONFIG.listingsUrl),json(CONFIG.marketUrl)]);const raw=feed.listings;if(!Array.isArray(raw))throw Error('Invalid feed');
   const parsed=parseListings(raw),by=new Map(raw.map(t=>[JSON.stringify([t.source,t.id]),t]));
   live=parsed.map(t=>{const src=by.get(JSON.stringify([t.source,t.id]));return {...t,status:src.status,verifiedAt:src.verifiedAt,username:typeof src.username==='string'?src.username:''}});
   market=makeMarket(values.records);render();status.textContent='Verified feed checked '+new Date().toLocaleTimeString();
  }catch(e){live=[];market=null;render();status.textContent='Live feed unavailable: '+e.message;if(timer!==null){clearInterval(timer);timer=null;start.textContent='Enable tracker'}}
  finally{busy=false}
 }
 for(const n of [source,query,owned,wins,active,profit,loss,demand])n.addEventListener(n===query?'input':'change',()=>{limit=40;render()});
 setInterval(()=>{if(root.closest('.tab-content')?.classList.contains('active'))render()},30000);
 mounted.set(root,render);render();if(configured)void refresh();
}
