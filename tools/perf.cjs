const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const PORT = 8105;
(async () => {
  const srv = spawn('node', ['tools/serve.js'], { env: { ...process.env, PORT }, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1200));
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  await p.setViewport({ width: 960, height: 480 });
  await p.goto(`http://127.0.0.1:${PORT}/game.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction("window.__game && !document.getElementById('menu').classList.contains('hidden')", { timeout: 120000 });
  await p.evaluate(() => document.getElementById('btn-new').click());
  await new Promise(r => setTimeout(r, 900));
  await p.evaluate(() => { document.getElementById('cc-name').value='П'; document.getElementById('cc-random').click(); });
  await new Promise(r => setTimeout(r, 400));
  await p.evaluate(() => document.getElementById('cc-start').click());
  await new Promise(r => setTimeout(r, 4000));

  for (const q of ['LOW','MEDIUM','HIGH']) {
    const r = await p.evaluate(async (q) => {
      const g = window.__game; g.paused = false; g.setQuality(q);
      await new Promise(r => setTimeout(r, 2500));
      const info = g.engine.renderer.info;
      // что именно в сцене
      let chunkTris = 0, visibleChunks = 0;
      g.city.chunks.forEach(grp => {
        if (!grp.visible) return;
        visibleChunks++;
        grp.traverse(o => { if (o.isMesh && o.geometry && o.geometry.index) chunkTris += o.geometry.index.count / 3;
                            else if (o.isMesh && o.geometry) chunkTris += o.geometry.attributes.position.count / 3; });
      });
      let propsVisible = 0, propCells = 0;
      g.city.props.cells.forEach(c => { if (c.meshes[0] && c.meshes[0].visible) { propCells++; propsVisible += c.meshes.length; } });
      const top = [];
      g.scene.traverse(o => {
        if (!o.isMesh || !o.visible) return;
        let vis = o, ok = true;
        while (vis) { if (!vis.visible) { ok = false; break; } vis = vis.parent; }
        if (!ok) return;
        const geo = o.geometry;
        const tris = (geo.index ? geo.index.count : geo.attributes.position.count) / 3
                     * (o.isInstancedMesh ? o.count : 1);
        geo.computeBoundingBox();
        const bb = geo.boundingBox;
        const mat = Array.isArray(o.material) ? o.material[0] : o.material;
        top.push([o.name || o.type, Math.round(tris), mat && (mat.name || mat.type),
                  'parent=' + (o.parent && (o.parent.name || o.parent.type)),
                  'size=' + [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z].map(v => Math.round(v)).join('x')]);
      });
      top.sort((a, b) => b[1] - a[1]);
      return { propsVisible, propCells, top: top.slice(0, 3), q, fps: g.engine.fps, scale: +g.engine.renderScale.toFixed(2),
               draw: info.render.calls, tris: info.render.triangles,
               geoms: info.memory.geometries, tex: info.memory.textures,
               visibleChunks, chunkTris: Math.round(chunkTris),
               traffic: g.traffic.cars.length, peds: g.peds.list.length, parked: g.worldVehicles.length };
    }, q);
    console.log(JSON.stringify(r));
  }
  await b.close(); srv.kill();
})();
