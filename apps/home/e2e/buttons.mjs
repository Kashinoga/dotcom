import { firefox } from 'playwright';
const B = process.env.BASE || 'http://localhost:5199';
const b = await firefox.launch();
const res=[]; const ok=(n,p,d='')=>{res.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`)};

// scale extracted from a matrix(a,...) transform
const scaleOf = async (loc) => loc.evaluate(e=>{
  const t = getComputedStyle(e).transform;
  if (!t || t==='none') return 1;
  const m = t.match(/matrix\(([^)]+)\)/); if(!m) return null;
  return +parseFloat(m[1].split(',')[0]).toFixed(3);
});
const easingOf = (loc) => loc.evaluate(e=>{
  const s = getComputedStyle(e);
  const props = s.transitionProperty.split(',').map(x=>x.trim());
  const eas = s.transitionTimingFunction.split(/,(?![^(]*\))/).map(x=>x.trim());
  const i = props.indexOf('transform');
  return i>=0 ? eas[i] : 'NO-TRANSFORM-TRANSITION';
});

// Wait for the ENTRANCE flourishes to finish before measuring a hover scale. Panels and their
// chrome fly in on finite animations, and mid-flight the computed transform is that entrance
// (`matrix(1,0,0,1,-10,0)` — a translate), so scaleOf reads 1 and a perfectly good hover pop
// looks like a missing one. This bit ATFC's field pill in Bubble, which arrives a beat later
// than in Flat: the suite was reading the fly-in, not the pop. Endless animations (the sky's
// clouds and stars) are excluded — awaiting those would never return.
const settle = async (p) => {
	await p.evaluate(() =>
		Promise.all(
			document.getAnimations()
				.filter((a) => a.effect?.getTiming().iterations !== Infinity)
				.map((a) => a.finished.catch(() => {}))
		)
	);
	await p.waitForTimeout(150);
};

const HOVER = 1.05, PRESS = 0.95;

for (const ui of ['flat','bubble']) {
  const ctx = await b.newContext({ viewport:{width:1500,height:950} });
  const p = await ctx.newPage();
  await p.goto(B+'/',{waitUntil:'domcontentloaded'});
  await p.evaluate(u=>{localStorage.setItem('ksh-ui',u);localStorage.setItem('ksh-sky','off');localStorage.setItem('ksh-theme','light');},ui);
  console.log(`\n===== ${ui.toUpperCase()} =====`);

  // Presentation Builder: New/Open (.tb) vs Back (.icon-btn) — the exact pair from the report
  await p.goto(B+'/apps/presentation-builder',{waitUntil:'networkidle'});
  await p.getByRole('button',{name:'New from template'}).click(); await p.waitForTimeout(1400);
  // Scope the Back button to the PB header — the masthead's "show full map" control is also an
  // .icon-btn and (hidden) earlier in the DOM, so a bare button.icon-btn would grab that instead.
  for (const [sel,label] of [['button.tb','PB New (.tb)'],['.pb-head button.icon-btn','PB Back (.icon-btn)'],['button.mini','PB .mini']]) {
    const loc = p.locator(sel+':not([disabled])').first();
    if (!(await loc.count())) { console.log('  skip '+label); continue; }
    ok(`${ui}: ${label} transitions transform on the spring`, (await easingOf(loc)).includes('0.34'), await easingOf(loc));
    await loc.hover({force:true}); await p.waitForTimeout(450);
    ok(`${ui}: ${label} hover = ${HOVER}`, (await scaleOf(loc))===HOVER, String(await scaleOf(loc)));
    await p.mouse.down(); await p.waitForTimeout(220);
    ok(`${ui}: ${label} press = ${PRESS}`, (await scaleOf(loc))===PRESS, String(await scaleOf(loc)));
    await p.mouse.move(5, 5); await p.mouse.up(); await p.waitForTimeout(200);
  }

  // Panel chrome + settings (the map legend went with the map).
  // RE-OPENED per selector, not once for the loop: the first entry is the panel's own Back, and
  // pressing it — even though the press is dragged off at (5,5) so no click fires — leaves the
  // panel gone by the next iteration, so `button.seg` was never found and the suite hung on it
  // for 30s and died. That, not the retired map, is what actually parked this suite.
  // `a.chip` is left in the list deliberately: the Related rail is gone site-wide, so it hits
  // the skip below and says so, rather than silently disappearing from the list.
  for (const [sel,label] of [['button.icon-btn.back','Panel Back'],['button.seg','Settings .seg'],['button.sky-opt','Settings .sky-opt'],['a.chip','Panel .chip']]) {
    await p.goto(B+'/settings',{waitUntil:'networkidle'}); await p.waitForTimeout(1200);
    const loc = p.locator(sel).first();
    if (!(await loc.count())) { console.log('  skip '+label); continue; }
    await loc.scrollIntoViewIfNeeded().catch(()=>{});
    await loc.hover({force:true}); await p.waitForTimeout(450);
    ok(`${ui}: ${label} hover = ${HOVER}`, (await scaleOf(loc))===HOVER, String(await scaleOf(loc)));
    await p.mouse.down(); await p.waitForTimeout(220);
    ok(`${ui}: ${label} press = ${PRESS}`, (await scaleOf(loc))===PRESS, String(await scaleOf(loc)));
    await p.mouse.move(5, 5); await p.mouse.up(); await p.waitForTimeout(200);
  }
  await p.goto(B+'/',{waitUntil:'networkidle'}); await p.waitForTimeout(1500);

  // ATFC board — the field pills live in the expanded super bar now (the compact panel uses a
  // dropdown), so expand it first to reach a .field pill.
  await p.goto(B+'/apps/air-traffic',{waitUntil:'networkidle'}); await p.waitForTimeout(2200);
  await p.getByRole('button',{name:/Expand panel/i}).click(); await p.waitForTimeout(650);
  await settle(p);
  const fld = p.locator('button.field').first();
  await fld.hover({force:true}); await p.waitForTimeout(450);
  ok(`${ui}: ATFC .field hover = ${HOVER}`, (await scaleOf(fld))===HOVER, String(await scaleOf(fld)));
  await ctx.close();
}

// reduced motion: no scale anywhere
{
  const ctx = await b.newContext({ viewport:{width:1500,height:950}, reducedMotion:'reduce' });
  const p = await ctx.newPage();
  await p.goto(B+'/',{waitUntil:'domcontentloaded'});
  await p.evaluate(()=>{localStorage.setItem('ksh-ui','flat');localStorage.setItem('ksh-sky','off');});
  await p.goto(B+'/settings',{waitUntil:'networkidle'}); await p.waitForTimeout(1500);
  const loc = p.locator('button.icon-btn.back').first();
  await loc.hover({force:true}); await p.waitForTimeout(400);
  ok('reduced-motion: Back does not scale on hover', (await scaleOf(loc))===1, String(await scaleOf(loc)));
  await ctx.close();
}
await b.close();
const f=res.filter(x=>!x).length;
console.log(`\n${res.length-f}/${res.length} passed`);
process.exit(f?1:0);
