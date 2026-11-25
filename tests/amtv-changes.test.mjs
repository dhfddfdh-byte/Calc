import test from 'node:test';
import assert from 'node:assert/strict';
import {parseChanges} from '../src/v2/amtv-changes.mjs';
const fixture=[["Item","Old Value","New Value","Change"],["Example A","2 RP","1 RP","50%"],["Example B","1.0 RP","1.2 RP","20%"]];
const options={"growth":"regular","period":"provider-selected timeframe","observedAt":"2026-11-25T00:00:00Z"};
test('uses actual old/new values for direction and does not invent potion variants',()=>{const r=parseChanges(fixture,options);assert.equal(r[0].changePct,-50);assert.ok(r[1].changePct>19.99);assert.equal(r[0].potionState,null)});
test('rejects malformed rows',()=>assert.throws(()=>parseChanges([fixture[0],['Oops','n/a','1 RP','0%']],options)));
test('rejects empty tables',()=>assert.throws(()=>parseChanges([fixture[0]],options)));
