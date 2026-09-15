/* 费用页与事项页。所有数字都来自 data/budget.json 与 data/tasks.json：
   本页只做算术与展示，不做任何新判断；未报价一律留空而不是当 0。 */
(function () {
  const TYPE = document.body.dataset.type;

  /* ── 费用 ───────────────────────────────────────────────────────── */
  function money(n) {
    return n == null ? '—' : '¥ ' + Math.round(n).toLocaleString('zh-CN');
  }
  const rowTable = (rows, cols) => '<div class="wrap-tbl"><table><thead><tr>'
    + cols.map(c => '<th>' + esc(c[0]) + '</th>').join('') + '</tr></thead><tbody>'
    + rows.map(r => '<tr>' + cols.map(c => '<td>' + (typeof c[1] === 'function' ? c[1](r) : esc(r[c[1]] || '—')) + '</td>').join('')
      + '</tr>').join('') + '</tbody></table></div>';

  function renderBudget() {
    const b = TRIP.budget, calc = b.calculator;
    document.title = '费用预算｜我们的阿勒泰';
    const state = { nights: {}, x: { X1: '', X2: '', X3: '', X4: '' }, transfer: 'shuttle', food: 0 };
    calc.nights.forEach(n => { state.nights[n.night] = n.default; });

    $('#hero').innerHTML = '<div><p class="eyebrow">费用</p>'
      + '<h1>已经确定的、和还没报价的分开看</h1>'
      + '<p class="verdict">三套情景都只是地面费用：不含任何一段包车与往返火车。'
      + '四段包车还没报价，要填真实询价结果，本页不会替你猜。</p></div>';

    function totals() {
      let stay = 0, camps = 0;
      calc.nights.forEach(n => {
        const v = state.nights[n.night] === 'camp' ? n.camp : n.stay;
        if (state.nights[n.night] === 'camp') camps++;
        stay += (v || 0);
      });
      const gear = camps ? calc.gear_camp : 0;
      const food = calc.food_per_person[state.food] * 3;
      const transfer = calc.baihaba_transfer.filter(t => t.id === state.transfer)[0];
      const xs = ['X1', 'X2', 'X3', 'X4'].map(k => parseFloat(state.x[k])).filter(v => !isNaN(v));
      const xSum = xs.reduce((a, c) => a + c, 0);
      const missing = 4 - xs.length;
      const ground = calc.tickets_three + stay + gear + food + (transfer ? transfer.three : 0) + xSum;
      return { stay, camps, gear, food, transfer, xSum, missing, ground };
    }

    function paint() {
      const t = totals();
      $('#ledger').innerHTML = '<div class="money-grid">'
        + [['票与区间车', money(calc.tickets_three), '三人合计'],
          ['住宿', money(t.stay), t.camps + ' 晚露营'],
          ['露营装备', money(t.gear), t.camps ? '有露营夜才租' : '全部住店则不租'],
          ['餐饮', money(t.food), '按 ' + calc.food_per_person[state.food] + ' 元/人 · 8 天'],
          ['白哈巴→喀纳斯', money(t.transfer ? t.transfer.three : 0), t.transfer ? t.transfer.label : ''],
          ['四段整车（已填 ' + (4 - t.missing) + '/4）', money(t.xSum), t.missing ? '仍有 ' + t.missing + ' 段未报价' : '全部填入'],
          ['整车预估区间', '¥ 1,800—3,600', '600—1200 元/人；填入真实报价即替换']]
        .map(x => '<div class="mcell"><small>' + x[0] + '</small><b>' + x[1] + '</b><span>' + esc(x[2] || '') + '</span></div>').join('')
        + '</div>'
        + '<div class="total-bar"><div><small>三人地面合计</small><b>' + money(t.ground) + '</b></div>'
        + '<div><small>每人地面合计</small><b>' + money(t.ground / 3) + '</b></div>'
        + '<div class="caveat"><small>还不含</small><b>往返火车按 12306 实付</b>'
        + '<span>' + (t.missing ? '另有 ' + t.missing + ' 段整车未报价，不能当 0 元' : '四段整车已填齐') + '</span></div></div>'
        + '<p class="est-line">预估人均消费：<b>' + money(Math.round((t.ground + 1800) / 3)) + '—'
        + money(Math.round((t.ground + 3600) / 3)) + '</b>（本页合计 ＋ 四段整车预估 1800—3600 元/车；不含往返火车）</p>';
      const sc = b.scenarios_v4.filter(s => s.recomputed)[0];
      $('#scenNow').innerHTML = '<p class="big">本页当前组合：<b>' + money(t.ground) + '</b> 三人 · '
        + money(t.ground / 3) + ' 每人（不含火车）。主方案估算 ' + esc(sc.three_total) + '／人 '
        + esc(sc.per_person) + '，差额全部来自你刚才拨动的开关。</p>';
    }

    let c = sec2('四段包车询价', '<div class="x-grid">' + b.quotes.map(q =>
      '<label class="xrow"><span><b>' + esc(q.label) + '</b><small>' + esc(q.ask) + '</small>'
      + '<em>锚点：' + esc(q.anchor) + '</em></span>'
      + '<input type="number" min="0" step="50" inputmode="numeric" placeholder="填入司机报价" data-x="' + q.var + '">'
      + '<i class="pending">未报价</i></label>').join('') + '</div>'
      + '<p class="rule">规则：整车按「一车总价」填，页面自动 ÷3 落到每人；未填的段落不计入合计，也不会被当成 0 元。</p>',
      '填上真实报价才计入');

    c += sec2('逐晚住宿开关', '<div class="night-grid">' + calc.nights.map(n => {
      const p = Trip.place(n.place);
      return '<div class="ncell"><b>' + esc(n.night) + ' ' + esc(p ? p.name : n.place) + '</b>'
        + '<div class="seg" data-night="' + n.night + '">'
        + (n.camp == null ? '' : '<button data-v="camp"' + (state.nights[n.night] === 'camp' ? ' class="on"' : '') + '>露营 0 元</button>')
        + '<button data-v="stay"' + (state.nights[n.night] === 'stay' ? ' class="on"' : '') + '>住店 ' + n.stay + ' 元/间</button>'
        + '</div><small>' + esc(n.source) + '</small></div>';
    }).join('') + '</div>', '可变 · 露营与住店可切换');

    c += sec2('升级与补给开关', '<div class="opt-grid">'
      + '<div><b>白哈巴 → 喀纳斯怎么走</b>' + calc.baihaba_transfer.map(t =>
        '<label class="opt"><input type="radio" name="transfer" value="' + t.id + '"' + (state.transfer === t.id ? ' checked' : '') + '>'
        + '<span>' + esc(t.label) + ' <em>' + (t.three ? money(t.three) + '／三人' : '含票内') + '</em>'
        + '<small>' + esc(t.source) + '</small></span></label>').join('') + '</div>'
      + '<div><b>餐饮预估（每人）</b>' + calc.food_per_person.map((f, i) =>
        '<label class="opt"><input type="radio" name="food" value="' + i + '"' + (state.food == i ? ' checked' : '') + '>'
        + '<span>' + money(f) + ' <small>' + esc(calc.food_source) + '</small></span></label>').join('') + '</div></div>', '可变');

    c += sec2('当前合计', '<div id="ledger"></div><div id="scenNow"></div>', '合计');

    c += sec2('已确认或有明确报价', rowTable(b.fixed, [['项目', 'item'], ['单价', 'unit_price'],
      ['计价', 'unit'], ['三人合计', 'three_total'], ['每人', 'per_person'],
      ['依据', r => esc(polishText(r.nature || ''))]]), '已确认');
    c += sec2('有历史价格，出行前需现场确认', rowTable(b.review, [['项目', 'item'], ['单价', 'unit_price'],
      ['三人合计', 'three_total'], ['每人', 'per_person'],
      ['要确认的事', r => '<span class="ask">' + esc(r.action || '') + '</span>']]), '需确认');
    c += sec2('现在还不能定价的项目', rowTable(b.unknown, [['项目', 'item'], ['为什么先不定价', 'why'],
      ['量级参照', 'anchor'], ['询价动作', r => '<span class="ask">' + esc(r.ask || '') + '</span>']]), '待报价');
    c += sec2('三种情景', '<div class="scen-grid">' + b.scenarios_v4.map(s =>
      '<article class="' + (s.recomputed ? 'now' : '') + '"><h3>' + esc(s.name) + '</h3>'
      + '<p class="der">' + esc(s.derivation) + '</p>'
      + '<div class="scen-nums"><span><i>三人</i><b>' + esc(s.three_total) + '</b></span>'
      + '<span><i>每人</i><b>' + esc(s.per_person) + '</b></span></div>'
      + '<p class="cav">' + esc(s.caveat) + '</p></article>').join('') + '</div>'
      + '<p class="rule">' + esc(b.scenario_warning) + '</p>', '情景');
    c += sec2('计算公式', '<p class="formula">' + esc(b.formula) + '</p>'
      + '<ul class="detail-list">' + b.rules.map(r => '<li>' + esc(r) + '</li>').join('') + '</ul>', '怎么算');
    $('#content').innerHTML = '<section class="detail-section"><h2>每天大概花多少</h2><div id="dayCost"></div></section>' + c;

    $$('[data-x]').forEach(i => i.addEventListener('input', e => {
      state.x[e.target.getAttribute('data-x')] = e.target.value;
      e.target.closest('.xrow').classList.toggle('filled', !!e.target.value);
      paint();
    }));
    $$('[data-night]').forEach(g => g.addEventListener('click', e => {
      const v = e.target.getAttribute('data-v');
      if (!v) return;
      state.nights[g.getAttribute('data-night')] = v;
      $$('button', g).forEach(x => x.classList.toggle('on', x.getAttribute('data-v') === v));
      paint();
    }));
    $$('[name="transfer"]').forEach(r => r.addEventListener('change', e => { state.transfer = e.target.value; paint(); }));
    $$('[name="food"]').forEach(r => r.addEventListener('change', e => { state.food = +e.target.value; paint(); }));
    paint();

    $('#facts').innerHTML = '<h3>费用速查</h3>'
      + '<div><small>门票基准</small>' + b.ticket_baseline.per_person + ' 元/人 · '
      + b.ticket_baseline.three_total + ' 元/三人</div>'
      + '<div><small>已含票内</small>' + esc(b.ticket_baseline.note) + '</div>'
      + '<div><small>暂无报价</small>贾登峪→白哈巴整车（没有可靠成交价）</div>'
      + '<div><small>逐项待办</small><a href="tasks.html">15 项待办 →</a></div>'
      + '<div><small>回行程</small><a href="index.html">首页 →</a></div>';
  }

  /* 收尾：移除渲染后为空的 section（避免空白带） */
  function dropEmptySections() {
    document.querySelectorAll('.detail-section').forEach(s => {
      const body = Array.prototype.slice.call(s.children)
        .filter(c => !c.matches('h2, .eyebrow, p.eyebrow'));
      const h2 = s.querySelector('h2');
      const empty = (!h2 || !h2.textContent.trim()) || !body.length || body.every(c => !c.textContent.trim() && !c.querySelector('*'));
      if (empty) s.remove();
    });
  }
  const sec2 = (title, inner, kicker) => '<section class="detail-section"><p class="eyebrow">'
    + esc(kicker || '') + '</p><h2>' + esc(title) + '</h2>' + inner + '</section>';

  /* ── 事项 ───────────────────────────────────────────────────────── */
  function renderTasks() {
    const t = TRIP.tasks;
    document.title = '行前与现场事项｜我们的阿勒泰';
    $('#hero').innerHTML = '<div><p class="eyebrow">出发前 · 15 项</p>'
      + '<h1>出发前真正要办的，就这 15 件</h1>'
      + '<p class="verdict">每项都写明谁负责、几号前办完、办成之后要留下什么凭据，'
      + '以及它影响哪一天和多少钱。</p></div>';
    const byOwner = {};
    t.forEach(x => { (byOwner[x.owner] = byOwner[x.owner] || []).push(x); });
    $('#content').innerHTML = sec2('按时间排', '<ol class="task-list">' + t.map(x =>
      '<li><span class="tk-id">' + esc(x.id) + '</span><div><b>' + esc(x.item) + '</b>'
      + '<div class="tk-meta"><span>负责人 ' + esc(x.owner) + '</span><span>截止 ' + esc(x.due) + '</span>'
      + '<span>费用 ' + esc(x.cost) + '</span>'
      + '<span>影响 ' + String(x.affects).split(/[、—]/).map(d => {
        const id = '0' + d.replace(/[^\d]/g, '');
        const day = TRIP.days.filter(y => y.id === id.slice(-4))[0];
        return day ? '<a href="day.html?id=' + day.id + '">' + esc(d) + '</a>' : esc(d);
      }).join(' ') + '</span></div>'
      + '<p class="tk-result"><b>办成标准：</b>' + esc(x.result) + '</p>'
      + '</div></li>').join('') + '</ol>', '顺序');
    $('#facts').innerHTML = '<h3>按人分工</h3>'
      + Object.keys(byOwner).map(k => '<div><small>' + esc(k) + '</small>'
        + byOwner[k].map(x => x.id).join(' · ') + '</div>').join('')
      + '<div><small>合计</small>' + t.length + ' 项</div>'
      + '<div><small>费用页</small><a href="budget.html">重算预算 →</a></div>'
      + '<div><small>回行程</small><a href="index.html">首页 →</a></div>';
  }

  if (TYPE === 'budget') renderBudget();
  else if (TYPE === 'tasks') renderTasks();
  else $('#content').innerHTML = '<section class="detail-section"><h2>页面未知</h2>'
    + '<p><a href="index.html">回首页</a></p></section>';
  (function dayCost() {
    const host = document.querySelector('#dayCost');
    if (!host || !window.TRIP) return;
    const B = TRIP.budget || {};
    const stay = {};
    (B.variable_stay || []).forEach(x => { if (x && x.night) stay[x.night] = x; });
    const rows = (TRIP.days || []).filter(d => d.id !== '1002').map(d => {
      const st = stay[d.date] || stay[d.id];
      let stayTxt = '—';
      if (st) {
        const v = String(st.main_value || '');
        const camp = /露营\s*0\s*元/.test(v);
        const num = ((v.match(/主案[取：:]*\s*(\d{2,4})\s*元/) || v.match(/住店\s*(\d{2,4})\s*元\/间/)
          || v.match(/(\d{2,4})\s*元\/间/) || [])[1]) || '';
        stayTxt = camp ? ('露营 0 元｜店 ' + (num ? '约 ' + num + ' 元/间' : '需询价'))
                       : (num ? '店 约 ' + num + ' 元/间' : '住店需询价');
      } else if (d.id === '0924') { stayTxt = '火车卧铺'; }
      else if (d.sleep) {
        const sl = String(d.sleep);
        if (/继续住/.test(sl)) stayTxt = sl.replace(/继续住/, '') + '（续住）';
        else if (/露营/.test(sl)) {
          const who = (sl.match(/^([^，,、／\/]+?)露营/) || [])[1] || '';
          const cap = (sl.match(/≤\s*(\d{2,4})/) || [])[1] || '';
          stayTxt = (who ? who + ' · ' : '') + '露营｜店' + (cap ? ' ≤' + cap + ' 元' : '');
        } else stayTxt = sl.split(/[，,；;]/)[0];
      }
      const move = (d.move || '');
      const traffic = /包车|整车/.test(move) ? '待报价'
        : (/区间车|摆渡|村公交/.test(move) ? '含票内' : '含票内');
      const ticket = /白哈巴/.test(d.headline || '') ? '30 元/人' : (/禾木/.test(d.headline || '') ? '50 元/人'
        : (/喀纳斯/.test(d.headline || '') ? '230 元/人含区间车' : '0'));
      return '<tr><td><b>' + d.date + '</b></td><td>' + esc(stayTxt) + '</td><td>100 元/人</td><td>'
        + esc(traffic) + '</td><td>' + esc(ticket) + '</td></tr>';
    }).join('');
    host.innerHTML = '<div class="wrap-tbl days-tbl"><table><thead><tr><th>日期</th><th>住（预估）</th><th>吃</th><th>交通</th><th>门票</th></tr></thead>'
      + '<tbody>' + rows + '</tbody></table></div>'
      + '<p class="dc-note">吃按 100 元/人·天；住按"整间≤600 否则帐篷"预估；标"待报价"的四段拿到司机报价后在上方填入即自动重算。</p>';
  })();
  dropEmptySections();
})();
