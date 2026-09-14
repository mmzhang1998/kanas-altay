/* 首页：主方案优先的现场操作系统。地图用真实坐标与 KML 点列，没有公开轨迹的转场一律标成示意走向。 */
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const W = 1000, H = 600, M = 46;
  let sel = 'all', scope = 'full', plan = 'main', focus = null;

  const P = TRIP.places, D = TRIP.days, T = TRIP.topics, R = TRIP.routes, G = TRIP.guides;
  /* 有 Leaflet 与底图瓦片就用真地图；失败则本文件的真实坐标 SVG 顶上（两套都不产生新事实） */
  const AMAP = !!(window.TripAMap && TripAMap.boot());
  const LEAF = !AMAP && !!(window.TripLeaf && TripLeaf.boot());
  /* 引擎可能在运行中降级（高德瓦片失败→Leaflet），所以每次取"当前活着的引擎" */
  const ENG = () => (window.TripAMap && window.TripAMap.active) ? window.TripAMap
    : (window.TripLeaf && window.TripLeaf.ready) ? window.TripLeaf : null;
  const TK = (window.TRACKS ? TRACKS.tracks : []);
  const trackById = id => TK.filter(t => t.id === id)[0];
  const placeById = id => P.filter(p => p.id === id)[0];
  const withCoord = P.filter(p => p.coord && p.coord[0]);
  /* 阿禾与阿勒泰走廊只在「含阿禾」视图里出现，否则一个 47.85/88.14 的点会把整张图拉出大片空白 */
  const AHE_CORRIDOR = { altay_city: 1, back_to_altay: 1, ahe_road: 1, urumqi_night_train: 1 };
  /* 本次不执行的穿越线不进首页地图，避免读者把它当成走法 */
  const USED = {};
  D.forEach(d => d.tracks.forEach(t => { USED[t] = 1; }));
  TK.forEach(t => { if (t.route && t.adopted_points.length) USED[t.id] = 1; });
  delete USED['大美新疆白哈巴穿越到喀纳斯'];

  function el(tag, at) {
    const e = document.createElementNS(NS, tag);
    Object.keys(at || {}).forEach(k => e.setAttribute(k, at[k]));
    return e;
  }

  /* ── 当前视图要画什么 ─────────────────────────────────────────────── */
  function view() {
    const day = sel === 'all' ? null : Trip.day(sel);
    const pl = TRIP.plans.filter(x => x.id === plan)[0];
    const trackIds = day ? day.tracks : Object.keys(USED).filter(id => !/阿禾/.test(id) || scope === 'full');
    let tracks = trackIds.map(trackById).filter(Boolean);
    if (scope === 'core') tracks = tracks.filter(t => !/阿禾/.test(t.name));
    if (focus) tracks = tracks.filter(t => t.id === focus);
    /* 「核心区」＝禾木—贾登峪—白哈巴—喀纳斯这一块；阿禾与阿勒泰只在「含阿禾」里出现 */
    let v_pois = (day ? day.places.map(placeById).filter(Boolean) : withCoord)
      .filter(p => p.coord && p.coord[0] != null);
    if (scope === 'core' && !day) v_pois = v_pois.filter(p => !AHE_CORRIDOR[p.id]);
    /* 转场走向：只在没有真实轨迹可画的相邻点之间出现，并且明确标成示意 */
    const seq = day ? day.places : (pl ? pl.route.filter(id => !/(campsites|luggage|back_to_altay|baihaba_kanas_transfer)/.test(id)) : []);
    const intent = [];
    const shown = {};
    v_pois.forEach(p => { shown[p.id] = 1; });
    for (let i = 0; i + 1 < seq.length; i++) {
      const a = placeById(seq[i]), b = placeById(seq[i + 1]);
      if (!a || !b || !a.coord || !b.coord || a.coord[0] == null || b.coord[0] == null) continue;
      /* 范围外的点不参与取景，否则「核心区」会被阿勒泰市拉到右边一大片空白 */
      if (!shown[a.id] || !shown[b.id]) continue;
      intent.push({ a: a, b: b });
    }
    const covered = tracks.length > 0;
    /* 三方案同图：没选日期时按方案视图取腿与点 */
    const planView = window.PLAN_VIEW || 'main';
    let planLegs = null, planPois = null;
    if (!day && !focus) {
      const ids = planView === 'all' ? ['main', 'alt_a', 'alt_b'] : [planView];
      planLegs = [];
      ids.forEach(id => { planLegs = planLegs.concat(GeoMap.planLegs(id, scope)); });
      const seen = {}; planPois = [];
      ids.forEach(id => {
        const pp = TRIP.plans.filter(x => x.id === id)[0];
        (pp && pp.day_places ? Object.keys(pp.day_places).sort().reduce((acc, k) => acc.concat(pp.day_places[k]), []) : [])
          .forEach(pid => { const p = placeById(pid);
            if (p && p.coord && p.coord[0] != null && !seen[pid]
                && (scope === 'full' || !AHE_CORRIDOR[pid])) { seen[pid] = 1; planPois.push(p); } });
      });
    }
    return { day: day, plan: pl, tracks: tracks, pois: v_pois, intent: focus ? [] : intent,
             planLegs: planLegs, planPois: planPois, planView: planView };
  }

  let prevViewKey = null, prevAt = null;
  function bounds(v) {
    let pts = [];
    (v.planLegs || GeoMap.legsFor(v.day ? v.day.id : null, scope)).forEach(l => { pts = pts.concat(l.points || []); });
    v.tracks.forEach(t => { pts = pts.concat((t.adopted_points.length ? t.adopted_points : t.points) || []); });
    v.pois.forEach(p => pts.push(p.coord));
    v.intent.forEach(i => pts.push(i.a.coord, i.b.coord));
    pts = pts.filter(c => c && c[0] != null && Math.abs(c[0]) < 90);
    if (!pts.length) pts = withCoord.map(p => p.coord);
    const lat = pts.map(c => c[0]), lng = pts.map(c => c[1]);
    let a = Math.min.apply(null, lng), b = Math.max.apply(null, lng);
    let c = Math.min.apply(null, lat), d = Math.max.apply(null, lat);
    const px = Math.max((b - a) * .14, .012), py = Math.max((d - c) * .18, .012);
    a -= px; b += px; c -= py; d += py;
    const k = Math.min((W - 2 * M) / (b - a), (H - 2 * M) / (d - c));
    const cx = (a + b) / 2, cy = (c + d) / 2;
    return p => [(p[1] - cx) * k + W / 2, H / 2 - (p[0] - cy) * k];
  }
  /* 同一天/同一范围下切方案：保持比例与中心，不跳 */
  function viewTransform(v) {
    const key = (v.day ? v.day.id : 'all') + '|' + scope;
    if (key === prevViewKey && prevAt) return prevAt;
    prevViewKey = key; prevAt = bounds(v); return prevAt;
  }

  function drawMap() {
    const svg = $('#routeMap');
    if (!svg) return;
    const v = view();
    const at = viewTransform(v);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.innerHTML = '';
    svg.append(el('rect', { width: W, height: H, class: 'map-bg' }));
    GeoMap.drawSVG(svg, { dayId: v.day ? v.day.id : null, scope: scope,
      tracks: v.planLegs ? [] : v.tracks, pois: v.planPois || v.pois,
      planLegs: v.planLegs, colorByPlan: v.planView === 'all' }, at);
    /* 标记：白环＋彩芯，标签带描边光晕，压在任何底图上都读得清 */
    (v.planPois || v.pois).forEach(p => {
      if (!p.coord || p.coord[0] == null) return;
      const q = at(p.coord);
      if (q[0] < -24 || q[1] < -24 || q[0] > W + 24 || q[1] > H + 24) return;
      const cls = p.kind === 'stay' ? 'stay' : (p.kind === 'hub' ? 'hub' : (p.kind === 'road' ? 'road' : 'sight'));
      const g = el('g', { class: 'gm-pin poi ' + cls,
                          transform: 'translate(' + q[0].toFixed(1) + ' ' + q[1].toFixed(1) + ')' });
      g.append(el('circle', { r: 7.5, class: 'gm-pin-ring' }));
      g.append(el('circle', { r: 3.4, class: 'gm-pin-core' }));
      const t = el('text', GeoMap.labelAttrs());
      t.setAttribute('x', 11); t.setAttribute('y', 4); t.textContent = p.name;
      g.append(t);
      const ttl = el('title', {}); ttl.textContent = p.name + ' — 打开地点页'; g.append(ttl);
      g.addEventListener('click', () => { location.href = 'place.html?id=' + p.id; });
      svg.append(g);
    });
    /* 图例分类按"这一天/这个范围一共有哪些走法"算，和当前开关无关：
       否则点掉一类，按钮会跟着消失，看起来就像筛选失效。 */
    const dayId = v.day ? v.day.id : null;
    const ids2 = v.day ? [plan] : (v.planView === 'all' ? ['main', 'alt_a', 'alt_b'] : [v.planView]);
    const kinds = {};
    GeoMap.planLegsRaw(ids2, scope, dayId).forEach(l => { kinds[l.src === 'schematic' ? 'schem' : l.mode] = 1; });
    TK.forEach(t => { if (v.day ? v.day.tracks.indexOf(t.id) >= 0 : USED[t.id])
      kinds[/行车|公路|通行/.test(t.kind) ? 'drive' : 'hike'] = 1; });
    if ((v.planPois || v.pois).some(p => p.kind === 'stay')) kinds.stay = 1;
    if (!Object.keys(kinds).length) { kinds.drive = 1; kinds.hike = 1; }
    const LBL = { drive: '包车 · 真实道路', shuttle: '区间车 · 真实道路', hike: '徒步实录',
                  schem: '走向示意', stay: '过夜点' };
    const lg = $('#mapLegend');
    if (lg) {
      lg.innerHTML = (v.planView === 'all' && !v.day
        ? '<div class="lg-plans">' + ['main', 'alt_a', 'alt_b'].map(id =>
            '<span class="lg-plan" style="--pc:' + GeoMap.PLAN_COLOR[id] + '"><i></i>'
            + esc(GeoMap.PLAN_NAME[id].split(' · ')[0]) + '</span>').join('') + '</div>' : '')
        + '<div class="lg-kinds">' + Object.keys(kinds).map(k =>
            '<button class="lg-' + k + (window.HIDE && window.HIDE[k] ? ' off' : '') + '" data-lg="' + k
            + '" aria-pressed="' + !(window.HIDE && window.HIDE[k]) + '"><i></i>' + (LBL[k] || LEGEND[k] || k)
            + '</button>').join('') + '</div>';
      $$('#mapLegend [data-lg]').forEach(b => b.addEventListener('click', () => {
        window.HIDE = window.HIDE || {};
        window.HIDE[b.dataset.lg] = !window.HIDE[b.dataset.lg];
        drawMap();
      }));
    }
    const mt = $('#mapTitle');
    if (mt) mt.textContent = (v.day ? v.day.date + ' · 当天动线'
      : (GeoMap.PLAN_NAME[v.planView] || (TRIP.plans.filter(x => x.id === plan)[0] || {}).name)
        + ' · ' + (scope === 'full' ? '含阿禾全线' : '核心区域'));
    const note = $('#mapNote');
    if (note) note.textContent = '';

    const fk = $('#focusTrack');
    if (!fk) return;
    const list = (sel === 'all' ? TK.filter(t => USED[t.id]) : (v.day ? v.day.tracks.map(trackById).filter(Boolean) : []));
    fk.innerHTML = '<option value="">看某一条徒步线（放大）</option>'
      + list.map(t => '<option value="' + esc(t.id) + '"' + (focus === t.id ? ' selected' : '') + '>'
        + esc((t.name || t.id).slice(0, 22)) + ' · ' + (t.adopted_points.length ? '采用段' : '完整轨迹') + '</option>').join('');
    fk.style.display = list.length ? '' : 'none';
  }

  /* ── 日期面板 ─────────────────────────────────────────────────────── */
  function selectDay(id) {
    sel = id; focus = null;
    const e0 = ENG(); if (e0) e0.select(id);
    const d = id === 'all' ? null : Trip.day(id);
    $$('.strip-card').forEach(x => x.classList.toggle('active', x.dataset.day === id));
    const dd = $('#dayDetail');
    if (dd) {
      if (!d) { dd.hidden = true; dd.innerHTML = ''; }
      else {
        dd.hidden = false;
        dd.innerHTML = '<div class="dd-head"><b>' + d.date + ' ' + esc(d.week) + ' · ' + esc(d.headline) + '</b>'
          + '<a href="day.html?id=' + d.id + '">打开当日完整日程 →</a></div>'
          + '<div class="dd-grid"><div class="schedule-preview">'
          + (d.timeline || []).slice(0, 6).map(x => '<div class="schedule-item"><time>' + esc(x.time || '—')
            + '</time><div><b>' + esc(x.what || '') + '</b></div></div>').join('')
          + '</div><div class="dd-side"><span><i>移动</i>' + esc(d.move) + '</span>'
          + '<span><i>过夜</i>' + esc(d.sleep.split('（')[0]) + '</span>'
          + '<span><i>大包</i>' + esc(d.bag || '—') + '</span>'
          + '<span class="dd-red"><i>红线</i>' + esc(d.redline) + '</span></div></div>';
      }
    }
    drawMap();
  }

  /* ── 首页各区块 ───────────────────────────────────────────────────── */

  function shortSleep(d) {
    const raw = (d.sleep || '').split('（')[0];
    const place = raw.replace(/现场低价住宿优先|低价住宿优先|现场低价房优先|继续住|住宿；.*/, '').trim();
    if (/露营/.test(d.sleep)) return place + ' · 可露营';
    if (/火车/.test(raw)) return '火车卧铺';
    return (place || raw) + ' · 房≤600 否则帐篷';
  }

  /* 地图下方的九天日程条：点一下，地图切到当天 */
  function strip() {
    const box = $('#dayStrip');
    if (!box) return;
    box.innerHTML = D.map(d => '<button class="strip-card" data-day="' + d.id + '">'
      + '<i>' + d.date + '</i><b>' + esc(d.short) + '</b>'
      + '<span>' + esc((TRIP.plans[0].nights || {})[d.id] || d.sleep.split('（')[0]) + '</span></button>').join('');
    $$('.strip-card').forEach(b => b.addEventListener('click', () => {
      selectDay(b.dataset.day === sel ? 'all' : b.dataset.day);
    }));
  }

  function topic(id) {
    const grid = $('#guideGrid');
    if (!grid) return;
    grid.innerHTML = T.map(x =>
      '<a class="guide-card" href="topic.html?id=' + x.id + '">'
      + (x.thumb ? '<img src="' + esc(x.thumb) + '" alt="' + esc(x.name) + '">' : '<div class="gc-ph">' + esc(x.name.slice(0,1)) + '</div>')
      + '<div class="gc-body"><p class="gc-k">' + esc(x.name) + '</p>'
      + '<p class="gc-c">' + esc(x.conclusion) + '</p></div>'
      + '<span class="gc-go">看攻略 →</span></a>').join('');
  }

  window.addEventListener('planview', () => { planPicker(); planTable(); drawMap(); });

  /* ── 三套方案：标题右侧的白色方形按钮 ───────────────────────────────── */
  function planPicker() {
    const box = $('#planBtns');
    if (!box) return;
    const cur = window.PLAN_VIEW || 'main';
    box.innerHTML = TRIP.plans.map(p => {
      const parts = String(p.name).split('｜');
      const on = p.id === cur;
      return '<button role="tab" data-ptab="' + p.id + '" aria-selected="' + on + '" class="'
        + (on ? 'active' : '') + '" style="--pc:' + GeoMap.PLAN_COLOR[p.id] + '">'
        + '<i class="pp-dot"></i><b>' + esc(parts[0]) + '</b>'
        + '<span class="pp-sub">' + esc(parts[1] || '') + '</span></button>';
    }).join('');
    $$('#planBtns [data-ptab]').forEach(b => b.addEventListener('click', () => {
      if ((window.PLAN_VIEW || 'main') === b.dataset.ptab) return;
      window.PLAN_VIEW = b.dataset.ptab;
      window.dispatchEvent(new CustomEvent('planview', { detail: window.PLAN_VIEW }));
    }));
  }

  /* ── 三套方案差异表（表头是标签，不承担地图切换）──────────────────── */
  function planTable() {
    const host = $('#planTable');
    if (!host) return;
    const P2 = TRIP.plans;
    const cur = window.PLAN_VIEW || 'main';
    const rows = [
      ['禾木清晨＋哈登观景台', p => p.id === 'alt_b' ? '放弃' : '保留'],
      ['小阿什克秋林徒步', p => p.id === 'alt_b' ? '放弃' : '保留'],
      ['铁贾公路＋齐巴尔希力克', p => p.id === 'alt_a' ? '放弃' : '保留'],
      ['白哈巴村一晚', p => p.id === 'alt_a' ? '放弃' : '保留'],
      ['喀纳斯完整日', p => p.id === 'main' ? '2 天' : '3 天'],
      ['露营压力', p => p.id === 'main' ? '中（2—3 晚）' : (p.id === 'alt_a' ? '低' : '中')],
      ['转场复杂度', p => p.id === 'main' ? '最高（四段整车待报价）' : (p.id === 'alt_a' ? '最低' : '中')],
      ['适合谁', p => (p.gain || '').split('：')[0]],
    ];
    host.innerHTML = '<div class="tbl-wrap"><table class="cmp"><thead><tr><th class="cmp-key">关键差异</th>'
      + P2.map(p => '<th class="' + (p.id === cur ? 'cur' : '') + '" style="--pc:'
          + GeoMap.PLAN_COLOR[p.id] + '"><i class="cmp-dot"></i>' + esc(p.name.split('｜')[0]) + '</th>').join('')
      + '</tr></thead><tbody>'
      + rows.map(r => '<tr><td>' + r[0] + '</td>'
          + P2.map(p => '<td class="' + (p.id === cur ? 'cur' : '') + '">' + esc(r[1](p)) + '</td>').join('') + '</tr>').join('')
      + '</tbody></table></div>'
      + '<p class="cmp-note">当前高亮的是地图上正在看的方案；切换首屏方案按钮，高亮与地图一起变。</p>';
  }

  /* ─ 逐日：九天各一张卡，不用大表格 ─────────────────────────────────── */
  function feed() {
    const host = $('#dayFeed');
    if (!host) return;
    const nights = (TRIP.plans[0] || {}).nights || {};
    host.innerHTML = '<div class="day-tiles">' + D.map(d => {
      const stay = nights[d.id] || String(d.sleep || '').split('（')[0];
      const ps = (d.places || []).map(placeById).filter(Boolean).slice(0, 3);
      return '<a class="day-tile" href="day.html?id=' + d.id + '">'
        + '<header><b>' + d.date + '</b><span>' + esc(d.week) + '</span></header>'
        + '<p class="dt-head">' + esc(d.headline) + '</p>'
        + '<div class="dt-figs"><div><i>移动</i><span>' + esc(d.move) + '</span></div>'
        + '<div><i>过夜</i><span>' + esc(stay) + '</span></div></div>'
        + (ps.length ? '<div class="dt-tags">' + ps.map(p => '<span>' + esc(p.name) + '</span>').join('') + '</div>' : '')
        + '<footer><span class="dt-cut">先删：' + esc(d.cut_first) + '</span><em>当日日程 →</em></footer></a>';
    }).join('') + '</div>';
  }

  /* ─ 费用：关键数字 + 按天拆开（和日程同一套日期）───────────────────── */
  function money() {
    const host = $('#moneyList');
    if (!host) return;
    const B = TRIP.budget || {};
    const fixed = (B.fixed || []).reduce((n, x) => n + (parseInt(String(x.per_person)) || 0), 0);
    const unknown = (B.unknown || []).length;
    const cells = [
      ['已确认票车', fixed + ' 元/人', '三人共 ' + fixed * 3 + ' 元'],
      ['待报价整车', unknown ? '4 段' : '—', '阿禾／契巴罗依／铁贾／10·1 返程'],
      ['装备租赁', '955 元/三人', '目标 ≤1000，阿勒泰租优先'],
      ['住宿上限', '≤600 元/间', '超了就用帐篷兜底'],
      ['餐饮', '500—600 元/人', '长徒步日路餐在阿勒泰补齐'],
      ['地面总目标', '≤3000 元/人', '往返火车实付另计'],
    ];
    const stay = {};
    (B.variable_stay || []).forEach(x => { if (x && x.night) stay[x.night] = x; });
    const rows = D.filter(d => d.id !== '1002').map(d => {
      const st = stay[d.id];
      const stayTxt = st ? String(st.main_value || '').split('；')[0].slice(0, 20)
        : (d.id === '0924' ? '火车卧铺' : String(d.sleep || '').split('（')[0]);
      const needQuote = /包车|整车/.test(d.move || '');
      const ticket = /白哈巴/.test(d.headline || '') ? '30'
        : (/禾木/.test(d.headline || '') ? '50' : (/喀纳斯/.test(d.headline || '') ? '230' : '0'));
      return '<tr><td><b>' + d.date + '</b><span class="dc-w">' + esc(d.week) + '</span></td>'
        + '<td>' + esc(stayTxt) + '</td><td>50—60</td>'
        + '<td>' + (needQuote ? '<em class="dc-quote">待报价</em>' : '含票内') + '</td>'
        + '<td class="dc-num">' + ticket + '</td></tr>';
    }).join('');
    host.innerHTML = '<div class="money-grid">' + cells.map(x =>
        '<div class="money-cell"><i>' + x[0] + '</i><b>' + x[1] + '</b><span>' + x[2] + '</span></div>').join('')
      + '</div><div class="money-days"><div class="md-head"><b>按天算</b>'
      + '<span>元／人；住按「整间≤600 或帐篷」预估</span>'
      + '<a class="btn-line small" href="budget.html">费用计算器 →</a></div>'
      + '<div class="tbl-wrap"><table class="cmp cost-tbl"><thead><tr><th>日期</th><th>住（预估）</th>'
      + '<th>吃</th><th>交通</th><th class="num">门票</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  }

  /* ─ 出发前：五件必办 ───────────────────────────────────────────────── */
  function todo() {
    const box = $('#todoList');
    if (!box) return;
    box.innerHTML = (TRIP.tasks || []).slice(0, 5).map(t =>
      '<li><a href="tasks.html"><span class="fm-due">' + esc(t.due || '') + '</span>'
      + '<span class="fm-who">' + esc(t.owner || '') + '</span>'
      + '<span class="fm-what">' + esc(t.item || t.what || '') + '</span>'
      + '<span class="fm-go">→</span></a></li>').join('');
  }

  /* ── 官方导览：单击换详情，双击开大图 ───────────────────────────────── */
  function official() {
    const thumbs = $('#offThumbs'), panel = $('#offPanel');
    if (!thumbs || !panel) return;
    thumbs.innerHTML = G.map((g, i) => '<button class="off-thumb' + (i === 0 ? ' active' : '') + '" data-off="' + g.id + '">'
      + '<img src="' + esc(g.file) + '" alt="' + esc(g.name) + '"><span>' + esc(g.name) + '</span></button>').join('');
    const group = (lines) => {
      const g1 = [], g2 = [], g3 = [];
      (lines || []).forEach(l => {
        const t = String(l);
        if (/换乘|回枢|班车|区间车/.test(t)) g1.push(t);
        else if (/寄存|行李|转运/.test(t)) g2.push(t);
        else g3.push(t);
      });
      return [['换乘与班车', g1], ['行李寄存', g2], ['吃住与充电', g3]];
    };
    const short = t => { const x = String(t).split('→')[0].replace(/^作者"|"$/g, '');
      return x.length > 26 ? x.slice(0, 26) + '…' : x; };
    const show = id => {
      const g = G.filter(x => x.id === id)[0];
      if (!g) return;
      $$('.off-thumb').forEach(b => b.classList.toggle('active', b.dataset.off === id));
      const p = placeById(g.place);
      const groups = group(g.facility_lines);
      panel.innerHTML = '<div class="offp-head"><h3>' + esc(g.name) + '</h3>'
        + '<div class="offp-acts"><button class="btn-line small" data-guide="' + g.id + '">放大官方全图</button>'
        + (p ? '<a class="mini-link" href="place.html?id=' + p.id + '">地点页 →</a>' : '') + '</div></div>'
        + '<p class="offp-key">' + esc(g.official_vs_us || g.use) + '</p>'
        + '<div class="offp-cols">' + groups.map(gr =>
            '<div class="offp-col"><p class="offp-h">' + gr[0] + '</p><ul>'
            + (gr[1].slice(0, 3).map(t => '<li title="' + esc(t) + '"><b>' + esc(short(t))
                + '</b><span>' + esc(t.length > 26 ? t.slice(26, 96) : '') + '</span></li>').join('')
               || '<li><b>—</b><span></span></li>')
            + '</ul></div>').join('') + '</div>'
        + '<div class="offp-adopt"><p class="offp-h">我们这次采用</p><div class="chip-row">'
        + (g.adopted || []).slice(0, 4).map(t => '<span class="chip">' + esc(short(t)) + '</span>').join('') + '</div></div>';
      panel.querySelectorAll('[data-guide]').forEach(b => b.addEventListener('click',
        () => Guide.open(g.file, g.name, g.facility_lines)));
    };
    let timer = null;
    thumbs.querySelectorAll('[data-off]').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.off;
      if (timer) {                       /* 双击：直接开大图 */
        clearTimeout(timer); timer = null;
        const g = G.filter(x => x.id === id)[0];
        if (g) Guide.open(g.file, g.name, g.facility_lines);
        return;
      }
      timer = setTimeout(() => { timer = null; show(id); }, 200);
    }));
    show(G[0].id);
  }

  /* ── 点地图上的线：这一段的路程、时长、来源和当日入口 ───────────────── */
  const LEG_SPEED = { drive: 40, shuttle: 30, hike: 4 };
  const MODE_TXT = { drive: '包车／拼车', shuttle: '区间车／摆渡', hike: '徒步', schem: '接驳示意' };
  const SRC_TXT = { nav: '高德导航路线', kml: '两步路轨迹（KML）', osm_route: 'OpenStreetMap 路网路由',
                    schematic: '走向示意（该路未收录于公开路网）' };
  window.__openLeg = function (leg) {
    const host = $('#mapDrawer');
    if (!host || !leg) return;
    const d = D.filter(x => x.id === leg.day || x.date === leg.day || x.date === leg.dayLabel)[0];
    const km = leg.km || 0;
    const h = km / (LEG_SPEED[leg.mode] || 40);
    const t = km ? (h < 1 ? Math.round(h * 60) + ' 分钟' : h.toFixed(1) + ' 小时') : '—';
    const src = leg.src === 'schematic' ? 'schematic' : (leg.src || 'kml');
    const free = /hike|shuttle/.test(leg.mode);
    host.innerHTML = '<button class="drawer-x" aria-label="关闭">×</button>'
      + '<div class="drawer-in"><p class="eyebrow">' + esc(leg.dayLabel || (d ? d.date : ''))
      + (d ? ' · ' + esc(d.week) : '') + '</p>'
      + '<h3>' + esc(leg.name || leg.id) + '</h3>'
      + '<div class="leg-figs">'
      + '<div><i>里程</i><b>' + (km ? km + ' km' : '—') + '</b></div>'
      + '<div><i>预计</i><b>' + t + '</b></div>'
      + '<div><i>方式</i><b>' + esc(MODE_TXT[leg.mode] || leg.mode || '—') + '</b></div></div>'
      + '<p class="drawer-src">几何来源：' + esc(SRC_TXT[src] || src) + '</p>'
      + '<p class="drawer-src">估价：' + (free ? '已含票内／不产生包车费' : '整车待司机报价，拿到后进费用页重算') + '</p>'
      + (d ? '<a class="drawer-go" href="day.html?id=' + d.id + '">打开 ' + esc(d.date) + ' 完整日程 →</a>' : '')
      + '<a class="drawer-go" href="budget.html">费用怎么算 →</a></div>';
    host.classList.add('open');
    host.querySelector('.drawer-x').onclick = () => host.classList.remove('open');
  };

  planPicker(); strip(); planTable(); feed(); official(); money(); todo();

  topic(T[0].id);
  $$('#scopeSwitch [data-scope]').forEach(b => b.addEventListener('click', () => {
    scope = b.dataset.scope;
    $$('#scopeSwitch [data-scope]').forEach(x => x.classList.toggle('active', x === b));
    const e1 = ENG(); if (e1) e1.scope(scope);
    drawMap();
  }));
  selectDay('all');
  addEventListener('resize', drawMap);

})();