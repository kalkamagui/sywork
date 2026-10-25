/*
 * 계산 로직 회귀 테스트 — 설치 없이 실행: node tests/calculator.test.js
 * 괄호 안 쪽수는 「2026년 한부모가족지원사업 안내」 인쇄 쪽수
 */
var assert = require('assert');
var Calc = require('../js/calculator.js');

var KID = { name: '막내', birth: '2015-05', school: 'elem', raisedByApplicant: true };
var AP = { birth: '1985-01' };
var WORK = [{ name: '신청인', birth: '1985-01', regular: 1000000 }];

function evaluate(over) {
  return Calc.evaluate(Object.assign({
    baseMonth: '2026-03', region: 'other', familyType: 'single', reason: 'divorce',
    applicant: AP, children: [KID], incomePersons: WORK, household: {}, assets: {}
  }, over));
}
function cars(list, applicant) { return evaluate({ applicant: applicant || AP, assets: { cars: list } }).assets.cars; }

var tests = [];
function test(name, fn) { tests.push({ name: name, fn: fn }); }

// ---------- 자동차 (p.135~138) ----------
test('생업용 3,000cc 승용은 재산 제외가 아니라 월 100% 환산', function () {
  var r = evaluate({ assets: { cars: [{ type: 'passenger', use: 'business', cc: 3000, age: 2, value: 40000000 }] } });
  assert.strictEqual(r.assets.cars.excluded.length, 0);
  assert.strictEqual(r.assets.cars.full.length, 1);
  assert.strictEqual(r.eligible, false);
});
test('생업용 1,600cc 승용은 재산 제외', function () {
  var c = cars([{ type: 'passenger', use: 'business', cc: 1600, age: 2, value: 20000000 }]);
  assert.strictEqual(c.excluded.length, 1);
});
test('생업용 화물차·11인승 승합은 배기량과 무관하게 재산 제외', function () {
  assert.strictEqual(cars([{ type: 'truckL', use: 'business', cc: 5000, value: 50000000 }]).excluded.length, 1);
  assert.strictEqual(cars([{ type: 'vanL', use: 'business', cc: 2900, seats: 12, value: 30000000 }]).excluded.length, 1);
  assert.strictEqual(cars([{ type: 'vanL', use: 'business', cc: 2900, seats: 9, value: 30000000 }]).excluded.length, 0);
});
test('일반가구: 생업용 1 + 일반재산 1까지, 3번째 차는 100%', function () {
  var c = cars([
    { type: 'truck', use: 'business', cc: 2500, age: 3, value: 20000000 },
    { type: 'passenger', use: 'general', cc: 1000, age: 12, value: 3000000 },
    { type: 'passenger', use: 'general', cc: 1200, age: 11, value: 2000000 }
  ]);
  assert.deepStrictEqual([c.excluded.length, c.general.length, c.full.length], [1, 1, 1]);
});
test('장애인가구: 장애인사용 1 + (생업용 또는 일반재산) 1, 3번째 차는 100%', function () {
  var r = evaluate({ applicant: { birth: '1985-01', disabled: true }, assets: { cars: [
    { type: 'passenger', use: 'disabled', cc: 1600, age: 3, value: 15000000 },
    { type: 'truck', use: 'business', cc: 2500, age: 3, value: 20000000 },
    { type: 'passenger', use: 'general', cc: 1000, age: 12, value: 3000000 }
  ] } });
  var c = r.assets.cars;
  assert.deepStrictEqual([c.excluded.length, c.general.length, c.full.length], [2, 0, 1]);
  assert.strictEqual(c.full[0].value, 3000000);
  assert.strictEqual(r.eligible, false);
});
test('장애인사용(심한 장애) 2,800cc 승합은 재산 제외 아님', function () {
  var c = cars([{ type: 'van', use: 'disabled', cc: 2800, age: 3, value: 30000000 }]);
  assert.strictEqual(c.excluded.length, 0);
  assert.strictEqual(c.full.length, 1);
});
test('장애인사용(심한 장애) 2,000~2,500cc 미만은 일반재산 4.17%', function () {
  var c = cars([{ type: 'passenger', use: 'disabled', cc: 2200, age: 3, value: 25000000 }]);
  assert.strictEqual(c.general.length, 1);
});
test('그 외 장애·보철용 2,000cc 미만 승용은 재산 제외가 아니라 일반재산 4.17%', function () {
  var c = cars([{ type: 'passenger', use: 'disabledMild', cc: 1600, age: 3, value: 15000000 }]);
  assert.deepStrictEqual([c.excluded.length, c.general.length], [0, 1]);
});
test('260cc 이하 이륜차 2대는 보유 한도와 별도로 일반재산, 3대째는 100%', function () {
  var c = cars([
    { type: 'passenger', use: 'general', cc: 1000, age: 12, value: 3000000 },
    { type: 'moto', use: 'general', cc: 125, value: 1000000 },
    { type: 'moto', use: 'general', cc: 125, value: 900000 },
    { type: 'moto', use: 'general', cc: 125, value: 800000 }
  ]);
  assert.deepStrictEqual([c.general.length, c.full.length], [3, 1]);
});
test('예전 저장 파일의 차종 other(중형 이상 승합·화물)도 계산됨', function () {
  assert.strictEqual(cars([{ type: 'other', use: 'general', value: 5000000 }]).full.length, 1);
});
test('생업용 차를 제외했는데 근로·사업소득이 없으면 최저임금 기준 소득 안내', function () {
  var r = evaluate({ incomePersons: [], assets: { cars: [{ type: 'truck', use: 'business', cc: 2500, value: 20000000 }] } });
  assert.ok(r.warnings.some(function (w) { return w.indexOf('1,238,400원') >= 0; }));
});

// ---------- 자립지원 별도가구 특례 자녀 (p.59, p.63) ----------
test('연령초과 + 자립 특례 자녀는 소득인정액 산정 가구원에서 제외', function () {
  var base = { y: 2026, m: 3 };
  var k = Calc.classifyChild({ name: '큰애', birth: '2003-01', school: 'none', raisedByApplicant: true, selfReliance: true }, base);
  assert.strictEqual(k.counted, false);
  // 18세 미만이면 특례 체크와 무관하게 지원 가구원
  var y = Calc.classifyChild({ name: '막내', birth: '2015-05', school: 'elem', raisedByApplicant: true, selfReliance: true }, base);
  assert.strictEqual(y.counted, true);
});

// ---------- 정기지원 사적이전소득 (p.100~102) ----------
test('정기 지원 + 양육비 합계에서 기준중위소득 15%를 한 번만 제외', function () {
  // 2인가구 15% = 629,893.8원 (지침 예시 629,894원)
  var r = evaluate({ incomePersons: [], household: { privateRegular: 400000, childSupport: 300000 } });
  assert.strictEqual(Math.round(r.income.privateExempt), 629894);
  assert.strictEqual(Math.round(r.income.privateCounted), 70106);
  assert.strictEqual(Math.round(r.income.eval), 70106);
});
test('양육비만 받아도 15% 이하이면 미반영', function () {
  var r = evaluate({ incomePersons: [], household: { childSupport: 300000 } });
  assert.strictEqual(r.income.privateCounted, 0);
});

// ---------- 긴급복지 생계지원·교육지원 구분 (p.176, p.178) ----------
test('긴급 생계지원은 생활보조금만, 교육지원은 학용품비만 제외', function () {
  function names(r) { return r.benefits.filter(function (b) { return b.amount > 0; }).map(function (b) { return b.name.split(' — ')[0]; }); }
  var living = evaluate({ facility: true, emergencyLiving: true });
  assert.ok(names(living).indexOf('아동교육지원비(학용품비)') >= 0);
  assert.ok(names(living).indexOf('생활보조금') < 0);
  var edu = evaluate({ facility: true, emergencyEdu: true });
  assert.ok(names(edu).indexOf('아동교육지원비(학용품비)') < 0);
  assert.ok(names(edu).indexOf('생활보조금') >= 0);
});

// ---------- 장기금융저축공제 (p.130~131) ----------
function fin(assets, baseMonth) {
  return evaluate({ incomePersons: [], baseMonth: baseMonth || '2026-03', assets: assets }).assets;
}
test('신규 신청: 장기저축 1,800만원 중 첫해 한도 500만원 공제 (지침 사례3)', function () {
  var a = fin({ financial: 30000000, longSavings: 18000000 });
  assert.strictEqual(a.longDeduct, 5000000);
});
test('2025년 결정된 기존 수급자: 2026년 2년차 누적 한도 1,000만원', function () {
  assert.strictEqual(fin({ financial: 30000000, longSavings: 18000000, longSavingsStartYear: '2025' }).longDeduct, 10000000);
});
test('총한도 1,500만원, 장기저축 잔액·금융재산을 넘지 않음', function () {
  assert.strictEqual(fin({ financial: 30000000, longSavings: 18000000, longSavingsStartYear: '2020' }).longDeduct, 15000000);
  assert.strictEqual(fin({ financial: 30000000, longSavings: 3000000, longSavingsStartYear: '2020' }).longDeduct, 3000000);
  // 생활준비금 500만원을 먼저 뺀 뒤 남은 금융재산까지만
  assert.strictEqual(fin({ financial: 8000000, longSavings: 8000000, longSavingsStartYear: '2020' }).longDeduct, 3000000);
});
test('장기저축공제 후 금융재산 6.26% 환산', function () {
  // 금융 3,000만 − 생활준비금 500만 − 장기저축 500만 = 2,000만 (그 외 지역 기본재산 5,300만이 먼저 차감되므로 재산 더 추가)
  var a = fin({ financial: 30000000, longSavings: 18000000, otherBuilding: 53000000 });
  assert.strictEqual(a.net.financial, 20000000);
  assert.strictEqual(Math.round(a.conv.financial), 1252000);
});

// ---------- 임대보증금 부채 한 채 제한 (p.145) ----------
function rentDebt(extra, baseMonth) {
  return fin(Object.assign({ otherBuilding: 300000000, debtRentDeposit: 50000000, debtRentDepositOther: 30000000 }, extra), baseMonth).debt;
}
test('여러 채 보유: 임대보증금 부채는 한 채분만 인정', function () {
  assert.strictEqual(rentDebt({}), 50000000);
});
test('유예 대상 기존 수급자는 2026년까지 2채째부터도 인정, 2027.1월부터 한 채분만', function () {
  assert.strictEqual(rentDebt({ debtRentGrace: true }, '2026-12'), 80000000);
  assert.strictEqual(rentDebt({ debtRentGrace: true }, '2027-01'), 50000000);
});

// ---------- 기존 수치 (p.58, p.88~90, p.171) ----------
test('34세 이하 월급 200만원 → 60만 + 140만×30% = 102만원 공제', function () {
  var r = evaluate({ applicant: { birth: '1995-01' }, incomePersons: [{ name: '신청인', birth: '1995-01', regular: 2000000 }] });
  assert.strictEqual(Math.round(r.income.totalDeduct), 1020000);
});
test('2인가구 65% 기준 2,729,540원, 아동양육비 월 23만원', function () {
  var r = evaluate({});
  assert.strictEqual(r.line65, 2729540);
  assert.ok(r.benefits.some(function (b) { return b.amount === 230000 && b.unit === '월'; }));
});

var failed = 0;
tests.forEach(function (t) {
  try { t.fn(); console.log('  ok   ' + t.name); }
  catch (e) { failed++; console.log('  FAIL ' + t.name + '\n       ' + e.message.split('\n')[0]); }
});
console.log('\n' + (tests.length - failed) + '/' + tests.length + ' passed');
process.exit(failed ? 1 : 0);
