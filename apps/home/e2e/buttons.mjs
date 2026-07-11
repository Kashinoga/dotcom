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

  // Panel chrome + settings + map legend
  await p.goto(B+'/settings',{waitUntil:'networkidle'}); await p.waitForTimeout(1500);
  for (const [sel,label] of [['button.icon-btn.back','Panel Back'],['button.seg','Settings .seg'],['button.sky-opt','Settings .sky-opt'],['a.chip','Panel .chip']]) {
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
  const leg = p.locator('a.legend-btn').first();
  await leg.hover({force:true}); await p.waitForTimeout(450);
  ok(`${ui}: map legend hover = ${HOVER}`, (await scaleOf(leg))===HOVER, String(await scaleOf(leg)));

  // ATFC board — the field pills live in the expanded super bar now (the compact panel uses a
  // dropdown), so expand it first to reach a .field pill.
  await p.goto(B+'/apps/air-traffic',{waitUntil:'networkidle'}); await p.waitForTimeout(2200);
  await p.getByRole('button',{name:/Expand panel/i}).click(); await p.waitForTimeout(650);
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
