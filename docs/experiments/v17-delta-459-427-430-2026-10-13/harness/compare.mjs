import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { coverage, comparableScore, placements } from '../../board-regeneration-0.6.3-full-history-2026-10-10/harness/compare.mjs';
import { loadPlan, publicEntries, sha } from './common.mjs';
const canonical = value => {
 if(Array.isArray(value))return value.map(canonical);
 if(value && typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
 return value;
};
export const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
export function criterion(c){
 if(!c)return null;
 return {id:c.id,status:c.status,score:c.score,metrics:(c.metrics??[]).map(m=>({name:m.name,value:m.value,max:m.max,weight:m.weight})),findings:['critical','warning','info'].map(severity=>[severity,(c.findings??[]).filter(f=>f.severity===severity).length])};
}
export function summary(report,placement){return {overall:report.overallScore,code:report.codeTrustScore,process:report.processTrustScore,verdict:report.verdict,coverage:coverage(report).text,comparable:comparableScore(report),placement};}
export function comparePair(before,after,beforePlacement,afterPlacement){
 const movedCriteria=[];
 for(const id of new Set([...before.criteria,...after.criteria].map(c=>c.id))){
  const b=criterion(before.criteria.find(c=>c.id===id)),a=criterion(after.criteria.find(c=>c.id===id));
  if(!equal(b,a))movedCriteria.push({id,before:b,after:a});
 }
 const b=summary(before,beforePlacement),a=summary(after,afterPlacement);
 const scoringChanged=movedCriteria.length>0 || !equal({...b,placement:undefined},{...a,placement:undefined});
 const sansFingerprint=r=>{const x=structuredClone(r);delete x.rubricBehaviourFingerprint;return x;};
 return {before:b,after:a,scoringChanged,movedCriteria,placementChanged:beforePlacement!==afterPlacement,fingerprintChanged:before.rubricBehaviourFingerprint!==after.rubricBehaviourFingerprint,reportIdentical:equal(before,after),identicalAfterFingerprintRemoval:equal(sansFingerprint(before),sansFingerprint(after)),changedTopLevelFields:[...new Set([...Object.keys(before),...Object.keys(after)])].filter(k=>!equal(before[k],after[k]))};
}
export function main(planPath,corpusPath,scratch){
 const plan=loadPlan(planPath),entries=publicEntries(readFileSync(corpusPath),plan),arms={};
 for(const arm of Object.keys(plan.arms)){
  const root=join(scratch,'out',arm),manifest=JSON.parse(readFileSync(join(root,'_manifest.json'),'utf8'));
  if(manifest.sourceHead!==plan.arms[arm] || manifest.rows.length!==entries.length || manifest.planSha256!==sha(readFileSync(planPath)))throw Error('arm manifest mismatch');
  if(arms.before459 && manifest.preregCommit!==arms.before459.manifest.preregCommit)throw Error('preregistration binding mismatch');
  const reports=new Map(entries.map(e=>{const m=manifest.rows.find(r=>r.name===e.name);if(!m || m.commit!==e.commit)throw Error('target binding mismatch');return [e.name,m.ok?JSON.parse(readFileSync(join(root,e.name+'.json'),'utf8')):null];}));
  arms[arm]={manifest,reports,placements:placements(reports,new Set(['cejel']))};
 }
 const pairs={};
 for(const [name,left,right,allowed] of [['459','before459','after459',['A3']],['fixes','after459','fixes',['A1','A2']],['release','before459','fixes',['A1','A2','A3']]]){
  const rows=entries.map(e=>{
   const b=arms[left].reports.get(e.name),a=arms[right].reports.get(e.name);
   if(!b || !a)return {name:e.name,error:true};
   return {name:e.name,...comparePair(b,a,arms[left].placements.get(e.name),arms[right].placements.get(e.name))};
  });
  const scored=rows.filter(r=>!r.error);
  const sum={completed:scored.length,errors:rows.length-scored.length,scoringRowsMoved:scored.filter(r=>r.scoringChanged).length,placementsMoved:scored.filter(r=>r.placementChanged).length,fingerprintsChanged:scored.filter(r=>r.fingerprintChanged).length,identicalReports:scored.filter(r=>r.reportIdentical).length,identicalAfterFingerprintRemoval:scored.filter(r=>r.identicalAfterFingerprintRemoval).length,unexpectedCriteria:scored.flatMap(r=>r.movedCriteria.filter(c=>!allowed.includes(c.id)).map(c=>({name:r.name,id:c.id})))};
  pairs[name]={left,right,summary:sum,rows};
 }
 const result={schema:'cejel-public-three-arm-delta-v1',planSha256:sha(readFileSync(planPath)),preregCommit:arms.before459.manifest.preregCommit,arms:Object.fromEntries(Object.entries(arms).map(([k,a])=>[k,{sourceHead:a.manifest.sourceHead,completed:a.manifest.rows.filter(r=>r.ok).length,errors:a.manifest.rows.filter(r=>!r.ok).length}])),expected:plan.expected,pairs};
 writeFileSync(join(scratch,'paired-result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(Object.fromEntries(Object.entries(pairs).map(([k,v])=>[k,v.summary])),null,2));
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url))main(...process.argv.slice(2));
