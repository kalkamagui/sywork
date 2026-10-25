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
test('일반 승용차 100% 환산 사유에 걸린 조건을 표시', function () {
  var newCar = cars([{ type: 'passenger', use: 'general', cc: 1600, age: 3, value: 15000000 }]).full[0];
  assert.ok(newCar.reason.indexOf('차령 10년 미만이면서 차량가액 1,000만원 이상') >= 0);
  var big = cars([{ type: 'passenger', use: 'general', cc: 2400, age: 12, value: 3000000 }]).full[0];
  assert.ok(big.reason.indexOf('2,000cc 이상') >= 0);
  assert.ok(big.reason.indexOf('차령 10년 미만') < 0);
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

test('자립 특례는 18~34세 자녀만: 35세 이상 자녀는 체크해도 산정 가구원에 포함', function () {
  var base = { y: 2026, m: 3 };
  var k = Calc.classifyChild({ name: '큰애', birth: '1986-01', school: 'none', raisedByApplicant: true, selfReliance: true }, base);
  assert.strictEqual(k.counted, true);
  // 18세 생일이 속한 달까지는 적용 안 함, 다음 달부터 적용 (p.64)
  assert.strictEqual(Calc.classifyChild({ birth: '2008-03', school: 'none', raisedByApplicant: true, selfReliance: true }, base).counted, true);
  assert.strictEqual(Calc.classifyChild({ birth: '2008-02', school: 'none', raisedByApplicant: true, selfReliance: true }, base).counted, false);
});
test('22세 미만 취학 자녀(산업기능요원 등)도 자립 특례 체크 시 지원·산정 가구원에서 제외', function () {
  var base = { y: 2026, m: 3 };
  var k = Calc.classifyChild({ name: '둘째', birth: '2006-01', school: 'univ', raisedByApplicant: true, selfReliance: true }, base);
  assert.strictEqual(k.supported, false);
  assert.strictEqual(k.counted, false);
  // 가구원수에도 반영: 신청인 + 막내 = 2인
  var r = evaluate({ children: [KID, { name: '둘째', birth: '2006-01', school: 'univ', raisedByApplicant: true, selfReliance: true }] });
  assert.strictEqual(r.countSize, 2);
});

// ---------- 결혼한 자녀 (p.57, p.61) ----------
test('결혼한 자녀는 18세 미만이어도 지원·산정 가구원에서 제외, 아동양육비 없음', function () {
  var married = { name: '둘째', birth: '2009-05', school: 'high', raisedByApplicant: true, married: true };
  var k = Calc.classifyChild(married, { y: 2026, m: 3 });
  assert.deepStrictEqual([k.supported, k.counted, k.childCare], [false, false, false]);
  var r = evaluate({ children: [KID, married] });
  assert.strictEqual(r.countSize, 2);
  assert.strictEqual(r.benefits.filter(function (b) { return b.name.indexOf('아동양육비 — ') === 0; }).length, 1);
});
test('결혼한 22세 미만 대학생 자녀도 가구원 제외', function () {
  var k = Calc.classifyChild({ birth: '2006-01', school: 'univ', raisedByApplicant: true, married: true }, { y: 2026, m: 3 });
  assert.deepStrictEqual([k.supported, k.counted], [false, false]);
});
test('생년월일이 없는 자녀는 산정 가구원이 아님 (소득표 열도 같은 기준)', function () {
  assert.strictEqual(Calc.classifyChild({ name: '셋째', birth: '', school: 'elem', raisedByApplicant: true }, { y: 2026, m: 3 }).counted, false);
});

// ---------- 30초 사전 확인: 보증금과 자가 주택 구분 (p.58, p.141) ----------
test('주택 전·월세보증금은 0.95를 곱해 주거용재산', function () {
  var a = fin({ depositHouse: 100000000 });
  assert.strictEqual(a.net.housing, 95000000 - 53000000);
});
test('조손가족: 실거주 주택은 제외하지만 전·월세보증금은 재산에 포함', function () {
  var house = evaluate({ familyType: 'grand', reason: 'grand', incomePersons: [], assets: { housePrice: 100000000, houseLiving: true } }).assets;
  assert.strictEqual(house.net.housing, 0);
  var dep = evaluate({ familyType: 'grand', reason: 'grand', incomePersons: [], assets: { depositHouse: 100000000 } }).assets;
  assert.strictEqual(dep.net.housing, 95000000 - 53000000);
});

// ---------- 다자녀 가구 자동차 (p.138) ----------
var MULTI_CAR = [{ type: 'passenger', use: 'general', cc: 2200, seats: 7, age: 11, value: 5000000 }];
test('다자녀 자동차 기준: 양육하는 18세 미만 자녀 2명이면 일반재산 4.17%', function () {
  var r = evaluate({ children: [KID, { name: '둘째', birth: '2016-05', school: 'elem', raisedByApplicant: true }], assets: { cars: MULTI_CAR } });
  assert.strictEqual(r.assets.cars.general.length, 1);
});
test('다자녀 자동차 기준: 양육하지 않거나 시설 입소 자녀는 세지 않음', function () {
  var notRaised = evaluate({ children: [KID, { name: '둘째', birth: '2016-05', school: 'elem', raisedByApplicant: false }], assets: { cars: MULTI_CAR } });
  assert.strictEqual(notRaised.assets.cars.general.length, 0);
  assert.strictEqual(notRaised.assets.cars.full.length, 1);
  var inst = evaluate({ children: [KID, { name: '둘째', birth: '2016-05', school: 'elem', raisedByApplicant: true, institution: true }], assets: { cars: MULTI_CAR } });
  assert.strictEqual(inst.assets.cars.full.length, 1);
});

// ---------- 7인 이상 가구 ----------
function sixKids() {
  var list = [];
  for (var i = 0; i < 6; i++) list.push({ name: '자녀' + i, birth: (2010 + i) + '-05', school: 'elem', raisedByApplicant: true });
  return list;
}
test('7인 가구: 사적이전소득·자연적 소비금액이 6인 기준으로 계산됐음을 경고', function () {
  var r = evaluate({ children: sixKids(), household: { privateRegular: 1500000 }, assets: { dispGeneral: 10000000, dispMonth: '2026-01' } });
  assert.strictEqual(r.countSize, 7);
  assert.ok(r.warnings.some(function (w) { return w.indexOf('사적이전소득') >= 0 && w.indexOf('6인') >= 0; }));
});
test('7인 가구라도 사적이전소득·처분 재산이 없으면 해당 경고 없음', function () {
  var r = evaluate({ children: sixKids() });
  assert.ok(!r.warnings.some(function (w) { return w.indexOf('사적이전소득') >= 0; }));
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
// 월별 지원: privateMonthly[0] = 기준월, [11] = 11개월 전 (순서는 계산 결과에 영향 없음)
function months(map) { var a = []; for (var i = 0; i < 12; i++) a.push(map[i] || 0); return a; }
test('지침 예시1: 후원자 둘이 매월 10만원씩 → 월 20만원은 15% 이하라 미반영', function () {
  var r = evaluate({ incomePersons: [], household: { privateRegular: 200000 } });
  assert.strictEqual(r.income.privateCount, 12);
  assert.strictEqual(r.income.privateCounted, 0);
});
test('지침 예시2: 6회(1~2월 40만, 3월 20만, 4~6월 70만) → 4~6월 초과분 210,318원 ÷ 12 = 17,526원', function () {
  var r = evaluate({ incomePersons: [], household: { privateMonthly: months({ 0: 400000, 1: 400000, 2: 200000, 3: 700000, 4: 700000, 5: 700000 }) } });
  assert.strictEqual(r.income.privateCount, 6);
  assert.strictEqual(r.income.privateIsRegular, true);
  assert.strictEqual(Math.round(r.income.privateExcessYear), 210318);
  assert.strictEqual(Math.floor(r.income.privateCounted), 17526);
});
// 지침 p.102 예시3은 본문에 "A 3회 각 100만원 + B 60만원(총 360만원)"이라 적었지만, 계산식(570,106원×2 + 1,170,106원)은
// 1~2월 120만원·3월 180만원 기준이다. 결과값(17,556원)이 나오는 계산식 쪽 금액으로 확인한다.
test('지침 예시3: 4건(1~2월 120만, 3월 180만) → 초과분 2,310,318원 − 중위 50% 2,099,646원 = 210,672원 ÷ 12 = 17,556원', function () {
  var r = evaluate({ incomePersons: [], household: { privateMonthly: months({ 0: 1200000, 1: 1200000, 2: 1800000 }), privateCount: '4' } });
  assert.strictEqual(r.income.privateIsRegular, false);
  assert.strictEqual(Math.round(r.income.privateExcessYear), 2310318);
  assert.strictEqual(Math.floor(r.income.privateCounted), 17556);
});
test('6회 미만이고 합계가 중위 50% 이하이면 미반영', function () {
  var r = evaluate({ incomePersons: [], household: { privateMonthly: months({ 0: 1500000, 1: 1500000 }) } });
  assert.strictEqual(r.income.privateCount, 2);
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

// ---------- 대학생 등록금 지출 공제 (p.91) ----------
test('등록금 300만원 → 월 50만원 공제 (지침 예시: 근로소득공제 후 추가 공제)', function () {
  var r = evaluate({ applicant: { birth: '1995-01' }, incomePersons: [{ name: '신청인', birth: '1995-01', regular: 2000000 }], household: { tuition: 3000000 } });
  assert.strictEqual(Math.round(r.income.tuitionDeduct), 500000);
  assert.strictEqual(Math.round(r.income.eval), 480000);
});
test('등록금 공제는 공제 후 근로·사업소득을 넘지 않음', function () {
  var r = evaluate({ applicant: { birth: '1995-01' }, incomePersons: [{ name: '신청인', birth: '1995-01', regular: 1000000, pension: 300000 }], household: { tuition: 6000000 } });
  // 100만 − (60만 + 40만×30%) = 28만까지만 공제, 연금소득 30만은 그대로 반영
  assert.strictEqual(Math.round(r.income.tuitionDeduct), 280000);
  assert.strictEqual(Math.round(r.income.eval), 300000);
});

// ---------- 주택·농지연금 (p.100) ----------
test('주택연금 월 100만원은 50%만 소득 반영, 누적 수령액은 부채', function () {
  var r = evaluate({ incomePersons: [], household: { homePension: 1000000 }, assets: { homePensionTotal: 30000000 } });
  assert.strictEqual(r.income.homePensionCounted, 500000);
  assert.strictEqual(r.assets.debt, 30000000);
});

// ---------- 기타 산정되는 재산 (p.140~144) ----------
test('주택 5,000만원 처분, 4,000만원 사용 확인 → 일반 1,000만원 (지침 p.142 예시)', function () {
  var a = fin({ dispGeneral: 50000000, dispUsed: 40000000 });
  assert.strictEqual(a.disposed.general, 10000000);
});
test('자연적 소비금액: 2인가구 중위 50% × 경과 개월(처분 월~기준월)', function () {
  // 2026-01 ~ 2026-03 = 3개월 × 2,099,646원 = 6,298,938원
  var a = fin({ dispFinancial: 20000000, dispMonth: '2026-01' });
  assert.strictEqual(Math.round(a.disposed.financial), 20000000 - 6298938);
});
test('2021.6.30 이전 처분 재산은 5년이 지나면 제외', function () {
  // 5년 경과: 제외 / 5년 미경과: 반영 (59개월 자연적 소비금액 약 1억 2,388만원을 넘는 금액으로 확인)
  assert.strictEqual(fin({ dispGeneral: 500000000, dispMonth: '2021-05' }, '2026-06').disposed.general, 0);
  assert.ok(fin({ dispGeneral: 500000000, dispMonth: '2021-05' }, '2026-03').disposed.general > 0);
});

// ---------- 재산범위 특례 (p.153~155) ----------
var SMALL = { housePrice: 80000000, houseLiving: true, financial: 10000000 };
test('근로무능력 가구: 순재산 9,100만원·금융 3,400만원 이내(그 외 지역)면 재산 전체 소득환산 제외', function () {
  assert.ok(fin(SMALL).total > 0);
  var a = fin(Object.assign({ allIncapable: true }, SMALL));
  assert.strictEqual(a.special.applied, 'allIncapable');
  assert.strictEqual(a.total, 0);
});
test('금융재산 기준 초과 시 특례 미적용, 재산가액만 상승한 기존 가구는 3년 추가보장', function () {
  var over = Object.assign({ allIncapable: true }, SMALL, { housePrice: 50000000, financial: 40000000 });
  assert.strictEqual(fin(over).special.applied, null);
  assert.strictEqual(fin(Object.assign({ priceRiseOnly: true }, over)).special.applied, 'allIncapable');
});
test('100% 환산 자동차가 있으면 특례 미적용', function () {
  var a = fin(Object.assign({ allIncapable: true, cars: [{ type: 'passenger', use: 'general', cc: 2500, age: 2, value: 5000000 }] }, SMALL));
  assert.strictEqual(a.special.applied, null);
});
test('처분 곤란 재산은 기준 충족 시 그 재산만 소득환산 제외', function () {
  var a = fin({ otherBuilding: 80000000, hardAsset: 30000000 });
  assert.strictEqual(a.special.applied, 'hardAsset');
  // 일반재산 8,000만 − 처분곤란 3,000만 − 기본재산 5,300만 → 0
  assert.strictEqual(a.net.general, 0);
});
test('위원회 의결 제외 재산을 먼저 빼고 기본재산액 차감', function () {
  var a = fin({ otherBuilding: 100000000, committeeExcluded: 40000000 });
  assert.strictEqual(a.net.general, 100000000 - 40000000 - 53000000);
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
