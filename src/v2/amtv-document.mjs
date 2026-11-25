import {parseChanges} from './amtv-changes.mjs';
// Input is the document of a permitted public page or an owner-supplied export.
// No script injection, authentication bypass, or stealth.
export function parseAMTVDocument(doc,options){
 const tables=[...doc.querySelectorAll('table')];
 for(const table of tables){
  const rows=[...table.rows].map(row=>[...row.cells].map(cell=>cell.textContent.trim()));
  if(!rows.some(row=>row.map(s=>s.replace(/\s+/g,' ').trim().toLowerCase()).join('|')==='item|old value|new value|change'))continue;
  return parseChanges(rows,options);
 }
 throw Error('AMTV change table not found; preserve previous data');
}
