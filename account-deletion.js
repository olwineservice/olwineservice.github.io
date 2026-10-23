/* No third-party scripts, analytics, cookies, or persistent Auth tokens. */
(() => {
  'use strict';
  const config = window.OLWINE_ACCOUNT_CONFIG;
  const form = document.getElementById('account-delete-form');
  if (!form) return;
  const status = document.getElementById('account-delete-status');
  const policyText = document.getElementById('account-delete-policy');
  const confirm = document.getElementById('account-delete-confirm');
  const submit = document.getElementById('account-delete-submit');
  const controls = form.querySelectorAll('button,input');
  const flowKey = 'olwine-account-delete-pkce-v1';
  let token = null, policy = null, busy = false;
  function configured() {
    if (!config?.enabled || !/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(config.url)) return false;
    if (typeof config.publicKey !== 'string') return false;
    if (config.publicKey.startsWith('sb_publishable_')) return config.publicKey.length > 20;
    try {
      const part = config.publicKey.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
      return JSON.parse(atob(part)).role === 'anon';
    } catch { return false; }
  }
  function message(text) { status.textContent = text; }
  function lock(value) {
    busy = value;
    controls.forEach(c => { c.disabled = value || !configured(); });
    submit.disabled = busy || !configured() || !token || !policy || !confirm.checked;
    confirm.disabled = busy || !token || !policy;
  }
  const encode = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const random = () => encode(crypto.getRandomValues(new Uint8Array(48)));
  async function request(path, body, authToken = token) {
    const response = await fetch(`${config.url}${path}`, {method:'POST',redirect:'error',credentials:'omit',cache:'no-store',
      headers:{apikey:config.publicKey,'Content-Type':'application/json',...(authToken?{Authorization:`Bearer ${authToken}`}:{})},
      body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
    if (!response.ok) throw Error('request_failed');
    return await response.json();
  }
  async function signIn(provider) {
    if (busy || !configured() || !['google','apple'].includes(provider)) return;
    lock(true);
    try {
      const verifier = random(), flow = random();
      const redirect = new URL(location.origin + location.pathname); redirect.searchParams.set('flow',flow);
      sessionStorage.setItem(flowKey,JSON.stringify({verifier,flow,provider,project:config.url,expires:Date.now()+600000}));
      const url = new URL(config.url + '/auth/v1/authorize');
      url.searchParams.set('provider',provider);url.searchParams.set('redirect_to',redirect.toString());
      url.searchParams.set('code_challenge_method','s256');
      url.searchParams.set('code_challenge',encode(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
      if(provider==='google'){url.searchParams.set('access_type','offline');url.searchParams.set('prompt','select_account consent');}
      location.assign(url.toString());
    } catch {
      try { sessionStorage.removeItem(flowKey); } catch { /* Storage can be disabled. */ }
      message('로그인을 시작하지 못했습니다. / Unable to start sign-in.');lock(false);
    }
  }
  async function finishSignIn() {
    const current = new URL(location.href);
    if (!current.searchParams.has('code') && !current.searchParams.has('error')) return;
    history.replaceState(null,'',location.origin+location.pathname);
    lock(true);
    try {
      const saved = sessionStorage.getItem(flowKey);sessionStorage.removeItem(flowKey);
      const pending = JSON.parse(saved);
      if (!configured() || !pending || pending.project!==config.url || !['apple','google'].includes(pending.provider) ||
        typeof pending.verifier!=='string' || !/^[\w-]{43,128}$/.test(pending.verifier) ||
        pending.expires<=Date.now() || current.hash || current.searchParams.getAll('flow').length!==1 ||
        pending.flow!==current.searchParams.get('flow') || current.searchParams.getAll('code').length!==1 ||
        current.searchParams.has('error') || current.searchParams.get('code').length>4096) throw Error('invalid_callback');
      const session = await request('/auth/v1/token?grant_type=pkce',{
        auth_code:current.searchParams.get('code'),code_verifier:pending.verifier},null);
      if(typeof session.access_token!=='string' || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(session.access_token)) throw Error('invalid_session');
      token = session.access_token;
      const state = await request('/functions/v1/account-lifecycle/v1/session',{
        ...(typeof session.provider_refresh_token==='string' && session.provider_refresh_token ?
          {credential:{provider:pending.provider,refresh_token:session.provider_refresh_token}}:{})});
      if(!['ok','deletion_pending'].includes(state.state)) throw Error('invalid_session');
      const value = await request('/functions/v1/account-lifecycle/v1/deletion-policy',{});
      if(value.revision!=='member_deletion_v3_minimal' ||
        value.policy_id!=='member_minimal_retention_2026_10_23' ||
        value.recovery_months!==0 || value.transaction_months!==12 ||
        value.detail_days!==30 || value.backup_days!==30 ||
        value.deletion_target_days!==7) throw Error('invalid_policy');
      policy = value;confirm.checked=false;
      policyText.textContent=`탈퇴 시 모든 잔액·로그인 복구 식별값·회원 최초 지급 이력을 삭제합니다. 재가입은 새 지갑이며 스토어에서 확인한 구매 권리만 복원합니다. 상세 AI 장부는 탈퇴 후 ${value.detail_days}일 이내, 최소 거래 기록은 권리·미완료 처리 종료 후 ${value.transaction_months}개월(충전권은 탈퇴·최종 처리 중 늦은 시점부터) 보관합니다. 백업은 생성일부터 최대 ${value.backup_days}일, 정상 삭제 목표는 ${value.deletion_target_days}일 이내입니다. / Deletion forfeits every credit and removes login-recovery identifiers and member initial-grant history. Rejoining starts a new wallet; only store-verified purchase rights can return. Detailed AI records are deleted within ${value.detail_days} days. Minimal transactions remain for ${value.transaction_months} months after rights/unfinished processing end (top-ups: from the later of deletion or final processing). Backups expire within ${value.backup_days} days of creation; normal deletion targets ${value.deletion_target_days} days.`;
      message(state.state==='deletion_pending'?'기존 삭제 요청이 처리 중입니다. 재인증 정보를 갱신했습니다. / Your deletion request is pending; reauthorization was updated.':'로그인 확인 완료. 아래 내용을 확인한 뒤 삭제를 요청하세요. / Signed in. Review and confirm before requesting deletion.');
    } catch {
      token=null;policy=null;message('로그인 또는 정책 확인에 실패했습니다. 다시 로그인하거나 이메일로 문의해 주세요. / Sign-in or policy check failed. Retry sign-in or contact support.');
    } finally { lock(false); }
  }
  form.addEventListener('submit',async event => {
    event.preventDefault();if(busy || !token || !policy || !confirm.checked)return;
    lock(true);
    try {
      const result=await request('/functions/v1/account-lifecycle/v1/delete',{confirmation:policy.revision,policy_id:policy.policy_id});
      if(result.state!=='accepted')throw Error('not_accepted');
      const old=token;token=null;policy=null;confirm.checked=false;policyText.textContent='';
      message('계정 삭제 요청이 접수되었습니다. 서버에서 처리 중이며 구독은 별도로 관리해 주세요. / Deletion request received and processing. Manage store subscriptions separately.');
      try {await request('/auth/v1/logout?scope=local',{},old);}catch{/* Accepted deletion is not reversed by logout failure. */}
    } catch {
      confirm.checked=false;policy=null;
      message('요청 결과를 확인하지 못했습니다. 다시 로그인하여 확인하거나 이메일로 문의해 주세요. / Could not confirm the outcome. Sign in again to check or contact support.');
    } finally { lock(false); }
  });
  form.querySelectorAll('[data-provider]').forEach(button=>button.addEventListener('click',()=>signIn(button.dataset.provider)));
  confirm.addEventListener('change',()=>lock(busy));
  lock(false);
  if(!configured())message('온라인 계정 삭제는 준비 중입니다. 아래 이메일로 삭제를 요청할 수 있습니다. / Online account deletion is being prepared. You can request deletion by email below.');
  void finishSignIn();
})();
