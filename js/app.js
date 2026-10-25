/* 화면 동작: 탭, 입력폼, 판정 결과, 신청 안내, 전화상담 */
(function () {
  var Calc = window.HanbumoCalc;
  var won = Calc.won, man = Calc.man, num = Calc.num;
  var lastResult = null, lastInput = null;
  var RESULT_EMPTY = document.getElementById('result').innerHTML;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // 금액 입력은 만원 단위 (예: 220 → 220만원 = 2,200,000원)
  var MAN = 10000;
  function fmtMan(n) { return n ? Number(n).toLocaleString('ko-KR', { maximumFractionDigits: 1 }) : ''; }
  function manToWon(str) { return Math.round(num(str) * MAN); }
  function wonToMan(n) { return fmtMan(n / MAN); }
  // 입력하는 동안 천 단위 콤마 표시 (커서 위치 유지)
  function formatLive(el) {
    var raw = el.value, caret = el.selectionStart == null ? raw.length : el.selectionStart;
    var digitsBefore = raw.slice(0, caret).replace(/[^\d.]/g, '').length;
    var clean = raw.replace(/[^\d.]/g, '');
    var dot = clean.indexOf('.');
    if (dot >= 0) clean = clean.slice(0, dot + 1) + clean.slice(dot + 1).replace(/\./g, '').slice(0, 1);
    var parts = clean.split('.');
    var intPart = parts[0].replace(/^0+(?=\d)/, '');
    var out = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (parts.length > 1 ? '.' + parts[1] : '');
    el.value = out;
    var pos = 0, seen = 0;
    while (pos < out.length && seen < digitsBefore) { if (/[\d.]/.test(out[pos])) seen++; pos++; }
    try { el.setSelectionRange(pos, pos); } catch (e) {}
  }
  function fmtMoneyInput(el) { el.value = fmtMan(num(el.value)); }
  function val(id) { return manToWon($(id).value); }

  // 금액칸에 "만원" 단위 표시를 붙임 (나중에 생기는 칸 포함)
  function wrapMoney(scope) {
    (scope || document).querySelectorAll('input.money').forEach(function (el) {
      if (el.parentNode.classList && el.parentNode.classList.contains('money-wrap')) return;
      var w = document.createElement('span');
      w.className = 'money-wrap';
      el.parentNode.insertBefore(w, el);
      w.appendChild(el);
      var u = document.createElement('span');
      u.className = 'unit'; u.textContent = '만원'; u.setAttribute('aria-hidden', 'true');
      w.appendChild(u);
      el.setAttribute('aria-label', (el.getAttribute('aria-label') || '') + ' 만원 단위');
      el.setAttribute('inputmode', 'decimal');
      if (!el.placeholder) el.placeholder = '0';
    });
  }
  wrapMoney();
  new MutationObserver(function () { wrapMoney(); }).observe(document.body, { childList: true, subtree: true });
  function checked(id) { return $(id).checked; }

  // ---------- 탭 ----------
  function showTab(name) {
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('active', t.dataset.tab === name); });
    document.querySelectorAll('.panel').forEach(function (p) { p.classList.toggle('active', p.id === 'tab-' + name); });
    if (name === 'guide') renderGuide();
    if (window.CareInfo && window.CareInfo.has(name)) window.CareInfo.load(name);
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('.tab').forEach(function (t) {
    t.addEventListener('click', function () { showTab(t.dataset.tab); });
  });

  // 금액 입력 콤마
  document.addEventListener('input', function (e) {
    if (e.target.classList && e.target.classList.contains('money')) formatLive(e.target);
  });
  document.addEventListener('focusout', function (e) {
    if (e.target.classList && e.target.classList.contains('money')) fmtMoneyInput(e.target);
  });

  // ---------- 공통 초기값 ----------
  function todayMonth() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  ['region', 'q-region'].forEach(function (id) {
    var sel = $(id);
    Object.keys(RULES.regions).forEach(function (k) {
      var o = document.createElement('option');
      o.value = k; o.textContent = RULES.regions[k].label;
      sel.appendChild(o);
    });
    sel.value = 'gyeonggi'; // 기본 거주지역: 경기도
  });
  $('baseMonth').value = todayMonth();

  // =====================================================
  // ② 판정 폼
  // =====================================================
  var kidSeq = 0, carSeq = 0;
  var incomeStore = {}; // personKey -> {field: value}

  var SCHOOL_OPTS = [['pre', '미취학'], ['elem', '초등학생'], ['mid', '중학생'], ['high', '고등학생'], ['univ', '대학(학위과정)'], ['none', '비취학·졸업']];

  function addKid(d) {
    d = d || {};
    var id = ++kidSeq;
    var tr = document.createElement('tr');
    tr.dataset.id = id;
    tr.innerHTML =
      '<td data-label="이름"><input data-f="name" placeholder="자녀' + id + '" value="' + esc(d.name || '') + '"></td>' +
      '<td data-label="생년월일"><input data-f="birth" type="date" value="' + esc(d.birth || '') + '"></td>' +
      '<td data-label="학적"><select data-f="school">' + SCHOOL_OPTS.map(function (o) {
        return '<option value="' + o[0] + '"' + (d.school === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('') + '</select></td>' +
      '<td data-label="병역(개월)"><input data-f="military" type="number" min="0" max="48" value="' + esc(d.military || '') + '"></td>' +
      '<td class="c" data-label="실제 양육"><input data-f="raised" type="checkbox"' + (d.raised === false ? '' : ' checked') + '></td>' +
      '<td class="c" data-label="결혼"><input data-f="married" type="checkbox"' + (d.married ? ' checked' : '') + '></td>' +
      '<td class="c" data-label="고교 휴학"><input data-f="leave" type="checkbox"' + (d.leave ? ' checked' : '') + '></td>' +
      '<td class="c" data-label="시설·소년원"><input data-f="institution" type="checkbox"' + (d.institution ? ' checked' : '') + '></td>' +
      '<td class="c" data-label="취·창업 특례"><input data-f="selfReliance" type="checkbox"' + (d.selfReliance ? ' checked' : '') + ' title="18~34세 자녀가 월 90만원 이상 취·창업 소득이 있어 자립지원 별도가구 특례 적용(지원·산정 가구원에서 제외)"></td>' +
      '<td class="del-cell"><button class="btn del" title="삭제" aria-label="자녀 삭제">✕</button></td>';
    tr.querySelector('.del').addEventListener('click', function () { tr.remove(); buildIncomeTable(); });
    tr.addEventListener('change', buildIncomeTable);
    $('kids-table').querySelector('tbody').appendChild(tr);
    buildIncomeTable();
  }

  function readKids() {
    return Array.prototype.map.call($('kids-table').querySelectorAll('tbody tr'), function (tr) {
      function f(n) { return tr.querySelector('[data-f="' + n + '"]'); }
      return {
        id: tr.dataset.id,
        name: f('name').value.trim() || ('자녀' + tr.dataset.id),
        birth: f('birth').value,
        school: f('school').value,
        raisedByApplicant: f('raised').checked,
        married: f('married').checked,
        leaveOfAbsence: f('leave').checked,
        institution: f('institution').checked,
        militaryMonths: f('military').value,
        selfReliance: f('selfReliance').checked
      };
    });
  }

  var CAR_TYPES = [['passenger', '승용'], ['van', '소형 이하 승합'], ['truck', '소형 이하 화물'], ['vanL', '중형 이상 승합'], ['truckL', '중형 이상 화물·특수'], ['moto', '이륜']];
  var CAR_USES = [['general', '일반(자가용)'], ['business', '생업용'], ['disabled', '장애인사용(심한 장애·상이 1~3급)'], ['disabledMild', '장애인사용(그 외 장애)·보철용']];
  function addCar(d) {
    d = d || {};
    var id = ++carSeq;
    var tr = document.createElement('tr');
    function opts(list, v) { return list.map(function (o) { return '<option value="' + o[0] + '"' + (v === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join(''); }
    tr.innerHTML =
      '<td data-label="차량명"><input data-f="name" placeholder="예: 아반떼" value="' + esc(d.name || '') + '"></td>' +
      '<td data-label="종류"><select data-f="type">' + opts(CAR_TYPES, d.type === 'other' ? 'vanL' : (d.type || 'passenger')) + '</select></td>' +
      '<td data-label="용도"><select data-f="use">' + opts(CAR_USES, d.use || 'general') + '</select></td>' +
      '<td data-label="배기량(cc)"><input data-f="cc" type="number" min="0" value="' + esc(d.cc || '') + '"></td>' +
      '<td data-label="승차정원"><input data-f="seats" type="number" min="1" value="' + esc(d.seats || '') + '"></td>' +
      '<td data-label="차령(년)"><input data-f="age" type="number" min="0" value="' + esc(d.age || '') + '"></td>' +
      '<td data-label="차량가액(만원)"><input data-f="value" class="money" inputmode="numeric" value="' + (d.value ? wonToMan(d.value) : '') + '"></td>' +
      '<td class="del-cell"><button class="btn del" title="삭제" aria-label="자동차 삭제">✕</button></td>';
    tr.querySelector('.del').addEventListener('click', function () { tr.remove(); });
    $('cars-table').querySelector('tbody').appendChild(tr);
  }
  function readCars() {
    return Array.prototype.map.call($('cars-table').querySelectorAll('tbody tr'), function (tr) {
      var o = {};
      tr.querySelectorAll('[data-f]').forEach(function (el) { o[el.dataset.f] = el.value; });
      o.value = manToWon(o.value);
      return o;
    });
  }

  // 소득표: 신고서처럼 가구원별 열
  var INCOME_ROWS = [
    ['g', '근로소득'], ['regular', '상시근로'], ['daily', '일용근로', '최근 3개월 평균(확인조사 시 6개월 평균)'],
    ['g', '사업소득'], ['farm', '농업소득'], ['forest', '임업소득'], ['fish', '어업소득'], ['business', '그 밖의 사업소득(자영업)'],
    ['g', '재산소득·이전소득'], ['rent', '임대소득'], ['pension', '연금소득(사적연금)'],
    ['publicTransfer', '공적이전소득(국민연금·실업·육아휴직급여 등)'], ['otherIncome', '그 밖의 소득(지자체 지원금 등)']
  ];
  function incomePersons() {
    var list = [{ key: 'ap', name: ($('apName').value.trim() || '신청인'), role: 'applicant' }];
    if ($('familyType').value === 'single' && $('reason').value === 'spouseDisabled') {
      list.push({ key: 'sp', name: '배우자', role: 'spouse' });
    }
    var bm = $('baseMonth').value || todayMonth();
    var base = { y: +bm.slice(0, 4), m: +bm.slice(5, 7) };
    readKids().forEach(function (k) {
      if (!k.raisedByApplicant || k.married || k.institution) return;
      // 자립지원 별도가구 특례 자녀는 소득인정액 산정 가구원이 아니므로 소득도 넣지 않음 (p.59, p.63)
      if (k.selfReliance && k.birth && !Calc.classifyChild(k, base).counted) return;
      list.push({ key: 'k' + k.id, name: k.name, role: 'child', kid: k });
    });
    return list;
  }
  function saveIncomeTable() {
    $('income-table').querySelectorAll('input[data-p]').forEach(function (el) {
      (incomeStore[el.dataset.p] = incomeStore[el.dataset.p] || {})[el.dataset.f] = el.value;
    });
  }
  function buildIncomeTable(skipSave) {
    if (skipSave !== true) saveIncomeTable();
    var persons = incomePersons();
    var html = '<thead><tr><th>항목 \\ 가구원</th>' + persons.map(function (p) { return '<th>' + esc(p.name) + '</th>'; }).join('') + '</tr></thead><tbody>';
    INCOME_ROWS.forEach(function (r) {
      if (r[0] === 'g') { html += '<tr class="group"><td colspan="' + (persons.length + 1) + '">' + r[1] + '</td></tr>'; return; }
      html += '<tr><th>' + r[1] + (r[2] ? '<small class="help">' + r[2] + '</small>' : '') + '</th>' + persons.map(function (p) {
        var v = (incomeStore[p.key] || {})[r[0]] || '';
        return '<td><input class="money" inputmode="numeric" data-p="' + p.key + '" data-f="' + r[0] + '" value="' + esc(v) + '" placeholder="0"></td>';
      }).join('') + '</tr>';
    });
    html += '</tbody>';
    $('income-table').innerHTML = html;
  }

  function updateVisibility() {
    var grand = $('familyType').value === 'grand';
    document.querySelectorAll('.only-single').forEach(function (el) { el.style.display = grand ? 'none' : ''; });
    document.querySelectorAll('.only-grand').forEach(function (el) { el.style.display = grand ? '' : 'none'; });
    var base = { y: +($('baseMonth').value || todayMonth()).slice(0, 4), m: +($('baseMonth').value || todayMonth()).slice(5, 7) };
    var youth = !grand && $('apBirth').value && Calc.underAge($('apBirth').value, base, RULES.age.youthParent);
    document.querySelectorAll('.only-youth').forEach(function (el) { el.style.display = youth ? '' : 'none'; });
    if ($('reason').value === 'unmarried') $('unmarried').checked = true;
    updatePrivateMonthLabels();
  }
  ['familyType', 'reason', 'apBirth', 'baseMonth'].forEach(function (id) {
    $(id).addEventListener('change', function () { updateVisibility(); buildIncomeTable(); });
  });

  // 비정기 사적이전소득 칸 이름: 기준월에서 거슬러 12개월 (priv_m0 = 기준월)
  function updatePrivateMonthLabels() {
    var bm = $('baseMonth').value || todayMonth();
    var idx = +bm.slice(0, 4) * 12 + (+bm.slice(5, 7) - 1);
    document.querySelectorAll('#private-months .pm-label').forEach(function (el) {
      var k = idx - (+el.dataset.i);
      el.textContent = Math.floor(k / 12) + '년 ' + (k % 12 + 1) + '월' + (el.dataset.i === '0' ? ' (기준월)' : '');
    });
  }
  $('baseMonth').addEventListener('change', updatePrivateMonthLabels);
  $('baseMonth').addEventListener('input', updatePrivateMonthLabels);
  $('apName').addEventListener('change', buildIncomeTable);

  $('add-kid').addEventListener('click', function () { addKid(); });
  $('add-car').addEventListener('click', function () { addCar(); });

  function collectInput() {
    saveIncomeTable();
    var grand = $('familyType').value === 'grand';
    var kids = readKids();
    var persons = incomePersons().map(function (p) {
      var s = incomeStore[p.key] || {};
      var o = { name: p.name };
      INCOME_ROWS.forEach(function (r) { if (r[0] !== 'g') o[r[0]] = manToWon(s[r[0]]); });
      if (p.role === 'applicant') {
        o.birth = $('apBirth').value; o.disabled = checked('apDisabled'); o.univ = checked('apUniv');
        o.student = checked('apStudent'); o.rehab = checked('apRehab'); o.nkDefector = checked('apNk');
      } else if (p.role === 'spouse') {
        o.disabled = true;
      } else {
        o.birth = p.kid.birth; o.univ = p.kid.school === 'univ';
        o.student = ['elem', 'mid', 'high'].indexOf(p.kid.school) >= 0;
      }
      return o;
    });
    return {
      baseMonth: $('baseMonth').value || todayMonth(),
      region: $('region').value,
      familyType: $('familyType').value,
      reason: grand ? 'grand' : $('reason').value,
      unmarried: !grand && checked('unmarried'),
      foreigner: !grand && checked('foreigner'),
      applicant: { name: $('apName').value.trim(), birth: $('apBirth').value, disabled: checked('apDisabled') },
      facility: checked('facility'), livelihood: checked('livelihood'), eduBenefit: checked('eduBenefit'),
      emergencyLiving: checked('emergencyLiving'), emergencyEdu: checked('emergencyEdu'), fosterCare: checked('fosterCare'),
      cohabitWithEx: !grand && checked('cohabitWithEx'), commonLaw: !grand && checked('commonLaw'),
      birthUnregistered: !grand && checked('birthUnregistered'),
      grandParentsIncome: $('grandParentsIncome').value, grandBoth: grand && checked('grandBoth'),
      youthActivity: checked('youthActivity'), youthNoHighSchool: checked('youthNoHighSchool'), youthInSchool: checked('youthInSchool'),
      children: kids,
      incomePersons: persons,
      household: {
        interestYear: val('interestYear'), privateRegular: val('privateRegular'), childSupport: val('childSupport'),
        medical: val('medical'), pensionPremium: val('pensionPremium'), tuition: val('tuition'), homePension: val('homePension'),
        privateMonthly: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(function (i) { return val('priv_m' + i); }),
        privateCount: $('privateCount').value
      },
      assets: {
        housePrice: val('housePrice'), houseLiving: checked('houseLiving'), otherBuilding: val('otherBuilding'), land: val('land'),
        depositHouse: val('depositHouse'), depositShop: val('depositShop'), depositOther: val('depositOther'),
        financial: val('financial'), movable: val('movable'), cars: readCars(),
        longSavings: val('longSavings'), longSavingsStartYear: $('longSavingsStartYear').value,
        debtFin: val('debtFin'), debtOther: val('debtOther'), debtRentDeposit: val('debtRentDeposit'), debtCourt: val('debtCourt'),
        debtRentDepositOther: val('debtRentDepositOther'), debtRentGrace: checked('debtRentGrace'), homePensionTotal: val('homePensionTotal'),
        dispGeneral: val('dispGeneral'), dispFinancial: val('dispFinancial'), dispMonth: $('dispMonth').value, dispUsed: val('dispUsed'),
        allIncapable: checked('allIncapable'), hardAsset: val('hardAsset'), priceRiseOnly: checked('priceRiseOnly'),
        committeeExcluded: val('committeeExcluded')
      }
    };
  }

  // ---------- 결과 렌더링 ----------
  function verdictHtml(r) {
    var line = r.line65;
    if (!r.eligibleBasic) {
      return '<div class="verdict"><span class="badge bad">가구 요건 미충족</span>' +
        '<h3>지원대상이 아닐 가능성이 높습니다</h3>' +
        '<ul class="notes">' + r.reasons.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
    }
    if (r.eligible) {
      return '<div class="verdict"><span class="badge ok">지원대상 가능 · ' + esc(r.typeLabel) + '</span>' +
        '<p class="k">예상 급여</p><div class="big-num">월 ' + won(r.monthly) + '</div>' +
        '<p>' + (r.yearlyExtra ? '+ 학용품비 연 ' + won(r.yearlyExtra) + ' · ' : '') + '연간 약 ' + man(r.annualTotal) + '</p></div>';
    }
    if (r.certOnly) {
      return '<div class="verdict"><span class="badge warn">증명서만 발급 가능</span>' +
        '<h3>청소년 한부모가족 — 72% 이하</h3><p>복지급여 기준(65%)은 넘지만 한부모가족증명서는 발급됩니다.</p></div>';
    }
    if (line == null) {
      return '<div class="verdict"><span class="badge warn">담당자 확인 필요</span><h3>지침 표 밖의 가구원수</h3></div>';
    }
    return '<div class="verdict"><span class="badge bad">기준 초과</span>' +
      '<h3>복지급여 대상 아님</h3><p>' + r.countSize + '인 기준(65%)보다 ' + won(r.recognized - line) + ' 많습니다.</p>' +
      (r.pass100 ? '<p>중위소득 100% 이하 → 한부모가족복지시설 입소 상담 가능</p>' : '') + '</div>';
  }

  function renderResult(r, input) {
    var el = $('result');
    var ratio = r.line65 ? Math.min(100, r.recognized / r.line65 * 100) : 0;
    var html = heroHtml(r, '<button class="btn hero-btn" id="to-guide" type="button">신청 안내 보기 →</button>');
    html += '<div class="res-card">' + flowHtml(r) + benefitRowsHtml(r);

    html += '<div class="stats">' +
      stat('가구 유형', esc(r.typeLabel) + (r.applicantAge != null ? ' · 만 ' + r.applicantAge + '세' : '')) +
      stat('지원 / 산정 가구원', r.supportSize + '인 / ' + r.countSize + '인') +
      stat('소득평가액', won(r.income.eval)) +
      stat('재산 소득환산액', won(r.assets.total)) +
      (r.youth && r.line72 ? stat('증명서 기준 72%', won(r.line72)) : '') +
      '</div>';

    html += '<h4>자녀별 판정</h4><div class="table-scroll"><table class="data-table"><thead><tr><th>자녀</th><th>나이</th><th>학적</th><th>지원 가구원</th><th>산정 가구원</th><th>아동양육비</th><th>비고</th></tr></thead><tbody>' +
      r.kids.map(function (k) {
        return '<tr><td>' + esc(k.name) + '</td><td>' + (k.age != null ? '만 ' + k.age + '세' : '-') + '</td><td>' + Calc.SCHOOL_LABEL[k.school] + '</td>' +
          '<td style="text-align:center">' + (k.supported ? '○' : '×') + '</td><td style="text-align:center">' + (k.counted ? '○' : '×') + '</td>' +
          '<td style="text-align:center">' + (k.childCare ? '○' : '×') + '</td><td style="text-align:left">' + esc(k.notes.join(' / ')) + '</td></tr>';
      }).join('') + '</tbody></table></div>';

    if (r.reasons.length && r.eligibleBasic) html += '<h4>확인 필요</h4><ul class="notes">' + r.reasons.map(li).join('') + '</ul>';
    if (r.warnings.length) html += '<h4>주의</h4><ul class="notes">' + r.warnings.map(li).join('') + '</ul>';
    if (r.links.length) html += '<h4>함께 안내할 내용</h4><ul class="notes">' + r.links.map(li).join('') + '</ul>';

    // 계산 근거
    var inc = r.income;
    html += '<details class="calc-steps"><summary>계산 근거 보기</summary>' +
      '<h5>① 소득평가액 = 실제소득 − 근로·사업소득 공제 − 가구특성 지출 (p.82~91)</h5>' +
      '<div class="table-scroll"><table class="data-table"><thead><tr><th>가구원</th><th>근로·사업소득</th><th>공제</th><th>적용 공제</th><th>그 밖의 소득</th></tr></thead><tbody>' +
      inc.rows.map(function (x) {
        return '<tr><td>' + esc(x.name) + '</td><td>' + won(x.earned) + '</td><td>' + won(x.deduction.amount) + '</td><td style="text-align:left">' + esc(x.deduction.label) + '</td><td>' + won(x.other) + '</td></tr>';
      }).join('') + '</tbody></table></div><ul class="notes">' +
      (inc.interest ? '<li>이자소득: (연 이자 − 24만원) ÷ 12 = ' + won(inc.interest) + '</li>' : '') +
      (inc.privateTotal ? '<li>사적이전소득 (' +
        [inc.privateRegular ? '매월 정기 지원 ' + won(inc.privateRegular) : '', inc.childSupport ? '매월 양육비·선지급금 ' + won(inc.childSupport) : '',
         inc.privateIrregularYear ? '비정기 지원 1년 합계 ' + won(inc.privateIrregularYear) : ''].filter(Boolean).join(' + ') +
        '): 최근 1년 ' + inc.privateCount + '회 → ' + (inc.privateIsRegular ? '정기지원(6회 이상)' : '6회 미만') +
        '. 달마다 기준중위소득 15%(' + won(inc.privateCap15) + ') 초과분 1년 합계 ' + won(inc.privateExcessYear) +
        (inc.privateIsRegular ? '' : (inc.privateExcessYear > inc.privateLargeCap
          ? ' − 중위 50%(' + won(inc.privateLargeCap) + ') = ' + won(inc.privateExcessYear - inc.privateLargeCap) + '만 반영'
          : ' → 중위 50%(' + won(inc.privateLargeCap) + ') 이하')) +
        (inc.privateCounted ? ' ÷ 12 = 월 ' + won(inc.privateCounted) + ' 반영' : ' → 반영 안 함') + ' (p.101~102)</li>' : '') +
      (inc.specialExpense ? '<li>가구특성 지출(의료비 + 국민연금 보험료 75%) ' + won(inc.specialExpense) + ' 차감</li>' : '') +
      (inc.tuitionDeduct ? '<li>대학생 등록금 지출 공제: 등록금 ÷ 6 = ' + won(inc.tuitionDeduct) + ' 차감 (근로·사업소득 범위 내, p.91)</li>' : '') +
      (inc.homePension ? '<li>주택·농지연금 ' + won(inc.homePension) + ' 중 50% 공제 → ' + won(inc.homePensionCounted) + ' 반영 (p.100)</li>' : '') +
      '<li><b>소득평가액 = ' + won(inc.eval) + '</b></li></ul>' +
      '<h5>② 재산의 소득환산액 = (재산 − 기본재산액 − 부채) × 환산율 (p.151~152)</h5><ul class="notes">' +
      r.assets.steps.map(li).join('') +
      r.assets.cars.excluded.concat(r.assets.cars.general, r.assets.cars.full).map(function (c) { return '<li>' + esc(c.label) + ' ' + won(c.value) + ': ' + esc(c.reason) + '</li>'; }).join('') +
      '<li>주거용재산 ' + won(r.assets.net.housing) + ' × 1.04% = ' + won(r.assets.conv.housing) + '</li>' +
      '<li>일반재산 ' + won(r.assets.net.general) + ' × 4.17% = ' + won(r.assets.conv.general) + '</li>' +
      '<li>금융재산 ' + won(r.assets.net.financial) + ' × 6.26% = ' + won(r.assets.conv.financial) + '</li>' +
      (r.assets.net.car100 ? '<li>100% 환산 자동차 ' + won(r.assets.net.car100) + ' × 100% = ' + won(r.assets.conv.car100) + '</li>' : '') +
      '<li><b>재산 소득환산액 = ' + won(r.assets.total) + '</b></li></ul>' +
      '<h5>③ 소득인정액 = ' + won(inc.eval) + ' + ' + won(r.assets.total) + ' = ' + won(r.recognized) + '</h5></details>' +
      '<p class="disclaimer">모의계산입니다. 최종 결정은 사회보장정보시스템 공적자료 조회·조사 결과에 따릅니다. 기준월 ' + r.base.y + '년 ' + r.base.m + '월</p></div>';

    el.innerHTML = html;
    renderKpis(r);
    el.scrollTop = 0;
    $('to-guide').addEventListener('click', function () { showTab('guide'); });
    if (getComputedStyle(el).position !== 'sticky') el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  // ---------- 핀테크 스타일 결과 조각 ----------
  function ringSvg(pct, over) {
    var C = 326.7, dash = Math.max(0, Math.min(pct, 100)) / 100 * C;
    return '<svg class="ring" role="img" aria-label="소득인정액이 선정기준의 ' + pct.toFixed(0) + '%" width="112" height="112" viewBox="0 0 120 120">' +
      '<circle cx="60" cy="60" r="52" fill="none" stroke="#1e293b" stroke-width="12"></circle>' +
      '<circle cx="60" cy="60" r="52" fill="none" stroke="' + (over ? '#fb7185' : '#a5b4fc') + '" stroke-width="12" stroke-linecap="round" stroke-dasharray="' + dash.toFixed(1) + ' ' + C + '" transform="rotate(-90 60 60)"></circle>' +
      '<text x="60" y="60" text-anchor="middle" fill="#ffffff" font-size="24" font-weight="800">' + pct.toFixed(0) + '%</text>' +
      '<text x="60" y="80" text-anchor="middle" fill="#94a3b8" font-size="11">기준 대비</text></svg>';
  }
  function heroHtml(r, extra) {
    var badge = !r.eligibleBasic ? ['bad', '가구 요건 미충족'] : r.eligible ? ['ok', '지원대상 가능 · ' + r.typeLabel]
      : r.certOnly ? ['warn', '증명서만 발급 가능'] : r.line65 == null ? ['warn', '담당자 확인 필요'] : ['bad', '기준 초과'];
    var h = '<div class="hero"><div class="hero-top"><span class="hero-label">예상 월 급여</span><span class="hero-badge ' + badge[0] + '">' + esc(badge[1]) + '</span></div>';
    if (r.eligible) {
      h += '<div class="hero-num">' + Math.round(r.monthly).toLocaleString('ko-KR') + '<span>원</span></div>';
    } else {
      h += '<div class="hero-num muted">0<span>원</span></div>' +
        '<p class="hero-msg">' + esc(!r.eligibleBasic ? '한부모가족 요건을 먼저 확인해야 합니다.' : r.certOnly ? '복지급여 기준(65%)은 넘지만 한부모가족증명서(72%)는 발급됩니다.' : '소득인정액이 선정기준을 넘습니다.' + (r.pass100 ? ' 복지시설 입소 상담은 가능합니다.' : '')) + '</p>';
    }
    if (r.line65) {
      var pct = r.recognized / r.line65 * 100, over = r.recognized > r.line65;
      h += '<div class="hero-gauge">' + ringSvg(pct, over) + '<div class="hero-rows">' +
        '<div><span>소득인정액</span><b>' + Math.round(r.recognized).toLocaleString('ko-KR') + '</b></div>' +
        '<div><span>' + r.countSize + '인 기준 65%</span><b>' + r.line65.toLocaleString('ko-KR') + '</b></div>' +
        '<div><span>' + (over ? '초과' : '여유') + '</span><b class="' + (over ? 'neg' : 'pos') + '">' + (over ? '+' : '+') + Math.round(Math.abs(r.line65 - r.recognized)).toLocaleString('ko-KR') + '</b></div>' +
        '</div></div>';
    }
    if (r.eligible && (r.yearlyExtra || r.annualTotal)) {
      h += '<div class="hero-chips"><div><span>연간 합계</span><b>' + man(r.annualTotal) + '</b></div>' +
        (r.yearlyExtra ? '<div><span>학용품비 (7월)</span><b>' + man(r.yearlyExtra) + '</b></div>' : '<div><span>지원 가구원</span><b>' + r.supportSize + '인</b></div>') + '</div>';
    }
    if (!r.eligibleBasic && r.reasons.length) h += '<ul class="hero-reasons">' + r.reasons.map(li).join('') + '</ul>';
    return h + (extra || '') + '</div>';
  }
  function benefitIcon(name) {
    var m = [[/추가/, '추', 'mint'], [/학용품|교육지원/, '학', 'amber'], [/생활보조/, '생', 'slate'], [/자립/, '자', 'mint'], [/검정|학습/, '검', 'amber'], [/양육비/, '양', 'indigo']];
    for (var i = 0; i < m.length; i++) if (m[i][0].test(name)) return '<span class="b-ico ' + m[i][2] + '" aria-hidden="true">' + m[i][1] + '</span>';
    return '<span class="b-ico slate" aria-hidden="true">·</span>';
  }
  function benefitRowsHtml(r) {
    if (!r.benefits.length) return '';
    return '<h4>급여 구성</h4><ul class="b-rows">' + r.benefits.map(function (b) {
      return '<li class="' + (b.amount ? '' : 'zero') + '">' + benefitIcon(b.name) +
        '<span class="b-txt"><b>' + esc(b.name) + '</b><small>' + esc(b.detail) + '</small></span>' +
        '<span class="b-amt">' + (b.amount ? (b.unit === '월' ? '' : b.unit + ' ') + Math.round(b.amount).toLocaleString('ko-KR') : '해당 없음') + '</span></li>';
    }).join('') + '</ul>';
  }
  function flowHtml(r) {
    if (!r.line65) return '';
    var inc = r.income, E = inc.totalEarned, D = inc.totalDeduct, O = Math.max(0, inc.eval - (E - D)), A = r.assets.total, R = r.recognized, L = r.line65;
    var max = Math.max(E + O + A, R, L, 1);
    function m(v) { return (v / 10000).toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
    function row(label, v, cls, sign, offset) {
      return '<div class="f-row"><span>' + label + '</span><div class="f-bar"><i class="' + cls + '" style="margin-left:' + ((offset || 0) / max * 100).toFixed(1) + '%;width:' + (v / max * 100).toFixed(1) + '%"></i></div><b class="' + cls + '">' + sign + m(v) + '</b></div>';
    }
    return '<h4>소득인정액 산출 흐름 <small>만원 / 월</small></h4><div class="flow">' +
      (E ? row('근로·사업소득', E, 'base', '', 0) + row('근로소득공제', D, 'minus', '−', E - D) : '') +
      (O ? row('그 밖의 소득', O, 'base', '+', 0) : '') +
      (A ? row('재산 소득환산액', A, 'plus', '+', Math.max(0, R - A)) : '') +
      '<div class="f-row total"><span>소득인정액</span><div class="f-bar"><i class="sum' + (R > L ? ' over' : '') + '" style="width:' + (R / max * 100).toFixed(1) + '%"></i><em style="left:' + (L / max * 100).toFixed(1) + '%" title="선정기준"></em></div><b class="sum">' + m(R) + '</b></div>' +
      '<p class="f-note">세로선 = ' + r.countSize + '인 선정기준 ' + m(L) + '만원' + (inc.rows[0] && inc.rows[0].deduction ? ' · ' + esc(inc.rows[0].deduction.label) : '') + '</p></div>';
  }
  function renderKpis(r) {
    var box = $('judge-kpis');
    if (!box) return;
    var inc = r.income, over = r.line65 && r.recognized > r.line65;
    box.innerHTML =
      kpi('소득평가액', won(inc.eval), inc.totalEarned ? '근로 ' + man(inc.totalEarned) + ' − 공제 ' + man(inc.totalDeduct) : '근로·사업소득 없음') +
      kpi('재산 소득환산액', won(r.assets.total), '주거 ' + man(r.assets.conv.housing) + ' · 일반 ' + man(r.assets.conv.general) + ' · 금융 ' + man(r.assets.conv.financial)) +
      kpi('소득인정액', '<span class="accent">' + won(r.recognized) + '</span>', '월 기준') +
      kpi(r.countSize + '인 선정기준 (65%)', r.line65 ? won(r.line65) : '표 밖', r.line65 ? '<span class="' + (over ? 'neg' : 'pos') + '">' + (over ? '초과 ' : '여유 +') + won(Math.abs(r.line65 - r.recognized)) + '</span>' : '담당자 확인');
    box.hidden = false;
  }
  function kpi(k, v, sub) { return '<div class="kpi"><span class="k">' + k + '</span><span class="v">' + v + '</span><span class="s">' + sub + '</span></div>'; }
  function tile(k, v) { return '<div class="tile"><span class="k">' + k + '</span><span class="v">' + v + '</span></div>'; }
  function stat(k, v) { return '<div class="stat"><div class="k">' + k + '</div><div class="v">' + v + '</div></div>'; }
  function li(x) { return '<li>' + esc(x) + '</li>'; }

  $('btn-judge').addEventListener('click', function () {
    var input = collectInput();
    var r = Calc.evaluate(input);
    lastResult = r; lastInput = input;
    renderResult(r, input);
  });

  // ---------- 초기화·예시 ----------
  function resetForm() {
    document.querySelectorAll('#tab-judge input').forEach(function (el) {
      if (el.type === 'checkbox') el.checked = el.id === 'houseLiving';
      else if (el.id !== 'baseMonth') el.value = '';
    });
    $('familyType').value = 'single'; $('reason').value = 'divorce'; $('region').value = 'gyeonggi';
    $('grandParentsIncome').value = 'ok';
    $('kids-table').querySelector('tbody').innerHTML = '';
    $('cars-table').querySelector('tbody').innerHTML = '';
    incomeStore = {}; kidSeq = 0; carSeq = 0;
    $('result').innerHTML = RESULT_EMPTY;
    if ($('judge-kpis')) { $('judge-kpis').hidden = true; $('judge-kpis').innerHTML = ''; }
    lastResult = null; lastInput = null;
    addKid();
    updateVisibility();
  }
  $('btn-reset').addEventListener('click', function () {
    if (confirm('입력한 내용을 모두 지울까요?')) resetForm();
  });
  $('btn-example').addEventListener('click', function () {
    resetForm();
    var y = +($('baseMonth').value.slice(0, 4));
    $('region').value = 'gyeonggi';
    $('reason').value = 'divorce';
    $('apName').value = '김예시';
    $('apBirth').value = (y - 32) + '-05-10';
    $('kids-table').querySelector('tbody').innerHTML = ''; kidSeq = 0;
    addKid({ name: '첫째', birth: (y - 9) + '-03-02', school: 'elem' });
    addKid({ name: '둘째', birth: (y - 4) + '-11-20', school: 'pre' });
    incomeStore.ap = { regular: '220' };
    buildIncomeTable(true);
    $('childSupport').value = '30';
    $('depositHouse').value = '6,000';
    $('financial').value = '800';
    addCar({ name: '모닝', type: 'passenger', use: 'general', cc: 998, seats: 5, age: 11, value: 3500000 });
    updateVisibility();
    $('btn-judge').click();
  });

  // =====================================================
  // ③ 신청 안내
  // =====================================================
  function renderGuide() {
    var r = lastResult, inp = lastInput;
    var html = '';
    var name = inp && inp.applicant.name ? inp.applicant.name + ' 님' : '신청인';
    html += '<p class="hint" style="margin:0">신청 안내 · ' + new Date().toLocaleDateString('ko-KR') + '</p>';
    html += '<h2>' + (r ? esc(name) : '한부모가족 지원 신청 안내') + '</h2>';
    if (!r) {
      html += '<p class="hint">② 탭에서 판정을 하면 신청인 상황에 맞춘 안내가 만들어집니다. 아래는 공통 안내입니다.</p>';
    } else {
      html += '<div class="tiles">' +
        tile('가구 유형', esc(r.typeLabel) + ' · ' + r.supportSize + '인') +
        tile('소득인정액', '월 ' + won(r.recognized)) +
        tile('예상 급여', r.eligible ? '<span style="color:var(--accent)">월 ' + won(r.monthly) + '</span>' : '해당 없음') +
        '</div><ul class="notes">' +
        '<li>소득인정액 산정 가구원 ' + r.countSize + '인' + (r.line65 ? ' · 선정기준(65%) ' + won(r.line65) : '') + '</li>' +
        (r.eligible
          ? (r.yearlyExtra ? '<li>학용품비 연 ' + won(r.yearlyExtra) + ' (7월)</li>' : '') +
            r.benefits.filter(function (b) { return b.amount; }).map(function (b) { return '<li>' + esc(b.name) + ': ' + b.unit + ' ' + won(b.amount) + '</li>'; }).join('')
          : '<li>' + (r.certOnly ? '한부모가족증명서 발급 대상(복지급여는 기준 초과)' : '모의계산상 복지급여 기준 미충족 — 실제 조사 결과에 따라 달라질 수 있으므로 신청은 가능합니다') + '</li>') +
        '</ul><p class="hint">※ 실제 금액·선정 여부는 신청 후 소득·재산 조사로 결정됩니다.</p>';
    }

    html += '<h3>01 · 신청 장소·방법</h3><ul class="notes">' +
      '<li><b>방문</b>: 주민등록 주소지 또는 실제 거주지 읍·면·동 행정복지센터(주민센터) — 연중 신청</li>' +
      '<li><b>온라인</b>: 복지로 www.bokjiro.go.kr</li>' +
      '<li>본인 외에 가구원·친족·이해관계인(시설 종사자, 자녀 학교 교사 등)이 위임장(서식 Ⅰ-18)과 신분증을 지참해 대리 신청 가능</li>' +
      '<li>실거주지에서 신청해도 결정·급여 지급은 주민등록 주소지 시·군·구에서 합니다</li></ul>';

    var docs = [
      '사회보장급여 신청(변경)서 (서식 Ⅰ-1) — 센터에 비치',
      '소득·재산 신고서 (서식 Ⅰ-2) — 이자·연금소득, 토지·건축물, 금융재산·금융부채는 적지 않아도 됨',
      '금융정보 등 제공 동의서 (서식 Ⅰ-3) — 가구원 전원' + (r && r.countSize > r.supportSize ? ' (연령초과 자녀 포함)' : ''),
      '신분증',
      '가족관계증명서 — 전산으로 확인되면 생략, 미혼 여부는 혼인관계증명서'
    ];
    if (!inp || inp.assets.depositHouse || inp.assets.depositShop) docs.push('임대차계약서 (확정일자 받은 것)');
    if (!inp || inp.foreigner) docs.push('외국인등록사실증명 (외국국적동포는 국내거소신고 사실증명)');
    if (!inp || (inp.children || []).some(function (k) { return k.school === 'univ' || k.school === 'high'; })) docs.push('18세 이상 자녀 재학증명서 (고교·대학 재학 시)');
    if (!inp || inp.birthUnregistered) docs.push('친생자 출생신고 확인 신청서 사본·법원 접수증명원 (출생신고 전 미혼부) — 유전자검사 결과는 6개월 내 제출');
    if (!inp || (r && r.youth)) {
      docs.push('청소년한부모 자립지원 제공 신청서 (서식 Ⅰ-19, 만 24세 이하)');
      docs.push('자립촉진수당: 재학·학원 등록·재직 증명 등 자립활동 증빙');
      docs.push('검정고시 학습지원: 학습지원 신청서, 최종학력 또는 재학증명서, 학원 등록증');
    }
    if (!inp || (inp.assets.cars || []).some(function (c) { return c.use === 'business'; })) docs.push('생업용 자동차: 사업자등록증·운행 관련 증빙 등 생업 사용 확인 자료');
    if (!inp || inp.reason === 'violence') docs.push('가정폭력 확인 서류 (보호시설 입소확인서, 임시조치·보호명령 결정서, 사건결정결과통지서 등)');
    if (!inp || inp.reason === 'spouseDisabled') docs.push('배우자 장애 확인 (중증장애·장애정도가 심한 장애인 등)');
    if (!inp || inp.household.medical) docs.push('만성질환 의료비 공제: 진단서, 최근 3개월 진료비 영수증');
    if (!inp || inp.household.tuition) docs.push('대학생 등록금 지출 공제: 등록금 납입영수증, 재학(휴학)증명서');
    if (!inp || inp.assets.dispGeneral || inp.assets.dispFinancial) docs.push('최근 처분·증여 재산: 매매계약서·통장 거래내역, 사용처 증빙(부동산 계약서, 부채상환증명서, 의료비·교육비 영수증, 납세증명서 등)');
    if (!inp || inp.assets.hardAsset) docs.push('처분 곤란 재산: 가압류·경매 등 등기부등본, 개발제한구역은 토지이용계획확인원 등');
    if (!inp || inp.reason === 'divorce') docs.push('이혼 확인: 협의이혼 확인서 등본(3개월 내) 또는 판결문 — 양육자 지정 확인');
    html += '<h3>02 · 준비 서류</h3><ul class="checklist">' + docs.map(li).join('') + '</ul>';

    html += '<h3>03 · 처리 절차</h3><ol class="steps">' +
      '<li>읍·면·동 신청·접수 — 신청서 낸 날이 <b>급여신청일(=급여 개시일)</b></li>' +
      '<li>시·군·구 통합조사관리팀 소득·재산·가구 조사 (공적자료 조회, 필요 시 가정방문)</li>' +
      '<li>지원 결정 및 서면 통지 — <b>신청일부터 30일 이내</b> (특별한 사유 시 60일)</li>' +
      '<li>매월 정기지급일에 본인 계좌로 입금 — 신청한 달 급여 전액 지급, 학용품비는 7월</li></ol>';

    html += '<div class="notice"><h3 style="margin:0 0 8px;color:var(--ink);font-size:15px;letter-spacing:0">꼭 알려드릴 사항</h3><ul class="notes">' +
      '<li><b>변동 신고 의무</b>: 취업·소득 증가, 재산 취득, 이사, 혼인(사실혼 포함), 가구원 변동 시 즉시 신고</li>' +
      '<li>신고하지 않거나 거짓으로 받은 급여는 환수되며 1년 이하 징역 또는 1천만원 이하 벌금 대상</li>' +
      '<li>지원 중 부·모가 180일 중 60일을 넘게 해외 체류하면 지원 중지</li>' +
      '<li>아이를 출산하면 출생일 포함 60일 이내 신고 시 출생월부터 소급 지급</li>' +
      '<li>결정에 이의가 있으면 통지받은 날부터 90일 이내 시·군·구에 서면 이의신청</li></ul></div>';

    html += '<h3>04 · 연계 기관</h3><ul class="notes">' +
      RULES.contacts.map(function (c) { return '<li><b>' + esc(c.name) + '</b> ☎ ' + esc(c.tel) + (c.web ? ' · ' + esc(c.web) : '') + ' — ' + esc(c.desc) + '</li>'; }).join('') +
      (r ? r.links.map(li).join('') : '') + '</ul>';
    html += '<p class="hint" style="margin-top:32px">근거: ' + RULES.source + '</p>';
    $('guide-content').innerHTML = html;
  }
  $('btn-print').addEventListener('click', function () { renderGuide(); window.print(); });

  // =====================================================
  // ① 전화상담
  // =====================================================
  function quickInput() {
    var base = $('baseMonth').value || todayMonth();
    var y = +base.slice(0, 4), m = base.slice(5, 7);
    var age = num($('q-age').value);
    var kids = Math.max(0, Math.round(num($('q-kids').value)));
    var k6 = Math.min(kids, Math.round(num($('q-kids6').value)));
    var ks = Math.min(kids - k6, Math.round(num($('q-kidsSchool').value)));
    var over = Math.round(num($('q-over').value));
    var children = [];
    var i;
    for (i = 0; i < k6; i++) children.push({ name: '5세 이하 ' + (i + 1), birth: (y - 3) + '-' + m + '-01', school: 'pre' });
    for (i = 0; i < ks; i++) children.push({ name: '초중고 ' + (i + 1), birth: (y - 10) + '-' + m + '-01', school: 'elem' });
    for (i = 0; i < kids - k6 - ks; i++) children.push({ name: '자녀 ' + (i + 1), birth: (y - 7) + '-' + m + '-01', school: 'none' });
    for (i = 0; i < over; i++) children.push({ name: '연령초과 ' + (i + 1), birth: (y - 25) + '-' + m + '-01', school: 'none' });
    var apBirth = age ? (y - age) + '-' + m + '-01' : '';
    var carType = $('q-car').value;
    var carValue = manToWon($('q-carValue').value);
    var cars = carType === 'general' ? [{ type: 'passenger', use: 'general', cc: 1600, age: 10, value: carValue }]
      : carType === 'full' ? [{ type: 'other', use: 'general', value: carValue }] : [];
    var grand = $('q-type').value === 'grand';
    return {
      baseMonth: base, region: $('q-region').value, familyType: $('q-type').value,
      reason: grand ? 'grand' : ($('q-unmarried').checked ? 'unmarried' : 'divorce'),
      unmarried: !grand && $('q-unmarried').checked,
      applicant: { birth: apBirth }, grandParentsIncome: 'ok',
      children: children,
      incomePersons: [{ name: '신청인', birth: apBirth, regular: manToWon($('q-earned').value), publicTransfer: manToWon($('q-other').value) }],
      household: {},
      assets: { housePrice: manToWon($('q-house').value), houseLiving: true, financial: manToWon($('q-fin').value), cars: cars, debtFin: manToWon($('q-debt').value) }
    };
  }
  $('q-run').addEventListener('click', function () {
    var r = Calc.evaluate(quickInput());
    var html = heroHtml(r) + '<div class="res-card">' + benefitRowsHtml(r) + quickBasisHtml(r) +
      '<p class="hint" style="margin-top:10px">근로소득은 신청인 나이 기준 공제를 적용한 대략값입니다. 금융재산·부채·자녀 연령 세부사항에 따라 달라집니다.</p></div>';
    $('q-result').innerHTML = html;
  });

  // 30초 사전 확인: 소득인정액 산출 근거
  function quickBasisHtml(r) {
    var inc = r.income, as = r.assets, C = RULES.conversion;
    var row0 = inc.rows[0] || { earned: 0, deduction: { amount: 0, label: '해당 없음' }, other: 0 };
    function kv(k, v, cls) { return '<li' + (cls ? ' class="' + cls + '"' : '') + '><span>' + k + '</span><b>' + v + '</b></li>'; }
    var h = '<div class="basis"><h4>소득인정액 산출 근거</h4>';
    h += '<p class="basis-step">① 소득평가액 <small>(p.82~91)</small></p><ul class="kv">' +
      kv('근로·사업소득', won(row0.earned)) +
      kv('근로소득공제 <small>' + esc(row0.deduction.label) + '</small>', '− ' + won(row0.deduction.amount)) +
      (row0.other ? kv('그 밖의 소득', '+ ' + won(row0.other)) : '') +
      kv('소득평가액', won(inc.eval), 'sum') + '</ul>';
    h += '<p class="basis-step">② 재산의 소득환산액 <small>(p.151~152)</small></p>';
    if (as.steps.length) h += '<ul class="notes basis-notes">' + as.steps.map(li).join('') + '</ul>';
    h += '<ul class="kv">' +
      kv('주거용재산 ' + won(as.net.housing) + ' × ' + (C.housing * 100).toFixed(2) + '%', won(as.conv.housing)) +
      (as.net.general ? kv('일반재산 ' + won(as.net.general) + ' × ' + (C.general * 100).toFixed(2) + '%', won(as.conv.general)) : '') +
      (as.net.financial ? kv('금융재산 ' + won(as.net.financial) + ' × ' + (C.financial * 100).toFixed(2) + '%', won(as.conv.financial)) : '') +
      (as.net.car100 ? kv('일반환산 불가 자동차 ' + won(as.net.car100) + ' × 100%', won(as.conv.car100)) : '') +
      kv('재산 소득환산액', won(as.total), 'sum') + '</ul>';
    h += '<p class="basis-step">③ 소득인정액</p><ul class="kv">' +
      kv(won(inc.eval) + ' + ' + won(as.total), won(r.recognized), 'sum');
    if (r.line65) {
      h += kv(r.countSize + '인 선정기준 (중위소득 65%)', won(r.line65)) +
        kv(r.recognized <= r.line65 ? '기준까지 여유' : '기준 초과', won(Math.abs(r.line65 - r.recognized)), r.recognized <= r.line65 ? 'ok' : 'over');
    }
    h += '</ul></div>';
    return h;
  }
  // 30초 사전 확인 초기화
  var Q_RESULT_EMPTY = $('q-result').innerHTML;
  $('q-reset').addEventListener('click', function () {
    $('q-type').value = 'single';
    $('q-region').value = 'gyeonggi';
    $('q-unmarried').checked = false;
    $('q-car').value = 'none';
    $('q-age').value = '';
    $('q-kids').value = '1';
    ['q-kids6', 'q-kidsSchool', 'q-over'].forEach(function (id) { $(id).value = '0'; });
    ['q-earned', 'q-other', 'q-house', 'q-fin', 'q-debt', 'q-carValue'].forEach(function (id) { $(id).value = ''; });
    $('q-result').innerHTML = Q_RESULT_EMPTY;
    $('q-age').focus();
  });
  $('q-to-judge').addEventListener('click', function () {
    var qi = quickInput();
    resetForm();
    $('familyType').value = qi.familyType; $('region').value = qi.region;
    if (qi.familyType === 'single') $('reason').value = qi.reason;
    $('unmarried').checked = qi.unmarried;
    $('apBirth').value = qi.applicant.birth ? qi.applicant.birth : '';
    $('kids-table').querySelector('tbody').innerHTML = ''; kidSeq = 0;
    qi.children.forEach(function (c) { addKid({ name: c.name, birth: c.birth, school: c.school }); });
    incomeStore.ap = { regular: wonToMan(qi.incomePersons[0].regular), publicTransfer: wonToMan(qi.incomePersons[0].publicTransfer) };
    buildIncomeTable(true);
    if (qi.assets.housePrice) $('housePrice').value = wonToMan(qi.assets.housePrice);
    if (qi.assets.financial) $('financial').value = wonToMan(qi.assets.financial);
    if (qi.assets.debtFin) $('debtFin').value = wonToMan(qi.assets.debtFin);
    qi.assets.cars.forEach(function (c) {
      addCar({ name: c.type === 'other' ? '그 외 자동차' : '승용차', type: c.type === 'other' ? 'other' : 'passenger',
        use: 'general', cc: c.cc, age: c.age, value: c.value });
    });
    updateVisibility();
    showTab('judge');
    // 넘겨받은 값으로 바로 판정하고, 확인할 점을 결과 위에 안내
    $('btn-judge').click();
    $('result').insertAdjacentHTML('afterbegin',
      '<div class="transfer-note"><b>전화상담에서 넘겨받은 값으로 판정했습니다.</b>' +
      '자녀 생년월일은 나이 구간으로 추정한 값입니다. 실제 생년월일·학적, 주택이 자가인지 전·월세인지, 자동차 배기량·차령을 확인해 고친 뒤 [판정하기]를 다시 누르세요.</div>');
  });

  // FAQ
  var faqCat = 'all';
  function renderFaqCats() {
    var cats = [{ id: 'all', label: '전체' }].concat(FAQ_CATEGORIES);
    $('faq-cats').innerHTML = cats.map(function (c) {
      return '<button class="chip' + (c.id === faqCat ? ' active' : '') + '" data-c="' + c.id + '">' + esc(c.label) + '</button>';
    }).join('');
    $('faq-cats').querySelectorAll('.chip').forEach(function (b) {
      b.addEventListener('click', function () { faqCat = b.dataset.c; renderFaqCats(); renderFaq(); });
    });
  }
  function highlight(text, q) {
    var t = esc(text);
    if (!q) return t;
    var words = q.split(/\s+/).filter(Boolean).map(function (w) { return esc(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
    if (!words.length) return t;
    return t.replace(new RegExp('(' + words.join('|') + ')', 'g'), '<mark>$1</mark>');
  }
  function renderFaq() {
    var q = $('faq-search').value.trim();
    var words = q.split(/\s+/).filter(Boolean);
    var items = FAQ.filter(function (f) {
      if (faqCat !== 'all' && f.cat !== faqCat) return false;
      var hay = f.q + ' ' + f.a;
      return words.every(function (w) { return hay.indexOf(w) >= 0; });
    });
    $('faq-list').innerHTML = items.length ? items.map(function (f) {
      return '<details class="faq-item"' + (words.length ? ' open' : '') + '><summary>' + highlight(f.q, q) + '</summary>' +
        '<div class="ans">' + highlight(f.a, q) + '\n<span class="pg">근거: 지침 ' + esc(f.page) + '</span></div></details>';
    }).join('') : '<p class="hint">검색 결과가 없습니다.</p>';
  }
  $('faq-search').addEventListener('input', renderFaq);

  function renderKeyNumbers() {
    var sizes = [2, 3, 4, 5, 6];
    var B = RULES.benefit;
    var C = RULES.conversion;
    var html =
      '<h3>급여 단가</h3><div class="tiles">' +
      tile('아동양육비', '월 ' + man(B.childCare)) +
      tile('추가아동양육비', '월 ' + man(B.extraChildCare)) +
      tile('청소년한부모 양육비', '월 ' + man(B.youthChildCare) + '~' + man(B.youthChildCareInfant)) +
      tile('학용품비 (초·중·고)', '연 ' + man(B.schoolSupplies)) +
      tile('생활보조금 (시설)', '월 ' + man(B.livingAllowance)) +
      tile('자립촉진수당', '월 ' + man(B.youthSelfReliance)) +
      '</div>' +
      '<h3>소득인정액 기준 (월, 원)</h3>' +
      '<table class="data-table"><thead><tr><th>가구원</th><th>급여 65%</th><th>청소년 72%</th></tr></thead><tbody>' +
      sizes.map(function (s) {
        return '<tr><td>' + s + '인</td><td class="em">' + RULES.line65[s].toLocaleString('ko-KR') + '</td><td>' + RULES.line72[s].toLocaleString('ko-KR') + '</td></tr>';
      }).join('') +
      '</tbody></table>' +
      '<p class="hint" style="margin-top:6px">한부모가족복지시설 입소: 기준 중위소득 100% 이하</p>' +
      '<h3>재산 기본공제 · 주거용재산 한도</h3>' +
      '<table class="data-table"><thead><tr><th>지역</th><th>기본공제</th><th>주거용 한도</th></tr></thead><tbody>' +
      Object.keys(RULES.regions).map(function (k) {
        var g = RULES.regions[k];
        return '<tr><td>' + esc(g.label) + '</td><td>' + man(g.basic) + '</td><td>' + man(g.housingCap) + '</td></tr>';
      }).join('') +
      '</tbody></table>' +
      '<h3>재산 소득환산율 (월)</h3><ul class="kv">' +
      '<li><span>주거용재산</span><b>' + (C.housing * 100).toFixed(2) + '%</b></li>' +
      '<li><span>일반재산</span><b>' + (C.general * 100).toFixed(2) + '%</b></li>' +
      '<li><span>금융재산 (생활준비금 ' + man(RULES.livingReserve) + ' 공제)</span><b>' + (C.financial * 100).toFixed(2) + '%</b></li>' +
      '<li><span>일반환산 불가 자동차</span><b>100%</b></li></ul>' +
      '<h3>근로·사업소득 공제</h3><ul class="kv">' +
      '<li><span>기본</span><b>30%</b></li>' +
      '<li><span>34세 이하 · 대학생</span><b>60만원 + 30%</b></li>' +
      '<li><span>65세 이상 · 등록장애인 등</span><b>20만원 + 30%</b></li></ul>' +
      '<h3>연락처</h3><ul class="kv">' +
      RULES.contacts.map(function (c) { return '<li><span>' + esc(c.name) + '</span><b>' + esc(c.tel) + '</b></li>'; }).join('') +
      '</ul>';
    $('key-numbers').innerHTML = html;
  }

  // 좌측 메뉴 아래 핵심 숫자 요약
  function renderSideSummary() {
    var B = RULES.benefit;
    $('side-summary').innerHTML =
      '<div><span>아동양육비</span><b>월 ' + man(B.childCare) + '</b></div>' +
      '<div><span>3인 기준 65%</span><b class="em">' + man(Math.round(RULES.line65[3] / 10000) * 10000) + '</b></div>' +
      '<div><span>청소년한부모</span><b>월 ' + (B.youthChildCare / 10000) + '~' + man(B.youthChildCareInfant) + '</b></div>';
  }
  renderSideSummary();

  // 2026 핵심 숫자 사이드바
  function setSidebar(open) {
    $('sidebar').classList.toggle('open', open);
    $('sidebar').setAttribute('aria-hidden', open ? 'false' : 'true');
    $('sidebar-backdrop').hidden = !open;
    $('btn-keys').setAttribute('aria-expanded', open ? 'true' : 'false');
    $('btn-keys').classList.toggle('active', open);
    if (open) $('sb-close').focus();
  }
  $('btn-keys').addEventListener('click', function () { setSidebar(!$('sidebar').classList.contains('open')); });
  $('sb-close').addEventListener('click', function () { setSidebar(false); $('btn-keys').focus(); });
  $('sidebar-backdrop').addEventListener('click', function () { setSidebar(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && $('sidebar').classList.contains('open')) { setSidebar(false); $('btn-keys').focus(); }
  });

  // ---------- 30초 사전 확인: 가구 유형 토글 · 자녀 수 스테퍼 ----------
  function enhanceQuickForm() {
    var sel = $('q-type');
    if (sel && !sel.dataset.enhanced) {
      sel.dataset.enhanced = '1';
      var seg = document.createElement('div');
      seg.className = 'segmented'; seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', '가구 유형');
      Array.prototype.forEach.call(sel.options, function (o) {
        var b = document.createElement('button');
        b.type = 'button'; b.textContent = o.textContent; b.dataset.value = o.value;
        b.addEventListener('click', function () { sel.value = o.value; sel.dispatchEvent(new Event('change', { bubbles: true })); sync(); });
        seg.appendChild(b);
      });
      function sync() { seg.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.value === sel.value ? 'true' : 'false'); }); }
      sel.addEventListener('change', sync);
      sel.classList.add('visually-hidden'); sel.tabIndex = -1;
      sel.parentNode.insertBefore(seg, sel);
      // 라벨 글자를 눌러도 토글 버튼이 눌리지 않도록 라벨을 숨은 선택칸에 연결
      if (sel.closest('label')) sel.closest('label').htmlFor = sel.id;
      sync();
      $('q-reset').addEventListener('click', sync);
    }
    ['q-kids', 'q-kids6', 'q-kidsSchool', 'q-over'].forEach(function (id) {
      var inp = $(id);
      if (!inp || inp.dataset.enhanced) return;
      inp.dataset.enhanced = '1';
      var wrap = document.createElement('span'); wrap.className = 'stepper';
      inp.parentNode.insertBefore(wrap, inp);
      function btn(txt, d, label) {
        var b = document.createElement('button');
        b.type = 'button'; b.textContent = txt; b.className = d > 0 ? 'plus' : 'minus'; b.setAttribute('aria-label', label);
        b.addEventListener('click', function () {
          var v = Math.max(+inp.min || 0, Math.min(+inp.max || 10, (parseInt(inp.value, 10) || 0) + d));
          inp.value = v; inp.dispatchEvent(new Event('input', { bubbles: true }));
        });
        return b;
      }
      var name = (inp.closest('label') ? inp.closest('label').firstChild.textContent : '').trim();
      // 라벨 안 첫 번째 버튼(−)이 라벨 클릭을 받지 않도록 라벨을 숫자칸에 직접 연결
      if (inp.closest('label')) inp.closest('label').htmlFor = inp.id;
      wrap.appendChild(btn('−', -1, name + ' 줄이기'));
      wrap.appendChild(inp);
      wrap.appendChild(btn('+', 1, name + ' 늘리기'));
    });
  }
  enhanceQuickForm();


  // =====================================================
  // 상담 내용 저장 · 불러오기 · 마지막 작업 기억
  //  - 30초 사전 확인 + 자격·급여 판정 입력을 한 묶음(JSON)으로 다룸
  //  - 파일: 내 PC에 .json 파일로 내려받고, 다시 불러와 그대로 복원
  //  - 마지막 작업: 입력할 때마다 이 브라우저(localStorage)에 자동 저장 → 다음에 열면 복원
  // =====================================================
  var STATE_APP = 'hanbumo-consult', STATE_VER = 1, LAST_KEY = 'hanbumo-last-work-v1';
  var restoring = false;

  function fieldValues(scope) {
    var out = {};
    document.querySelectorAll(scope + ' input[id], ' + scope + ' select[id]').forEach(function (el) {
      if (el.type === 'file') return;
      out[el.id] = el.type === 'checkbox' ? el.checked : el.value;
    });
    return out;
  }
  function setFieldValues(map) {
    Object.keys(map || {}).forEach(function (id) {
      var el = $(id);
      if (!el || el.type === 'file') return;
      if (el.type === 'checkbox') el.checked = !!map[id]; else el.value = map[id];
    });
  }

  function collectState() {
    saveIncomeTable();
    var kidRows = Array.prototype.slice.call($('kids-table').querySelectorAll('tbody tr'));
    return {
      app: STATE_APP, version: STATE_VER, savedAt: new Date().toISOString(),
      tab: (document.querySelector('.panel.active') || {}).id || 'tab-phone',
      quick: { fields: fieldValues('#tab-phone'), ran: !!$('q-result').querySelector('.hero') },
      judge: {
        fields: fieldValues('#tab-judge'),
        kids: readKids().map(function (k) {
          return { name: k.name, birth: k.birth, school: k.school, raised: k.raisedByApplicant, married: k.married,
            leave: k.leaveOfAbsence, institution: k.institution, military: k.militaryMonths, selfReliance: k.selfReliance };
        }),
        cars: Array.prototype.map.call($('cars-table').querySelectorAll('tbody tr'), function (tr) {
          var o = {};
          tr.querySelectorAll('[data-f]').forEach(function (el) { o[el.dataset.f] = el.value; });
          o.value = manToWon(o.value);
          return o;
        }),
        income: {
          ap: incomeStore.ap || {}, sp: incomeStore.sp || {},
          kids: kidRows.map(function (tr) { return incomeStore['k' + tr.dataset.id] || {}; })
        },
        judged: !!lastResult
      }
    };
  }

  function applyState(st) {
    if (!st || st.app !== STATE_APP) throw new Error('한부모 상담 도우미에서 저장한 파일이 아닙니다.');
    restoring = true;
    try {
      // 30초 사전 확인
      setFieldValues(st.quick && st.quick.fields);
      $('q-type').dispatchEvent(new Event('change'));
      $('q-result').innerHTML = Q_RESULT_EMPTY;

      // 자격·급여 판정
      var j = st.judge || {};
      resetForm();
      setFieldValues(j.fields);
      // 예전 파일: 긴급복지 생계·교육지원이 체크박스 하나(emergency)였음
      if (j.fields && j.fields.emergency) { $('emergencyLiving').checked = true; $('emergencyEdu').checked = true; }
      $('kids-table').querySelector('tbody').innerHTML = ''; kidSeq = 0;
      $('cars-table').querySelector('tbody').innerHTML = ''; carSeq = 0;
      $('income-table').innerHTML = ''; // 빈 표의 값이 저장된 소득을 덮어쓰지 않도록
      incomeStore = { ap: (j.income && j.income.ap) || {}, sp: (j.income && j.income.sp) || {} };
      (j.kids || []).forEach(function (k) { addKid(k); });
      if (!(j.kids || []).length) addKid();
      Array.prototype.forEach.call($('kids-table').querySelectorAll('tbody tr'), function (tr, i) {
        var inc = j.income && j.income.kids && j.income.kids[i];
        if (inc) incomeStore['k' + tr.dataset.id] = inc;
      });
      buildIncomeTable(true);
      (j.cars || []).forEach(function (c) { addCar(c); });
      updateVisibility();

      // 결과가 있던 화면은 다시 계산해서 보여 줌
      if (st.quick && st.quick.ran) $('q-run').click();
      if (j.judged) $('btn-judge').click();
      var tab = (st.tab || 'tab-phone').replace(/^tab-/, '');
      if (document.querySelector('.tab[data-tab="' + tab + '"]')) showTab(tab);
    } finally {
      restoring = false;
      setTimeout(markNumbers, 0);
    }
  }

  // ---------- 파일로 저장 / 불러오기 ----------
  function stamp(d) {
    function p(n) { return String(n).padStart(2, '0'); }
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes());
  }
  function saveToFile() {
    var st = collectState();
    var who = ($('apName').value || '').trim().replace(/[\\/:*?"<>|\s]+/g, '_');
    var name = '한부모상담_' + (who ? who + '_' : '') + stamp(new Date()) + '.json';
    var blob = new Blob([JSON.stringify(st, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    toast('상담 내용을 파일로 저장했습니다: ' + name);
  }
  $('state-file').addEventListener('change', function () {
    var f = this.files && this.files[0];
    this.value = '';
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var st = JSON.parse(reader.result);
        applyState(st);
        saveLast();
        toast('파일을 불러왔습니다: ' + f.name + (st.savedAt ? ' (저장 ' + new Date(st.savedAt).toLocaleString('ko-KR') + ')' : ''));
      } catch (e) {
        alert('파일을 불러오지 못했습니다.\n' + e.message);
      }
    };
    reader.readAsText(f, 'utf-8');
  });
  document.querySelectorAll('[data-act="save-file"]').forEach(function (b) { b.addEventListener('click', saveToFile); });
  document.querySelectorAll('[data-act="load-file"]').forEach(function (b) { b.addEventListener('click', function () { $('state-file').click(); }); });

  // ---------- 마지막 작업 자동 저장 ----------
  var saveTimer = null;
  function saveLast() {
    try { localStorage.setItem(LAST_KEY, JSON.stringify(collectState())); } catch (e) {}
  }
  function scheduleSave() {
    if (restoring) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveLast, 400);
  }
  ['input', 'change', 'click'].forEach(function (ev) {
    document.addEventListener(ev, function (e) {
      if (e.target && e.target.closest && e.target.closest('#tab-phone, #tab-judge, .side')) scheduleSave();
    }, true);
  });
  window.addEventListener('beforeunload', function () { if (!restoring) saveLast(); });

  // ---------- 안내 토스트 ----------
  var toastTimer = null;
  function toast(msg, actionLabel, action) {
    var t = $('toast');
    t.innerHTML = '<span>' + esc(msg) + '</span>' + (actionLabel ? '<button type="button" class="toast-act">' + esc(actionLabel) + '</button>' : '') +
      '<button type="button" class="toast-x" aria-label="닫기">✕</button>';
    t.hidden = false;
    if (actionLabel) t.querySelector('.toast-act').addEventListener('click', function () { action(); t.hidden = true; });
    t.querySelector('.toast-x').addEventListener('click', function () { t.hidden = true; });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, actionLabel ? 12000 : 5000);
  }

  // 입력 내용만 비교용으로 뽑음 (저장 시각·탭·기준월 제외)
  function contentKey(st) {
    var jf = Object.assign({}, st.judge && st.judge.fields);
    delete jf.baseMonth;
    return JSON.stringify([st.quick && st.quick.fields, jf, st.judge && st.judge.kids, st.judge && st.judge.cars, st.judge && st.judge.income]);
  }

  // 페이지를 열 때 마지막 작업 복원 (빈 기본 상태면 아무것도 하지 않음)
  function restoreLast() {
    var st = null;
    try { st = JSON.parse(localStorage.getItem(LAST_KEY) || 'null'); } catch (e) {}
    if (!st || st.app !== STATE_APP) return;
    if (contentKey(st) === contentKey(collectState())) return;
    try { applyState(st); } catch (e) { return; }
    toast('마지막 작업 내용을 불러왔습니다 (' + new Date(st.savedAt).toLocaleString('ko-KR') + ')', '새로 시작', function () {
      try { localStorage.removeItem(LAST_KEY); } catch (e) {}
      $('q-reset').click();
      resetForm();
      showTab('phone');
      saveLast();
    });
  }

  // ---------- 0보다 큰 숫자가 들어간 입력칸 강조 ----------
  function markNumbers() {
    document.querySelectorAll('input.money, input[type=number]').forEach(function (el) {
      el.classList.toggle('has-value', num(el.value) > 0);
    });
  }
  var markTimer = null;
  function scheduleMark() { clearTimeout(markTimer); markTimer = setTimeout(markNumbers, 0); }
  // 직접 입력뿐 아니라 버튼(예시·초기화·불러오기·스테퍼 등)으로 값이 바뀐 경우도 반영
  ['input', 'change', 'click'].forEach(function (ev) { document.addEventListener(ev, scheduleMark, true); });

  // 시작
  renderFaqCats(); renderFaq(); renderKeyNumbers();
  addKid();
  updateVisibility();
  restoreLast();
  markNumbers();
})();
