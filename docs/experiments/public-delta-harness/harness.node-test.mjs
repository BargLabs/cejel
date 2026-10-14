import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { comparePair, main } from './compare.mjs';
import { main as precedentMain } from '../v17-delta-459-427-430-2026-10-13/harness/compare.mjs';
import { assertScratchOutside, claimRunOutput, loadPlan, publicEntries, scanOptions, sha, validatePlan, verifyPreregistration, verifyRunSource, verifyTarget } from './common.mjs';
const here=dirname(fileURLToPath(import.meta.url));
const report=(value=0,fingerprint='old')=>({rubricBehaviourFingerprint:fingerprint,overallScore:2,codeTrustScore:2,processTrustScore:2,verdict:'at_risk',criteria:[{id:'A1',category:'code_trust',status:'warning',score:2,metrics:[{name:'non_hollow_test_share',value,max:1,weight:0.15}],findings:[],positiveEvidence:[{path:'closed-path',label:'closed-note'}]}]});
test('fingerprint-only differences are not score differences',()=>{const d=comparePair(report(),report(0,'new'),'1','1');assert.equal(d.scoringChanged,false);assert.equal(d.fingerprintChanged,true);assert.equal(d.identicalAfterFingerprintRemoval,true);});
test('metric changes are retained even if the rounded headline does not change',()=>{const d=comparePair(report(),report(1,'new'),'1','2');assert.equal(d.scoringChanged,true);assert.equal(d.placementChanged,true);assert.equal(d.movedCriteria[0].after.metrics[0].value,1);assert.doesNotMatch(JSON.stringify(d),/closed-path|closed-note|positiveEvidence/);});
test('non-scoring evidence changes have no leaked values',()=>{const a=report();a.criteria[0].positiveEvidence[0].path='another-closed-path';const d=comparePair(report(),a,'1','1');assert.equal(d.scoringChanged,false);assert.equal(d.identicalAfterFingerprintRemoval,false);assert.deepEqual(d.changedTopLevelFields,['criteria']);assert.doesNotMatch(JSON.stringify(d),/closed-path|closed-note/);});
test('public filter refuses a changed manifest and omits private bindings',()=>{const bytes=Buffer.from(JSON.stringify({entries:[{name:'public',visibility:'public',commit:'a'.repeat(40)},{name:'closed',visibility:'private',commit:'b'.repeat(40)}]}));const plan={corpusSha256:sha(bytes),publicRows:1};assert.deepEqual(publicEntries(bytes,plan).map(e=>e.name),['public']);assert.throws(()=>publicEntries(Buffer.from('changed'),plan),/digest mismatch/);assert.throws(()=>publicEntries(bytes,{...plan,publicRows:2}),/row count mismatch/);});

// ---- v2 plan schema. Every fixture below is synthetic: no corpus row, report or score is read.
const V17='witan-rubric-v17-2026-07-24',V25='witan-rubric-v25-prospective-2026-10-12',V26='witan-rubric-v26-prospective-2026-10-14';
const hex=s=>sha(s).slice(0,40);
const basePlan=over=>({schema:'cejel-public-delta-v2',corpusSha256:sha('synthetic corpus'),scope:'synthetic',publicRows:1,generatedAt:'2026-10-15T00:00:00.000Z',expected:{},runs:[{name:'before',commit:hex('one'),rubric:V17},{name:'after',commit:hex('two'),rubric:V17}],pairs:[{name:'delta',before:'before',after:'after',allowedCriteria:['A3'],presentationOnly:['rubricBehaviourFingerprint']}],...over});
const tmp=label=>mkdtempSync(join(tmpdir(),`pdh-${label}-`));
const sh=(cwd,...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
function repo(files){
 const dir=tmp('repo');
 sh(dir,'init','-q');sh(dir,'config','user.email','synthetic@example.invalid');sh(dir,'config','user.name','synthetic');sh(dir,'config','commit.gpgsign','false');
 for(const [p,c] of Object.entries(files)){mkdirSync(dirname(join(dir,p)),{recursive:true});writeFileSync(join(dir,p),c);}
 sh(dir,'add','-A');sh(dir,'commit','-q','-m','synthetic');
 return {dir,head:sh(dir,'rev-parse','HEAD')};
}
const rubricSource=list=>({'src/witan/rubric-version.ts':`export const WITAN_SELECTABLE_RUBRIC_VERSIONS = Object.freeze(${JSON.stringify(list)} as const);\n`});

test('accepts a plan with two runs under v17',async()=>{
 const one=repo(rubricSource([V17,V25])),two=repo(rubricSource([V17,V25,V26]));
 const plan=validatePlan(basePlan({runs:[{name:'before',commit:one.head,rubric:V17},{name:'after',commit:two.head,rubric:V17}]}));
 assert.deepEqual(plan.runs.map(r=>r.name),['before','after']);
 await verifyRunSource(one.dir,plan.runs[0]);
 await verifyRunSource(two.dir,plan.runs[1]);
});
test('accepts a plan pairing two rubrics at one commit',async()=>{
 const src=repo(rubricSource([V17,V25,V26]));
 const plan=validatePlan(basePlan({runs:[{name:'v25',commit:src.head,rubric:V25},{name:'v26',commit:src.head,rubric:V26}],pairs:[{name:'item6',before:'v25',after:'v26',allowedCriteria:['A2','A5'],presentationOnly:['rubricVersion','rubricBehaviourFingerprint']}]}));
 for(const run of plan.runs)await verifyRunSource(src.dir,run);
});
test('refuses a rubric not selectable at the run\'s commit',async()=>{
 const src=repo(rubricSource([V17,V25]));
 const plan=validatePlan(basePlan({runs:[{name:'before',commit:src.head,rubric:V17},{name:'after',commit:src.head,rubric:V26}]}));
 await verifyRunSource(src.dir,plan.runs[0]);
 await assert.rejects(verifyRunSource(src.dir,plan.runs[1]),/rubric not selectable at run commit: after/);
});
test('refuses a source with no selectable rubric list',async()=>{
 const src=repo({'src/witan/rubric-version.ts':'export const WITAN_RUBRIC_VERSION = "witan-rubric-v17-2026-07-24";\n'});
 await assert.rejects(verifyRunSource(src.dir,{name:'before',commit:src.head,rubric:V17}),/no selectable rubric list at run commit/);
});
test('refuses a source checkout at another commit, or with dirty tracked source',async()=>{
 const src=repo(rubricSource([V17]));
 await assert.rejects(verifyRunSource(src.dir,{name:'before',commit:hex('elsewhere'),rubric:V17}),/source run mismatch/);
 writeFileSync(join(src.dir,'src/witan/rubric-version.ts'),rubricSource([V17,V26])['src/witan/rubric-version.ts']);
 await assert.rejects(verifyRunSource(src.dir,{name:'before',commit:src.head,rubric:V26}),/dirty source/);
});
test('refuses duplicate run names',()=>{assert.throws(()=>validatePlan(basePlan({runs:[{name:'before',commit:hex('one'),rubric:V17},{name:'before',commit:hex('two'),rubric:V17}]})),/duplicate run name: before/);});
test('refuses a pair naming an undeclared run',()=>{
 assert.throws(()=>validatePlan(basePlan({pairs:[{name:'delta',before:'before',after:'fixes',allowedCriteria:['A3'],presentationOnly:[]}]})),/pair names an undeclared run: delta\.after=fixes/);
 assert.throws(()=>validatePlan(basePlan({pairs:[{name:'delta',before:'baseline',after:'after',allowedCriteria:['A3'],presentationOnly:[]}]})),/pair names an undeclared run: delta\.before=baseline/);
});
test('refuses a non-40-hex commit',()=>{
 for(const commit of [hex('one').slice(0,12),hex('one').toUpperCase(),'main',hex('one')+'0'])assert.throws(()=>validatePlan(basePlan({runs:[{name:'before',commit,rubric:V17},{name:'after',commit:hex('two'),rubric:V17}]})),/run commit is not 40-hex: before/);
});
test('refuses an unknown schema',()=>{
 assert.throws(()=>validatePlan(basePlan({schema:'cejel-public-delta-v3'})),/unknown plan schema/);
 assert.throws(()=>loadPlan(join(here,'../v17-delta-459-427-430-2026-10-13/plan.json')),/unknown plan schema/);
});
test('refuses an existing output directory',()=>{
 const scratch=tmp('scratch');
 const out=claimRunOutput(scratch,'before');
 assert.equal(out,join(scratch,'out','before'));assert.ok(existsSync(out));
 assert.throws(()=>claimRunOutput(scratch,'before'),/run output already exists; never overwrite a run/);
 mkdirSync(join(scratch,'out','after'),{recursive:true});
 assert.throws(()=>claimRunOutput(scratch,'after'),/run output already exists; never overwrite a run/);
});
test('refuses a run that repeats another run\'s commit and rubric, and a pair of a run with itself',()=>{
 assert.throws(()=>validatePlan(basePlan({runs:[{name:'before',commit:hex('one'),rubric:V17},{name:'after',commit:hex('one'),rubric:V17}]})),/run repeats another run's commit and rubric: after/);
 assert.throws(()=>validatePlan(basePlan({pairs:[{name:'delta',before:'after',after:'after',allowedCriteria:[],presentationOnly:[]}]})),/pair compares a run with itself: delta/);
});
test('refuses malformed run and pair declarations',()=>{
 const bad=[
  [{runs:[]},/plan declares no runs/],
  [{pairs:[]},/plan declares no pairs/],
  [{runs:[{name:'../before',commit:hex('one'),rubric:V17},{name:'after',commit:hex('two'),rubric:V17}]},/invalid run name/],
  [{runs:[{name:'before',commit:hex('one')},{name:'after',commit:hex('two'),rubric:V17}]},/invalid run rubric: before/],
  [{runs:[{name:'before',commit:hex('one'),rubric:V17,arm:'x'},{name:'after',commit:hex('two'),rubric:V17}]},/unknown run field: before\.arm/],
  [{pairs:[{name:'delta',before:'before',after:'after',allowedCriteria:['A3']}]},/pair presentationOnly must be an array: delta/],
  [{pairs:[{name:'delta',before:'before',after:'after',allowedCriteria:['a3'],presentationOnly:[]}]},/pair allowedCriteria must list criterion ids: delta/],
  [{pairs:[{name:'delta',before:'before',after:'after',allowedCriteria:['A3','A3'],presentationOnly:[]}]},/pair allowedCriteria must list criterion ids: delta/],
  [{pairs:[{name:'delta',before:'before',after:'after',allowedCriteria:['A3'],presentationOnly:[],allowed:['A1']}]},/unknown pair field: delta\.allowed/],
  [{pairs:[{name:'d',before:'before',after:'after',allowedCriteria:[],presentationOnly:[]},{name:'d',before:'before',after:'after',allowedCriteria:[],presentationOnly:[]}]},/duplicate pair name: d/],
 ];
 for(const [over,pattern] of bad)assert.throws(()=>validatePlan(basePlan(over)),pattern);
});
test('refuses a presentation-only declaration that would hide a scoring field',()=>{
 for(const field of ['criteria','overallScore','codeTrustScore','processTrustScore','verdict'])assert.throws(()=>validatePlan(basePlan({pairs:[{name:'delta',before:'before',after:'after',allowedCriteria:[],presentationOnly:[field]}]})),new RegExp(`presentationOnly names a scoring field: delta\\.${field}`));
});
test('keeps the fixed generatedAt, corpus digest and public row count binding',()=>{
 assert.throws(()=>validatePlan(basePlan({generatedAt:'2026-10-15'})),/generatedAt must be a fixed ISO instant/);
 assert.throws(()=>validatePlan(basePlan({generatedAt:undefined})),/generatedAt must be a fixed ISO instant/);
 assert.throws(()=>validatePlan(basePlan({corpusSha256:'dc723f53'})),/invalid corpus digest/);
 assert.throws(()=>validatePlan(basePlan({publicRows:0})),/invalid public row count/);
 assert.throws(()=>validatePlan(basePlan({expected:undefined})),/plan expected values must be an object/);
});
test('scan options keep the fixed generatedAt and explicitly disabled ingest, and take the run rubric',()=>{
 const plan=validatePlan(basePlan({runs:[{name:'before',commit:hex('one'),rubric:V25},{name:'after',commit:hex('two'),rubric:V26}]}));
 const o=scanOptions(plan,plan.runs[1],'/scratch/checkouts',{name:'row-a',commit:hex('row')},'9.9.9');
 assert.deepEqual(o,{repoPath:join('/scratch/checkouts','row-a'),productSlug:'row-a',productDisplayName:'row-a',generatedAt:'2026-10-15T00:00:00.000Z',rubricVersion:V26,toolVersion:'9.9.9',ingestPatterns:[],autoDiscoverIngest:false});
});
test('targets must be pinned, clean, full-history and unfiltered',()=>{
 const t=repo({'README':'x\n'}),root=dirname(t.dir),entry={name:t.dir.slice(root.length+1),commit:t.head};
 assert.equal(verifyTarget(root,entry).commitCount,1);
 assert.throws(()=>verifyTarget(root,{...entry,commit:hex('other')}),/pin mismatch/);
 sh(t.dir,'config','remote.origin.partialclonefilter','blob:none');
 assert.throws(()=>verifyTarget(root,entry),/filtered target/);
 sh(t.dir,'config','--unset','remote.origin.partialclonefilter');
 writeFileSync(join(t.dir,'README'),'y\n');
 assert.throws(()=>verifyTarget(root,entry),/dirty target/);
});
test('the preregistration commit must be an ancestor holding the same plan bytes',()=>{
 const plan=JSON.stringify(basePlan({}),null,2)+'\n';
 const p=repo({'exp/plan.json':plan}),prereg=p.head,planPath=join(p.dir,'exp/plan.json');
 assert.equal(verifyPreregistration(planPath,prereg),sh(p.dir,'rev-parse','--show-toplevel'));
 writeFileSync(join(p.dir,'exp/result.md'),'later\n');sh(p.dir,'add','-A');sh(p.dir,'commit','-q','-m','result');
 assert.equal(verifyPreregistration(planPath,prereg),sh(p.dir,'rev-parse','--show-toplevel'));
 assert.throws(()=>verifyPreregistration(planPath,hex('never committed')),/preregistration commit is not an ancestor of the protocol checkout/);
 sh(p.dir,'checkout','-q','--orphan','other');sh(p.dir,'commit','-q','-m','unrelated');
 assert.throws(()=>verifyPreregistration(planPath,prereg),/preregistration commit is not an ancestor of the protocol checkout/);
 const q=repo({'exp/plan.json':plan}),qPrereg=q.head;
 writeFileSync(join(q.dir,'exp/plan.json'),plan.replace('synthetic"','edited"'));
 assert.throws(()=>verifyPreregistration(join(q.dir,'exp/plan.json'),qPrereg),/plan differs from the preregistered plan/);
 assert.throws(()=>verifyPreregistration(join(q.dir,'exp/plan.json'),'main'),/preregistration commit is not 40-hex/);
});
test('raw reports stay local: the scratch root is outside the protocol and source checkouts',()=>{
 const p=repo({'README':'x\n'}),scratch=tmp('scratch');
 assertScratchOutside(scratch,[p.dir]);
 mkdirSync(join(p.dir,'scratch'));
 assert.throws(()=>assertScratchOutside(join(p.dir,'scratch'),[p.dir]),/scratch root is inside a checkout; raw reports stay local/);
 assert.throws(()=>assertScratchOutside(p.dir,[p.dir]),/scratch root is inside a checkout; raw reports stay local/);
});

// ---- Translation: the precedent's three-arm plan, translated to v2, against the precedent's own
// compare.mjs on the same synthetic per-row reports. The committed precedent paired-result.json
// cannot be reproduced value for value without the raw reports, which are local and were never
// committed; this compares the two implementations on identical inputs instead.
const ROWS=['cejel',...Array.from({length:22},(_,i)=>`row-${String(i+1).padStart(2,'0')}`)];
const ARMS={before459:hex('arm before459'),after459:hex('arm after459'),fixes:hex('arm fixes')};
const PREREG=hex('synthetic preregistration');
function syntheticReport(row,arm){
 const n=ROWS.indexOf(row),c=(id,category,score,status='pass',metrics=[])=>({id,category,status,score,metrics,findings:[{severity:'info',title:'closed-finding-text'}],positiveEvidence:[{path:`closed/${row}/${id}`,label:'closed-evidence'}]});
 const criteria=[c('A1','code_trust',1+n%4,'pass',[{name:'non_hollow_test_share',value:(n%5)/5,max:1,weight:0.15}]),c('A2','code_trust',2),c('A3','code_trust',3,'warning'),c('B1','process_trust',2),c('B2','process_trust',1+n%3),c('B5','process_trust',4)];
 const at=id=>criteria.find(x=>x.id===id);
 if(row==='row-03' && arm!=='before459')at('A3').score=4;
 if(row==='row-04' && arm!=='before459')at('B2').score=4;
 if(row==='row-05' && arm==='fixes')at('A1').metrics[0].value=1;
 if(row==='row-06' && arm==='fixes')at('A2').status='not_applicable';
 if(row==='row-09' && arm!=='before459')at('A1').positiveEvidence[0].path='closed/moved';
 if(row==='row-10'){at('B2').status='insufficient_data';at('B5').status='insufficient_data';}
 if(row==='row-11' && arm==='fixes')at('A1').findings.push({severity:'warning',title:'closed-finding-text'});
 const r={schema:'synthetic',repo:{headSha:hex(row)},generatedAt:'2026-10-13T00:00:00.000Z',toolVersion:'0.6.3',rubricVersion:V17,rubricBehaviourFingerprint:row==='row-08' && arm==='after459'?'fp-before459':`fp-${arm}`,overallScore:row==='row-12'?null:2+(n%3),codeTrustScore:2,processTrustScore:2+(row==='row-03' && arm!=='before459'?1:0),verdict:'at_risk',criteria};
 if(row==='row-13' && arm==='fixes')r.historyLimitations=['closed-limitation'];
 return r;
}
const corpusBytes=Buffer.from(JSON.stringify({entries:[...ROWS.map(name=>({name,visibility:'public',commit:hex(name)})),{name:'closed-row',visibility:'private',commit:hex('closed-row')}]}));
const precedentPlan={schema:'cejel-three-arm-public-delta-v1',arms:ARMS,corpusSha256:sha(corpusBytes),scope:'synthetic',publicRows:23,generatedAt:'2026-10-13T00:00:00.000Z',rubricVersion:V17,expected:{completedPerArm:23,errorsPerArm:0}};
const PRECEDENT_PAIRS=[['459','before459','after459',['A3']],['fixes','after459','fixes',['A1','A2']],['release','before459','fixes',['A1','A2','A3']]];
const translate=p=>({schema:'cejel-public-delta-v2',runs:Object.entries(p.arms).map(([name,commit])=>({name,commit,rubric:p.rubricVersion})),pairs:PRECEDENT_PAIRS.map(([name,before,after,allowedCriteria])=>({name,before,after,allowedCriteria,presentationOnly:['rubricBehaviourFingerprint']})),corpusSha256:p.corpusSha256,scope:p.scope,publicRows:p.publicRows,generatedAt:p.generatedAt,expected:p.expected});
function scratchFor(plan,v2){
 const dir=tmp('translation'),planPath=join(dir,'plan.json'),corpusPath=join(dir,'corpus.json');
 writeFileSync(planPath,JSON.stringify(plan,null,2)+'\n');writeFileSync(corpusPath,corpusBytes);
 for(const arm of Object.keys(ARMS)){
  const out=join(dir,'scratch','out',arm);mkdirSync(out,{recursive:true});
  const rows=ROWS.map(name=>{const ok=!(name==='row-07' && arm==='fixes');if(ok)writeFileSync(join(out,name+'.json'),JSON.stringify(syntheticReport(name,arm),null,2)+'\n');return {name,commit:hex(name),commitCount:10,ok,ms:1};});
  const head=v2?{run:arm,sourceHead:ARMS[arm],rubricVersion:V17}:{arm,sourceHead:ARMS[arm]};
  writeFileSync(join(out,'_manifest.json'),JSON.stringify({...head,packageVersion:'0.6.3',preregCommit:PREREG,planSha256:sha(readFileSync(planPath)),generatedAt:plan.generatedAt,...(v2?{}:{rubricVersion:V17}),rows},null,2)+'\n');
 }
 return {planPath,corpusPath,scratch:join(dir,'scratch')};
}
function runBoth(){
 const a=scratchFor(precedentPlan,false),b=scratchFor(translate(precedentPlan),true);
 precedentMain(a.planPath,a.corpusPath,a.scratch);
 main(b.planPath,b.corpusPath,b.scratch);
 return {before:JSON.parse(readFileSync(join(a.scratch,'paired-result.json'),'utf8')),after:JSON.parse(readFileSync(join(b.scratch,'paired-result.json'),'utf8')),text:readFileSync(join(b.scratch,'paired-result.json'),'utf8')};
}
const project=(value,shape)=>{
 if(Array.isArray(shape))return value.map((v,i)=>project(v,shape[i]));
 if(shape && typeof shape==='object')return Object.fromEntries(Object.keys(shape).map(k=>[k,project(value?.[k],shape[k])]));
 return value;
};
test('translation: v2 reproduces the precedent pair logic field for field on the precedent plan',()=>{
 const {before:p,after:v}=runBoth();
 assert.deepEqual(validatePlan(translate(precedentPlan)).pairs.map(x=>[x.name,x.before,x.after,x.allowedCriteria]),PRECEDENT_PAIRS);
 // The fixture is not vacuous: each precedent measure takes a nonzero value somewhere.
 const s=Object.values(p.pairs).map(x=>x.summary);
 for(const key of ['scoringRowsMoved','placementsMoved','fingerprintsChanged','identicalReports','identicalAfterFingerprintRemoval','errors'])assert.ok(s.some(x=>x[key]>0),key);
 assert.ok(s.some(x=>x.unexpectedCriteria.length>0));
 assert.equal(v.preregCommit,p.preregCommit);assert.deepEqual(v.expected,p.expected);
 for(const [arm,a] of Object.entries(p.arms))assert.deepEqual(project(v.runs[arm],a),a,arm);
 assert.deepEqual(Object.keys(v.pairs),Object.keys(p.pairs));
 for(const [name,pair] of Object.entries(p.pairs)){
  assert.equal(v.pairs[name].before,pair.left);assert.equal(v.pairs[name].after,pair.right);
  assert.deepEqual(project(v.pairs[name].summary,pair.summary),pair.summary,name);
  assert.equal(v.pairs[name].rows.length,pair.rows.length);
  pair.rows.forEach((row,i)=>assert.deepEqual(project(v.pairs[name].rows[i],row),row,`${name} ${row.name}`));
 }
});
test('translation: v2 output carries every field name of the committed precedent paired-result.json',()=>{
 // Field names only; no committed value is read or compared. The keys under `expected` are the
 // plan's own forecast names, copied through unchanged, so only `expected` itself is required.
 const paths=(value,prefix='')=>Array.isArray(value)?value.flatMap(v=>paths(v,prefix+'[]')):value && typeof value==='object'?Object.entries(value).flatMap(([k,v])=>[prefix+'.'+k,...paths(v,prefix+'.'+k)]):[];
 const rename=p=>p.replace(/^\.arms(?=\.|$)/,'.runs').replace(/^(\.pairs\.[^.]+)\.left$/,'$1.before').replace(/^(\.pairs\.[^.]+)\.right$/,'$1.after');
 const committed=new Set(paths(JSON.parse(readFileSync(join(here,'../v17-delta-459-427-430-successor-2026-10-13/paired-result.json'),'utf8'))).map(rename).filter(p=>!p.startsWith('.expected.')));
 const produced=new Set(paths(runBoth().after));
 assert.ok(committed.size>40);
 assert.deepEqual([...committed].filter(p=>!produced.has(p)),[]);
});
test('unexpectedCriteria is measured against each pair\'s own allowedCriteria and nothing else',()=>{
 const {after:v,text}=runBoth();
 const ids=name=>[...new Set(v.pairs[name].summary.unexpectedCriteria.map(c=>c.id))].sort();
 assert.deepEqual(ids('459'),['B2']);
 assert.deepEqual(ids('fixes'),[]);
 assert.deepEqual(ids('release'),['B2']);
 assert.deepEqual(v.pairs['459'].allowedCriteria,['A3']);
 const narrowed=translate(precedentPlan);narrowed.pairs[1].allowedCriteria=['A1'];
 const b=scratchFor(narrowed,true);main(b.planPath,b.corpusPath,b.scratch);
 const n=JSON.parse(readFileSync(join(b.scratch,'paired-result.json'),'utf8'));
 assert.deepEqual([...new Set(n.pairs.fixes.summary.unexpectedCriteria.map(c=>c.id))].sort(),['A2']);
 assert.deepEqual(n.pairs['459'].summary.unexpectedCriteria,v.pairs['459'].summary.unexpectedCriteria);
 assert.doesNotMatch(text,/closed-|positiveEvidence|"path"|"title"/);
});
test('presentationOnly fields are allowed changes; any other non-scoring field change is reported',()=>{
 const {after:v}=runBoth();
 const row=name=>v.pairs.fixes.rows.find(r=>r.name===name);
 assert.deepEqual(row('row-01').presentationFieldsChanged,['rubricBehaviourFingerprint']);
 assert.equal(row('row-01').identicalAfterPresentationRemoval,true);
 assert.deepEqual(row('row-13').undeclaredFieldChanges,['historyLimitations']);
 assert.deepEqual(v.pairs.fixes.summary.undeclaredFieldChanges,[{name:'row-13',field:'historyLimitations'}]);
 assert.equal(v.pairs.fixes.summary.identicalAfterPresentationRemoval,v.pairs.fixes.rows.filter(r=>r.identicalAfterPresentationRemoval).length);
 const d=comparePair({...report(),rubricVersion:V25},{...report(0,'new'),rubricVersion:V26},'1','1',['rubricVersion','rubricBehaviourFingerprint']);
 assert.equal(d.scoringChanged,false);assert.equal(d.identicalAfterPresentationRemoval,true);assert.deepEqual(d.undeclaredFieldChanges,[]);
 const u=comparePair({...report(),rubricVersion:V25},{...report(0,'new'),rubricVersion:V26},'1','1',['rubricBehaviourFingerprint']);
 assert.deepEqual(u.undeclaredFieldChanges,['rubricVersion']);
});
test('compare refuses a run manifest that does not match its declared run',()=>{
 const plan=translate(precedentPlan);
 for(const [mutate,pattern] of [[m=>{m.rubricVersion=V25;},/run manifest mismatch: after459/],[m=>{m.run='fixes';},/run manifest mismatch: after459/],[m=>{m.preregCommit=hex('other prereg');},/preregistration binding mismatch: after459/]]){
  const b=scratchFor(plan,true),path=join(b.scratch,'out','after459','_manifest.json'),m=JSON.parse(readFileSync(path,'utf8'));
  mutate(m);writeFileSync(path,JSON.stringify(m));
  assert.throws(()=>main(b.planPath,b.corpusPath,b.scratch),pattern);
 }
 const b=scratchFor(plan,true),path=join(b.scratch,'out','fixes','row-01.json'),r=JSON.parse(readFileSync(path,'utf8'));
 r.rubricVersion=V25;writeFileSync(path,JSON.stringify(r));
 assert.throws(()=>main(b.planPath,b.corpusPath,b.scratch),/report rubric mismatch: fixes row-01/);
});
