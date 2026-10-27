import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
const source=readFileSync(new URL('../account-deletion.js',import.meta.url),'utf8');
class Element {
  constructor(dataset={}){this.dataset=dataset;this.disabled=false;this.checked=false;this.textContent='';this.events={};}
  addEventListener(name,fn){this.events[name]=fn;}
  async dispatch(name){await this.events[name]?.({preventDefault(){}});}
}
const config={enabled:true,url:'https://testproject.supabase.co',publicKey:'sb_publishable_synthetic_public_key'};
const currentPolicy={revision:'member_deletion_v3_minimal',policy_id:'member_minimal_retention_2026_10_23',
  recovery_months:0,transaction_months:12,detail_days:30,backup_days:30,deletion_target_days:7};
function setup({enabled=true,callback=false,wrongFlow=false,failedDelete=false,policyBad=false,policyOverride={}}={}){
  const ids=['account-delete-form','account-delete-status','account-delete-policy','account-delete-confirm','account-delete-submit'];
  const nodes=Object.fromEntries(ids.map(id=>[id,new Element()]));
  const google=new Element({provider:'google'}),apple=new Element({provider:'apple'});
  const form=nodes['account-delete-form'];form.querySelectorAll=selector=>selector==='[data-provider]'?[google,apple]:[google,apple,nodes['account-delete-confirm'],nodes['account-delete-submit']];
  const calls=[],memory=new Map();let assigned;
  if(callback)memory.set('olwine-account-delete-pkce-v1',JSON.stringify({verifier:'v'.repeat(64),flow:'synthetic-flow',provider:'google',project:config.url,expires:Date.now()+600000}));
  const location={origin:'https://olwineservice.github.io',pathname:'/account-deletion.html',
    href:'https://olwineservice.github.io/account-deletion.html'+(callback?`?code=one-use-code&flow=${wrongFlow?'forged':'synthetic-flow'}`:''),assign:url=>{assigned=url;}};
  const context={window:{OLWINE_ACCOUNT_CONFIG:{...config,enabled}},document:{getElementById:id=>nodes[id]},location,
    sessionStorage:{getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)},
    history:{replaceState:(_state,_title,url)=>{location.href=url;}},URL,Uint8Array,TextEncoder,Date,JSON,AbortSignal,
    crypto:webcrypto,atob,btoa,fetch:async(url,options)=>{
      calls.push({url,options});const path=new URL(url).pathname;
      if(path==='/auth/v1/token')return Response.json({access_token:'a.b.c',refresh_token:'auth-refresh-private',provider_refresh_token:'provider-refresh-private'});
      if(path.endsWith('/session'))return Response.json({state:'ok'});
      if(path.endsWith('/deletion-policy'))return Response.json({...currentPolicy,...(policyBad?{recovery_months:-1}:{}),...policyOverride});
      if(path.endsWith('/delete'))return failedDelete?new Response('private failure',{status:503}):Response.json({state:'accepted'});
      if(path.endsWith('/logout'))return new Response(null,{status:204});
      throw Error('Unexpected endpoint');
    }};
  vm.runInNewContext(source,context);
  return {nodes,google,apple,calls,memory,location,get assigned(){return assigned;}};
}
async function settled(s){
  for(let i=0;i<100;i++){
    if(s.nodes['account-delete-status'].textContent && !s.google.disabled)return;
    await new Promise(resolve=>setTimeout(resolve,2));
  }
  throw Error('UI did not settle');
}
test('disabled source makes no Auth calls and keeps confirmation disabled',async()=>{
  const s=setup({enabled:false});await s.google.dispatch('click');
  assert.equal(s.calls.length,0);assert.equal(s.nodes['account-delete-submit'].disabled,true);
  assert.match(s.nodes['account-delete-status'].textContent,/email/);
});
test('sign-in uses one-time S256 PKCE, same-origin callback and offline consent without storing Auth tokens',async()=>{
  const s=setup();await s.google.dispatch('click');
  const url=new URL(s.assigned);assert.equal(url.origin,config.url);assert.equal(url.searchParams.get('code_challenge_method'),'s256');
  assert.equal(url.searchParams.get('access_type'),'offline');assert.equal(url.searchParams.get('prompt'),'select_account consent');
  assert.equal(new URL(url.searchParams.get('redirect_to')).origin,s.location.origin);
  assert.equal(s.memory.size,1);assert.equal(s.calls.length,0);
});
test('wrong callback flow is scrubbed without exchanging or deleting',async()=>{
  const s=setup({callback:true,wrongFlow:true});await settled(s);
  assert.equal(s.calls.length,0);assert.equal(s.memory.size,0);assert.equal(s.location.href.includes('code='),false);
});
test('correct callback loads actual policy; unchecked form cannot delete; accepted request clears credentials',async()=>{
  const s=setup({callback:true});await settled(s);
  assert.equal(s.memory.size,0);assert.equal(s.nodes['account-delete-submit'].disabled,true);
  await s.nodes['account-delete-form'].dispatch('submit');assert.equal(s.calls.length,3);
  assert.match(s.nodes['account-delete-policy'].textContent,/30.*12.*30.*7/);
  assert.match(s.nodes['account-delete-policy'].textContent,/new wallet/);
  s.nodes['account-delete-confirm'].checked=true;await s.nodes['account-delete-confirm'].dispatch('change');
  assert.equal(s.nodes['account-delete-submit'].disabled,false);
  await s.nodes['account-delete-form'].dispatch('submit');
  assert.equal(s.nodes['account-delete-submit'].disabled,true);assert.equal(s.nodes['account-delete-confirm'].checked,false);
  const deletion=s.calls.find(c=>c.url.endsWith('/delete'));
  assert.deepEqual(JSON.parse(deletion.options.body),{confirmation:currentPolicy.revision,policy_id:currentPolicy.policy_id});
  assert.equal(deletion.options.headers.Authorization,'Bearer a.b.c');assert.equal(deletion.options.credentials,'omit');
  assert.match(s.nodes['account-delete-status'].textContent,/processing/);
  assert.equal([...s.memory.values()].some(v=>v.includes('refresh')),false);
});
test('invalid policy or failed deletion never reports completion or reuses confirmation',async()=>{
  const invalid=setup({callback:true,policyBad:true});await settled(invalid);
  assert.equal(invalid.nodes['account-delete-submit'].disabled,true);assert.match(invalid.nodes['account-delete-status'].textContent,/failed/);
  const s=setup({callback:true,failedDelete:true});await settled(s);
  s.nodes['account-delete-confirm'].checked=true;await s.nodes['account-delete-confirm'].dispatch('change');
  await s.nodes['account-delete-form'].dispatch('submit');
  assert.equal(s.nodes['account-delete-confirm'].checked,false);assert.equal(s.nodes['account-delete-submit'].disabled,true);
  assert.equal(s.nodes['account-delete-status'].textContent.includes('private failure'),false);
});

for(const policyOverride of [
  {revision:'member_deletion_v2_forfeit'}, {policy_id:'unknown'},
  {recovery_months:12}, {transaction_months:60}, {detail_days:31},
  {backup_days:31}, {deletion_target_days:8}, {detail_days:undefined},
]){
  test(`reject mismatched policy ${JSON.stringify(policyOverride)}`,async()=>{
    const s=setup({callback:true,policyOverride});await settled(s);
    assert.equal(s.nodes['account-delete-confirm'].disabled,true);
    assert.equal(s.nodes['account-delete-submit'].disabled,true);
    assert.equal(s.nodes['account-delete-policy'].textContent,'');
    s.nodes['account-delete-confirm'].checked=true;
    await s.nodes['account-delete-form'].dispatch('submit');
    assert.equal(s.calls.some(c=>c.url.endsWith('/delete')),false);
  });
}

test('disabled callback never exchanges credentials or requests deletion',async()=>{
  const s=setup({enabled:false,callback:true});
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(s.calls.length,0);
  assert.equal(s.nodes['account-delete-submit'].disabled,true);
  assert.equal(s.memory.size,0);
});

const trial = {
  policy_id:'ai_trial_5_12months_2026_10_26', confirmation:'ai_trial_v1_12months',credits:5,
  identity_scope:'verified_provider_account',retention:'12_months',
};
test('known trial exception is shown before deletion without granting a trial',async()=>{
  const s=setup({callback:true,policyOverride:{ai_trial:trial}});await settled(s);
  assert.match(s.nodes['account-delete-policy'].textContent,/무료 체험.*12개월/);
  assert.match(s.nodes['account-delete-policy'].textContent,/keyed redemption receipt.*12 months/);
  assert.equal(s.nodes['account-delete-confirm'].disabled,false);
  assert.equal(s.calls.some(c=>c.url.includes('ai-trial')),false);
  s.nodes['account-delete-confirm'].checked=true;await s.nodes['account-delete-confirm'].dispatch('change');
  await s.nodes['account-delete-form'].dispatch('submit');
  const deletion=s.calls.find(c=>c.url.endsWith('/delete'));
  assert.deepEqual(JSON.parse(deletion.options.body),{confirmation:currentPolicy.revision,policy_id:currentPolicy.policy_id});
});
for(const value of [null,[],{...trial,credits:10},{...trial,retention:'forever'},
  {...trial,policy_id:'unknown'},{...trial,identity_scope:'device'}]){
  test('unsupported trial retention policy keeps deletion disabled '+JSON.stringify(value),async()=>{
    const s=setup({callback:true,policyOverride:{ai_trial:value}});await settled(s);
    assert.equal(s.nodes['account-delete-submit'].disabled,true);
    assert.equal(s.nodes['account-delete-policy'].textContent,'');
    assert.equal(s.calls.some(c=>c.url.endsWith('/delete')),false);
  });
}
