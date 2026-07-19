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

  // Intergalactic Park Ranger — the app that is ENTIRELY about clicking, and whose buttons had
  // no spring at all: the universal recipe is opt-in by class name and none of its classes were
  // ever listed, even though its own CSS claimed "the universal spring gives the tap its thock".
  //
  // Seeded with a save so every control is present AND enabled — the shop's Buy pills are
  // disabled while you can't afford them, and a rig row only becomes a BUTTON once you own one.
  // Each control gets a fresh panel: the press is released away from the button so no click
  // fires, and away lands on the STAGE, whose anywhere-off click closes the panel.
  const PUD = '/apps/intergalactic-park-ranger';
  const seed = () => localStorage.setItem('ksh-pud', JSON.stringify({
    shards: 1e7, lifetime: 1e7, clickLevel: 3, owned: { probe: 2 },
    boostUntil: 0, boostReadyAt: 0, paused: false, rigPaused: {}, savedAt: Date.now()
  }));
  // The rig row is a full-width row, not a pill, so it takes the Apps cards' softened amounts.
  for (const [sel, label, hov, prs] of [
    ['.pud-extract', 'IPR Extract', HOVER, PRESS],
    ['.pud-boost', 'IPR Overclock', HOVER, PRESS],
    ['.pud-buy', 'IPR Buy', HOVER, PRESS],
    ['.pud-item-switch', 'IPR rig row', 1.01, 0.995],
    ['.pud-reset', 'IPR Reset', HOVER, PRESS]
  ]) {
    await p.goto(B+PUD,{waitUntil:'domcontentloaded'});
    await p.evaluate(seed);
    await p.goto(B+PUD,{waitUntil:'networkidle'}); await p.waitForTimeout(1800);
    await settle(p);
    const loc = p.locator(sel).first();
    if (!(await loc.count())) { ok(`${ui}: ${label} is present`, false, 'absent'); continue; }
    await loc.scrollIntoViewIfNeeded().catch(()=>{});
    await loc.hover({force:true}); await p.waitForTimeout(450);
    ok(`${ui}: ${label} hover = ${hov}`, (await scaleOf(loc))===hov, String(await scaleOf(loc)));
    await p.mouse.down(); await p.waitForTimeout(240);
    ok(`${ui}: ${label} press = ${prs}`, (await scaleOf(loc))===prs, String(await scaleOf(loc)));
    ok(`${ui}: ${label} rides the shared spring`, /cubic-bezier\(0\.34, 1\.4/.test(await easingOf(loc)), await easingOf(loc));
    await p.mouse.move(5, 5); await p.mouse.up(); await p.waitForTimeout(200);
  }
  // An UNOWNED rig has nothing to switch, so its body is a <span> that never takes the switch
  // class. A span is never :disabled — so if the spring were listed on .pud-item-main instead,
  // these inert rows would pop under the cursor as though they did something.
  await p.goto(B+PUD,{waitUntil:'networkidle'}); await p.waitForTimeout(1500);
  const inert = await p.evaluate(() => {
    const span = [...document.querySelectorAll('.pud-item-main')].find((e) => e.tagName === 'SPAN');
    return span ? getComputedStyle(span).transitionProperty.includes('transform') : null;
  });
  ok(`${ui}: IPR inert rig rows take no spring`, inert === false, String(inert));
  await ctx.close();
}

// ── A TAP gets the same squash as a click ────────────────────────────────────
// The press is a CSS transition on :active, so it needs time on the clock. A macOS trackpad
// tap-to-click releases in under a frame: :active came and went before the 0.1s transition had
// moved, and a tap got NO feedback while a click got the full squash. Measured on Extract:
// held 250ms → 0.945, held 80ms → 0.945, held 30ms → 0.957, tap → 1.0 (nothing).
//
// Sampling matters here. scaleOf() reads the transform ONCE, and a tap's squash is over in a
// few hundred ms — a single read lands wherever it lands. This watches every frame and keeps
// the PEAK, which is the thing a person actually sees.
const peakOnTap = async (p, sel) => {
  const l = p.locator(sel).first();
  if (!(await l.count())) return 'absent';
  await l.scrollIntoViewIfNeeded().catch(()=>{});
  await l.hover({force:true}); await p.waitForTimeout(400);
  await p.evaluate((s)=>{ window.__peak = 1; window.__watching = true;
    const el = document.querySelector(s);
    const tick = () => { const m = getComputedStyle(el).transform.match(/matrix\(([^)]+)\)/);
      window.__peak = Math.min(window.__peak, m ? parseFloat(m[1].split(',')[0]) : 1);
      if (window.__watching) requestAnimationFrame(tick); };
    tick(); }, sel);
  await p.mouse.down(); await p.mouse.up();   // a TAP: no hold at all
  await p.waitForTimeout(400);
  const peak = await p.evaluate(()=>{ window.__watching = false; return +window.__peak.toFixed(3); });
  await p.mouse.move(700, 930); await p.waitForTimeout(250);
  return peak;
};
for (const ui of ['flat','bubble']) {
  const ctx = await b.newContext({ viewport:{width:1400,height:950} });
  const p = await ctx.newPage();
  await p.goto(B+'/',{waitUntil:'domcontentloaded'});
  await p.evaluate(u=>{localStorage.setItem('ksh-ui',u);localStorage.setItem('ksh-sky','off');localStorage.setItem('ksh-theme','light');},ui);
  await p.goto(B+'/settings',{waitUntil:'networkidle'}); await p.waitForTimeout(1600);
  ok(`${ui}: tapping a .seg squashes it`, (await peakOnTap(p,'button.seg'))<=PRESS+0.005, String(await peakOnTap(p,'button.seg')));
  ok(`${ui}: tapping Back squashes it`, (await peakOnTap(p,'button.icon-btn.back'))<=PRESS+0.005);
  await p.goto(B+'/apps',{waitUntil:'networkidle'}); await p.waitForTimeout(1600);
  // The Apps cards soften the amounts (0.99), so a tap must reach THEIR press scale, not 0.95 —
  // proof the floor uses each control's own --btn-press-scale rather than a hardcoded squash.
  const card = await peakOnTap(p,'a.app-card');
  ok(`${ui}: tapping an Apps card squashes it to its own softer amount`, card <= 0.991 && card > 0.96, String(card));
  await ctx.close();
}
// The motion gate still wins: with a preference set there's no squash to hold, and press.ts
// must not even mark the control.
{
  const ctx = await b.newContext({ viewport:{width:1400,height:950}, reducedMotion:'reduce' });
  const p = await ctx.newPage();
  await p.goto(B+'/',{waitUntil:'domcontentloaded'});
  await p.evaluate(()=>{localStorage.setItem('ksh-ui','flat');localStorage.setItem('ksh-sky','off');});
  await p.goto(B+'/settings',{waitUntil:'networkidle'}); await p.waitForTimeout(1600);
  ok('reduced-motion: a tap does not squash', (await peakOnTap(p,'button.seg'))===1);
  ok('reduced-motion: no .btn-tap marked', await p.evaluate(()=>{
    const el = document.querySelector('button.seg');
    el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
    return !el.classList.contains('btn-tap'); }));
  await ctx.close();
}
// A dead control stays dead — the floor must not revive a disabled button.
{
  const ctx = await b.newContext({ viewport:{width:1400,height:950} });
  const p = await ctx.newPage();
  await p.goto(B+'/',{waitUntil:'domcontentloaded'});
  await p.evaluate(()=>{localStorage.setItem('ksh-ui','flat');localStorage.setItem('ksh-sky','off');localStorage.setItem('ksh-theme','light');
    localStorage.setItem('ksh-pud',JSON.stringify({shards:0,lifetime:0,clickLevel:0,owned:{},boostUntil:0,boostReadyAt:0,paused:false,rigPaused:{},savedAt:Date.now()}));});
  await p.goto(B+'/apps/intergalactic-park-ranger',{waitUntil:'networkidle'}); await p.waitForTimeout(2000);
  ok('a disabled control takes no tap squash', await p.evaluate(()=>{
    const el = [...document.querySelectorAll('.pud-buy')].find(e=>e.disabled);
    if (!el) return false;
    el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
    return !el.classList.contains('btn-tap'); }));
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
