// Poll an explicitly configured, authorized JSON feed only.
// This module is not a scraper and is not enabled against any third-party site.
export function startAuthorizedFeed({url,validate,onData,onError=()=>{},intervalMs=3600000,fetcher=fetch,now=Date.now}){
 const endpoint=new URL(url,globalThis.location?.href);
 if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password)throw Error('HTTPS feed required');
 if(!Number.isFinite(intervalMs)||intervalMs<900000)throw Error('Minimum refresh interval is 15 minutes');
 let stopped=false,timer=null,controller=null,etag=null,failures=0,lastGood=null;
 async function tick(){
  if(stopped)return;
  controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),15000);
  try{
   const response=await fetcher(endpoint.href,{headers:etag?{'If-None-Match':etag}:{},credentials:'omit',redirect:'error',signal:controller.signal});
   if(stopped)return;
   if(response.status===304&&lastGood!==null){failures=0;return}
   if(!response.ok)throw Error('Feed HTTP '+response.status);
   if(!response.headers.get('content-type')?.includes('application/json'))throw Error('Expected JSON');
   const raw=await response.text();if(raw.length>8*1024*1024)throw Error('Feed too large');
   const payload=validate(JSON.parse(raw));if(payload==null)throw Error('Invalid feed');
   if(stopped)return;
   await onData(payload,{retrievedAt:new Date(now()).toISOString()});
   lastGood=payload;etag=response.headers.get('etag');failures=0;
  }catch(error){if(!stopped){failures++;onError(error,{lastGood,failures})}}
  finally{clearTimeout(timeout);controller=null;if(!stopped)timer=setTimeout(tick,Math.min(intervalMs*2**Math.min(failures,3),86400000))}
 }
 void tick();
 return ()=>{stopped=true;clearTimeout(timer);controller?.abort()};
}
