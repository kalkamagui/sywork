/*
 * 참고 자료 메뉴: 성평등가족부 누리집 정책 안내 페이지
 * 메뉴를 열 때마다 원문 페이지를 실시간으로 불러와 보기 좋게 정리해 보여 줍니다.
 * (원문 서버가 Access-Control-Allow-Origin: * 를 허용하므로 서버 없이 브라우저에서 바로 읽음)
 * 원문의 스크립트·스타일·이미지는 쓰지 않고, 허용한 태그의 글자만 옮겨 담습니다.
 * 페이지를 추가하려면 PAGES에 항목을 넣고 index.html 사이드바에 같은 data-tab 버튼을 추가하세요.
 */
(function (root) {
  var ORIGIN = 'https://www.mogef.go.kr';
  var PAGES = {
    single: { title: '한부모가족 자녀양육 지원', url: ORIGIN + '/sp/fam/sp_fam_f006.do' },
    youth: { title: '청소년 한부모 아동양육 및 자립지원', url: ORIGIN + '/sp/fam/sp_fam_f007.do' },
    care: { title: '아이돌봄지원사업', url: ORIGIN + '/sp/fam/sp_fam_f005.do' }
  };
  var HIGHLIGHT = /(한부모|조손|청소년\s?부모)/g;
  var state = {};

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function clean(t) { return String(t || '').replace(/\s+/g, ' ').trim(); }
  function mark(html) {
    // 태그 밖의 글자에만 강조 표시
    return html.replace(/(^|>)([^<]+)/g, function (m, a, text) { return a + text.replace(HIGHLIGHT, '<mark>$1</mark>'); });
  }
  function absUrl(href) {
    if (/^https?:\/\//i.test(href)) return href;
    if (/^\//.test(href)) return ORIGIN + href;
    return '';
  }

  // ---------- 원문 HTML → 허용 태그만 남긴 안전한 HTML ----------
  var KEEP = { P: 'p', UL: 'ul', OL: 'ol', LI: 'li', STRONG: 'strong', B: 'strong', EM: 'em', BR: 'br',
    TABLE: 'table', THEAD: 'thead', TBODY: 'tbody', TR: 'tr', TH: 'th', TD: 'td' };
  function sanitize(node) {
    var out = '';
    node.childNodes.forEach(function (n) {
      if (n.nodeType === 3) { out += esc(n.nodeValue.replace(/\s+/g, ' ')); return; }
      if (n.nodeType !== 1) return;
      var tag = n.tagName, cls = n.className || '';
      if (/^(SCRIPT|STYLE|IMG|CAPTION|COLGROUP|COL|IFRAME|FORM|INPUT|BUTTON)$/.test(tag)) return;
      if (tag === 'A') {
        var abs = absUrl(n.getAttribute('href') || '');
        out += abs ? '<a href="' + esc(abs) + '" target="_blank" rel="noopener noreferrer">' + sanitize(n) + '</a>' : sanitize(n);
        return;
      }
      if (tag === 'UL' && /spComPorcess/.test(cls)) {
        // 신청절차 단계 그림 → 번호 단계
        out += '<ol class="care-steps">' + Array.prototype.map.call(n.children, function (li) {
          return '<li>' + sanitize(li) + '</li>';
        }).join('') + '</ol>';
        return;
      }
      if ((tag === 'P' && /spsubDot|sptbltitle/.test(cls)) || (tag === 'STRONG' && /fs14/.test(cls))) {
        out += '<h4>' + sanitize(n) + '</h4>'; return;
      }
      if (tag === 'P' && /numfr/.test(cls)) { out += '<p class="care-unit">' + sanitize(n) + '</p>'; return; }
      if (tag === 'DIV' && /boxType01/.test(cls)) { out += '<div class="care-box">' + sanitize(n) + '</div>'; return; }
      if (tag === 'TABLE') { out += '<div class="table-scroll"><table class="care-table">' + sanitize(n) + '</table></div>'; return; }
      var keep = KEEP[tag];
      if (!keep) { out += sanitize(n); return; }
      if (keep === 'br') { out += '<br>'; return; }
      var attrs = '';
      if (keep === 'td' || keep === 'th') {
        ['colspan', 'rowspan'].forEach(function (a) {
          var v = parseInt(n.getAttribute(a), 10);
          if (v > 1) attrs += ' ' + a + '="' + v + '"';
        });
        if (/tleft/.test(cls)) attrs += ' class="l"';
        if (/tnum/.test(cls)) attrs += ' class="n"';
      }
      out += '<' + keep + attrs + '>' + sanitize(n) + '</' + keep + '>';
    });
    return out;
  }

  // ---------- 아이돌봄 이용요금 표 (가형~마형) ----------
  function parseFeeTables(dd) {
    var types = [];
    dd.querySelectorAll('table').forEach(function (tb) {
      var head = tb.querySelector('thead th');
      if (!head) return;
      var typeEl = head.querySelector('.fee-type');
      var type = clean(typeEl ? typeEl.textContent : '');
      var rule = clean(head.textContent.replace(type, ''));
      var group = '', rows = [];
      tb.querySelectorAll('tr').forEach(function (tr) {
        var cells = Array.prototype.filter.call(tr.querySelectorAll('td'), function (td) { return clean(td.textContent) !== '' || td.classList.contains('tcen'); });
        if (cells.length === 1 && cells[0].getAttribute('colspan')) { group = clean(cells[0].textContent); return; }
        if (cells.length === 4) {
          rows.push({ group: group, service: clean(cells[0].textContent), gov: clean(cells[1].textContent),
            self: clean(cells[2].textContent), total: clean(cells[3].textContent) });
        }
      });
      if (type && rows.length) types.push({ type: type, rule: rule, rows: rows });
    });
    return types;
  }
  function feeTableHtml(types) {
    var cols = types[0].rows.map(function (r) { return { group: r.group, service: r.service, total: r.total }; });
    function groupLabel(g) { return esc(g.replace(/\(.*\)/, '').trim()); }
    var h = '<div class="table-scroll"><table class="care-fee"><thead><tr><th rowspan="2">소득유형</th>';
    var seen = {};
    cols.forEach(function (c) {
      var g = groupLabel(c.group);
      if (seen[g]) return;
      seen[g] = cols.filter(function (x) { return groupLabel(x.group) === g; }).length;
      h += '<th colspan="' + seen[g] + '">' + g + '<small>' + esc((c.group.match(/\(.*\)/) || [''])[0]) + '</small></th>';
    });
    h += '</tr><tr>' + cols.map(function (c) {
      return '<th>' + esc(c.service) + '<small>시간당 ' + esc(c.total.replace(/\(100%\)/, '')) + '</small></th>';
    }).join('') + '</tr></thead><tbody>';
    types.forEach(function (t) {
      h += '<tr><th scope="row"><span class="care-type">' + esc(t.type) + '</span><small>' + esc(t.rule) + '</small></th>' +
        t.rows.map(function (r) { return '<td><b>' + esc(r.self) + '</b><small>정부 ' + esc(r.gov) + '</small></td>'; }).join('') + '</tr>';
    });
    return h + '</tbody></table></div><p class="hint care-legend">굵은 글씨 = 본인부담금(시간당), 작은 글씨 = 정부지원금</p>';
  }

  // ---------- 원문 파싱 ----------
  function parse(htmlText, fallbackTitle) {
    var doc = new DOMParser().parseFromString(htmlText, 'text/html');
    var wrap = doc.querySelector('.spContentWrap');
    if (!wrap) throw new Error('원문 페이지 구성이 바뀌어 내용을 찾지 못했습니다.');
    var title = clean((doc.querySelector('.spTitleWrap h2') || doc.querySelector('#contents h2') || {}).textContent) || fallbackTitle;
    var sections = [];
    wrap.querySelectorAll(':scope > ul > li').forEach(function (li) {
      var dt = li.querySelector('dl > dt');
      if (!dt) return;
      var link = dt.querySelector('a[href]');
      var linkUrl = link ? absUrl(link.getAttribute('href')) : '';
      var name = clean(link ? dt.textContent.replace(link.textContent, '') : dt.textContent);
      var parts = [], fee = null;
      li.querySelectorAll('dl > dd').forEach(function (dd) {
        if (dd.querySelector('table .fee-type')) {
          var types = parseFeeTables(dd);
          if (types.length) {
            fee = types;
            var notes = '';
            dd.querySelectorAll(':scope > p').forEach(function (p) { notes += '<p>' + sanitize(p) + '</p>'; });
            parts.push({ fee: true, notes: notes });
            return;
          }
        }
        var inner = sanitize(dd).trim();
        if (!clean(inner.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ''))) return;
        var block = dd.classList.contains('dotnone') || /<(ul|ol|div|h4|table)/.test(inner);
        parts.push({ html: block ? inner : '<p class="care-dot">' + inner + '</p>' });
      });
      sections.push({ name: name, parts: parts, fee: fee, link: linkUrl });
    });
    if (!sections.length) throw new Error('원문 페이지에서 항목을 찾지 못했습니다.');
    return { title: title, sections: sections };
  }

  var ICONS = {
    goal: 'M12 2l3 7h7l-5.5 4 2 7-6.5-4.5L5.5 20l2-7L2 9h7z',
    who: 'M16 11a4 4 0 1 0-8 0M4 21a8 8 0 0 1 16 0',
    money: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
    apply: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
    docs: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6',
    tel: 'M22 16.92v3a2 2 0 0 1-2.18 2A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z',
    link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
    info: 'M12 8h.01M11 12h1v4h1M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z'
  };
  function iconFor(name, link) {
    var k = link ? 'link' : /목적|개요/.test(name) ? 'goal' : /대상/.test(name) ? 'who' : /내용/.test(name) ? 'money'
      : /신청|절차/.test(name) ? 'apply' : /서류/.test(name) ? 'docs' : /문의/.test(name) ? 'tel' : 'info';
    return '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="' + ICONS[k] + '"></path></svg>';
  }

  function render(id, data, meta) {
    var cards = data.sections.map(function (s) {
      var body = '';
      s.parts.forEach(function (p) {
        if (p.fee) body += feeTableHtml(s.fee) + (p.notes ? '<div class="care-notes">' + mark(p.notes) + '</div>' : '');
        else body += '<div class="care-body">' + mark(p.html) + '</div>';
      });
      // 짧은 항목(필요서류·문의 등)은 반 폭, 나머지는 전체 폭
      var short = !s.fee && !/목적|개요/.test(s.name) && body.replace(/<[^>]+>/g, '').length < 160 && !/<(table|ol)/.test(body);
      var title = esc(s.name) + (s.link ? ' <a class="care-go" href="' + esc(s.link) + '" target="_blank" rel="noopener noreferrer">바로가기 ↗</a>' : '');
      return { wide: !short, html: '<h3>' + iconFor(s.name, s.link) + '<span>' + title + '</span></h3>' + body };
    });
    // 반 폭 카드가 짝 없이 혼자 남으면 전체 폭으로 (빈칸 방지)
    var run = [];
    cards.concat([{ wide: true }]).forEach(function (c) {
      if (!c.wide) { run.push(c); return; }
      if (run.length % 2) run[run.length - 1].wide = true;
      run = [];
    });
    var h = cards.map(function (c) { return '<section class="care-card' + (c.wide ? ' wide' : '') + '">' + c.html + '</section>'; }).join('');
    $(id + '-content').innerHTML = '<div class="care-grid">' + h + '</div>';
    $(id + '-title').textContent = data.title;
    $(id + '-status').innerHTML = meta;
  }

  function timeLabel(d) {
    return d.toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function load(id, force) {
    var page = PAGES[id];
    if (!page) return;
    var st = state[id] || (state[id] = {});
    if (st.loading || (st.loaded && !force)) return;
    st.loading = true;
    var cacheKey = 'mogef-page-cache-' + id;
    $(id + '-status').innerHTML = '<span class="care-spin" aria-hidden="true"></span> 성평등가족부 누리집에서 최신 내용을 불러오는 중…';
    if (!st.loaded) $(id + '-content').innerHTML = '';
    fetch(page.url, { cache: 'no-store', credentials: 'omit' })
      .then(function (res) {
        if (!res.ok) throw new Error('원문 서버 응답 오류 (' + res.status + ')');
        return res.text();
      })
      .then(function (text) {
        var data = parse(text, page.title);
        var now = new Date();
        render(id, data, '<span class="care-live">실시간</span> ' + timeLabel(now) + ' 불러옴');
        st.loaded = true;
        try { localStorage.setItem(cacheKey, JSON.stringify({ at: now.toISOString(), html: text })); } catch (e) {}
      })
      .catch(function (err) {
        var cached = null;
        try { cached = JSON.parse(localStorage.getItem(cacheKey) || 'null'); } catch (e) {}
        if (cached && cached.html) {
          try {
            render(id, parse(cached.html, page.title), '<span class="care-old">저장본</span> 실시간 불러오기 실패(' + esc(err.message) + ') — ' + timeLabel(new Date(cached.at)) + '에 불러온 내용을 보여 줍니다.');
            st.loaded = true;
            return;
          } catch (e) {}
        }
        $(id + '-status').innerHTML = '<span class="care-old">불러오기 실패</span> ' + esc(err.message);
        $(id + '-content').innerHTML = '<div class="care-error"><p>인터넷 연결을 확인한 뒤 [다시 불러오기]를 누르거나, 원문 페이지를 직접 여세요.</p>' +
          '<a class="btn" href="' + esc(page.url) + '" target="_blank" rel="noopener noreferrer">원문 페이지 열기 ↗</a></div>';
      })
      .then(function () { st.loading = false; });
  }

  // ---------- 프린트 · PDF 저장 ----------
  function fileName(id) {
    var d = new Date();
    var ymd = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    return ($(id + '-title').textContent || PAGES[id].title).replace(/[\\/:*?"<>|\s]+/g, '_') + '_' + ymd + '.pdf';
  }
  function printPage(id) {
    if (!(state[id] && state[id].loaded)) { alert('내용을 불러온 뒤 프린트할 수 있습니다.'); return; }
    window.print(); // 인쇄용 CSS가 현재 열린 패널만 출력
  }

  // PDF는 html2pdf.js(cdnjs)를 처음 누를 때만 내려받아 만듦. 실패하면 인쇄 대화상자(PDF로 저장)로 대체
  var PDF_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
  var pdfLibPromise = null;
  function loadPdfLib() {
    if (root.html2pdf) return Promise.resolve(root.html2pdf);
    if (pdfLibPromise) return pdfLibPromise;
    pdfLibPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = PDF_LIB;
      s.onload = function () { root.html2pdf ? resolve(root.html2pdf) : reject(new Error('PDF 도구를 불러오지 못했습니다.')); };
      s.onerror = function () { pdfLibPromise = null; reject(new Error('PDF 도구를 내려받지 못했습니다.')); };
      document.head.appendChild(s);
    });
    return pdfLibPromise;
  }
  function savePdf(id, btn) {
    if (!(state[id] && state[id].loaded)) { alert('내용을 불러온 뒤 PDF로 저장할 수 있습니다.'); return; }
    var label = btn.textContent;
    btn.disabled = true; btn.textContent = 'PDF 만드는 중…';
    var el = document.querySelector('#tab-' + id + ' .care-page');
    document.body.classList.add('pdf-export');
    loadPdfLib()
      .then(function (html2pdf) {
        return html2pdf().set({
          margin: [10, 10, 12, 10],
          filename: fileName(id),
          image: { type: 'jpeg', quality: 0.95 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', scrollX: 0, scrollY: 0 },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', 'h3', 'h4', '.care-steps li', '.care-box', '.care-notes'] }
        }).from(el).save();
      })
      .catch(function (err) {
        if (confirm(err.message + '\n인쇄 화면에서 "PDF로 저장"을 선택해 저장할까요?')) window.print();
      })
      .then(function () {
        document.body.classList.remove('pdf-export');
        btn.disabled = false; btn.textContent = label;
      });
  }

  // 페이지마다 패널을 만들어 #ref-panels 에 넣음
  function buildPanels() {
    var box = $('ref-panels');
    if (!box) return;
    Object.keys(PAGES).forEach(function (id) {
      var p = PAGES[id];
      var sec = document.createElement('section');
      sec.id = 'tab-' + id;
      sec.className = 'panel';
      sec.innerHTML =
        '<div class="care-page">' +
        '<div class="page-head"><div><h2 id="' + id + '-title">' + esc(p.title) + '</h2>' +
        '<p id="' + id + '-status" class="care-status" aria-live="polite"></p></div>' +
        '<div class="actions top-actions no-print" data-html2canvas-ignore="true">' +
        '<button class="btn" type="button" data-pdf="' + id + '">PDF 저장하기</button>' +
        '<button class="btn" type="button" data-print="' + id + '">프린트</button>' +
        '<button class="btn" type="button" data-reload="' + id + '">다시 불러오기</button>' +
        '<a class="btn" href="' + esc(p.url) + '" target="_blank" rel="noopener noreferrer">원문 보기 ↗</a></div></div>' +
        '<div id="' + id + '-content"></div>' +
        '<p class="hint care-source">출처: 성평등가족부 누리집 「' + esc(p.title) + '」 (공공누리 제1유형·출처표시). 내용은 열 때마다 원문에서 새로 불러옵니다.</p>' +
        '</div>';
      sec.querySelector('[data-reload]').addEventListener('click', function () { load(id, true); });
      sec.querySelector('[data-print]').addEventListener('click', function () { printPage(id); });
      sec.querySelector('[data-pdf]').addEventListener('click', function (e) { savePdf(id, e.currentTarget); });
      box.appendChild(sec);
    });
  }
  buildPanels();

  root.CareInfo = { load: load, has: function (id) { return !!PAGES[id]; }, PAGES: PAGES };
})(this);
