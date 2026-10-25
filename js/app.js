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
      '<td><input data-f="name" placeholder="자녀' + id + '" value="' + esc(d.name || '') + '"></td>' +
      '<td><input data-f="birth" type="date" value="' + esc(d.birth || '') + '"></td>' +
      '<td><select data-f="school">' + SCHOOL_OPTS.map(function (o) {
        return '<option value="' + o[0] + '"' + (d.school === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('') + '</select></td>' +
      '<td class="c"><input data-f="raised" type="checkbox"' + (d.raised === false ? '' : ' checked') + '></td>' +
      '<td class="c"><input data-f="married" type="checkbox"' + (d.married ? ' checked' : '') + '></td>' +
      '<td class="c"><input data-f="leave" type="checkbox"' + (d.leave ? ' checked' : '') + '></td>' +
      '<td class="c"><input data-f="institution" type="checkbox"' + (d.institution ? ' checked' : '') + '></td>' +
      '<td><input data-f="military" type="number" min="0" max="48" value="' + esc(d.military || '') + '" style="min-width:60px"></td>' +
      '<td class="c"><input data-f="selfReliance" type="checkbox"' + (d.selfReliance ? ' checked' : '') + ' title="18~34세 연령초과 자녀가 월 90만원 이상 취·창업 소득이 있어 자립지원 별도가구 특례 적용"></td>' +
      '<td><button class="btn del" title="삭제">✕</button></td>';
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

  var CAR_TYPES = [['passenger', '승용'], ['van', '소형 이하 승합'], ['truck', '소형 이하 화물'], ['moto', '이륜'], ['other', '그 외(중형 이상 승합·화물 등)']];
  var CAR_USES = [['general', '일반(자가용)'], ['business', '생업용'], ['disabled', '장애인사용·보철용']];
  function addCar(d) {
    d = d || {};
    var id = ++carSeq;
    var tr = document.createElement('tr');
    function opts(list, v) { return list.map(function (o) { return '<option value="' + o[0] + '"' + (v === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join(''); }
    tr.innerHTML =
      '<td><input data-f="name" placeholder="예: 아반떼" value="' + esc(d.name || '') + '"></td>' +
      '<td><select data-f="type">' + opts(CAR_TYPES, d.type || 'passenger') + '</select></td>' +
      '<td><select data-f="use">' + opts(CAR_USES, d.use || 'general') + '</select></td>' +
      '<td><input data-f="cc" type="number" min="0" value="' + esc(d.cc || '') + '"></td>' +
      '<td><input data-f="seats" type="number" min="1" value="' + esc(d.seats || '') + '"></td>' +
      '<td><input data-f="age" type="number" min="0" value="' + esc(d.age || '') + '"></td>' +
      '<td><input data-f="value" class="money" inputmode="numeric" value="' + (d.value ? wonToMan(d.value) : '') + '"></td>' +
      '<td><button class="btn del" title="삭제">✕</button></td>';
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
    ['g', '근로소득'], ['regular', '상시근로'], ['daily', '일용근로'],
    ['g', '사업소득'], ['farm', '농업소득'], ['forest', '임업소득'], ['fish', '어업소득'], ['business', '그 밖의 사업소득(자영업)'],
    ['g', '재산소득·이전소득'], ['rent', '임대소득'], ['pension', '연금소득(사적연금)'],
    ['publicTransfer', '공적이전소득(국민연금·실업·육아휴직급여 등)'], ['otherIncome', '그 밖의 소득(지자체 지원금 등)']
  ];
  function incomePersons() {
    var list = [{ key: 'ap', name: ($('apName').value.trim() || '신청인'), role: 'applicant' }];
    if ($('familyType').value === 'single' && $('reason').value === 'spouseDisabled') {
      list.push({ key: 'sp', name: '배우자', role: 'spouse' });
    }
    readKids().forEach(function (k) {
      if (k.raisedByApplicant && !k.married && !k.institution) list.push({ key: 'k' + k.id, name: k.name, role: 'child', kid: k });
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
      html += '<tr><th>' + r[1] + '</th>' + persons.map(function (p) {
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
  }
  ['familyType', 'reason', 'apBirth', 'baseMonth'].forEach(function (id) {
    $(id).addEventListener('change', function () { updateVisibility(); buildIncomeTable(); });
  });
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
      emergencyLiving: checked('emergency'), emergencyEdu: checked('emergency'), fosterCare: checked('fosterCare'),
      cohabitWithEx: !grand && checked('cohabitWithEx'), commonLaw: !grand && checked('commonLaw'),
      birthUnregistered: !grand && checked('birthUnregistered'),
      grandParentsIncome: $('grandParentsIncome').value, grandBoth: grand && checked('grandBoth'),
      youthActivity: checked('youthActivity'), youthNoHighSchool: checked('youthNoHighSchool'), youthInSchool: checked('youthInSchool'),
      children: kids,
      incomePersons: persons,
      household: {
        interestYear: val('interestYear'), privateRegular: val('privateRegular'), childSupport: val('childSupport'),
        medical: val('medical'), pensionPremium: val('pensionPremium')
      },
      assets: {
        housePrice: val('housePrice'), houseLiving: checked('houseLiving'), otherBuilding: val('otherBuilding'), land: val('land'),
        depositHouse: val('depositHouse'), depositShop: val('depositShop'), depositOther: val('depositOther'),
        financial: val('financial'), movable: val('movable'), cars: readCars(),
        debtFin: val('debtFin'), debtOther: val('debtOther'), debtRentDeposit: val('debtRentDeposit'), debtCourt: val('debtCourt')
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
    var html = verdictHtml(r);
    if (r.line65) {
      html += '<div class="meter-row"><span>소득인정액</span><b>' + won(r.recognized) + '</b></div>' +
        '<div class="meter' + (r.recognized > r.line65 ? ' over' : '') + '"><span style="width:' + ratio.toFixed(1) + '%"></span></div>' +
        '<div class="meter-foot"><span>기준 대비 ' + (r.recognized / r.line65 * 100).toFixed(0) + '%</span><span>' + r.countSize + '인 기준 ' + won(r.line65) + '</span></div>';
    }

    if (r.benefits.length) {
      html += '<h4>받을 수 있는 급여</h4><ul class="benefit-list">' + r.benefits.map(function (b) {
        return '<li class="' + (b.amount ? '' : 'zero') + '"><div>' + esc(b.name) + '<small>' + esc(b.detail) + '</small></div>' +
          '<div class="amt">' + (b.amount ? (b.unit + ' ' + won(b.amount)) : '해당 없음') + '</div></li>';
      }).join('') + '</ul>';
    }

    html += '<div class="stats">' +
      stat('가구 유형', esc(r.typeLabel) + (r.applicantAge != null ? ' · 만 ' + r.applicantAge + '세' : '')) +
      stat('지원 / 산정 가구원', r.supportSize + '인 / ' + r.countSize + '인') +
      stat('소득평가액', won(r.income.eval)) +
      stat('재산 소득환산액', won(r.assets.total)) +
      (r.youth && r.line72 ? stat('증명서 기준 72%', won(r.line72)) : '') +
      '</div>';
    html += '<button class="btn block" id="to-guide">신청 안내 보기 →</button>';

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
      (inc.privateRegular ? '<li>정기 사적이전소득 ' + won(inc.privateRegular) + ' − 기준중위소득 15%(' + won(inc.privateExempt) + ') = 반영 ' + won(inc.privateCounted) + '</li>' : '') +
      (inc.childSupport ? '<li>양육비·선지급금 ' + won(inc.childSupport) + ' 사적이전소득으로 전액 반영(보수적 계산 — 실제 반영 방식은 조사 시 확인)</li>' : '') +
      (inc.specialExpense ? '<li>가구특성 지출(의료비 + 국민연금 보험료 75%) ' + won(inc.specialExpense) + ' 차감</li>' : '') +
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
      '<p class="disclaimer">모의계산입니다. 최종 결정은 사회보장정보시스템 공적자료 조회·조사 결과에 따릅니다. 기준월 ' + r.base.y + '년 ' + r.base.m + '월</p>';

    el.innerHTML = html;
    el.scrollTop = 0;
    $('to-guide').addEventListener('click', function () { showTab('guide'); });
    if (getComputedStyle(el).position !== 'sticky') el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
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
      else if (el.type !== 'month') el.value = '';
    });
    $('familyType').value = 'single'; $('reason').value = 'divorce'; $('region').value = 'gyeonggi';
    $('grandParentsIncome').value = 'ok';
    $('kids-table').querySelector('tbody').innerHTML = '';
    $('cars-table').querySelector('tbody').innerHTML = '';
    incomeStore = {}; kidSeq = 0; carSeq = 0;
    $('result').innerHTML = RESULT_EMPTY;
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
    var cls = r.eligible ? 'ok' : (r.certOnly ? 'warn' : 'bad');
    var title = !r.eligibleBasic ? '가구 요건 확인 필요'
      : r.eligible ? '대상 가능성 높음 · ' + r.typeLabel
      : r.certOnly ? '증명서만 가능(청소년한부모 72%)' : '기준 초과 가능성';
    var html = '<div class="box"><span class="badge ' + cls + '">' + esc(title) + '</span>';
    if (r.eligible) html += '<div class="big-num" style="margin-top:10px">월 ' + won(r.monthly) + '</div>' + (r.yearlyExtra ? '<p class="hint" style="margin:0">+ 학용품비 연 ' + won(r.yearlyExtra) + '</p>' : '');
    html += '<p class="hint" style="margin:6px 0 0">소득인정액 약 ' + won(r.recognized) + (r.line65 ? ' / ' + r.countSize + '인 기준 ' + won(r.line65) : '') + '</p>';
    if (!r.eligibleBasic) html += '<ul class="notes">' + r.reasons.map(li).join('') + '</ul>';
    html += '</div>' + quickBasisHtml(r) +
      '<p class="hint" style="margin-top:10px">근로소득은 신청인 나이 기준 공제를 적용한 대략값입니다. 금융재산·부채·자녀 연령 세부사항에 따라 달라집니다.</p>';
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

  // 시작
  renderFaqCats(); renderFaq(); renderKeyNumbers();
  addKid();
  updateVisibility();
})();
