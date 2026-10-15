// byte-identity.mjs <plan> <corpus> <scratch>: compares each declared pair's actual serialized
// report files, not a canonicalized parse, and writes <scratch>/byte-identity.json. Public row
// names and booleans only. Fixed with the preregistration, before any run; harness v2 is unchanged.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlan, publicEntries, sha } from '../public-delta-harness/common.mjs';
const FINGERPRINT='rubricBehaviourFingerprint';
// score-arm.mts writes JSON.stringify(report, null, 2): a top-level key is indented exactly two
// spaces, and a string value stays on its key's line. Anything else is refused, not approximated.
export function withoutTopLevelLines(text,fields){
 const parsed=JSON.parse(text);
 for(const f of fields)if(typeof parsed[f]!=='string')throw Error(`not a one-line top-level string: ${f}`);
 const prefixes=fields.map(f=>`  ${JSON.stringify(f)}: `);
 const kept=text.split('\n').filter(line=>!prefixes.some(p=>line.startsWith(p)));
 if(text.split('\n').length-kept.length!==fields.length)throw Error(`not a one-line top-level string: ${fields.join(',')}`);
 return kept.join('\n');
}
const identity=rows=>JSON.stringify(rows.map(r=>({name:r.name,commit:r.commit,commitCount:r.commitCount})));
export function main(planPath,corpusPath,scratch){
 const plan=loadPlan(planPath),entries=publicEntries(readFileSync(corpusPath),plan),planSha256=sha(readFileSync(planPath)),manifests={};
 for(const run of plan.runs){
  const m=JSON.parse(readFileSync(join(scratch,'out',run.name,'_manifest.json'),'utf8'));
  if(m.run!==run.name || m.sourceHead!==run.commit || m.planSha256!==planSha256 || m.rows.length!==entries.length)throw Error(`run manifest mismatch: ${run.name}`);
  manifests[run.name]=m;
 }
 const pairs={};
 for(const pair of plan.pairs){
  const rows=entries.map(e=>{
   const b=manifests[pair.before].rows.find(r=>r.name===e.name),a=manifests[pair.after].rows.find(r=>r.name===e.name);
   if(!b || !a || b.commit!==e.commit || a.commit!==e.commit)throw Error('target binding mismatch');
   if(!b.ok || !a.ok)return {name:e.name,error:true};
   const before=readFileSync(join(scratch,'out',pair.before,e.name+'.json'),'utf8'),after=readFileSync(join(scratch,'out',pair.after,e.name+'.json'),'utf8');
   return {name:e.name,rawIdentical:before===after,
    rawIdenticalAfterFingerprintLineRemoval:withoutTopLevelLines(before,[FINGERPRINT])===withoutTopLevelLines(after,[FINGERPRINT]),
    rawIdenticalAfterPresentationLineRemoval:withoutTopLevelLines(before,pair.presentationOnly)===withoutTopLevelLines(after,pair.presentationOnly)};
  });
  const ok=rows.filter(r=>!r.error);
  pairs[pair.name]={presentationOnly:pair.presentationOnly,completed:ok.length,errors:rows.length-ok.length,identicalReports:ok.filter(r=>r.rawIdentical).length,
   identicalAfterFingerprintRemoval:ok.filter(r=>r.rawIdenticalAfterFingerprintLineRemoval).length,identicalAfterPresentationRemoval:ok.filter(r=>r.rawIdenticalAfterPresentationLineRemoval).length,rows};
 }
 const first=identity(manifests[plan.runs[0].name].rows);
 const result={schema:'cejel-public-delta-byte-identity-v1',planSha256,targetIdentityIdenticalAcrossRuns:plan.runs.every(r=>identity(manifests[r.name].rows)===first),pairs};
 writeFileSync(join(scratch,'byte-identity.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({targetIdentityIdenticalAcrossRuns:result.targetIdentityIdenticalAcrossRuns,...Object.fromEntries(Object.entries(pairs).map(([k,v])=>[k,{...v,rows:undefined}]))},null,2));
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url))main(...process.argv.slice(2));
