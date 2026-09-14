/* 高德 JS API 主引擎（2026-09-14 Bailian 重写；用户已提供 Web 端 Key 与安全密钥）。
   有网＋有 Key：真实中文底图 + AMap.Driving 沿真实道路补全"铁贾公路""禾木—贾登峪"等
   OSM 缺失路段；无网或脚本失败：map.js 的 Leaflet+本地路网接管，再失败退 SVG。
   数据仍只来自 site-data.js / tracks.js / data/roads.js：本文件只负责"怎么画"。 */
(function () {
  const state = { day: 'all', scope: 'full', focus: null, map: null, ov: [], cache: {} };
  const place = id => TRIP.places.filter(x => x.id === id)[0];
  const CORIDOR = { altay_city: 1, back_to_altay: 1, ahe_road: 1 };
  const CORRIDOR = { altay_city: 1, back_to_altay: 1, ahe_road: 1, urumqi_night_train: 1 };
  const COLOR = { drive: '#b0742c', shuttle: '#2e7f6e', hike: '#4f8f5b', schem: '#8a948d' };
  /* 取景只由"范围"决定：切三套方案时比例完全一致，不会忽远忽近（读者点名的毛病） */
  const BOUNDS = {
    core: [[48.33, 86.60], [48.90, 87.68]],
    full: [[47.72, 86.45], [48.95, 88.32]],
  };
  function viewBounds() {
    return new AMap.Bounds(new AMap.LngLat(BOUNDS[state.scope][0][1], BOUNDS[state.scope][0][0]),
                           new AMap.LngLat(BOUNDS[state.scope][1][1], BOUNDS[state.scope][1][0]));
  }

  function legs() {
    const day = state.day === 'all' ? null : state.day;
    if (day) return GeoMap.dayLegs(day, state.scope);
    const pv = window.PLAN_VIEW || 'main';
    if (pv === 'all') return [].concat(GeoMap.planLegs('main', state.scope),
      GeoMap.planLegs('alt_a', state.scope), GeoMap.planLegs('alt_b', state.scope));
    return GeoMap.planLegs(pv, state.scope);
  }
  function pois() {
    const day = state.day === 'all' ? null : state.day;
    if (day) return (TRIP.days.filter(d => d.id === day)[0] || {}).places.map(place).filter(Boolean);
    const pv = window.PLAN_VIEW || 'main';
    const ids = pv === 'all' ? ['main', 'alt_a', 'alt_b'] : [pv];
    const seen = {}; const out = [];
    ids.forEach(id => {
      const p = TRIP.plans.filter(x => x.id === id)[0];
      (p && p.day_places ? Object.keys(p.day_places).sort().reduce((a, k) => a.concat(p.day_places[k]), []) : [])
        .forEach(pid => { const q = place(pid);
          if (q && q.coord && q.coord[0] != null && !seen[pid]
              && (state.scope === 'full' || !CORRIDOR[pid])) { seen[pid] = 1; out.push(q); } });
    });
    return out;
  }
  const lnglat = p => { const g = poiGCJ(p); return new AMap.LngLat(g[0], g[1]); };


  /* WGS-84（KML/OSM）→ GCJ-02（高德底图），否则徒步线与底图偏几百米 */
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
  const toGCJ = pts => (pts || []).map(q => { const g = wgs2gcj(q[1], q[0]); return [g[1], g[0]]; });
  const poiGCJ = p => (p.coord_gcj ? [p.coord_gcj[1], p.coord_gcj[0]]
    : (p.coord && p.coord[0] != null ? wgs2gcj(p.coord[1], p.coord[0]) : null));

  /* 车行/区间车腿的真实道路几何已在构建期用高德导航烘焙进 data/roads.js；
     运行期再逐段调用 AMap.Driving 会让首屏等十几次网络往返——默认关闭，只吃预烘焙几何。 */
  const LIVE_ROUTING = false;
  function roadPath(l, cb) {
    const pts0 = l.points;
    if (!LIVE_ROUTING || l.mode === 'hike' || !window.AMap || !AMap.Driving || !pts0 || pts0.length < 2) { cb(pts0); return; }
    const key = 'd' + pts0[0].join(',') + '|' + pts0[pts0.length - 1].join(',');
    if (state.cache[key]) { cb(state.cache[key]); return; }
    const a0 = pts0[0], b0 = pts0[pts0.length - 1];
    try {
      const drv = new AMap.Driving({ policy: 0, hideMarkers: true, autoFitView: false });
      drv.search(new AMap.LngLat(a0[1], a0[0]), new AMap.LngLat(b0[1], b0[0]), (st, res) => {
        if (st === 'complete' && res.routes && res.routes[0]) {
          const pts = [];
          res.routes[0].steps.forEach(s2 => s2.path.forEach(q => pts.push([q.lat, q.lng])));
          if (pts.length > 2) { state.cache[key] = pts; cb(pts); return; }
        }
        cb(pts0);
      });
    } catch (e) { cb(pts0); }
  }

  function drawLeg(l, all) {
    const color = all ? (GeoMap.PLAN_COLOR[l.plan] || COLOR.drive)
      : (l.src === 'schematic' ? COLOR.schem : (COLOR[l.mode] || COLOR.drive));
    const dash = l.src === 'schematic' && !all;
    roadPath(l, pts => {
      const path = toGCJ(pts);
      if (path.length < 2) return;
      const casing = new AMap.Polyline({ map: state.map, path: path, strokeColor: '#ffffff',
        strokeWeight: dash ? 1.6 : 6, strokeOpacity: .9, lineJoin: 'round', zIndex: 40 });
      const line = new AMap.Polyline({ map: state.map, path: path, strokeColor: color,
        strokeWeight: dash ? 2.2 : 3.6, strokeOpacity: .96,
        strokeStyle: dash ? 'dashed' : 'solid', strokeDasharray: [6, 7],
        lineJoin: 'round', showDir: !dash, zIndex: 45, cursor: 'pointer',
        extData: l.name + (l.km ? ' · ' + l.km + ' km' : '') });
      line.on('click', () => { if (window.__openLeg) window.__openLeg(l); });
      state.ov.push(casing, line);
      scheduleFit();
    });
  }

  let fitTimer = null;
  function scheduleFit() {
    if (state.keep || state.day !== 'all') return;
    clearTimeout(fitTimer);
    fitTimer = setTimeout(() => { if (state.map) { try { state.map.setBounds(viewBounds()); } catch (e) { } } }, 240);
  }

  function draw(keepView) {
    state.keep = !!keepView;
    if (!state.map) return;
    state.ov.forEach(o => o.setMap && o.setMap(null));
    state.ov = [];
    const HIDE = window.HIDE || {};
    const ls = legs(), ps = pois(), all = state.day === 'all' && (window.PLAN_VIEW || 'main') === 'all';
    ls.forEach(l => {
      if (!l.points || l.points.length < 2) return;
      if (HIDE[l.src === 'schematic' ? 'schem' : l.mode]) return;
      drawLeg(l, all);
    });
    /* 标记与名牌：像素距离避让，挤不下的只留悬停 */
    const taken = [];
    ps.slice().sort((a, b) => (a.kind === 'stay' ? 0 : 3) - (b.kind === 'stay' ? 0 : 3)).forEach(p => {
      if (!p.coord || p.coord[0] == null || !GeoMap.visible(p)) return;
      if (window.HIDE && window.HIDE[p.kind === 'stay' ? 'stay' : '']) return;
      const cp = state.map.lngLatToContainer(lnglat(p));
      const cls = p.kind === 'stay' ? 'stay' : (p.kind === 'hub' ? 'hub' : (p.kind === 'road' ? 'road' : 'sight'));
      state.ov.push(new AMap.Marker({ map: state.map, position: lnglat(p),
        content: '<i class="gpin ' + cls + '"><b></b></i>', offset: new AMap.Pixel(-11, -11),
        zIndex: 120, extData: p.id, title: p.name }));
      const clash = taken.some(q => Math.hypot(q.x - cp.x, q.y - cp.y) < 40);
      if (!clash) {
        taken.push(cp);
        const tx = new AMap.Text({ map: state.map, text: p.name, position: lnglat(p),
          offset: new AMap.Pixel(14, -9), zIndex: 130,
          style: { 'background-color': 'transparent', 'border': 'none', 'box-shadow': 'none',
                   'color': '#20302A', 'font-size': '11.5px', 'font-weight': '600', 'padding': '0',
                   'text-shadow': '0 0 3px #FBFAF7,0 0 3px #FBFAF7,0 0 6px #FBFAF7' } });
        if (tx.dom) tx.dom.classList.add('tip-name');
        state.ov.push(tx);
      }
    });
    state.ov.forEach(o => { if (o.on) o.on('click', e => {
      const id = e.target.getExtData && e.target.getExtData();
      if (id && place(id) && window.TripLeaf && TripLeaf.openDrawer) TripLeaf.openDrawer(place(id));
    }); });
    /* 取景：全天视图用固定范围（切方案不跳比例）；选中某一天才按当天覆盖物取景 */
    if (!keepView) {
      if (state.day === 'all') { try { state.map.setBounds(viewBounds()); } catch (e) { } }
      else if (state.ov.length) state.map.setFitView(state.ov.slice(), false, [46, 46, 46, 46], 12);
    }
  }

  /* 地图右下角一对缩放按钮：＋ / －，和站点其它控件同一套设计语言 */
  function zoomCtl(host) {
    const old = host.querySelector('.map-zoom'); if (old) old.remove();
    const box = document.createElement('div');
    box.className = 'map-zoom';
    box.innerHTML = '<button type="button" data-z="in" aria-label="放大">＋</button>'
      + '<button type="button" data-z="out" aria-label="缩小">－</button>';
    host.appendChild(box);
    box.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b || !state.map) return;
      const z = state.map.getZoom();
      state.map.setZoom(b.dataset.z === 'in' ? z + 1 : z - 1);
      e.stopPropagation();
    });
    ['dblclick', 'mousedown', 'touchstart'].forEach(ev => box.addEventListener(ev, e => e.stopPropagation()));
  }

  function boot() {
    if (!window.AMap) return false;
    const host = document.querySelector('#leafmap');
    if (!host) return false;
    try {
      document.body.setAttribute('data-map', 'amap');   /* 先让容器可见，再建图，否则尺寸为 0 */
      state.map = new AMap.Map(host, { viewMode: '2D', zoom: 10.5, center: [87.15, 48.63],
        mapStyle: 'amap://styles/whitesmoke', resizeEnable: true });
      zoomCtl(host);
      window.TripAMap.active = true;
      setTimeout(() => { if (state.map) { state.map.resize(); try { state.map.setBounds(viewBounds()); } catch (e) { } draw(true); } }, 150);
      const svg = document.querySelector('#routeMap');
      if (svg) svg.style.display = 'none';
      window.addEventListener('planview', () => draw(true));
      state.map.on('complete', () => { draw(); scheduleFit(); });
      window.addEventListener('resize', () => { if (state.map && state.day === 'all') scheduleFit(); });
      draw();
      /* 看门狗：Key 域名白名单未覆盖当前域名时瓦片会鉴权失败——5 秒内没有画布就
         交还给 Leaflet+本地路网，绝不留一张灰图给用户 */
      setTimeout(() => {
        const bad = performance.getEntriesByType('resource').some(e =>
          /amap\.com/.test(e.name) && (e.responseStatus >= 400 || e.responseStatus === 0));
        const ok = !bad && document.querySelectorAll('#leafmap canvas').length > 0;
        if (!ok && window.TripLeaf) {
          try { state.map.destroy(); } catch (e) { }
          state.map = null;
          window.TripAMap.active = false;
          document.body.setAttribute('data-map', 'leaflet');
          const svg = document.querySelector('#routeMap');
          if (svg) svg.style.display = '';
          if (TripLeaf.boot()) {
            const note = document.querySelector('#mapNote');
            if (note) note.innerHTML = '高德瓦片在当前域名未授权：已改用离线真实路网底图<br>'
              + '在高德控制台把本域名加入 Key 白名单即可切回高德底图';
          }
        }
      }, 5000);
      return true;
    } catch (e) { return false; }
  }

  window.TripAMap = {
    boot: boot,
    select(day) { state.day = day || 'all'; draw(); },
    plan(id) { state.day = 'all'; window.PLAN_VIEW = id; draw(); },
    scope(s) { state.scope = s; draw(); },
    focus() { },
    get engine() { return 'amap'; },
  };
})();
