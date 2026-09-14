/* 首页地图：Leaflet + 真实底图瓦片（Esri 灰底，调色后与站点同色系）。
   数据一律来自 site-data.js / tracks.js；本文件只负责"怎么画"，不产生任何事实。
   底图或 Leaflet 不可用时，app.js 的真实坐标 SVG 视图原样保留（不隐藏、不报错）。 */
(function () {
  const COLOR = {
    drive: '#c8964a', shuttle: '#5c8a63', bus: '#4c7d8c', hike: '#c9603f',
    train: '#6f6a86', intent: '#9fb0a8',
  };
  const BOUNDS = {
    core: [[48.33, 86.60], [48.90, 87.68]],          /* 禾木—贾登峪—白哈巴—喀纳斯 */
    full: [[47.72, 86.45], [48.95, 88.32]],          /* 加上阿勒泰站与阿禾公路走廊 */
  };
  const WORLD = [[47.2, 85.6], [49.6, 89.2]];
  let map = null, layers = { base: null, lines: null, pins: null }, tileOk = null, ready = false;
  let state = { day: 'all', scope: 'core', focus: null, plan: 'main' };

  const place = id => TRIP.places.filter(x => x.id === id)[0];
  const track = id => (window.TRACKS ? TRACKS.tracks.filter(t => t.id === id)[0] : null);
  const esc2 = s => String(s == null ? '' : s).replace(/[&<>"]/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function pinIcon(p) {
    const cls = p.kind === 'stay' ? 'stay' : (p.kind === 'hub' ? 'hub' :
      (p.kind === 'road' ? 'road' : 'sight'));
    return L.divIcon({ className: 'gpin-wrap ' + cls, html: GeoMap.pinHTML(p),
                       iconSize: [22, 22], iconAnchor: [11, 11] });
  }

  function current() {
    const day = state.day === 'all' ? null : TRIP.days.filter(d => d.id === state.day)[0];
    const plan = TRIP.plans.filter(x => x.id === state.plan)[0] || TRIP.plans[0];
    const skip = { campsites: 1, luggage: 1, urumqi_night_train: 1 };
    const CORRIDOR = { altay_city: 1, back_to_altay: 1, ahe_road: 1 };   /* 阿禾走廊只在「含阿禾」里出现 */
    let tracks = [];
    if (day) {
      tracks = day.tracks.map(track).filter(Boolean);
    } else {
      tracks = (window.TRACKS ? TRACKS.tracks : []).filter(t =>
        ((t.adopted_points || []).length || t.kind === 'drive' || /公路|通行|行车/.test(t.kind))
        && (state.scope === 'full' || !/阿禾/.test(t.name)));
    }
    if (state.focus) tracks = tracks.filter(t => t.id === state.focus);
    let pois = day ? day.places.map(place).filter(Boolean)
      : (state.scope === 'full' ? TRIP.places : TRIP.places.filter(p => !skip[p.id] && !CORRIDOR[p.id]))
          .filter(p => p.coord && p.coord[0] != null);
    /* 直线腿彻底作废：改用 GeoMap 的三方案真实路网腿 */
    const pv = window.PLAN_VIEW || 'main';
    const ids = (!day && pv === 'all') ? ['main', 'alt_a', 'alt_b'] : (!day ? [pv] : null);
    let planLegs = null;
    if (ids) {
      planLegs = [];
      ids.forEach(id => { planLegs = planLegs.concat(GeoMap.planLegs(id, state.scope)); });
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
    layers.pins.clearLayers();
    /* 真实路网：OSM 路由出的腿按交通方式上色（白衬线＋彩主线）；
       没有公开路网的接驳段画细点线并标"接驳示意"，绝不把直线当道路 */
    const drawLegs = c.planLegs || GeoMap.legsFor(state.day === 'all' ? null : state.day, state.scope);
    const HIDE = window.HIDE || {};
    drawLegs.forEach(l => {
      if (!l.points || l.points.length < 2) return;
      if (HIDE[l.src === 'schematic' ? 'schem' : l.mode]) return;
      const st = l.src === 'schematic' ? GeoMap.STYLE.schem
        : ((c.planView === 'all') ? { color: GeoMap.PLAN_COLOR[l.plan] || GeoMap.STYLE.drive.color,
                                      width: 3.2, dash: null } : GeoMap.STYLE[l.mode]) || GeoMap.STYLE.drive;
      const ll = l.points.map(q => [q[0], q[1]]);
      L.polyline(ll, { color: '#ffffff', weight: st.width + 2.6, opacity: .92,
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
            .map(p => ({ p: p, d: Math.hypot(p.coord[0] - q[0], p.coord[1] - q[1]) }))
            .sort((x, y) => x.d - y.d)[0];
          if (near && near.d < 0.06) L.polyline([q, [near.p.coord[0], near.p.coord[1]]],
            { color: GeoMap.STYLE.stub.color, weight: 1.6, dashArray: '2 6', opacity: .9, interactive: false })
            .bindTooltip('接驳示意：这一段没有公开路网', { sticky: true, className: 'tip-line' })
            .addTo(layers.lines);
        });
      }
    });
    c.tracks.forEach(t => {
      const g = (t.adopted_points && t.adopted_points.length) ? t.adopted_points : t.points;
      if (!g || g.length < 2) return;
      if (HIDE[GeoMap.modeOf(t.kind, t.name)]) return;
      const isHike = GeoMap.modeOf(t.kind, t.name) === 'hike';
      const full = (t.adopted_points || []).length ? t.points : null;
      if (full && full.length > 1) {                       /* 完整轨迹压淡，采用段加粗：一眼看出"走哪段" */
        L.polyline(full.map(q => [q[0], q[1]]), { color: isHike ? COLOR.hike : COLOR.drive,
          weight: 2, opacity: .28, interactive: false }).addTo(layers.lines);
      }
      L.polyline(g.map(q => [q[0], q[1]]), {
        color: isHike ? COLOR.hike : COLOR.drive, weight: isHike ? 3.5 : 4,
        opacity: .95, dashArray: isHike ? '1 7' : null, lineCap: 'round',
      }).bindTooltip(t.name + ' · ' + (t.distance || '') + ' km',
        { sticky: true, className: 'tip-line' }).addTo(layers.lines);
    });
    drawPins(c);
    const pts = [];
    c.tracks.forEach(t => { const g = (t.adopted_points && t.adopted_points.length) ? t.adopted_points : t.points;
      (g || []).forEach(q => pts.push([q[0], q[1]])); });
    c.pois.forEach(p => pts.push([p.coord[0], p.coord[1]]));
    drawLegs.forEach(l => (l.points || []).forEach(q => pts.push([q[0], q[1]])));

    (GeoMap.CAMP_IDS() || []).forEach(cid => {
      const p = TRIP.places.filter(x => x.id === cid)[0];
      if (!p || !p.coord || p.coord[0] == null) return;
      L.marker([p.coord[0], p.coord[1]], { interactive: false, icon: L.divIcon({ className: 'camp-wrap',
        html: '<i class="camp-dot" title="' + p.name + ' · 可选露营点"></i>', iconSize: [10, 10], iconAnchor: [-9, 5] }) }).addTo(layers.pins);
    });
    const nr = TRIP.places.filter(x => x.id === 'naren')[0];
    if (nr && nr.coord && nr.coord[0] != null && state.day === 'all') {
      L.marker([nr.coord[0], nr.coord[1]], { interactive: false, icon: L.divIcon({ className: 'ghost-wrap',
        html: '<i class="gpin sight ghost-pin"><b></b></i><span class="gm-name ghost">那仁牧场（本次不去）</span>',
        iconSize: [140, 22], iconAnchor: [11, 11] }) }).addTo(layers.pins);
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
  }


  /* 标签碰撞在"创建时"用地图投影坐标判定：挤不下的点只保留悬停标签，
     不依赖 DOM 测量（瓦片与动画期间矩形不可靠）。缩放后重算一次。 */
  const PRIO = { stay: 0, hub: 1, road: 2, sight: 3, logic: 3 };
  let lastPins = null;
  function drawPins(c) {
    lastPins = c;
    layers.pins.clearLayers();
    const taken = [];
    const pois = c.pois.slice().sort((a, b) => (PRIO[a.kind] ?? 3) - (PRIO[b.kind] ?? 3));
    pois.forEach(p => {
      if (!p.coord || p.coord[0] == null) return;
      if (window.HIDE && window.HIDE[p.kind === 'stay' ? 'stay' : '']) return;
      const cp = map.latLngToContainerPoint([p.coord[0], p.coord[1]]);
      const size = map.getSize();
      const inView = cp.x > -30 && cp.y > -30 && cp.x < size.x + 30 && cp.y < size.y + 30;
      /* 四个方向轮流试：右→左→上→下；都挤才退成悬停标签 */
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
      const mk = L.marker([p.coord[0], p.coord[1]],
        { icon: pinIcon(p), title: p.name, riseOnHover: true, zIndexOffset: 400 });
      if (pick) {
        mk.bindTooltip(p.name, { permanent: true, direction: pick[0], offset: pick[1], className: 'tip-name' });
      } else {
        mk.bindTooltip(p.name, { direction: 'right', offset: [14, 0], className: 'tip-name' });
      }
      mk.on('click', () => openDrawer(p)).addTo(layers.pins);
    });
  }

  function openDrawer(p) {
    const d = document.querySelector('#mapDrawer');
    if (!d) return;
    const slice = null;
    const dayIds = p.days || [];
    const g = TRIP.guides.filter(x => x.place === p.id)[0];
    d.innerHTML = '<button class="drawer-x" aria-label="关闭">×</button>'
      + (p.thumb ? '<img class="drawer-cover" src="' + esc2(p.thumb) + '" alt="">' : '<div class="drawer-cover none">无合格实拍</div>')
      + '<div class="drawer-in"><p class="eyebrow">'
      + esc2((p.days || []).map(x => x.slice(0, 2).replace(/^0/, '') + '/' + x.slice(2).replace(/^0/, '')).join(' · ')
             || p.type || '地图速览') + '</p>'
      + '<h3>' + esc2(p.name) + '</h3><p>' + esc2(p.conclusion) + '</p>'
      + '<div class="drawer-meta"><span>' + esc2(p.hike || p.duration || p.type || '路过／枢纽') + '</span>'
      + (dayIds.length ? '<span>' + dayIds.map(x => x.slice(0, 2) + '/' + x.slice(2)).join('、') + '</span>' : '')
      + '<span>' + (p.photo_count || 0) + ' 张实拍 · ' + esc2(p.confidence || '') + '</span></div>'
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
      map = L.map(host, { zoomControl: false, attributionControl: false, minZoom: 7, maxZoom: 14,
                          maxBounds: WORLD, maxBoundsViscosity: .9, zoomSnap: .5,
                          preferCanvas: false }).fitBounds(BOUNDS.core, { padding: [30, 30] });
      layers.base = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
        { minZoom: 7, maxZoom: 14, bounds: WORLD, noWrap: true, opacity: .95 }).addTo(map);
      layers.geo = L.layerGroup().addTo(map);
      (GeoMap.raw.water || []).forEach(w => {
        if (w.points && w.points.length > 3) L.polygon(w.points.map(q => [q[0], q[1]]),
          { className: 'gm-water-leaf', interactive: false, fillOpacity: 1 }).addTo(layers.geo);
      });
      (GeoMap.raw.ctx || []).forEach(r2 => {
        const ll = r2.points.map(q => [q[0], q[1]]);
        L.polyline(ll, { color: '#cfccc2', weight: 3.2, opacity: .85, interactive: false }).addTo(layers.geo);
        L.polyline(ll, { color: '#ffffff', weight: 1.9, opacity: .95, interactive: false }).addTo(layers.geo);
      });
      layers.lines = L.layerGroup().addTo(map);
      layers.pins = L.layerGroup().addTo(map);
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      host.style.display = 'block';
      /* 画线/画点不依赖瓦片是否加载成功：先 ready，瓦片好了只负责好看 */
      document.body.setAttribute('data-map', 'leaflet');
      ready = true;
      size();
      draw();
      layers.base.on('load', function () { tileOk = true; size(); });
      /* 容器在字体与栅格稳定前尺寸不可靠：不重算就会只画出一块瓦片 */
      function size() { if (map) { map.invalidateSize({ animate: false }); } }
      if (window.ResizeObserver) { new ResizeObserver(size).observe(host); }
      window.addEventListener('resize', size);
      window.addEventListener('planview', () => { if (ready) draw(true); });
      map.on('zoomend', () => { if (lastPins) drawPins(lastPins); });
      setTimeout(function () { size(); draw(); }, 80);
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
        ready = false; tileOk = false;
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
    select(day) { state.day = day || 'all'; state.focus = null; draw(); },
    plan(id) { state.plan = id || 'main'; state.day = 'all'; state.focus = null; draw(); },
    scope(s) { state.scope = s || 'core'; if (!ready) return;
      if (state.day === 'all') map.flyToBounds(BOUNDS[state.scope], { duration: .5 }); draw(); },
    focus(id) { state.focus = id || null; draw(); },
    fitDay(day) { state.day = day; draw(); },
  };
})();
