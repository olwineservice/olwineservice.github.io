import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('plan tables contain the confirmed Korean prices and initial allowances in both languages', () => {
  const html = read('support.html');
  for (const amount of ['1,900', '10,900', '24,900', '2,900', '14,900', '34,900', '4,900', '54,900', '7,900', '74,900']) {
    assert.ok(html.includes(`${amount}원`), amount);
    assert.ok(html.includes(`KRW ${amount}`), amount);
  }
  for (const credits of ['50', '150', '500', '1,000']) {
    assert.ok(html.includes(`${credits}크레딧`));
    assert.ok(html.includes(`${credits} credits`));
  }
  assert.ok(html.includes('매월 30크레딧'));
  assert.ok(html.includes('KRW 1,900 for 200 credits'));
  assert.ok(html.includes('첫해 총 510크레딧'));
  assert.ok(html.includes('510 in the first year'));
  assert.ok(html.includes('Google/Apple 로그인, 새 상품 구매와 온라인 계정 삭제는 아직 준비 중'));
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

test('online deletion stays disabled and has a script-independent email path', () => {
  assert.match(read('account-deletion-config.js'), /enabled:\s*false/);
  const html = read('account-deletion.html');
  assert.match(html, /data-provider="google" disabled/);
  assert.match(html, /data-provider="apple" disabled/);
  assert.ok(html.includes('mailto:olwine.service@gmail.com'));
  assert.ok(html.includes('온라인 삭제 준비 중'));
  assert.ok(html.includes('Online deletion is in preparation'));
});
