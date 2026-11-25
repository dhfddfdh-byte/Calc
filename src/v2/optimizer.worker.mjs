import {findBundles} from './market.mjs';
self.onmessage=({data})=>{
 const {id,inventory,target,options}=data;
 try {self.postMessage({id,results:findBundles(inventory,target,options)})}
 catch(error){self.postMessage({id,error:String(error.message)})}
};
