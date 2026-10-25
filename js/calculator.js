/*
 * 한부모가족 지원대상 판정 및 복지급여 모의계산
 * 입력(input) 구조는 app.js 의 collectInput() 참고.
 * 모든 금액은 원 단위. 소득은 월 금액, 재산은 가액.
 */
(function (root) {
  var R = (typeof RULES !== 'undefined') ? RULES : require('./rules2026.js');

  // ---------- 날짜/연령 ----------
  function parseYM(dateStr) {
    if (!dateStr) return null;
    var m = String(dateStr).match(/^(\d{4})-(\d{1,2})/);
    if (!m) return null;
    return { y: +m[1], m: +m[2] };
  }
  function monthIndex(ym) { return ym.y * 12 + (ym.m - 1); }

  // "N세가 되는 생일이 속한 달의 전 달까지" 해당하면 true
  function underAge(birth, base, age) {
    var b = parseYM(birth);
    if (!b) return false;
    return monthIndex(base) < (b.y + age) * 12 + (b.m - 1);
  }
  // 만 나이 (월 단위 기준, 표시용)
  function ageInYears(birth, base) {
    var b = parseYM(birth);
    if (!b) return null;
    return Math.floor((monthIndex(base) - monthIndex(b)) / 12);
  }

  function num(v) {
    var n = Number(String(v == null ? '' : v).replace(/[^\d.-]/g, ''));
    return isFinite(n) && n > 0 ? n : 0;
  }
  function won(n) { return Math.round(n).toLocaleString('ko-KR') + '원'; }
  function man(n) { return (n / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 1 }) + '만원'; }

  function threshold(table, size) {
    if (size < 2) return null;
    return table[size] || null;
  }

  // ---------- 자녀 분류 ----------
  var SCHOOL_LABEL = { none: '미취학/비취학', pre: '미취학', elem: '초등학생', mid: '중학생', high: '고등학생', univ: '대학생' };

  function classifyChild(c, base) {
    var res = {
      name: c.name || '자녀',
      age: ageInYears(c.birth, base),
      school: c.school || 'none',
      supported: false,       // 지원대상 가구원
      counted: false,         // 소득인정액 산정 가구원
      childCare: false,       // 아동양육비 대상 연령·학적
      under6: false,
      under2: false,
      schoolSupplies: false,
      notes: []
    };
    if (!c.birth) { res.notes.push('생년월일 미입력'); return res; }
    if (c.raisedByApplicant === false) {
      res.notes.push('신청인이 실제 양육하지 않는 자녀 → 지원·산정 가구원에서 제외(FAQ 25)');
      return res;
    }
    if (c.institution) {
      res.notes.push('아동복지시설 입소·소년원 등 수용 중 → 지원가구원 제외(p.56)');
      return res;
    }
    var schooling = ['elem', 'mid', 'high', 'univ'].indexOf(res.school) >= 0 || c.schooling;
    var studentLimit = R.age.childStudent;
    var militaryMonths = num(c.militaryMonths);
    var under18 = underAge(c.birth, base, R.age.child);
    var under22 = underAge(c.birth, base, studentLimit);
    var underMil = false;
    if (militaryMonths > 0 && schooling) {
      // 병역의무 이행기간 가산 (최대 25세 생일 전달)
      var b = parseYM(c.birth);
      var limitIdx = Math.min((b.y + studentLimit) * 12 + (b.m - 1) + militaryMonths,
                              (b.y + R.age.childMilitaryMax) * 12 + (b.m - 1));
      underMil = monthIndex(base) < limitIdx;
    }

    if (under18 || (schooling && (under22 || underMil))) {
      res.supported = true;
      res.counted = true;
      if (!under18) {
        res.notes.push(underMil && !under22
          ? '18세 이상 취학 자녀(병역의무 이행기간 가산) → 지원가구원'
          : '18세 이상 취학 자녀 → 22세 생일 전달까지 지원가구원');
      }
    } else {
      // 연령초과 자녀: 지원대상 제외, 결혼하지 않았으면 소득인정액 산정 가구원 포함
      if (c.married) {
        res.notes.push('연령초과·결혼한 자녀 → 지원·산정 모두 제외(p.61)');
      } else if (c.selfReliance) {
        res.notes.push('연령초과 취·창업 자녀(자립지원 별도가구 특례) → 산정 가구원에서도 제외(p.63)');
      } else {
        res.counted = true;
        res.notes.push('연령초과 자녀 → 지원대상 제외, 소득인정액 산정 가구원에는 포함(p.59)');
      }
      return res;
    }

    // 아동양육비: 18세 미만, 또는 고등학교 이하 재학 중 22세 미만 (대학생 제외)
    var hsOrBelow = ['elem', 'mid', 'high'].indexOf(res.school) >= 0;
    if (under18 || (hsOrBelow && under22)) res.childCare = true;
    else res.notes.push('대학생 등 18세 이상 → 가구원으로는 지원되나 아동양육비 대상 아님');
    if (c.leaveOfAbsence && !under18 && hsOrBelow) {
      res.childCare = false;
      res.notes.push('18세 이상 고교 휴학 중 → 아동양육비 제외(p.56)');
    }
    res.under6 = underAge(c.birth, base, R.age.extraChild);
    res.under2 = underAge(c.birth, base, R.age.youthInfant);
    res.schoolSupplies = hsOrBelow && !c.leaveOfAbsence;
    return res;
  }

  // ---------- 근로·사업소득 공제 ----------
  function earnedDeduction(earned, person) {
    if (earned <= 0) return { amount: 0, label: '해당 없음' };
    var D = R.earnedDeduction;
    var opts = [{ amount: earned * D.basicRate, label: '기본 30% 공제' }];
    function fixedRate(o, label) {
      var a = Math.min(earned, o.fixed) + Math.max(0, earned - o.fixed) * o.rate;
      opts.push({ amount: a, label: label });
    }
    if (person.under35 || person.univ) fixedRate(D.young, (person.univ ? '대학생' : '34세 이하') + ' 60만원 + 나머지 30% 공제');
    if (person.age65 || person.disabled || person.nkDefector || (person.student && !person.under35)) {
      fixedRate(D.senior, '65세 이상·장애인 등 20만원 + 나머지 30% 공제');
    }
    if (person.rehab) fixedRate(D.rehab, '장애인 직업재활 20만원 + 나머지 50% 공제');
    opts.sort(function (a, b) { return b.amount - a.amount; });
    return { amount: Math.min(earned, opts[0].amount), label: opts[0].label };
  }

  // ---------- 자동차 분류 ----------
  function classifyCars(cars, ctx) {
    var C = R.car;
    var out = { excluded: [], general: [], full: [] };
    var usedDisabled = false, usedBusiness = false, usedGeneral = false;
    (cars || []).forEach(function (car, i) {
      var v = num(car.value);
      if (!v && !car.type) return;
      var item = { idx: i + 1, value: v, label: (car.name || ('자동차 ' + (i + 1))) };
      var cc = num(car.cc), age = num(car.age), seats = num(car.seats);
      var oldOrCheap = age >= C.oldYears || v < C.lowValue;
      if (car.use === 'disabled' && !usedDisabled && (cc < C.ccLimit || car.type !== 'passenger')) {
        usedDisabled = true; item.reason = '장애인사용자동차(가구별 1대) → 재산가액 산정 제외';
        out.excluded.push(item); return;
      }
      if (car.use === 'business' && !usedBusiness) {
        usedBusiness = true; item.reason = '생업용자동차(가구별 1대) → 재산가액 산정 제외 (소득 파악 필요)';
        out.excluded.push(item); return;
      }
      var generalOk = false, why = '';
      if (car.type === 'moto' && cc <= C.motorcycleCc) { generalOk = true; why = '260cc 이하 이륜자동차'; }
      else if (car.type === 'passenger' && cc < C.ccLimit && oldOrCheap) { generalOk = true; why = '2,000cc 미만 + 차령 10년 이상 또는 1,000만원 미만'; }
      else if (car.type === 'passenger' && ctx.kidsUnder18 >= C.multiChildMinKids && cc < C.multiChildCcLimit && seats >= C.multiChildSeats && oldOrCheap) {
        generalOk = true; why = '자녀 2명 이상 가구 2,500cc 미만 7인승 이상 + 차령 10년 이상 또는 1,000만원 미만';
      }
      else if ((car.type === 'van' || car.type === 'truck') && oldOrCheap) { generalOk = true; why = '소형 이하 승합·화물 + 차령 10년 이상 또는 1,000만원 미만'; }
      if (generalOk && !usedGeneral) { // 일반재산 환산 자동차는 가구당 1대
        usedGeneral = true; item.reason = '일반재산 환산율(월 4.17%) 적용: ' + why;
        out.general.push(item); return;
      }
      item.reason = generalOk ? '일반재산 환산 자동차 보유한도 초과 → 월 100% 환산' : '일반재산 환산 요건 미충족 → 월 100% 환산';
      out.full.push(item);
    });
    return out;
  }

  // ---------- 재산의 소득환산액 ----------
  function assetConversion(a, ctx) {
    var region = R.regions[ctx.region] || R.regions.other;
    var steps = [];
    var housing = 0, general = 0, financial = 0;

    var housePrice = num(a.housePrice);
    if (housePrice) {
      if (ctx.grand && a.houseLiving) {
        steps.push('조손가족: 실거주 주택 ' + won(housePrice) + ' 재산 산정 제외(p.60)');
      } else if (a.houseLiving) { housing += housePrice; }
      else { general += housePrice; steps.push('거주하지 않는 주택 → 일반재산'); }
    }
    var depHouse = num(a.depositHouse);
    if (depHouse) {
      housing += depHouse * R.rentDepositRatio;
      steps.push('주택 전·월세보증금 ' + won(depHouse) + ' × 0.95 = ' + won(depHouse * R.rentDepositRatio) + ' → 주거용재산');
    }
    var land = num(a.land);
    if (land && ctx.grand) { steps.push('조손가족: 토지 ' + won(land) + ' 재산 산정 제외(p.60)'); land = 0; }
    general += num(a.otherBuilding) + land + num(a.depositShop) + num(a.depositOther) + num(a.movable);

    var cars = classifyCars(a.cars, ctx);
    var car100 = 0;
    cars.general.forEach(function (c) { general += c.value; });
    cars.full.forEach(function (c) { car100 += c.value; });

    if (housing > region.housingCap) {
      var over = housing - region.housingCap;
      steps.push('주거용재산 한도(' + region.label + ' ' + won(region.housingCap) + ') 초과분 ' + won(over) + ' → 일반재산');
      general += over; housing = region.housingCap;
    }

    var finRaw = num(a.financial);
    financial = Math.max(0, finRaw - R.livingReserve);
    if (finRaw) steps.push('금융재산 ' + won(finRaw) + ' − 생활준비금 ' + won(R.livingReserve) + ' = ' + won(financial));

    var gross = { housing: housing, general: general, financial: financial, car100: car100 };

    // 기본재산액 → 부채 순으로 주거용 → 일반 → 금융 차감 (100% 자동차에는 미적용)
    var debt = num(a.debtFin) + num(a.debtOther) + num(a.debtRentDeposit) + num(a.debtCourt);
    function deduct(amount, label) {
      var left = amount;
      ['housing', 'general', 'financial'].forEach(function (k) {
        var d = Math.min(left, gross[k]);
        gross[k] -= d; left -= d;
      });
      steps.push(label + ' ' + won(amount) + ' 차감(주거용 → 일반 → 금융 순)' + (left > 0 ? ', 남은 ' + won(left) + '은 반영 안 됨' : ''));
    }
    deduct(region.basic, '기본재산액(' + region.label + ')');
    if (debt) deduct(debt, '부채');

    var conv = {
      housing: gross.housing * R.conversion.housing,
      general: gross.general * R.conversion.general,
      financial: gross.financial * R.conversion.financial,
      car100: gross.car100 * R.conversion.car100
    };
    var total = conv.housing + conv.general + conv.financial + conv.car100;
    return { net: gross, conv: conv, total: total, steps: steps, cars: cars, debt: debt, region: region };
  }

  // ---------- 메인 판정 ----------
  function evaluate(input) {
    var base = parseYM(input.baseMonth) || { y: R.year, m: 1 };
    var warnings = [], reasons = [];
    var ap = input.applicant || {};
    var grand = input.familyType === 'grand';

    var apAge = ageInYears(ap.birth, base);
    var youth = !grand && ap.birth && underAge(ap.birth, base, R.age.youthParent);
    var under35 = ap.birth && underAge(ap.birth, base, R.age.youngAdultParentMax);
    var youngAdult = !grand && !youth && under35;
    var age65 = ap.birth && !underAge(ap.birth, base, R.earnedDeduction.seniorAge);
    if (!ap.birth) warnings.push('신청인 생년월일을 입력해야 청소년한부모·청년한부모 여부와 근로소득공제를 정확히 판정할 수 있습니다.');

    // 자녀 분류
    var kids = (input.children || []).map(function (c) { return classifyChild(c, base); });
    var supportedKids = kids.filter(function (k) { return k.supported; });
    var countedKids = kids.filter(function (k) { return k.counted; });
    var kidsUnder18 = (input.children || []).filter(function (c) { return c.birth && underAge(c.birth, base, R.age.child); }).length;

    var spouseIncluded = !grand && input.reason === 'spouseDisabled';
    var supportSize = 1 + (spouseIncluded ? 1 : 0) + supportedKids.length;
    var countSize = 1 + (spouseIncluded ? 1 : 0) + countedKids.length;

    // 가구 유형
    var typeLabel;
    if (grand) typeLabel = '조손가족';
    else if (youth) typeLabel = '청소년 한부모가족';
    else typeLabel = '한부모가족' + (input.unmarried ? ' (미혼 한부모)' : '');

    // 기본 요건
    var eligibleBasic = true;
    if (!supportedKids.length) {
      eligibleBasic = false;
      reasons.push('지원대상 자녀(18세 미만, 취학 시 22세 미만)가 없어 한부모가족 지원대상이 아닙니다(p.43). 단, 출산 전 임신부·미혼모자가족복지시설 이용 미혼모는 예외.');
    }
    if (input.reason === 'none') {
      eligibleBasic = false;
      reasons.push('한부모가족의 "모·부" 요건(사별·이혼·유기, 배우자 장애, 미혼, 생사불명, 가정폭력 가출, 배우자 군복무·장기복역 등)에 해당하지 않습니다(p.45).');
    }
    if (input.cohabitWithEx) {
      eligibleBasic = false;
      reasons.push('이혼(미혼은 자녀의 비양육부모)한 상대와 주민등록 주소가 같거나 그 명의 주택에 거주 → 원칙적 제외(특별한 사유는 사실조사로 예외 가능, p.43).');
    }
    if (input.commonLaw) {
      eligibleBasic = false;
      reasons.push('사실혼 관계가 있으면 한부모가족이 성립하지 않습니다(p.45, FAQ 7).');
    }
    if (grand && input.grandParentsIncome === 'over') {
      eligibleBasic = false;
      reasons.push('조손가족은 아동 부모(친권자)의 소득인정액이 기준 중위소득 65% 이하여야 합니다(p.59~60).');
    }
    if (grand && input.grandParentsIncome === 'unknown') {
      warnings.push('조손가족: 아동 부모(친권자)의 소득인정액 65% 이하 여부를 먼저 확인해야 합니다. 부모 행방불명 등으로 파악이 어려우면 지방생활보장위원회 심의로 예외 보장 가능.');
    }
    if (grand && input.grandBoth) {
      warnings.push('조부·조모가 함께 양육하는 경우 한 분이 65세 이상이거나 장기간 근로능력을 상실한 경우에만 지원 가능합니다(p.48).');
    }
    if (input.reason === 'divorcePending') {
      eligibleBasic = false;
      reasons.push('이혼 소송 중·협의이혼 신청 접수만으로는 선정 불가 → 이혼 성립(확인서 등본·판결문) 후 신청 안내(FAQ 26~27).');
    }

    // ---------- 소득 ----------
    var persons = input.incomePersons || [];
    var incomeRows = [];
    var totalEarned = 0, totalDeduct = 0, totalOther = 0;
    persons.forEach(function (p) {
      var earned = num(p.regular) + num(p.daily) + num(p.farm) + num(p.forest) + num(p.fish) + num(p.business);
      var pAgeUnder35 = p.birth ? underAge(p.birth, base, R.age.youngAdultParentMax) : !!p.under35;
      var pAge65 = p.birth ? !underAge(p.birth, base, R.earnedDeduction.seniorAge) : false;
      var ded = earnedDeduction(earned, {
        under35: pAgeUnder35, age65: pAge65, univ: p.univ, disabled: p.disabled,
        student: p.student, rehab: p.rehab, nkDefector: p.nkDefector
      });
      var other = num(p.rent) + num(p.pension) + num(p.publicTransfer) + num(p.otherIncome);
      totalEarned += earned; totalDeduct += ded.amount; totalOther += other;
      incomeRows.push({ name: p.name, earned: earned, deduction: ded, other: other });
    });

    var hh = input.household || {};
    var interestYear = num(hh.interestYear);
    var interest = Math.max(0, interestYear - R.interestDeductionYear) / 12;
    var medianForSize = threshold(R.median, Math.min(Math.max(countSize, 2), 6));
    var privateRegular = num(hh.privateRegular);
    var privateExempt = medianForSize ? medianForSize * R.privateTransferExemptRate : 0;
    var privateCounted = Math.max(0, privateRegular - privateExempt);
    var childSupport = num(hh.childSupport);
    var specialExpense = num(hh.medical) + num(hh.pensionPremium) * 0.75;

    var actualIncome = totalEarned + totalOther + interest + privateRegular + childSupport;
    var incomeEval = Math.max(0, totalEarned - totalDeduct + totalOther + interest + privateCounted + childSupport - specialExpense);

    // ---------- 재산 ----------
    var assets = assetConversion(input.assets || {}, {
      region: input.region, grand: grand, kidsUnder18: kidsUnder18, hasDisabled: !!(ap.disabled)
    });

    var recognized = incomeEval + assets.total;

    // ---------- 선정기준 비교 ----------
    var sizeForLine = countSize;
    var line65 = threshold(R.line65, sizeForLine);
    var line72 = threshold(R.line72, sizeForLine);
    var median = threshold(R.median, sizeForLine);
    if (sizeForLine > 6) {
      warnings.push(sizeForLine + '인 가구는 지침 표(2~6인)에 금액이 없습니다. 사회보장정보시스템의 해당 가구원수 기준 중위소득으로 확인하세요.');
    }
    var pass65 = line65 != null ? recognized <= line65 : null;
    var pass72 = line72 != null ? recognized <= line72 : null;
    var pass100 = median != null ? recognized <= median : null;

    var eligible = eligibleBasic && pass65 === true;
    var certOnly = eligibleBasic && youth && pass65 === false && pass72 === true;

    // ---------- 급여 ----------
    var benefits = [];
    var B = R.benefit;
    var monthly = 0, yearlyExtra = 0;
    var foster = !!input.fosterCare;
    if (eligible) {
      var careKids = supportedKids.filter(function (k) { return k.childCare; });
      if (foster) {
        benefits.push({ name: '아동양육비', amount: 0, unit: '', detail: '가정위탁 양육보조금을 받는 경우 아동양육비·추가아동양육비 지원 제외(p.172)' });
      } else if (youth) {
        careKids.forEach(function (k) {
          var amt = k.under2 ? B.youthChildCareInfant : B.youthChildCare;
          monthly += amt;
          benefits.push({ name: '청소년한부모 아동양육비 — ' + k.name, amount: amt, unit: '월',
            detail: (k.under2 ? '0~1세 영아' : '2세 이상') + ' · 한부모 아동양육비 23만원 우선 지급 + 차액 ' + man(amt - B.childCare) + ' 청소년한부모 급여에서 지급' });
        });
      } else {
        careKids.forEach(function (k) {
          monthly += B.childCare;
          benefits.push({ name: '아동양육비 — ' + k.name, amount: B.childCare, unit: '월', detail: '18세 미만(고교 이하 재학 시 22세 미만) 자녀 1인당' + (input.livelihood ? ' · 생계급여 수급 가구도 동일 지원' : '') });
        });
        // 추가아동양육비
        if (grand || (input.unmarried && apAge != null && apAge >= R.age.unmarriedExtraMin)) {
          careKids.filter(function (k) { return k.under6; }).forEach(function (k) {
            monthly += B.extraChildCare;
            benefits.push({ name: '추가아동양육비 — ' + k.name, amount: B.extraChildCare, unit: '월', detail: (grand ? '조손가족' : '35세 이상 미혼 한부모') + '의 5세 이하 아동' });
          });
        } else if (youngAdult) {
          careKids.forEach(function (k) {
            monthly += B.extraChildCare;
            benefits.push({ name: '추가아동양육비 — ' + k.name, amount: B.extraChildCare, unit: '월', detail: '25~34세 청년 한부모의 18세 미만(고교 이하 재학 시 22세 미만) 자녀' });
          });
        }
      }
      // 아동교육지원비(학용품비)
      var schoolKids = supportedKids.filter(function (k) { return k.schoolSupplies; });
      if (schoolKids.length) {
        if (input.eduBenefit || input.emergencyEdu) {
          benefits.push({ name: '아동교육지원비(학용품비)', amount: 0, unit: '', detail: '국민기초 교육급여(또는 긴급복지 교육지원)를 받는 가구는 제외 — 교육급여가 우선(p.176)' });
        } else {
          schoolKids.forEach(function (k) {
            yearlyExtra += B.schoolSupplies;
            benefits.push({ name: '아동교육지원비(학용품비) — ' + k.name, amount: B.schoolSupplies, unit: '연', detail: SCHOOL_LABEL[k.school] + ' · 매년 7월 일괄 지급(7월 이후 선정 시 선정 후 지급일)' });
          });
        }
      }
      // 생활보조금
      if (input.facility) {
        if (input.livelihood || input.emergencyLiving) {
          benefits.push({ name: '생활보조금', amount: 0, unit: '', detail: '생계급여·긴급복지 생계지원 수급 가구는 제외(p.178)' });
        } else {
          monthly += B.livingAllowance;
          benefits.push({ name: '생활보조금', amount: B.livingAllowance, unit: '월', detail: '한부모가족복지시설 입소 가구당 · 입소일이 속한 달부터, 별도 신청 불필요' });
        }
      }
      // 청소년한부모 자립지원
      if (youth) {
        if (input.youthActivity) {
          monthly += B.youthSelfReliance;
          benefits.push({ name: '청소년한부모 자립촉진수당', amount: B.youthSelfReliance, unit: '월', detail: '최근 1년 내 학업·직업훈련·취업 등 자립활동(월 10일 이상) · 분기(1·4·7·10월)마다 활동 재확인' });
        } else {
          benefits.push({ name: '청소년한부모 자립촉진수당', amount: 0, unit: '', detail: '학업·직업훈련·취업 등 자립활동을 하면 월 10만원 신청 가능(증빙 필요)' });
        }
        if (input.youthNoHighSchool || input.youthInSchool) {
          benefits.push({ name: '청소년한부모 검정고시 등 학습지원', amount: B.youthStudyLimit, unit: '연 한도',
            detail: input.youthInSchool ? '중·고 재학: 교통비 월 3만원, 교복구입비 1회 50만원 이내' : '검정고시 준비: 학원비 월 30만원·교재비 연 20만원 이내 실비, 학용품비 연 10만원 (12개월 내 1회 이상 응시 의무, 최대 2년)' });
        }
      }
    }

    // ---------- 연계 안내 ----------
    var links = [];
    if (eligibleBasic && (pass65 || (youth && pass72))) {
      links.push('한부모가족증명서 발급 대상 (' + (youth ? '청소년한부모 72%' : '65%') + ' 이하) — 각종 감면·임대주택 특별공급 등에 활용');
    }
    if (eligibleBasic && pass100 && !eligible) {
      links.push('소득인정액이 기준 중위소득 100% 이하 → 한부모가족복지시설 입소 상담 가능(무주택 등 시설 기준 확인)');
    } else if (eligibleBasic && pass100) {
      links.push('한부모가족복지시설 입소 기준(중위 100% 이하) 충족 — 주거가 불안정하면 시설 입소 상담');
    }
    links.push('양육비를 받지 못하면 양육비이행관리원(1644-6621) 이행지원·양육비 선지급제 안내');
    links.push('한부모가족 신청 시 차상위계층 확인 신청도 함께 가능함을 안내');
    if (input.unmarried && input.birthUnregistered) links.push('출생신고 전 미혼부: 친생자 출생신고 확인신청서 사본 제출, 유전자검사 결과 사후 제출(최대 6개월) — 가족상담전화 1577-4206, 법률구조 132');
    if (youth) links.push('학교 밖 청소년이면 꿈드림(1388) 검정고시·자립 지원, 위기청소년 특별지원 함께 안내');
    if (eligible) links.push('한부모가족 임대주택 특별공급(LH 등 국민임대 물량의 10% 범위) — 읍·면·동 공고 확인');

    return {
      base: base,
      typeLabel: typeLabel,
      youth: !!youth, grand: grand, youngAdult: !!youngAdult,
      applicantAge: apAge,
      kids: kids,
      supportSize: supportSize, countSize: countSize,
      income: { rows: incomeRows, totalEarned: totalEarned, totalDeduct: totalDeduct, totalOther: totalOther,
        interest: interest, privateRegular: privateRegular, privateExempt: privateExempt, privateCounted: privateCounted,
        childSupport: childSupport, specialExpense: specialExpense, actual: actualIncome, eval: incomeEval },
      assets: assets,
      recognized: recognized,
      line65: line65, line72: line72, median: median,
      pass65: pass65, pass72: pass72, pass100: pass100,
      eligibleBasic: eligibleBasic, eligible: eligible, certOnly: certOnly,
      benefits: benefits, monthly: monthly, yearlyExtra: yearlyExtra,
      annualTotal: monthly * 12 + yearlyExtra,
      reasons: reasons, warnings: warnings, links: links
    };
  }

  var api = { evaluate: evaluate, underAge: underAge, ageInYears: ageInYears, won: won, man: man, num: num, SCHOOL_LABEL: SCHOOL_LABEL };
  if (typeof module !== 'undefined') module.exports = api;
  else root.HanbumoCalc = api;
})(this);
