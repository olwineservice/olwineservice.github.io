import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('support provides prominent bilingual deletion links before the FAQ sections', () => {
  const html = read('support.html');
  const intro = html.slice(html.indexOf('<main>'), html.indexOf('<section lang="ko">'));
  assert.match(intro, /<nav class="actions" aria-label="계정 관리 \/ Account management">/);
  assert.match(intro, /<a class="button" href="account-deletion\.html" lang="ko">회원 탈퇴 · 계정 삭제<\/a>/);
  assert.match(intro, /<a class="button secondary" href="account-deletion\.html" lang="en">Delete your account<\/a>/);
  assert.ok(read('account-deletion.html').includes('온라인 계정 삭제'));
});

test('support omits regional prices while preserving initial allowances in both languages', () => {
  const html = read('support.html');
  assert.doesNotMatch(html, /(?:KRW|USD|EUR|[₩$€£])\s*[\d,]+|[\d,]+\s*원/);
  assert.ok(!html.includes('Korean prices'));
  assert.ok(html.includes('가격과 통화는 국가·지역'));
  assert.ok(html.includes('Prices and currencies vary by country'));
  for (const credits of ['50', '150', '500', '1,000']) {
    assert.ok(html.includes(`${credits}크레딧`));
    assert.ok(html.includes(`${credits} credits`));
  }
  assert.ok(html.includes('매월 30크레딧'));
  assert.ok(html.includes('구매마다 200크레딧'));
  assert.ok(html.includes('Each top-up provides 200 credits'));
  assert.ok(html.includes('첫해 총 510크레딧'));
  assert.ok(html.includes('510 in the first year'));
  assert.ok(html.includes('새 상품 판매는 준비 중'));
  assert.ok(html.includes('외부 계정 삭제 페이지'));
});

test('published policy removes identity-based rejoin recovery and preserves separate logout semantics', () => {
  for (const file of ['support.html', 'privacy.html', 'terms.html', 'account-deletion.html']) {
    const html = read(file);
    for (const obsolete of ['기한 내 같은 로그인', '기한 안에 같은 로그인', '복구 기한', '재가입 복구 식별값', 'Within the recovery period', 'initial-grant history and benefit anchor, never']) {
      assert.ok(!html.includes(obsolete), `${file}: ${obsolete}`);
    }
    assert.ok(html.includes('새 지갑'), `${file}: new wallet Korean`);
    assert.ok(html.includes('new wallet'), `${file}: new wallet English`);
    assert.ok(html.includes('재설치'), `${file}: reinstall Korean`);
    assert.ok(html.includes('reinstall'), `${file}: reinstall English`);
  }
});

test('privacy describes separate fixed operational periods without a universal legal claim', () => {
  const html = read('privacy.html');
  for (const phrase of ['탈퇴 후 30일 이내', '최종 처리 중 늦은 시점부터 12개월', '생성일부터 최대 30일', '정상 처리 목표는 7일 이내', 'not universal statutory periods', 'not anonymous information']) {
    assert.ok(html.includes(phrase), phrase);
  }
});

test('online deletion uses production while HTML fails closed and retains an email path', () => {
  const config = read('account-deletion-config.js');
  assert.match(config, /enabled:\s*true/);
  assert.ok(config.includes('https://owfrxjapqbwhinfnkysk.supabase.co'));
  assert.match(config, /publicKey:\s*'sb_publishable_[^']+'/);
  const html = read('account-deletion.html');
  assert.match(html, /data-provider="google" disabled/);
  assert.match(html, /data-provider="apple" disabled/);
  assert.ok(html.includes('mailto:olwine.service@gmail.com'));
  assert.ok(html.includes('온라인 계정 삭제'));
  assert.ok(html.includes('Delete your account online'));
  assert.ok(!html.includes('Online requests are being prepared'));
});

test('both privacy languages disclose OAuth profile fields and current member flow', () => {
  const html = read('privacy.html');
  assert.ok(html.includes('공급자 식별자·이름·이메일'));
  assert.ok(html.includes('provider identifiers, names, email addresses'));
  assert.ok(!html.includes('server-side anonymous authentication'));
  assert.ok(html.includes('does not automatically create a member account'));
});
