import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { main, withoutTopLevelLines } from './byte-identity.mjs';
import { loadPlan, publicEntries, sha } from '../public-delta-harness/common.mjs';

const here=dirname(fileURLToPath(import.meta.url));
test('the committed plan passes harness v2 validation and binds the repository corpus',()=>{
 const plan=loadPlan(join(here,'plan.json'));
 assert.deepEqual(plan.runs.map(r=>r.name),['v064-v17','main-v17','main-v25','main-v26']);
 assert.deepEqual(plan.pairs.map(p=>[p.name,p.before,p.after]),[['release-v17','v064-v17','main-v17'],['item6-v26','main-v25','main-v26']]);
 assert.equal(publicEntries(readFileSync(join(here,'../../../leaderboard/corpus.json')),plan).length,23);
});

// Every fixture below is synthetic: no corpus row, report or score is read.
const FP='rubricBehaviourFingerprint';
const serialize=r=>JSON.stringify(r,null,2)+'\n';
const report=over=>({rubricVersion:'witan-rubric-v17-2026-07-24',[FP]:'sha256:'+'a'.repeat(64),overallScore:2,criteria:[{id:'A1',score:2,note:{[FP]:'nested'}}],...over});

test('a report differing only in the fingerprint line is identical after removing that line',()=>{
 const a=serialize(report()),b=serialize(report({[FP]:'sha256:'+'b'.repeat(64)}));
 assert.notEqual(a,b);
 assert.equal(withoutTopLevelLines(a,[FP]),withoutTopLevelLines(b,[FP]));
});
test('a nested key with the same name is not removed',()=>{
 const a=serialize(report()),b=report();b.criteria[0].note[FP]='other';
 assert.notEqual(withoutTopLevelLines(a,[FP]),withoutTopLevelLines(serialize(b),[FP]));
});
test('any other top-level difference survives the removal',()=>{
 assert.notEqual(withoutTopLevelLines(serialize(report()),[FP]),withoutTopLevelLines(serialize(report({overallScore:3})),[FP]));
 assert.notEqual(withoutTopLevelLines(serialize(report()),[FP]),withoutTopLevelLines(serialize(report({rubricVersion:'witan-rubric-v26-prospective-2026-10-14'})),[FP]));
 assert.equal(withoutTopLevelLines(serialize(report()),[FP,'rubricVersion']),withoutTopLevelLines(serialize(report({rubricVersion:'witan-rubric-v26-prospective-2026-10-14'})),[FP,'rubricVersion']));
});
test('refuses a field that is not a one-line top-level string',()=>{
 assert.throws(()=>withoutTopLevelLines(serialize(report({[FP]:{multi:'line'}})),[FP]),/not a one-line top-level string: rubricBehaviourFingerprint/);
 assert.throws(()=>withoutTopLevelLines(serialize(report({[FP]:undefined})),[FP]),/not a one-line top-level string: rubricBehaviourFingerprint/);
});

function fixture({errorRow=false,changedIdentity=false}={}){
 const scratch=mkdtempSync(join(tmpdir(),'bi-'));
 const corpus=Buffer.from(JSON.stringify({entries:[{name:'one',visibility:'public',commit:'1'.repeat(40)},{name:'two',visibility:'public',commit:'2'.repeat(40)},{name:'closed',visibility:'private'}]}));
 writeFileSync(join(scratch,'corpus.json'),corpus);
 const plan={schema:'cejel-public-delta-v2',corpusSha256:sha(corpus),publicRows:2,scope:'synthetic',generatedAt:'2026-10-15T00:00:00.000Z',expected:{},
  runs:[{name:'b17',commit:'a'.repeat(40),rubric:'witan-rubric-v17-2026-07-24'},{name:'a17',commit:'b'.repeat(40),rubric:'witan-rubric-v17-2026-07-24'}],
  pairs:[{name:'release',before:'b17',after:'a17',allowedCriteria:['A1'],presentationOnly:[FP]}]};
 writeFileSync(join(scratch,'plan.json'),JSON.stringify(plan));
 for(const run of plan.runs){
  const out=join(scratch,'out',run.name);mkdirSync(out,{recursive:true});
  const rows=[{name:'one',commit:'1'.repeat(40),commitCount:5,ok:true},{name:'two',commit:'2'.repeat(40),commitCount:changedIdentity&&run.name==='a17'?6:7,ok:!(errorRow&&run.name==='a17')}];
  writeFileSync(join(out,'_manifest.json'),JSON.stringify({run:run.name,sourceHead:run.commit,planSha256:sha(JSON.stringify(plan)),rows}));
  const fp=run.name==='b17'?'a':'b';
  writeFileSync(join(out,'one.json'),serialize(report({[FP]:'sha256:'+fp.repeat(64)})));
  if(rows[1].ok)writeFileSync(join(out,'two.json'),serialize(report({[FP]:'sha256:'+fp.repeat(64),overallScore:run.name==='b17'?2:3})));
 }
 return scratch;
}
test('records raw and line-removed identity per row, every public row, no private row',()=>{
 const s=fixture();main(join(s,'plan.json'),join(s,'corpus.json'),s);
 const r=JSON.parse(readFileSync(join(s,'byte-identity.json'),'utf8'));
 assert.deepEqual(r.pairs.release.rows,[{name:'one',rawIdentical:false,rawIdenticalAfterFingerprintLineRemoval:true,rawIdenticalAfterPresentationLineRemoval:true},{name:'two',rawIdentical:false,rawIdenticalAfterFingerprintLineRemoval:false,rawIdenticalAfterPresentationLineRemoval:false}]);
 assert.deepEqual({...r.pairs.release,rows:undefined},{rows:undefined,presentationOnly:[FP],completed:2,errors:0,identicalReports:0,identicalAfterFingerprintRemoval:1,identicalAfterPresentationRemoval:1});
 assert.equal(r.targetIdentityIdenticalAcrossRuns,true);
 assert.doesNotMatch(JSON.stringify(r),/closed|nested|sha256:/);
});
test('an errored row is recorded as an error, not compared',()=>{
 const s=fixture({errorRow:true});main(join(s,'plan.json'),join(s,'corpus.json'),s);
 const r=JSON.parse(readFileSync(join(s,'byte-identity.json'),'utf8'));
 assert.deepEqual(r.pairs.release.rows[1],{name:'two',error:true});
 assert.equal(r.pairs.release.errors,1);
});
test('a target whose identity differs between runs is reported, and an existing output is refused',()=>{
 const s=fixture({changedIdentity:true});main(join(s,'plan.json'),join(s,'corpus.json'),s);
 assert.equal(JSON.parse(readFileSync(join(s,'byte-identity.json'),'utf8')).targetIdentityIdenticalAcrossRuns,false);
 assert.throws(()=>main(join(s,'plan.json'),join(s,'corpus.json'),s),/EEXIST/);
});
test('refuses a manifest bound to another plan',()=>{
 const s=fixture();writeFileSync(join(s,'plan.json'),readFileSync(join(s,'plan.json'),'utf8')+'\n');
 assert.throws(()=>main(join(s,'plan.json'),join(s,'corpus.json'),s),/run manifest mismatch: b17/);
});
