/* 首页地图：Leaflet ＋ 高德中文路网瓦片（webrd）。
   数据一律来自 site-data.js / tracks.js；本文件只负责"怎么画"，不产生任何事实。
   瓦片不可达时由 app.js 的真实坐标 SVG 视图接管（不隐藏、不报错）。 */
(function () {
  /* 颜色只有一处定义：一律引用 GeoMap.STYLE（geomap.js）。
     同一套设计语言必须让 SVG／Leaflet／高德三套引擎对同一种走法给出同一个颜色。 */
  const FALLBACK = { drive: '#2A5750', shuttle: '#5C8A80', hike: '#7FA090', schem: '#A8A79E',
                     bus: '#4c7d8c', train: '#6f6a86', intent: '#9FB0A8' };
  const COLOR = new Proxy({}, {
    get: (_, k) => {
      const st = (window.GeoMap && GeoMap.STYLE) || {};
      return (st[k] && st[k].color) || FALLBACK[k] || '#A8A79E';
    },
  });
  const BOUNDS = {
    core: [[48.33, 86.60], [48.90, 87.68]],          /* 禾木—贾登峪—白哈巴—喀纳斯 */
    full: [[47.72, 86.45], [48.95, 88.32]],          /* 加上阿勒泰站与阿禾公路走廊 */
  };
  const WORLD = [[47.2, 85.6], [49.6, 89.2]];
  let map = null, layers = { base: null, lines: null, pins: null, camp: null }, tileOk = null, ready = false;
  let active = false;
  let state = { day: 'all', scope: 'full', focus: null, plan: 'main' };

  const place = id => TRIP.places.filter(x => x.id === id)[0];
  const track = id => (window.TRACKS ? TRACKS.tracks.filter(t => t.id === id)[0] : null);
  const esc2 = s => String(s == null ? '' : s).replace(/[&<>"]/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ── WGS-84 → GCJ-02 ────────────────────────────────────────────────
     高德瓦片是 GCJ-02；行程数据（KML 实录、OSM 路由、高德导航烘焙）统一存 WGS-84。
     不换算就会出现 300—600 m 的系统性偏移：点位看起来"就在附近"，其实没压在路上。 */
  const PI = 3.14159265358979324, A = 6378245.0, EE = 0.00669342162296594323;
  const outCN = (lng, lat) => lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
  function tfLat(x, y) { let r = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    r += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3;
    r += (20 * Math.sin(y * PI) + 40 * Math.sin(y / 3 * PI)) * 2 / 3;
    r += (160 * Math.sin(y / 12 * PI) + 320 * Math.sin(y * PI / 30)) * 2 / 3; return r; }
  function tfLng(x, y) { let r = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    r += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3;
    r += (20 * Math.sin(x * PI) + 40 * Math.sin(x / 3 * PI)) * 2 / 3;
    r += (150 * Math.sin(x / 12 * PI) + 300 * Math.sin(x / 30 * PI)) * 2 / 3; return r; }
  function wgs2gcj(lng, lat) {
    if (outCN(lng, lat)) return [lng, lat];
    let dLat = tfLat(lng - 105, lat - 35), dLng = tfLng(lng - 105, lat - 35);
    const radLat = lat / 180 * PI, s = Math.sin(radLat), m = 1 - EE * s * s, sq = Math.sqrt(m);
    dLat = dLat * 180 / ((A * (1 - EE)) / (m * sq) * PI); dLng = dLng * 180 / (A / sq * Math.cos(radLat) * PI);
    return [lng + dLng, lat + dLat];
  }
  /* 点：已烘焙 coord_gcj 直接用，否则由 WGS 换算 */
  function poiLL(p) {
    if (p.coord_gcj && p.coord_gcj[0] != null) return [p.coord_gcj[0], p.coord_gcj[1]];
    const g = wgs2gcj(p.coord[1], p.coord[0]);
    return [g[1], g[0]];
  }
  const toGCJ = pts => (pts || []).map(q => { const g = wgs2gcj(q[1], q[0]); return [g[1], g[0]]; });

  function pinIcon(p) {
    const cls = p.kind === 'stay' ? 'stay' : (p.kind === 'hub' ? 'hub' :
      (p.kind === 'road' ? 'road' : 'sight'));
    return L.divIcon({ className: 'gpin-wrap ' + cls, html: GeoMap.pinHTML(p),
                       iconSize: [22, 22], iconAnchor: [11, 11] });
  }

  function current() {
    const day = state.day === 'all' ? null : TRIP.days.filter(d => d.id === state.day)[0];
    /* 方案口径只有一处：PlanView（顶部三个方按钮写的就是它）。
       地图必须先认它，日期筛选、图例、里程统计才能跟着方案一起变。 */
    const pv = window.PLAN_VIEW || state.plan || 'main';
    const plan = TRIP.plans.filter(x => x.id === pv)[0] || TRIP.plans[0];
    const skip = { campsites: 1, luggage: 1, urumqi_night_train: 1 };
    const CORRIDOR = { altay_city: 1, back_to_altay: 1, ahe_road: 1 };   /* 阿禾走廊只在「含阿禾」里出现 */
    const planDays = (plan && plan.day_places) ? Object.keys(plan.day_places) : [];
    /* 方案级过滤：这一套方案不去的地方，实录也不画（切换方案时地图必须真的变） */
    const inPlan = t => planDays.some(d => GeoMap.trackAllowed(plan, d, t));
    let tracks = [];
    if (day) {
      tracks = day.tracks.map(track).filter(Boolean)
        .filter(t => GeoMap.trackAllowed(plan, day.id, t));
    } else {
      /* 实录不再用「有没有 adopted_points」当门槛——那会把未裁段的徒步实录整条丢掉。
         现在只由两件事决定：方案/日期是否覆盖它（inPlan），以及是否属于阿禾走廊。 */
      tracks = (window.TRACKS ? TRACKS.tracks : [])
        .filter(t => state.scope === 'full' || !/阿禾/.test(t.name))
        .filter(inPlan);
    }
    if (state.focus) tracks = tracks.filter(t => t.id === state.focus);
    /* 图钉同样按方案过滤：备选A 不去白哈巴，就不该在白哈巴留一个点 */
    let pois;
    if (day) {
      const dp = (plan.day_places || {})[day.id];
      pois = ((dp && dp.length) ? dp.map(place) : day.places.map(place)).filter(Boolean);
    } else {
      pois = (state.scope === 'full' ? TRIP.places : TRIP.places.filter(p => !skip[p.id] && !CORRIDOR[p.id]))
        .filter(p => p.coord && p.coord[0] != null);
    }
    /* 直线腿彻底作废：改用 GeoMap 的真实路网腿，并且按当前方案＋当前日期过滤。
       实录那一路由上面的 tracks 负责，这里只取道路几何，避免同一段路叠两层线。 */
    const ids = pv === 'all' ? ['main', 'alt_a', 'alt_b'] : [pv];
    let planLegs = GeoMap.planLegsRaw(ids, state.scope, day ? day.id : null)
      .filter(l => l.src !== 'kml');
    if (state.focus) planLegs = [];
    if (!day) {
      const seen = {}; const pp2 = [];
      ids.forEach(id => {
        const pl2 = TRIP.plans.filter(x => x.id === id)[0];
        (pl2 && pl2.day_places ? Object.keys(pl2.day_places).sort().reduce((acc, k) => acc.concat(pl2.day_places[k]), []) : [])
          .forEach(pid => { const q = place(pid);
            if (q && q.coord && q.coord[0] != null && !seen[pid]
                && (state.scope === 'full' || !CORRIDOR[pid])) { seen[pid] = 1; pp2.push(q); } });
      });
      pois = pp2;
    }
    return { day: day, plan: plan, tracks: tracks, pois: pois, legs: [], planLegs: planLegs, planView: pv };
  }

  function draw(keepView) {
    if (!ready) return;
    const c = current();
    layers.lines.clearLayers();
    /* 注意：这里绝不能 clearLayers() 图钉。
       图钉与它的常驻标签走 pinCache 差量更新，整体清空会让标签消失再重建——就是闪烁的来源。 */
    /* 真实路网：OSM 路由出的腿按交通方式上色（白衬线＋彩主线）；
       没有公开路网的接驳段画细点线并标"接驳示意"，绝不把直线当道路 */
    const drawLegs = c.planLegs || (state.day === 'all' ? GeoMap.legsFor(null, state.scope)
      : GeoMap.dayLegs(state.day, state.scope));
    const HIDE = window.HIDE || {};
    drawLegs.forEach(l => {
      if (!l.points || l.points.length < 2) return;
      if (HIDE[l.src === 'schematic' ? 'schem' : l.mode]) return;
      const st = l.src === 'schematic' ? GeoMap.STYLE.schem
        : ((c.planView === 'all') ? { color: GeoMap.PLAN_COLOR[l.plan] || GeoMap.STYLE.drive.color,
                                      width: 2.8, dash: null } : GeoMap.STYLE[l.mode]) || GeoMap.STYLE.drive;
      const ll = toGCJ(l.points);
      L.polyline(ll, { color: '#ffffff', weight: st.width + 1.8, opacity: .92,
                       interactive: false, lineCap: 'round', lineJoin: 'round' }).addTo(layers.lines);
      L.polyline(ll, { color: st.color, weight: st.width, opacity: .96, dashArray: st.dash,
                       lineCap: 'round', lineJoin: 'round' })
        .bindTooltip(l.name + (l.src === 'schematic' ? ' · 走向示意（该路未收录于公开路网）'
                                      : (l.km ? ' · ' + l.km + ' km' : '')), { sticky: true, className: 'tip-line' })
        .on('click', () => { if (window.__openLeg) window.__openLeg(l); })
        .addTo(layers.lines);
      if (l.stub) {
        [ll[0], ll[ll.length - 1]].forEach(q => {
          const near = c.pois.filter(p => p.coord && p.coord[0] != null)
            .map(p => { const t = poiLL(p); return { p: p, t: t, d: Math.hypot(t[0] - q[0], t[1] - q[1]) }; })
            .sort((x, y) => x.d - y.d)[0];
          if (near && near.d < 0.06) L.polyline([q, near.t],
            { color: GeoMap.STYLE.stub.color, weight: 1.6, dashArray: '2 6', opacity: .9, interactive: false })
            .bindTooltip('接驳示意：这一段没有公开路网', { sticky: true, className: 'tip-line' })
            .addTo(layers.lines);
        });
      }
    });
    c.tracks.forEach(t => {
      const g = (t.adopted_points && t.adopted_points.length) ? t.adopted_points : t.points;
      if (!g || g.length < 2) return;
      const mm = GeoMap.modeOf(t.kind, t.name);
      if (HIDE[mm]) return;
      /* 交通方式只能有一种画法：走 GeoMap.STYLE 全量映射。
         早先这里只判 hike / 非 hike 两种，区间车与摆渡被当成包车涂成琥珀色实线——
         读者一眼分不出「包车」「区间车」「徒步」，这就是"区间车与徒步搞混"的根因。 */
      const st = GeoMap.STYLE[mm] || GeoMap.STYLE.drive;
      const full = (t.adopted_points || []).length ? t.points : null;
      if (full && full.length > 1) {                       /* 完整轨迹压淡，采用段加粗：一眼看出"走哪段" */
        L.polyline(toGCJ(full), { color: st.color, weight: 1.2, opacity: .20,
          dashArray: st.dash, interactive: false }).addTo(layers.lines);
      }
      L.polyline(toGCJ(g), {
        color: st.color, weight: st.width * 0.9, opacity: .96, dashArray: st.dash,
        lineCap: 'round', lineJoin: 'round',
      }).bindTooltip(t.name + ' · ' + (t.distance || '') + ' km',
        { sticky: true, className: 'tip-line' })
        .on('click', () => { if (window.__openLeg) window.__openLeg({
          name: t.name, mode: mm, src: 'kml', km: t.distance,
          gain: t.gain, loss: t.loss, elevation: t.elevation,
          adoptedNote: t.adopted_note, fullKm: t.distance, day: t.day }); })
        .addTo(layers.lines);
    });
    drawPins(c);
    const pts = [];
    c.tracks.forEach(t => { const g = (t.adopted_points && t.adopted_points.length) ? t.adopted_points : t.points;
      toGCJ(g).forEach(q => pts.push(q)); });
    c.pois.forEach(p => pts.push(poiLL(p)));
    drawLegs.forEach(l => toGCJ(l.points).forEach(q => pts.push(q)));

    /* 露营点与"本次不去"的对照点放进独立图层：drawPins 重画时不会把它们擦掉 */
    layers.camp.clearLayers();
    (GeoMap.CAMP_IDS() || []).forEach(cid => {
      const p = TRIP.places.filter(x => x.id === cid)[0];
      if (!p || !p.coord || p.coord[0] == null) return;
      L.marker(poiLL(p), { interactive: true, icon: L.divIcon({ className: 'camp-wrap',
        html: '<i class="camp-dot" title="' + p.name + ' · 可选露营点"></i>', iconSize: [13, 12], iconAnchor: [-6, 6] }) })
        .bindTooltip(p.name + ' · 可选露营点', { direction: 'top', offset: [0, -6], className: 'tip-line' })
        .on('click', () => openDrawer(p))
        .addTo(layers.camp);
    });
    const nr = TRIP.places.filter(x => x.id === 'naren')[0];
    if (nr && nr.coord && nr.coord[0] != null && state.day === 'all') {
      L.marker(poiLL(nr), { interactive: false, icon: L.divIcon({ className: 'ghost-wrap',
        html: '<i class="gpin sight ghost-pin"><b></b></i>',
        iconSize: [22, 22], iconAnchor: [11, 11] }) })
        .bindTooltip('那仁牧场 · 本次不去', { permanent: true, direction: 'right', offset: [12, 0],
          /* 必须带 tip-perm：否则它不参与避让，会和其他常驻标签叠字 */
          className: 'tip-name prio4 tip-perm' })
        .addTo(layers.camp);
    }
    /* 取景只由"范围"决定，与选哪套方案无关：切三个方案时比例完全一致，
       不会忽远忽近。只有选中某一天才按当天点列取景。 */
    if (state.day !== 'all' && pts.length > 1 && !keepView) {
      map.fitBounds(L.latLngBounds(pts).pad(0.14),
        { animate: true, duration: .45, maxZoom: state.focus ? 13 : 12 });
    } else if (!keepView) {
      map.flyToBounds(BOUNDS[state.scope] || BOUNDS.core, { duration: .45 });
    }
    const note = document.querySelector('#mapNote');
    if (note) {
      note.innerHTML = '';
    }
    reclutter();
  }


  /* 标签碰撞在"创建时"用地图投影坐标判定：挤不下的点只保留悬停标签，
     不依赖 DOM 测量（瓦片与动画期间矩形不可靠）。缩放后重算一次。 */
  const PRIO = { stay: 0, hub: 1, road: 2, sight: 3, logic: 3 };
  let lastPins = null;

  /* 图钉缓存：key = 地点 id。重绘时只做增删差量，绝不整体重建。
     以前每次 draw() 都 clearLayers() 再重造图钉与常驻标签，标签是地图上的 DOM，
     重造的瞬间会消失再出现、位置也会从旧坐标跳过来——这就是"名字时有时无、还会漂移"的根因。
     现在同一个地点自始至终是同一个图钉、同一个标签 DOM，地图平移缩放时它跟着走，不会闪。 */
  const pinCache = new Map();
  /* 每个地点固定的标签朝向。图钉离开当前方案再回来时，必须还用原来那一侧——
     否则重新出现会换到另一侧，看起来就是名字"跳了一下"。 */
  const dirCache = new Map();

  function drawPins(c) {
    lastPins = c;
    const hided = window.HIDE || {};
    const pois = c.pois.filter(p => p && p.coord && p.coord[0] != null
      && !(hided[p.kind === 'stay' ? 'stay' : '']))
      .sort((a, b) => (PRIO[a.kind] ?? 3) - (PRIO[b.kind] ?? 3));

    /* 先按投影估算给"新出现"的标签挑一个不撞车方向；已在图上的沿用原方向，
       免得每次重绘都换位置（那才是肉眼看到的"跳动"）。 */
    const taken = [];
    const wanted = new Map();
    pois.forEach(p => {
      const llp = poiLL(p);
      const cp = map.latLngToContainerPoint(llp);
      const size = map.getSize();
      const inView = cp.x > -30 && cp.y > -30 && cp.x < size.x + 30 && cp.y < size.y + 30;
      const DIRS = [['right', [14, 0]], ['left', [-14, 0]], ['top', [0, -14]], ['bottom', [0, 14]]];
      let pick = null;
      if (inView) {
        for (let i = 0; i < DIRS.length; i++) {
          const ox = DIRS[i][1][0], oy = DIRS[i][1][1];
          const lx = cp.x + ox + (ox < 0 ? -70 : 8), ly = cp.y + oy - 8;
          const box = { x: lx, y: ly, w: p.name.length * 12 + 10, h: 20 };
          const hit = taken.some(q => !(box.x + box.w < q.x - 3 || box.x > q.x + q.w + 3
                                     || box.y + box.h < q.y - 2 || box.y > q.y + q.h + 2));
          if (!hit) { pick = DIRS[i]; taken.push(box); break; }
        }
      }
      /* 朝向只定一次，之后永久沿用；只有新地点才现场挑一侧 */
      let dir = dirCache.get(p.id);
      if (!dir) {
        /* 靠边的点朝图内放，避免标签被裁掉 */
        if (inView && cp.x < size.x * 0.22) pick = ['right', [14, 0]];
        else if (inView && cp.x > size.x * 0.78) pick = ['left', [-14, 0]];
        dir = pick || ['right', [14, 0]];
        dirCache.set(p.id, dir);
      }
      wanted.set(p.id, { p: p, dir: dir });
    });

    /* 1) 这一屏不再需要的图钉整只撤掉（连同它的标签） */
    pinCache.forEach((entry, id) => {
      if (!wanted.has(id)) { layers.pins.removeLayer(entry.mk); pinCache.delete(id); }
    });

    /* 2) 留着的原样不动，只补上真正新出现的 */
    wanted.forEach((w, id) => {
      if (pinCache.has(id)) return;
      const p = w.p;
      const mk = L.marker(poiLL(p),
        { icon: pinIcon(p), title: p.name, riseOnHover: true, zIndexOffset: 400 });
      const pc = 'tip-name prio' + (PRIO[p.kind] ?? 3) + ' pid-' + p.id;
      /* 标签常驻；是否显示交给避让逻辑，缩放后会放出更多名字 */
      mk.bindTooltip(p.name, { permanent: true, direction: w.dir[0], offset: w.dir[1],
                               className: pc + ' tip-perm' });
      mk.on('click', () => openDrawer(p));
      mk.addTo(layers.pins);
      pinCache.set(id, { mk: mk, dir: w.dir });
    });
  }

  /* 收尾去重：标签是 DOM，投影估算会有几像素误差，所以落图后再用真实矩形判一次。
     只藏撞车的标签，图钉始终保留；过夜点/枢纽优先。 */
  let dcl = 0, dclPass = 0, dclSig = '';
  /* 避让必须是"几何的函数"：同一份几何只可能得到同一个结果，而且必须等到
     几何稳定后再定案。以前只算一次，若那一次赶在 Leaflet 摆好标签之前，
     用的就是旧位置，两个贴得近的点会轮流胜出——看起来就是名字互换、闪烁。
     现在算完比对几何签名，没稳定就再算一轮，直到两轮看到同一份几何为止。 */
  function declutterLabels() {
    if (!map) return '';
    const host = map.getContainer();
    const base = host.getBoundingClientRect();
    const nodes = [].slice.call(document.querySelectorAll('#leafmap .leaflet-tooltip.tip-name.tip-perm'));
    const items = nodes.map(n => {
      const m = /prio(\d)/.exec(n.className);
      const idm = /pid-([A-Za-z0-9_]+)/.exec(n.className);
      const r = n.getBoundingClientRect();
      return { n: n, p: m ? +m[1] : 3, id: idm ? idm[1] : '',
               x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height };
    }).sort((a, b) => (a.p - b.p) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      /* 过夜点 → 枢纽 → 道路 → 景点；同级按地点 id 排，恒定，与元素顺序和测量时机无关 */
    const ok = [];
    items.forEach(o => {
      const b = { x: o.x, y: o.y, w: o.w, h: o.h };
      const hit = ok.some(q => !(b.x + b.w < q.x - 4 || b.x > q.x + q.w + 4
                              || b.y + b.h < q.y - 3 || b.y > q.y + q.h + 3));
      o.n.classList.toggle('tip-hide', hit);
      if (!hit) ok.push(b);
    });
    /* 几何签名：只含位置尺寸，不含显隐——显隐不影响几何，所以几何不变即结果已定案 */
    return items.map(o => o.id + ':' + Math.round(o.x) + ',' + Math.round(o.y)
      + ',' + Math.round(o.w) + ',' + Math.round(o.h)).join('|');
  }
  function reclutter() {
    clearTimeout(dcl); dclPass = 0; dclSig = '';
    dcl = setTimeout(tick, 120);
  }
  function tick() {
    if (!map) return;
    /* 动画途中 DOM 矩形还没稳定，等它停下再算 */
    const panning = map._panAnim && map._panAnim._inProgress;
    if (map._animatingZoom || panning) { dcl = setTimeout(tick, 120); return; }
    const sig = declutterLabels();
    dclPass++;
    if (sig !== dclSig && dclPass < 6) { dclSig = sig; dcl = setTimeout(tick, 150); return; }
    dclPass = 0; dclSig = '';
  }

  function openDrawer(p) {
    const d = document.querySelector('#mapDrawer');
    if (!d) return;
    const slice = null;
    const dayIds = p.days || [];
    const g = TRIP.guides.filter(x => x.place === p.id)[0];
    d.innerHTML = '<button class="drawer-x" aria-label="关闭">×</button>'
      + (p.thumb ? '<img class="drawer-cover" src="' + esc2(p.thumb) + '" alt="">' : '<div class="drawer-cover none">暂无现场照片</div>')
      + '<div class="drawer-in"><p class="eyebrow">'
      + esc2((p.days || []).map(x => x.slice(0, 2).replace(/^0/, '') + '/' + x.slice(2).replace(/^0/, '')).join(' · ')
             || p.type || '地图速览') + '</p>'
      + '<h3>' + esc2(p.name) + '</h3><p>' + esc2(p.conclusion) + '</p>'
      + '<div class="drawer-meta"><span>' + esc2(p.hike || p.duration || p.type || '路过／枢纽') + '</span>'
      + (dayIds.length ? '<span>' + dayIds.map(x => x.slice(0, 2) + '/' + x.slice(2)).join('、') + '</span>' : '')
      + '<span>' + (p.photo_count || 0) + ' 张现场照片' + (p.confidence ? ' · ' + esc2(p.confidence) : '') + '</span></div>'
      + '<p class="drawer-src">坐标来源：' + esc2(p.coord_source || '—') + '</p>'
      + (g ? '<button class="drawer-guide" data-guide="' + g.id + '">查看' + esc2(p.name) + '官方导览图 →</button>' : '')
      + '<a class="drawer-go" href="place.html?id=' + p.id + '">打开地点页（怎么玩／机位／避坑／原帖）→</a>'
      + '<div class="drawer-days">' + dayIds.map(x => {
          const dd = TRIP.days.filter(y => y.id === x)[0];
          return dd ? '<a href="day.html?id=' + x + '">' + dd.date + ' ' + esc2(dd.short) + '</a>' : '';
        }).join('') + '</div></div>';
    d.classList.add('open');
    d.querySelector('.drawer-x').onclick = () => d.classList.remove('open');
    const gb = d.querySelector('[data-guide]');
    if (gb) gb.onclick = () => Guide.open(g.file, p.name, g.facility_lines);
  }

  function boot() {
    if (window.TripAMap && window.TripAMap.active) return false;   /* 高德主引擎在场：Leaflet 让位 */
    const host = document.querySelector('#leafmap');
    if (!host || !window.L) return false;
    try {
      map = L.map(host, { zoomControl: false, attributionControl: false, minZoom: 7, maxZoom: 18,
                          maxBounds: WORLD, maxBoundsViscosity: .9, zoomSnap: .5,
                          preferCanvas: false }).fitBounds(BOUNDS.full, { padding: [30, 30], maxZoom: 11 });
      layers.base = L.tileLayer(
        'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}',
        { subdomains: ['1', '2', '3', '4'], minZoom: 7, maxZoom: 18, noWrap: true,
          updateWhenIdle: true, updateWhenZooming: false, keepBuffer: 2,
          attribution: '© 高德地图' }).addTo(map);
      layers.geo = L.layerGroup().addTo(map);
      layers.lines = L.layerGroup().addTo(map);
      layers.pins = L.layerGroup().addTo(map);
      layers.camp = L.layerGroup().addTo(map);
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      host.style.display = 'block';
      /* 画线/画点不依赖瓦片是否加载成功：先 ready，瓦片好了只负责好看 */
      document.body.setAttribute('data-map', 'leaflet');
      ready = true; active = true;
      size();
      draw();
      layers.base.on('load', function () {
        tileOk = true; size();
        document.body.setAttribute('data-map', 'leaflet');
      });
      /* 容器在字体与栅格稳定前尺寸不可靠：不重算就会只画出一块瓦片 */
      function size() { if (map) { map.invalidateSize({ animate: false }); } }
      if (window.ResizeObserver) { new ResizeObserver(size).observe(host); }
      window.addEventListener('resize', size);
      window.addEventListener('planview', () => { if (ready) draw(true); });
      /* 缩放只重算标签显隐，绝不重建图钉：重建会让所有名字消失再冒出来，
         还会在动画期间落到旧坐标上，看起来就是"闪烁 + 漂移"。 */
      map.on('zoomend moveend', reclutter);
      /* 首帧别反复重画：等容器尺寸稳定后画一次，瓦片到位再补一次即可 */
      setTimeout(function () { size(); draw(); }, 120);
      setTimeout(function () { size(); reclutter(); }, 760);
      layers.base.on('tileerror', function () {
        if (tileOk === true) return;
        tileOk = false;
        document.body.setAttribute('data-map', 'svg');      /* 瓦片失败：退回 SVG，正文照常可用 */
        const note = document.querySelector('#mapNote');
        if (note) note.innerHTML = '底图瓦片不可达：已改用真实坐标 SVG<br>正文与数据不受影响';
      });
      setTimeout(function () { if (tileOk === null) { giveUp('底图瓦片无响应'); } }, 4000);
      /* 看门狗：瓦片中途断掉也不能留一片空白——SVG 视图随时接管 */
      let low = 0;
      setInterval(function () {
        if (!ready) return;
        const n = document.querySelectorAll('#leafmap .leaflet-tile-loaded').length;
        low = n < 3 ? low + 1 : 0;
        if (low >= 2) giveUp('底图瓦片中断');
      }, 1600);
      function giveUp(why) {
        ready = false; active = false; tileOk = false;
        document.body.setAttribute('data-map', 'svg');
        const note = document.querySelector('#mapNote');
        if (note) note.innerHTML = why + '：已改用真实坐标 SVG<br>正文与数据不受影响';
      }
      document.querySelector('#mapDrawer') && document.querySelector('#mapDrawer')
        .addEventListener('click', e => { if (e.target.classList.contains('map-drawer')) e.target.classList.remove('open'); });
      return true;
    } catch (e) {
      return false;
    }
  }

  window.TripLeaf = {
    boot: boot,
    openDrawer: openDrawer,
    get ready() { return ready; },
    get active() { return active; },
    /* 外部改了筛选状态（图例开关等）后，让 Leaflet 按新状态重画。
       没有这个入口，图例按钮只会重画背后的 SVG，用户看到的地图一动不动——这正是"筛选不生效"的根因。 */
    refresh() { if (!ready) return; draw(); },
    select(day) { state.day = day || 'all'; state.focus = null; draw(); },
    plan(id) { state.plan = id || 'main'; state.day = 'all'; state.focus = null; draw(); },
    scope(s) { state.scope = s || 'core'; if (!ready) return;
      if (state.day === 'all') map.flyToBounds(BOUNDS[state.scope], { duration: .5 }); draw(); },
    focus(id) { state.focus = id || null; draw(); },
    fitDay(day) { state.day = day; draw(); },
  };
})();
