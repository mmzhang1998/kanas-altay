/* 首页：主方案优先的现场操作系统。地图用真实坐标与 KML 点列，没有公开轨迹的转场一律标成示意走向。 */
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  /* 画幅与 SVG 用户单位 1:1 —— viewBox 跟着实际画幅走，
     否则 1000×600 的固定比例会在宽屏里被居中压缩，左右各留一条空白带。 */
  let W = 1000, H = 600, M = 42;
  function fitSize() {
    const el = document.getElementById('routeMap');
    if (!el) return;
    const b = el.getBoundingClientRect();
    if (b.width > 40) W = Math.round(b.width);
    if (b.height > 40) H = Math.round(b.height);
    M = Math.max(18, Math.round(Math.min(W, H) * 0.07));
  }
  let sel = 'all', scope = 'full', plan = window.PLAN_VIEW || 'main', focus = null;

  const P = TRIP.places, D = TRIP.days, T = TRIP.topics, R = TRIP.routes, G = TRIP.guides;
  /* 有 Leaflet 与底图瓦片就用真地图；失败则本文件的真实坐标 SVG 顶上（两套都不产生新事实） */
  /* 本地 file:// 下高德底图无域名可鉴权，直接走离线真实路网（OSM 路网＋KML 实录）；
     联网时用高德真底图，就绪事件会把它接上来。 */
  const ONLINE = /^https?:$/.test(location.protocol);
  /* 引擎不再由协议决定：本地 file:// 也能用高德公开瓦片＋Leaflet（已验证可加载）。
     AMap JS API 只在高德脚本真正就绪时才接管，其余一律走 Leaflet，瓦片失效再退 SVG。 */
  let AMAP = false;
  /* 引擎可能在运行中降级（高德瓦片失败→Leaflet），所以每次取"当前活着的引擎" */
  const ENG = () => (window.TripAMap && window.TripAMap.active) ? window.TripAMap
    : (window.TripLeaf && window.TripLeaf.ready) ? window.TripLeaf : null;
  const TK = (window.TRACKS ? TRACKS.tracks : []);
  /* 可选露营点：数据里只有村庄坐标，没有独立营位。这里用暖金帐篷标记与"今晚住这"的圆钉区分开，
     露营点不再只在高德/Learflet 引擎里出现、SVG 兜底时整批消失。 */
  const CAMP = {};
  (GeoMap.CAMP_IDS ? GeoMap.CAMP_IDS() : []).forEach(id => { CAMP[id] = 1; });
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
    const dayIds = (day && pl && pl.day_places && pl.day_places[day.id]) ? pl.day_places[day.id] : null;
    let v_pois = (day ? (dayIds && dayIds.length ? dayIds : day.places).map(placeById).filter(Boolean) : withCoord)
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
    /* 方案级轨迹过滤：备选A 不去白哈巴，就不能再画白哈巴→喀纳斯那条线。 */
    const PLAN_NO_ROUTE = { alt_a: { baihaba_kanas_transfer: 1 }, alt_b: { xiaoshike_meilifeng: 1 } };
    const banOf = id => PLAN_NO_ROUTE[id] || {};
    const trackOk = (t, ids) => {
      if (t.status === '不采用') return false;
      if (ids.indexOf('alt_a') >= 0 && /白哈巴/.test(t.name || '')) return false;
      if (ids.indexOf('alt_b') >= 0 && /小阿什克|美丽峰/.test(t.name || '')) return false;
      return !ids.some(id => banOf(id)[t.route]);
    };
    tracks = tracks.filter(t => trackOk(t, planView === 'all' ? ['main', 'alt_a', 'alt_b'] : [planView]));
    let planLegs = null, planPois = null;
    if (!focus) {
      const ids = planView === 'all' ? ['main', 'alt_a', 'alt_b'] : [planView];
      /* 实录由 tracks 那一路负责，这里只取道路几何；同一天切方案，线也会跟着换 */
      planLegs = GeoMap.planLegsRaw(ids, scope, day ? day.id : null).filter(l => l.src !== 'kml');
      const seen = {}; planPois = [];
      if (!day) ids.forEach(id => {
        const pp = TRIP.plans.filter(x => x.id === id)[0];
        (pp && pp.day_places ? Object.keys(pp.day_places).sort().reduce((acc, k) => acc.concat(pp.day_places[k]), []) : [])
          .forEach(pid => { const p = placeById(pid);
            if (p && p.coord && p.coord[0] != null && !seen[pid]
                && (scope === 'full' || !AHE_CORRIDOR[pid])) { seen[pid] = 1; planPois.push(p); } });
      });
      if (day) planPois = null;
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
    const px = Math.max((b - a) * .02, .004), py = Math.max((d - c) * .025, .004);
    a -= px; b += px; c -= py; d += py;
    /* 等比缩放后让内容尽量填满画幅：横向富余就以横向为准，纵向富余就以纵向为准，
       再把 SVG 视窗收成内容加一圈小边距。这样宽画幅不再左右留白、竖屏不再上下留白。 */
    const fill = .88, mw = (W * (1 - fill)) / 2, mh = (H * (1 - fill)) / 2;
    const k = Math.max((W - 2 * mw) / (b - a), (H - 2 * mh) / (d - c));
    const cx = (a + b) / 2, cy = (c + d) / 2;
    return p => [(p[1] - cx) * k + W / 2, H / 2 - (p[0] - cy) * k];
  }
  /* 同一天/同一范围下切方案：保持比例与中心，不跳 */
  function viewTransform(v) {
    const key = (v.day ? v.day.id : 'all') + '|' + scope + '|' + W + 'x' + H;
    if (key === prevViewKey && prevAt) return prevAt;
    prevViewKey = key; prevAt = bounds(v); return prevAt;
  }

  function drawMap() {
    const svg = $('#routeMap');
    if (!svg) return;
    const v = view();
    fitSize();
    const at = viewTransform(v);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.innerHTML = '';
    svg.append(el('rect', { width: W, height: H, class: 'map-bg' }));
    GeoMap.drawSVG(svg, { w: W, h: H, dayId: v.day ? v.day.id : null, scope: scope,
      tracks: v.planLegs ? [] : v.tracks, pois: v.planPois || v.pois,
      planLegs: v.planLegs, colorByPlan: v.planView === 'all' }, at);
    /* 标记：白环＋彩芯，标签带描边光晕。
       标签做贪心避让——湖区几个点在全程视图里会挤成一团，宁可少写一个也不叠字。 */
    const ORD = { stay: 0, hub: 1, road: 2, sight: 3 };
    const boxes = [];
    const crowded = r => boxes.some(o => !(r[2] < o[0] || r[0] > o[2] || r[3] < o[1] || r[1] > o[3]));
    (v.planPois || v.pois)
      .filter(p => p.coord && p.coord[0] != null)
      .map(p => ({ p: p, q: at(p.coord) }))
      .filter(o => o.q[0] > -24 && o.q[1] > -24 && o.q[0] < W + 24 && o.q[1] < H + 24)
      .sort((a, b) => (ORD[a.p.kind] || 3) - (ORD[b.p.kind] || 3))
      .forEach(o => {
        const p = o.p, q = o.q;
        const cls = p.kind === 'stay' ? 'stay' : (p.kind === 'hub' ? 'hub' : (p.kind === 'road' ? 'road' : 'sight'));
        const g = el('g', { class: 'gm-pin poi ' + cls,
                            transform: 'translate(' + q[0].toFixed(1) + ' ' + q[1].toFixed(1) + ')' });
        g.append(el('circle', { r: 7.5, class: 'gm-pin-ring' }));
        g.append(el('circle', { r: 3.4, class: 'gm-pin-core' }));
        if (CAMP[p.id]) {   /* 帐篷角标：偏移在图钉右下，不遮挡圆环与标签 */
          g.append(el('polygon', { class: 'gm-camp', points: '-5.5,7 5.5,7 0,-1', transform: 'translate(-13 5)' }));
          const ct = el('title', {}); ct.textContent = p.name + ' · 可选露营点'; g.append(ct);
        }
        const tw = p.name.length * 12.4 + 6;
        const CAND = [[11, 4], [11, 21], [11, -13], [11, 38], [-11 - tw, 4], [-11 - tw, 21], [11, -30], [-11 - tw, -13]];
        let spot = null;
        for (let i = 0; i < CAND.length; i++) {
          const c = CAND[i];
          const r = [q[0] + c[0] - 3, q[1] + c[1] - 12, q[0] + c[0] - 3 + tw, q[1] + c[1] + 4];
          if (!crowded(r)) { spot = c; boxes.push(r); break; }
        }
        if (!spot && cls === 'stay') {                       /* 过夜点永远保留标签 */
          spot = CAND[0];
          boxes.push([q[0] + 8, q[1] - 12, q[0] + 8 + tw, q[1] + 4]);
        }
        if (spot) {
          const t = el('text', GeoMap.labelAttrs());
          t.setAttribute('x', spot[0]); t.setAttribute('y', spot[1]); t.textContent = p.name;
          g.append(t);
        }
        const ttl = el('title', {});
        ttl.textContent = p.name + ' — 打开地点页';
        g.append(ttl);
        g.addEventListener('click', () => {
          /* 先用浮卡给出浅入口（结论、照片数、关联日期），点卡里的按钮再进地点详情页 */
          const e = ENG();
          if (e && e.openDrawer) { e.openDrawer(p); } else { location.href = 'place.html?id=' + p.id; }
        });
        svg.append(g);
      });
    /* 图例分类按"这一天/这个范围一共有哪些走法"算，和当前开关无关：
       否则点掉一类，按钮会跟着消失，看起来就像筛选失效。 */
    const dayId = v.day ? v.day.id : null;
    const ids2 = v.day ? [plan] : (v.planView === 'all' ? ['main', 'alt_a', 'alt_b'] : [v.planView]);
    const kinds = {};
    GeoMap.planLegsRaw(ids2, scope, dayId).forEach(l => { kinds[l.src === 'schematic' ? 'schem' : l.mode] = 1; });
    TK.forEach(t => { if (v.day ? v.day.tracks.indexOf(t.id) >= 0 : USED[t.id]) {
      /* 图例键必须和 map.js 实际用来过滤的键完全一致：
         统一走 GeoMap.modeOf（kind 优先），否则按钮点掉的是 hike、被隐藏的是 drive，看起来就是筛选失效 */
      const mm = GeoMap.modeOf(t.kind, t.name);
      kinds[(mm === 'bus' || mm === 'train') ? mm : (mm === 'shuttle' ? 'shuttle' : (mm === 'drive' ? 'drive' : 'hike'))] = 1; } });
    if ((v.planPois || v.pois).some(p => p.kind === 'stay')) kinds.stay = 1;
    if (!Object.keys(kinds).length) { kinds.drive = 1; kinds.hike = 1; }
    const LBL = { drive: '包车 · 导航道路', shuttle: '区间车 · 导航道路', hike: '徒步路线',
                  schem: '走向示意', stay: '过夜点' };
    const lg = $('#mapLegend');
    if (lg) {
      lg.innerHTML = (v.planView === 'all' && !v.day
        ? '<div class="lg-plans">' + ['main', 'alt_a', 'alt_b'].map(id =>
            '<span class="lg-plan" style="--pc:' + GeoMap.PLAN_COLOR[id] + '"><i></i>'
            + esc(GeoMap.PLAN_NAME[id].split(' · ')[0]) + '</span>').join('') + '</div>' : '')
        + '<div class="lg-kinds">' + ['drive', 'shuttle', 'hike', 'schem', 'stay'].filter(k => kinds[k]).map(k =>
            '<button class="lg-' + k + (window.HIDE && window.HIDE[k] ? ' off' : '') + '" data-lg="' + k
            + '" aria-pressed="' + !(window.HIDE && window.HIDE[k]) + '"><i></i>' + (LBL[k] || LEGEND[k] || k)
            + '</button>').join('')
        + (Object.keys(CAMP).length ? '<span class="lg-camp-item"><i class="lg-camp"></i>可选露营点</span>' : '')
        + '</div>';
      $$('#mapLegend [data-lg]').forEach(b => b.addEventListener('click', () => {
        window.HIDE = window.HIDE || {};
        const k = b.dataset.lg;
        window.HIDE[k] = !window.HIDE[k];
        b.classList.toggle('off', !!window.HIDE[k]);
        b.setAttribute('aria-pressed', window.HIDE[k] ? 'false' : 'true');
        /* 真正在跑的是 Leaflet／高德时，必须让"当前活着的引擎"按新状态重画；
           以前这里只重画背后的 SVG，读者看到的地图纹丝不动，所以判定"图例筛选不生效"。 */
        const e = ENG();
        if (e && e.refresh) { try { e.refresh(); } catch (err) { drawMap(); } } else { drawMap(); }
      }));
    }
    const mt = $('#mapTitle');
    if (mt) mt.textContent = (v.day ? v.day.date + ' · 当天动线'
      : (GeoMap.PLAN_NAME[v.planView] || (TRIP.plans.filter(x => x.id === plan)[0] || {}).name)
        + ' · ' + (scope === 'full' ? '含阿禾全线' : '核心区域'));
    /* 右下角放本视图的真实里程合计（腿的 km 与轨迹原生统计），
       而不是留一块空地或写一句说明书。 */
    const note = $('#mapNote');
    if (note) {
      let drive = 0;
      GeoMap.planLegsRaw(ids2, scope, dayId).forEach(l => {
        if (l.src === 'schematic') return;
        if (l.mode === 'drive' || l.mode === 'shuttle') drive += (l.km || 0);
      });
      let hike = 0;
      const hk = (v.day ? v.day.tracks.map(trackById).filter(Boolean) : TK.filter(t => USED[t.id]))
        .filter(t => GeoMap.modeOf(t.kind, t.name) === 'hike');
      hk.forEach(t => {
        const ak = parseFloat(String(t.adopted_km == null ? '' : t.adopted_km).replace(/[^0-9.]/g, ''));
        hike += isFinite(ak) ? ak : (t.distance || 0);
      });
      const total = drive + hike;
      note.innerHTML = total
        ? '<div class="map-stats">'
          + '<span><i>车行／区间车</i><b>' + Math.round(drive) + ' km</b></span>'
          + (hike ? '<span><i>徒步</i><b>' + (Math.round(hike * 10) / 10) + ' km</b></span>' : '')
          + '<span><i>合计</i><b>' + Math.round(total) + ' km</b></span></div>'
        : '';
    }

    const fk = $('#focusTrack');
    if (!fk) return;
    const list = (sel === 'all' ? TK.filter(t => USED[t.id]) : (v.day ? v.day.tracks.map(trackById).filter(Boolean) : []));
    fk.innerHTML = '<option value="">看某一条徒步线（放大）</option>'
      + list.map(t => '<option value="' + esc(t.id) + '"' + (focus === t.id ? ' selected' : '') + '>'
        + esc((t.name || t.id).slice(0, 22)) + ' · ' + (t.adopted_points.length ? '采用段' : '完整轨迹') + '</option>').join('');
    fk.style.display = list.length ? '' : 'none';
  }

  /* ─ 日期面板 ────────────────────────────────────────────────────── */
  function selectDay(id) {
    sel = id; focus = null;
    const e0 = ENG(); if (e0) e0.select(id);
    $$('.strip-card').forEach(x => x.classList.toggle('active', x.dataset.day === id));
    syncDayDetail();
    drawMap();
  }

  /* 当前方案（顶部三个方按钮写的就是它）＋这一天的方案内写法。
     日期筛选必须跟着方案变，否则读者会拿主方案的日程去读备选方案。 */
  function planOf() {
    const cur = window.PLAN_VIEW || plan || 'main';
    return TRIP.plans.filter(x => x.id === cur)[0] || TRIP.plans[0];
  }
  function planRow(pl, id) {
    const rows = pl.day_rows || [];
    for (let i = 0; i < rows.length; i++) if (rows[i].date === id) return rows[i];
    return null;
  }
  /* 日期条上的方案写法：去掉"（第 2 晚）"这类只属于详情页的尾注，
     超长的在自然断点收口；完整句子仍留在下方那一天的日程面板里。 */
  function briefLabel(t) {
    const s = String(t || '').replace(/（第\s*[0-9一二三四五六七八九十]+\s*晚）/g, '')
                            .replace(/\(第\s*[0-9一二三四五六七八九十]+\s*晚\)/g, '').trim();
    if (s.length <= 20) return s;
    const cut = s.split(/[，,；;]/)[0].trim();
    if (cut.length >= 8 && cut.length <= 18) return cut;
    const noParen = s.replace(/（[^）]*）/g, '').trim();
    if (noParen.length >= 8 && noParen.length <= 22) return noParen;
    const head = s.split('（')[0].trim();
    const base = head.length >= 8 ? head : s;
    return base.length > 21 ? base.slice(0, 20) + '…' : base;
  }
  function planLabel(pl, d, brief) {
    const r = planRow(pl, d.id);
    let t;
    if (pl.id !== 'main' && r && r.plan && !/^同主方案$/.test(r.plan)) t = r.plan;
    else t = d.short;
    return brief ? briefLabel(t) : t;
  }

  function syncDayDetail() {
    const dd = $('#dayDetail');
    if (!dd) return;
    const d = sel === 'all' ? null : Trip.day(sel);
    if (!d) { dd.hidden = true; dd.innerHTML = ''; return; }
    const pl = planOf();
    const label = planLabel(pl, d);
    const differs = pl.id !== 'main' && label !== d.short;
    const sleep = (pl.nights || {})[d.id] || d.sleep.split('（')[0];
    dd.hidden = false;
    dd.innerHTML = '<div class="dd-head"><b>' + d.date + ' ' + esc(d.week) + ' · ' + esc(d.headline) + '</b>'
      + '<a href="day.html?id=' + d.id + '">打开当日完整日程 →</a></div>'
      + '<div class="dd-grid">'
      + '<div class="schedule-preview">'
      + (differs
        ? '<div class="dd-plan"><span class="dd-plan-tag" style="--pc:' + GeoMap.PLAN_COLOR[pl.id] + '">'
            + esc(String(pl.name).split('｜')[0]) + '</span>'
            + '<b>' + esc(label) + '</b>'
            + '<p>该日在另一套方案里的时间轴不同，<a href="plans.html">看这一套的完整对比 →</a></p></div>'
        : (d.timeline || []).slice(0, 6).map(x => '<div class="schedule-item"><time>' + esc(x.time || '—')
            + '</time><div><b>' + esc(x.what || '') + '</b></div></div>').join(''))
      + '</div><div class="dd-side"><span><i>移动</i>' + esc(d.move) + '</span>'
      + '<span><i>过夜</i>' + esc(sleep) + '</span>'
      + '<span><i>大包</i>' + esc(d.bag || '—') + '</span>'
      + '<span class="dd-red"><i>红线</i>' + esc(d.redline) + '</span>'
      + ddPlaces(d) + '</div></div>';
  }

  /* 当日经过的地点：点名字直接在地图上打开那一颗钉的浮卡，不用先去图上找。 */
  function ddPlaces(d) {
    const ids = (d.places || []).filter(id => placeById(id)).slice(0, 8);
    if (!ids.length) return '';
    return '<span class="dd-jump"><i>当日地点</i><span class="dd-chips">'
      + ids.map(id => '<button type="button" class="dd-chip" data-place="' + id + '">'
          + esc(placeById(id).name) + '</button>').join('') + '</span></span>';
  }
  document.addEventListener('click', function (e) {
    const b = e.target.closest && e.target.closest('[data-place]');
    if (!b) return;
    const id = b.getAttribute('data-place');
    if (!id) return;
    const dayId = sel === 'all' ? null : sel;
    /* 地图在上方，日程在下方：点了地名先把地图滚进视野，否则浮卡开在看不见的地方 */
    const stage = document.querySelector('.map-stage');
    if (stage && stage.getBoundingClientRect().top < 40) {
      try { stage.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (err) { stage.scrollIntoView(); }
    }
    const A = window.TripAMap, L = window.TripLeaf;
    if (A && A.active && A.focusPlace) { A.focusPlace(id, dayId); return; }
    if (L && L.ready && L.focusPlace) { L.focusPlace(id, dayId); return; }
    location.href = 'place.html?id=' + id;
  });

  /* ── 首页各区块 ───────────────────────────────────────────────────── */

  function shortSleep(d) {
    const raw = (d.sleep || '').split('（')[0];
    const place = raw.replace(/现场低价住宿优先|低价住宿优先|现场低价房优先|继续住|住宿；.*/, '').trim();
    if (/露营/.test(d.sleep)) return place + ' · 可露营';
    if (/火车/.test(raw)) return '火车卧铺';
    return (place || raw) + ' · 房≤600 否则帐篷';
  }

  /* 地图下方的九天日程条：跟着当前方案换标题与过夜点，点一下地图切到当天 */
  function strip() {
    const box = $('#dayStrip');
    if (!box) return;
    const pl = planOf();
    const active = sel;
    box.innerHTML = D.map(d => {
      const label = planLabel(pl, d, true);
      const sleep = (pl.nights || {})[d.id] || d.sleep.split('（')[0];
      return '<button class="strip-card' + (active === d.id ? ' active' : '') + '" data-day="' + d.id + '">'
        + '<i>' + d.date + '</i><b>' + esc(label) + '</b>'
        + '<span>' + esc(sleep) + '</span></button>';
    }).join('');
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

  window.addEventListener('planview', () => {
    plan = window.PLAN_VIEW || plan;
    planPicker(); planTable(); strip(); syncDayDetail(); drawMap();
  });

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

  /* ─ 九天总表：日程与当天花销同一条线，一眼看完 ─────────────────────── */
  /* 逐日口径：过夜地点、住宿区间、门票（元/人）。
     门票口径＝喀纳斯一进 230＋跨 48 小时补差 35＋白哈巴 30＋禾木 50，与费用页票种基线一致。 */
  /*  逐日：九天各一张卡，同行并列，不打表 ───────────────────────────── */
  const DAY_TICKET = { '0924': 0, '0925': 50, '0926': 0, '0927': 30, '0928': 230,
    '0929': 0, '0930': 35, '1001': 0, '1002': 0 };
  const DAY_BED = { '0924': '夜火车', '0925': '禾木', '0926': '贾登峪', '0927': '白哈巴',
    '0928': '喀纳斯', '0929': '喀纳斯', '0930': '贾登峪', '1001': 'K9752 卧铺', '1002': '—' };
  const bedPlace = d => DAY_BED[d.id] || String(d.sleep || '').split('（')[0] || '—';

  function feed() {
    const host = $('#dayFeed');
    if (!host) return;
    host.innerHTML = '<div class="day-tiles">' + D.map(d => {
      const stay = bedPlace(d);
      const ps = (d.places || []).map(placeById).filter(Boolean).slice(0, 3);
      return '<a class="day-tile" href="day.html?id=' + d.id + '">'
        + '<header><b>' + d.date + '</b><span>' + esc(d.week) + '</span></header>'
        + '<p class="dt-head">' + esc(d.headline) + '</p>'
        + '<div class="dt-figs"><div><i>移动</i><span>' + esc(d.move || '—') + '</span></div>'
        + '<div><i>过夜</i><span>' + esc(stay) + '</span></div></div>'
        + (ps.length ? '<div class="dt-tags">' + ps.map(p => '<span>' + esc(p.name) + '</span>').join('') + '</div>' : '')
        + '<footer><span class="dt-cut">先删：' + esc(d.cut_first || '—') + '</span><em>当日日程 →</em></footer></a>';
    }).join('') + '</div>';
  }

  /*  费用：六个关键数字 + 按天拆开（和日程同一套日期）───────────────────── */
  function money() {
    const host = $('#moneyList');
    if (!host) return;
    const B = TRIP.budget || {};
    const fixed = (B.fixed || []).reduce((n, x) => n + (parseInt(String(x.per_person)) || 0), 0);
    const unknown = (B.unknown || []).length;
    const EST = B.estimate || {};
    const cells = [
      ['已确认票车', fixed + ' 元/人', '三人共 ' + fixed * 3 + ' 元'],
      ['整车预估', EST.charter_per_person || '600—1200 元/人', '四段整车待司机报价，出价后重算'],
      ['装备租赁', '955 元/三人', '目标 ≤1000，阿勒泰租优先'],
      ['住宿上限', '≤600 元/间', '超了就用帐篷兜底'],
      ['餐饮', EST.food_per_person || '800—1000 元/人', '按 100 元/人·天 × 8 天备'],
      ['预估人均', /元/.test(String(EST.per_person || '')) ? EST.per_person : (EST.per_person || '2800—3400') + ' 元', '吃＋票＋住＋装备＋整车分摊，火车实付另计'],
    ];
    const stay = {};
    (B.variable_stay || []).forEach(x => { if (x && x.night) stay[x.night] = x; });
    const rows = D.filter(d => d.id !== '1002').map(d => {
      const st = stay[d.id];
      const stayTxt = st ? String(st.main_value || '').split('；')[0].slice(0, 20) : bedPlace(d);
      const needQuote = /包车|整车/.test(d.move || '');
      const ticket = DAY_TICKET[d.id] || 0;
      return '<tr><td><b>' + d.date + '</b><span class="dc-w">' + esc(d.week) + '</span></td>'
        + '<td>' + esc(stayTxt) + '</td><td>100</td>'
        + '<td>' + (needQuote ? '<em class="dc-quote">待报价</em>' : '含票内') + '</td>'
        + '<td class="dc-num">' + ticket + '</td></tr>';
    }).join('');
    host.innerHTML = '<div class="money-grid">' + cells.map(x =>
        '<div class="money-cell"><i>' + x[0] + '</i><b>' + x[1] + '</b><span>' + x[2] + '</span></div>').join('')
      + '</div><div class="money-days"><div class="md-head"><b>按天算</b>'
      + '<span>元／人；住按「整间≤600 或帐篷」预估，吃 100 元/人·天</span>'
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
    /* 只展示已提炼的分栏要点；数据里没有 points 才退回原文行 */
    const colsOf = g => {
      if (g.points && g.points.length) return g.points.map(x => [x.h, x.items || []]);
      const g1 = [], g2 = [], g3 = [];
      (g.facility_lines || []).forEach(l => {
        const t = String(l);
        if (/换乘|回枢|班车|区间车/.test(t)) g1.push(t);
        else if (/寄存|行李|转运/.test(t)) g2.push(t);
        else g3.push(t);
      });
      return [['换乘与班车', g1], ['行李与寄存', g2], ['现场要点', g3]];
    };
    const show = id => {
      const g = G.filter(x => x.id === id)[0];
      if (!g) return;
      $$('.off-thumb').forEach(b => b.classList.toggle('active', b.dataset.off === id));
      const p = placeById(g.place);
      panel.innerHTML = '<div class="offp-head"><h3>' + esc(g.name) + '</h3>'
        + '<div class="offp-acts"><button class="btn-line small" data-guide="' + g.id + '">放大官方全图</button>'
        + (p ? '<a class="mini-link" href="place.html?id=' + p.id + '">地点页 →</a>' : '') + '</div></div>'
        + '<p class="offp-key">' + esc(g.headline || g.official_vs_us || g.use) + '</p>'
        + '<div class="offp-cols">' + colsOf(g).map(gr =>
            '<div class="offp-col"><p class="offp-h">' + esc(gr[0]) + '</p><ul>'
            + gr[1].slice(0, 4).map(t => '<li>' + esc(t) + '</li>').join('')
            + '</ul></div>').join('') + '</div>'
        + '<div class="offp-adopt"><p class="offp-h">我们这次采用</p><div class="chip-row">'
        + (g.adopted || []).slice(0, 4).map(t => '<span class="chip">' + esc(t) + '</span>').join('') + '</div></div>';
      panel.querySelectorAll('[data-guide]').forEach(b => b.addEventListener('click',
        () => Guide.open(g.file, g.name, (g.points || []).reduce((a, x) => a.concat(x.items || []), []))));
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
    if (window.TripLeaf && TripLeaf.unanchor) TripLeaf.unanchor();
    host.style.left = '16px'; host.style.top = '16px'; host.style.right = 'auto';
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
      + '<div><i>方式</i><b>' + esc(MODE_TXT[leg.mode] || leg.mode || '—') + '</b></div>'
      + (leg.gain != null ? '<div><i>累计爬升</i><b>+' + leg.gain + ' m</b></div>' : '')
      + (leg.loss != null ? '<div><i>累计下降</i><b>−' + leg.loss + ' m</b></div>' : '')
      + (leg.elevation && leg.elevation.length > 1
          ? '<div><i>海拔区间</i><b>' + leg.elevation[0] + '—' + leg.elevation[1] + ' m</b></div>' : '')
      + '</div>'
      + '<p class="drawer-src">几何来源：' + esc(SRC_TXT[src] || src) + '</p>'
      + (leg.adoptedNote ? '<p class="drawer-src">采用段：' + esc(leg.adoptedNote) + '</p>' : '')
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
  /* 引擎启动顺序：高德 JS API（已就绪时）→ Leaflet＋高德瓦片 → app.js 的 SVG。
     本地 file:// 直接走第二条（公开瓦片无需域名鉴权，已实测可用）。 */
  function bootEngine() {
    if (window.AMap && window.TripAMap && TripAMap.boot()) { AMAP = true; }
    else if (window.TripLeaf && TripLeaf.boot()) { AMAP = false; }
  }
  window.addEventListener('amap-ready', function () {
    if (AMAP) return;
    if (window.TripAMap && TripAMap.boot()) { AMAP = true; try { drawMap(); } catch (e) {} }
  });

  bootEngine();
  selectDay('all');
  addEventListener('resize', drawMap);

})();