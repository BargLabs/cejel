import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertScratchOutside, claimRunOutput, loadPlan, planRun, publicEntries, scanOptions, sha, verifyPreregistration, verifyRunSource, verifyTarget } from './common.mjs';
const [planPath, source, runName, scratch, preregCommit] = process.argv.slice(2);
if(!planPath || !source || !runName || !scratch || !preregCommit || !/^[0-9a-f]{40}$/.test(preregCommit))throw Error('plan source run scratch preregCommit required');
const plan=loadPlan(planPath);
const run=planRun(plan,runName);
const protocol=verifyPreregistration(planPath,preregCommit);
await verifyRunSource(source,run);
assertScratchOutside(scratch,[protocol,source]);
const corpusBytes=readFileSync(join(source,'leaderboard/corpus.json'));
const entries=publicEntries(corpusBytes,plan);
const checkouts=join(scratch,'checkouts');
const targets=entries.map(e=>verifyTarget(checkouts,e));
const out=claimRunOutput(scratch,run.name);
const scannerPath=resolve(source,'src/witan/public-scan.ts');
const { scoreRepoWithPublicCejel }=await import(pathToFileURL(scannerPath).href);
const packageVersion=JSON.parse(readFileSync(join(source,'package.json'),'utf8')).version;
console.log(JSON.stringify({run:run.name,sourceHead:run.commit,rubricVersion:run.rubric,scannerPath,packageVersion,preregCommit}));
const rows=[];
for(const entry of entries){
 const identity=verifyTarget(checkouts,entry);
 const target=targets.find(t=>t.name===entry.name);
 if(JSON.stringify(identity)!==JSON.stringify(target))throw Error('target changed between verification and scan');
 const began=Date.now();
 try{
  const report=scoreRepoWithPublicCejel(scanOptions(plan,run,checkouts,entry,packageVersion));
  writeFileSync(join(out,entry.name+'.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  const after=verifyTarget(checkouts,entry);
  if(JSON.stringify(after)!==JSON.stringify(target))throw Error('target changed while scanning');
  rows.push({...identity,ok:true,ms:Date.now()-began});
  console.log(`${run.name}: ${entry.name} completed`);
 }catch(error){
  rows.push({...identity,ok:false,errorClass:error instanceof Error ? error.name : 'unknown',ms:Date.now()-began});
  console.log(`${run.name}: ${entry.name} error (details withheld)`);
 }
}
writeFileSync(join(out,'_manifest.json'),JSON.stringify({run:run.name,sourceHead:run.commit,rubricVersion:run.rubric,packageVersion,preregCommit,planSha256:sha(readFileSync(planPath)),generatedAt:plan.generatedAt,rows},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({run:run.name,completed:rows.filter(r=>r.ok).length,rows:rows.length}));
