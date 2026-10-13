import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { git, loadPlan, publicEntries, verifyTarget, sha } from './common.mjs';
const [planPath, source, arm, scratch, preregCommit] = process.argv.slice(2);
if(!planPath || !source || !arm || !scratch || !preregCommit || !/^[0-9a-f]{40}$/.test(preregCommit))throw Error('plan source arm scratch preregCommit required');
const plan=loadPlan(planPath);
if(!plan.arms[arm] || git(source,'rev-parse','HEAD')!==plan.arms[arm])throw Error('source arm mismatch');
if(git(source,'status','--porcelain','--untracked-files=no'))throw Error('dirty source');
const corpusBytes=readFileSync(join(source,'leaderboard/corpus.json'));
const entries=publicEntries(corpusBytes,plan);
const targets=entries.map(e=>verifyTarget(join(scratch,'checkouts'),e));
const out=join(scratch,'out',arm);
if(existsSync(out))throw Error('arm output already exists; never overwrite a run');
mkdirSync(out,{recursive:true});
const scannerPath=resolve(source,'src/witan/public-scan.ts');
const { scoreRepoWithPublicCejel }=await import(pathToFileURL(scannerPath).href);
const packageVersion=JSON.parse(readFileSync(join(source,'package.json'),'utf8')).version;
console.log(JSON.stringify({arm,sourceHead:plan.arms[arm],scannerPath,packageVersion,preregCommit}));
const rows=[];
for(const entry of entries){
 const identity=verifyTarget(join(scratch,'checkouts'),entry);
 const target=targets.find(t=>t.name===entry.name);
 if(JSON.stringify(identity)!==JSON.stringify(target))throw Error('target changed between verification and scan');
 const began=Date.now();
 try{
  const report=scoreRepoWithPublicCejel({repoPath:join(scratch,'checkouts',entry.name),productSlug:entry.name,productDisplayName:entry.name,generatedAt:plan.generatedAt,rubricVersion:plan.rubricVersion,toolVersion:packageVersion,ingestPatterns:[],autoDiscoverIngest:false});
  writeFileSync(join(out,entry.name+'.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  const after=verifyTarget(join(scratch,'checkouts'),entry);
  if(JSON.stringify(after)!==JSON.stringify(target))throw Error('target changed while scanning');
  rows.push({...identity,ok:true,ms:Date.now()-began});
  console.log(`${arm}: ${entry.name} completed`);
 }catch(error){
  rows.push({...identity,ok:false,errorClass:error instanceof Error ? error.name : 'unknown',ms:Date.now()-began});
  console.log(`${arm}: ${entry.name} error (details withheld)`);
 }
}
writeFileSync(join(out,'_manifest.json'),JSON.stringify({arm,sourceHead:plan.arms[arm],packageVersion,preregCommit,planSha256:sha(readFileSync(planPath)),generatedAt:plan.generatedAt,rubricVersion:plan.rubricVersion,rows},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({arm,completed:rows.filter(r=>r.ok).length,rows:rows.length}));
