import {trackerSettings} from './tracker.mjs';
const $=id=>document.getElementById(id);
const setup=$('companionSetup');
function readPrefs(){try{return trackerSettings(JSON.parse(localStorage.getItem('calc_tracker_settings')||'{}'))}catch{return trackerSettings()}}
function openSetup(){const p=readPrefs();$('companionProfit').value=p.minProfit;$('companionLoss').value=p.maxDemandLoss;setup.showModal()}
window.openCompanionSetup=openSetup;
function exportInventory(){
 const trade=JSON.parse(localStorage.getItem('tradeData')||'{}');
 const lockedPets=JSON.parse(localStorage.getItem('lockedPets')||'[]');
 const blob=new Blob([JSON.stringify({inventory:trade.inv||[],lockedPets,settings:readPrefs()},null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='Calc-inventory.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('companionDownload').onclick=()=>{try{const p=trackerSettings({minProfit:Number($('companionProfit').value),maxDemandLoss:Number($('companionLoss').value)});localStorage.setItem('calc_tracker_settings',JSON.stringify(p));$('companionNote').textContent='Download the Python application, export inventory, and run the application. Live feed is not configured.'}catch(e){$('companionNote').textContent=e.message;return false}};
$('companionInventory').onclick=()=>{try{exportInventory()}catch(e){$('companionNote').textContent=e.message}};
$('companionInstalled').onclick=()=>{try{const p=trackerSettings({minProfit:Number($('companionProfit').value),maxDemandLoss:Number($('companionLoss').value)});localStorage.setItem('calc_tracker_settings',JSON.stringify(p));setup.close();window.switchTab('scout')}catch(e){$('companionNote').textContent=e.message}};
$('companionClose').onclick=()=>setup.close();
