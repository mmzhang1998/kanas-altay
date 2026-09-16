/* 首页地图：Leaflet ＋ 高德中文路网瓦片（webrd）。
   数据一律来自 site-data.js / tracks.js；本文件只负责"怎么画"，不产生任何事实。
   瓦片不可达时由 app.js 的真实坐标 SVG 视图接管（不隐藏、不报错）。 */
(function () {
  /* 颜色只有一处定义：一律引用 GeoMap.STYLE（geomap.js）。
     同一套设计语言必须让 SVG／Leaflet／高德三套引擎对同一种走法给出同一个颜色。 */
  const FALLBACK = { drive: '#1E4A42', shuttle: '#1B5C7D', hike: '#A63A6B', schem: '#8A948D',
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
  /* 地图标签专用短名：只影响图上这一行字，不改站点其它任何文案。
     全名「小阿什克村＋美丽峰方向」有 11 个字符，在禾木—喀纳斯密集区必然被挤掉。 */
  const SHORT = { xiaoshike_meilifeng: '小阿什克·美丽峰', ahe_road: '阿禾公路',
                  tiejia_road: '铁贾公路', kanas_village: '喀纳斯村',
                  hemu_village: '禾木村', yaze_lake: '鸭泽湖', guanyutai: '观鱼台',
                  baihaba: '白哈巴村', kanas_hub: '换乘中心' };
  function labelOf(p) { return (p && (SHORT[p.id] || p.name)) || ''; }
  /* 用户明确点名"地图上必须看得见"的地点：过夜点/枢纽/道路之外，这些点也豁免避让淘汰，
     否则会被相邻的同类标签挤掉，读者就会以为它们没被标出来。 */
  const NAMED = { xiaoshike_meilifeng: 1, hemu_village: 1, yaze_lake: 1, kanas_village: 1,
                  guanyutai: 1, baihaba: 1, kanas_hub: 1 };

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
          const box = { x: lx, y: ly, w: labelOf(p).length * 14 + 24, h: 22 };
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
      mk.bindTooltip(labelOf(p), { permanent: true, direction: w.dir[0], offset: w.dir[1],
                               className: pc + ' tip-perm' });
      mk.on('click', () => openDrawer(p, placeAnchor(p)));
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
      /* 关键：减去上一轮加上的错位量，还原到"没有错位时的基准位置"再参与判定。
         否则自己加的 margin 会改变下一轮的测量结果，几何签名永远不收敛，
         标签就会保持在一个碰巧没被检测到的位置——手机上两个名字叠在一起就是这么来的。 */
      const off = parseFloat(n.style.marginTop) || 0;
      const offX = parseFloat(n.style.marginLeft) || 0;
      return { n: n, p: m ? +m[1] : 3, id: idm ? idm[1] : '',
               x: r.left - base.left - offX, y: r.top - base.top - off, w: r.width, h: r.height };
    }).sort((a, b) => (a.p - b.p) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      /* 过夜点 → 枢纽 → 道路 → 景点；同级按地点 id 排，恒定，与元素顺序和测量时机无关 */
    /* 地图上的浮层与图例本身要占位置：标签压到"喀纳斯/阿勒泰全程"胶囊或图例上，
       字就会被盖住半个。把它们当作已占用的禁区先放进去，标签自然会避开。 */
    const ok = [];
    ['.map-overlay', '.map-legend'].forEach(sel => {
      const el = host.querySelector(sel);
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width && r.height) ok.push({ x: r.left - base.left - 4, y: r.top - base.top - 4,
                                         w: r.width + 8, h: r.height + 8 });
    });
    /* 骨架标签（过夜点 prio0／枢纽 prio1／道路 prio2）与用户点名地点永不隐藏。
       它们撞车时不做淘汰，而是沿纵向找一个空档错开——喀纳斯湖区几个点投影后只差几像素，
       一味淘汰就会让读者以为观鱼台、鸭泽湖这些点没上地图。 */
    const OFFS = [0, -24, 24, -48, 48, -72, 72, -96, 96];
    /* 左右边界：地图容器 overflow:hidden，越界的标签会被直接切掉半个字。
       手机窄屏上"阿禾公路""阿勒泰市"就贴在右边缘，所以先算一个整体横移量，
       让每一个标签都完整落在画幅里；再纵向找空档避让其他标签。 */
    const PADX = 6, PADY = 6;
    items.forEach(o => {
      const keep = o.p <= 2 || !!NAMED[o.id];
      let fixX = 0;
      const overR = (o.x + o.w) - (base.width - PADX);
      const overL = PADX - o.x;
      if (overR > 0) fixX = -Math.ceil(overR);
      else if (overL > 0) fixX = Math.ceil(overL);
      let placed = null;
      for (let i = 0; i < OFFS.length; i++) {
        const yTop = o.y + OFFS[i];
        const yClamped = Math.max(PADY, Math.min(yTop, base.height - o.h - PADY));
        const b = { x: o.x + fixX, y: yClamped, w: o.w, h: o.h };
        const hit = ok.some(q => !(b.x + b.w < q.x - 4 || b.x > q.x + q.w + 4
                                || b.y + b.h < q.y - 3 || b.y > q.y + q.h + 3));
        if (!hit) { placed = { b: b, off: yClamped - o.y, fixX: fixX }; break; }
        if (!keep) break;                       /* 可淘汰的标签：撞了就藏，不找空档 */
      }
      const off = placed ? placed.off : 0;
      const fx = placed ? placed.fixX : 0;
      o.n.style.marginTop = off ? off + 'px' : '';
      o.n.style.marginLeft = fx ? fx + 'px' : '';
      /* 错位超过一格就补一条引线把标签系回图钉。没有它，手机上为避让而抬高的
         "鸭泽湖"会飘在图钉外 96px 处，读者根本认不出它标的是哪个点。 */
      o.n.classList.toggle('tip-lead', !!off && Math.abs(off) >= 24);
      o.n.classList.toggle('lead-up', off < 0);
      o.n.classList.toggle('lead-down', off > 0);
      if (off) o.n.style.setProperty('--lead', Math.abs(off) + 'px');
      o.n.classList.toggle('tip-hide', !placed);
      if (placed) ok.push(placed.b);
    });
    /* 几何签名：只含位置尺寸，不含显隐——显隐不影响几何，所以几何不变即结果已定案 */
    return items.map(o => o.id + ':' + Math.round(o.x) + ',' + Math.round(o.y)
      + ',' + Math.round(o.w) + ',' + Math.round(o.h)
      + ',' + Math.round(parseFloat(o.n.style.marginLeft) || 0)).join('|');
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

  /* ── 图上浮卡：点图钉才出现，贴在那一颗钉旁边 ───────────────────────
     不放整墙卡片，也不做整屏侧栏。只给"这个名字是什么、我在这待多久、下一步去哪看"。 */
  const KIND_TXT = { stay: '过夜点', sight: '游玩点', hub: '枢纽', road: '路段', logic: '行程节点' };
  function shortDuration(p) {
    const raw = String(p.duration || p.hike || '').split(/[（(；;。]/)[0].trim();
    if (!raw) return '';
    const m = /^([0-9０-９][0-9０-９.．\-—~～至到]*(?:\s*[—~～至到]\s*[0-9０-９.．]+)?\s*(?:分钟|小时|h|min|天|整天|个半天)[^，,]?)/.exec(raw);
    let t = (m ? m[1] : raw).replace(/^(约|大约|全程)?\s*/, '');
    /* 去掉"9/28抵达日""9/26 上午"这类日期/时段前缀：浮卡上一行已经写了日期，不重复 */
    t = t.replace(/^[0-9]{1,2}\/[0-9]{1,2}\s*(抵达日|当天|当日)?\s*/, '')
         .replace(/^(上午|下午|中午|早上|清晨|傍晚|夜晚|当天|抵达日)\s*/, '').trim();
    if (!t) return '';
    return t.length > 14 ? t.slice(0, 14) + '…' : t;
  }
  function dayLine(p) {
    const ds = (p.plan_dates && p.plan_dates.length) ? p.plan_dates
      : ((p.days || []).map(x => x.slice(0, 2).replace(/^0/, '') + '/' + x.slice(2).replace(/^0/, '')));
    return ds.join(' · ');
  }
  function placeAnchor(p) {
    try {
      if (!map || !p.coord || p.coord[0] == null) return null;
      const cp = map.latLngToContainerPoint(poiLL(p));
      const size = map.getSize();
      if (cp.x < 0 || cp.y < 0 || cp.x > size.x || cp.y > size.y) return null;
      return { x: cp.x, y: cp.y };
    } catch (e) { return null; }
  }
  let drawerPoi = null;
  function openDrawer(p, anchor) {
    const d = document.querySelector('#mapDrawer');
    if (!d || !p) return;
    drawerPoi = p;
    const g = TRIP.guides.filter(x => x.place === p.id)[0];
    const dur = shortDuration(p);
    const n = (p.photos || []).length;
    const cover = p.thumb || ((p.photos || [])[0] || {}).file;
    const dl = dayLine(p);
    d.innerHTML = '<button class="drawer-x" aria-label="关闭">×</button>'
      + (cover ? '<img class="drawer-cover" src="' + esc2(cover) + '" alt="" loading="lazy">'
               : '<div class="drawer-cover none">这一站没有留下现场照片</div>')
      + '<div class="drawer-in">'
      + '<p class="drawer-eyebrow">' + esc2(KIND_TXT[p.kind] || '途经点')
      + (dl ? ' · ' + esc2(dl) : '') + '</p>'
      + '<h3>' + esc2(p.name) + '</h3>'
      + (p.conclusion ? '<p class="drawer-lead">' + esc2(p.conclusion) + '</p>' : '')
      + '<div class="drawer-facts">'
      + (dur ? '<span><i>在这待多久</i><b>' + esc2(dur) + '</b></span>' : '')
      + (n ? '<span><i>现场照片</i><b>' + n + ' 张</b></span>' : '')
      + '</div>'
      + '<div class="drawer-acts">'
      + '<a class="drawer-cta" href="place.html?id=' + p.id + '">查看完整详情</a>'
      + (g ? '<button class="drawer-ghost" data-guide="' + g.id + '">官方导览图</button>' : '')
      + '</div></div>';
    placeDrawer(d, anchor);
    d.classList.add('open');
    d.querySelector('.drawer-x').onclick = () => d.classList.remove('open');
    const gb = d.querySelector('[data-guide]');
    if (gb) gb.onclick = () => Guide.open(g.file, p.name, g.facility_lines);
  }
  /* 卡片贴在那一颗钉旁边；靠边时自动翻到另一侧，并保证整张卡留在画幅内 */
  function reposition() {
    const d = document.querySelector('#mapDrawer');
    if (!d || !d.classList.contains('open') || !drawerPoi) return;
    placeDrawer(d, placeAnchor(drawerPoi));
  }
  function placeDrawer(d, anchor) {
    const stage = d.parentElement;
    if (!stage) return;
    const sw = stage.clientWidth, sh = stage.clientHeight;
    if (!anchor || !sw) { d.style.left = ''; d.style.top = ''; d.style.right = ''; return; }
    const cw = Math.min(312, sw - 24);
    const ch = Math.min(d.scrollHeight || 380, sh - 24);
    let x = anchor.x + 22, y = anchor.y - 24;
    if (x + cw > sw - 12) x = anchor.x - cw - 22;
    x = Math.max(12, Math.min(x, sw - cw - 12));
    y = Math.max(12, Math.min(y, sh - ch - 12));
    d.style.left = Math.round(x) + 'px';
    d.style.top = Math.round(y) + 'px';
    d.style.right = 'auto';
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
      window.addEventListener('planview', () => { if (ready) { dirCache.clear(); draw(true); } });
      /* 缩放只重算标签显隐，绝不重建图钉：重建会让所有名字消失再冒出来，
         还会在动画期间落到旧坐标上，看起来就是"闪烁 + 漂移"。 */
      map.on('zoomend moveend', function () { reclutter(); reposition(); });
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

  /* 日程里的地名点一下：地图平移到这一点并把浮卡打开。浅入口，不用先找图钉。 */
  function focusPlace(id, day) {
    const p = place(id);
    if (!p || !ready || !map) return false;
    if (day) { state.day = day; }
    state.focus = null; draw(true);
    if (p.coord && p.coord[0] != null) map.panTo(poiLL(p), { animate: true, duration: .45 });
    reclutter();
    setTimeout(() => openDrawer(p, placeAnchor(p)), 320);
    setTimeout(() => openDrawer(p, placeAnchor(p)), 700);
    return true;
  }

  window.TripLeaf = {
    boot: boot,
    openDrawer: openDrawer,
    focusPlace: focusPlace,
    /* 线路详情用同一只抽屉，但它不跟着图钉走 */
    unanchor() { drawerPoi = null; },
    get ready() { return ready; },
    get active() { return active; },
    /* 外部改了筛选状态（图例开关等）后，让 Leaflet 按新状态重画。
       没有这个入口，图例按钮只会重画背后的 SVG，用户看到的地图一动不动——这正是"筛选不生效"的根因。 */
    refresh() { if (!ready) return; draw(); },
    select(day) { state.day = day || 'all'; state.focus = null; draw(); },
    plan(id) { state.plan = id || 'main'; state.day = 'all'; state.focus = null;
      /* 方案一换，屏幕上的点列就变了；旧朝向是在旧点列里挑的，必须重挑，
         否则新点的标签会送到已被占用的方向，避让时被整片淘汰。 */
      dirCache.clear(); draw(); },
    scope(s) { state.scope = s || 'core'; if (!ready) return;
      if (state.day === 'all') map.flyToBounds(BOUNDS[state.scope], { duration: .5 }); draw(); },
    focus(id) { state.focus = id || null; draw(); },
    fitDay(day) { state.day = day; draw(); },
  };
})();
