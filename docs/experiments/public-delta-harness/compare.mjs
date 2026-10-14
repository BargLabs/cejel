import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { coverage, comparableScore, placements } from '../board-regeneration-0.6.3-full-history-2026-10-10/harness/compare.mjs';
import { SCORING_FIELDS, loadPlan, publicEntries, sha } from './common.mjs';
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
// presentationOnly: the pair's declared top-level fields whose change is allowed. They never enter
// scoringChanged (no scoring field can be declared). Any other changed non-scoring field is listed.
export function comparePair(before,after,beforePlacement,afterPlacement,presentationOnly=[]){
 const movedCriteria=[];
 for(const id of new Set([...before.criteria,...after.criteria].map(c=>c.id))){
  const b=criterion(before.criteria.find(c=>c.id===id)),a=criterion(after.criteria.find(c=>c.id===id));
  if(!equal(b,a))movedCriteria.push({id,before:b,after:a});
 }
 const b=summary(before,beforePlacement),a=summary(after,afterPlacement);
 const scoringChanged=movedCriteria.length>0 || !equal({...b,placement:undefined},{...a,placement:undefined});
 const sans=fields=>r=>{const x=structuredClone(r);for(const f of fields)delete x[f];return x;};
 const sansFingerprint=sans(['rubricBehaviourFingerprint']),sansPresentation=sans(presentationOnly);
 const changedTopLevelFields=[...new Set([...Object.keys(before),...Object.keys(after)])].filter(k=>!equal(before[k],after[k]));
 return {before:b,after:a,scoringChanged,movedCriteria,placementChanged:beforePlacement!==afterPlacement,fingerprintChanged:before.rubricBehaviourFingerprint!==after.rubricBehaviourFingerprint,reportIdentical:equal(before,after),identicalAfterFingerprintRemoval:equal(sansFingerprint(before),sansFingerprint(after)),changedTopLevelFields,
  presentationFieldsChanged:changedTopLevelFields.filter(k=>presentationOnly.includes(k)),identicalAfterPresentationRemoval:equal(sansPresentation(before),sansPresentation(after)),undeclaredFieldChanges:changedTopLevelFields.filter(k=>!presentationOnly.includes(k) && !SCORING_FIELDS.includes(k))};
}
export function main(planPath,corpusPath,scratch){
 const plan=loadPlan(planPath),entries=publicEntries(readFileSync(corpusPath),plan),runs={},planSha256=sha(readFileSync(planPath));
 for(const run of plan.runs){
  const root=join(scratch,'out',run.name),manifest=JSON.parse(readFileSync(join(root,'_manifest.json'),'utf8'));
  if(manifest.run!==run.name || manifest.sourceHead!==run.commit || manifest.rubricVersion!==run.rubric || manifest.generatedAt!==plan.generatedAt || manifest.rows.length!==entries.length || manifest.planSha256!==planSha256)throw Error(`run manifest mismatch: ${run.name}`);
  const first=runs[plan.runs[0].name];
  if(first && manifest.preregCommit!==first.manifest.preregCommit)throw Error(`preregistration binding mismatch: ${run.name}`);
  const reports=new Map(entries.map(e=>{
   const m=manifest.rows.find(r=>r.name===e.name);if(!m || m.commit!==e.commit)throw Error('target binding mismatch');
   if(!m.ok)return [e.name,null];
   const report=JSON.parse(readFileSync(join(root,e.name+'.json'),'utf8'));
   if(report.rubricVersion!==run.rubric)throw Error(`report rubric mismatch: ${run.name} ${e.name}`);
   return [e.name,report];
  }));
  runs[run.name]={run,manifest,reports,placements:placements(reports,new Set(['cejel']))};
 }
 const pairs={};
 for(const pair of plan.pairs){
  const left=runs[pair.before],right=runs[pair.after];
  const rows=entries.map(e=>{
   const b=left.reports.get(e.name),a=right.reports.get(e.name);
   if(!b || !a)return {name:e.name,error:true};
   return {name:e.name,...comparePair(b,a,left.placements.get(e.name),right.placements.get(e.name),pair.presentationOnly)};
  });
  const scored=rows.filter(r=>!r.error);
  const sum={completed:scored.length,errors:rows.length-scored.length,scoringRowsMoved:scored.filter(r=>r.scoringChanged).length,placementsMoved:scored.filter(r=>r.placementChanged).length,fingerprintsChanged:scored.filter(r=>r.fingerprintChanged).length,identicalReports:scored.filter(r=>r.reportIdentical).length,identicalAfterFingerprintRemoval:scored.filter(r=>r.identicalAfterFingerprintRemoval).length,unexpectedCriteria:scored.flatMap(r=>r.movedCriteria.filter(c=>!pair.allowedCriteria.includes(c.id)).map(c=>({name:r.name,id:c.id}))),
   identicalAfterPresentationRemoval:scored.filter(r=>r.identicalAfterPresentationRemoval).length,undeclaredFieldChanges:scored.flatMap(r=>r.undeclaredFieldChanges.map(field=>({name:r.name,field})))};
  pairs[pair.name]={before:pair.before,after:pair.after,allowedCriteria:pair.allowedCriteria,presentationOnly:pair.presentationOnly,summary:sum,rows};
 }
 const result={schema:'cejel-public-delta-v2-result',planSha256,preregCommit:runs[plan.runs[0].name].manifest.preregCommit,runs:Object.fromEntries(Object.entries(runs).map(([k,r])=>[k,{sourceHead:r.manifest.sourceHead,rubric:r.run.rubric,completed:r.manifest.rows.filter(x=>x.ok).length,errors:r.manifest.rows.filter(x=>!x.ok).length}])),expected:plan.expected,pairs};
 writeFileSync(join(scratch,'paired-result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(Object.fromEntries(Object.entries(pairs).map(([k,v])=>[k,v.summary])),null,2));
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url))main(...process.argv.slice(2));
