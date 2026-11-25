import test from 'node:test';import assert from 'node:assert/strict';import {decodeMaster,validateReplacement} from '../src/v2/master-feed.mjs';
const headers=["n","d","nd","md","v","f_v","r_v","fr_v","n_v","n_f_v","n_r_v","nfr_v","m_v","m_f_v","m_r_v","mfr_v","categories","value trend","demand trend","av","af_v","ar_v","afrl_v","an_v","an_f_v","an_r_v","anfr_v","am_v","am_f_v","am_r_v","amfr_v","a_demand_n","a_demand_nea_demand_m",""];
const row=["Example","9","5","3","1","2","3","4","5","6","7","8","9","10","11","12","Legendary","","","2","3","4","5","6","7","8","9","10","11","12","13","3/3","2/3","1/3"];
test('all variant fields and malformed demand header',()=>{const p=decodeMaster([headers,row])[0];assert.equal(p.elve.NFR,8);assert.equal(p.amvgg.MFR,13);assert.equal(p.amvggStars.neon,2);assert.equal(p.amvggStars.mega,1)});
test('zero is missing',()=>assert.equal(decodeMaster([headers,row.map((x,i)=>i===4?'0':x)])[0].elve.R0,null));
test('coverage guard',()=>assert.throws(()=>validateReplacement(decodeMaster([headers,row]),[])));
