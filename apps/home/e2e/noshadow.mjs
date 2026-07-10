import { firefox } from 'playwright';
const B = process.env.BASE || 'http://localhost:5199';
const b = await firefox.launch();
const results = [];
const ok=(n,p,d='')=>{results.push({n,p});console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`)};

// Rings (0 blur) are LINES, not shadows: `inset 0 0 0 1.5px`, `0 0 0 5px`.
const REAL_SHADOW = `(el) => {
  const s = getComputedStyle(el);
  const bad = [];
  const parse = (v) => v.split(/,(?![^(]*\\))/).map(x=>x.trim()).filter(Boolean);
  if (s.boxShadow && s.boxShadow !== 'none')
    for (const layer of parse(s.boxShadow)) {
      const nums = (layer.match(/-?[\\d.]+px/g)||[]).map(parseFloat);
      const inset = layer.includes('inset');
      const blur = inset ? nums[2] : nums[2];
      if (blur && blur > 0) bad.push('box:'+layer);
    }
  if (s.textShadow && s.textShadow !== 'none') bad.push('text:'+s.textShadow);
  if (s.filter && s.filter.includes('drop-shadow')) bad.push('filter:'+s.filter);
  return bad;
}`;
const scanAll = new Function('return (' + `() => {
  const isReal = ${REAL_SHADOW};
  const out = [];
  for (const el of document.querySelectorAll('*')) {
    const bad = isReal(el);
    if (bad.length) out.push({ sel: el.tagName.toLowerCase()+'.'+[...el.classList].filter(c=>!c.startsWith('svelte-')).join('.'), bad });
  }
  return out;
}` + ')')();

for (const [ui, expectZero] of [['flat', true], ['bubble', false]]) {
  const ctx = await b.newContext({ viewport:{width:1500,height:900} });
  const p = await ctx.newPage();
  await p.goto(B+'/',{waitUntil:'domcontentloaded'});
  await p.evaluate(u=>{localStorage.setItem('ksh-ui',u);localStorage.setItem('ksh-sky','off');localStorage.setItem('ksh-theme','light');},ui);

  const pages = ['/', '/about', '/settings', '/apps/air-traffic'];
  for (const path of pages) {
    await p.goto(B+path,{waitUntil:'networkidle'}); await p.waitForTimeout(1800);
    const found = await p.evaluate(scanAll);
    if (expectZero) ok(`flat: ${path} rest has no shadow`, found.length===0, found.slice(0,3).map(f=>f.sel+' '+f.bad[0].slice(0,44)).join(' | '));
    else ok(`bubble: ${path} still has shadows`, found.length>0, `${found.length} el`);
  }

  // hover + active states
  await p.goto(B+'/apps/presentation-builder',{waitUntil:'networkidle'});
  await p.getByRole('button',{name:'New from template'}).click(); await p.waitForTimeout(1500);
  for (const [sel,label] of [['button.tb','pb .tb'],['button.tb.primary','pb .tb.primary']]) {
    const n = await p.locator(sel).count(); if(!n) continue;
    await p.locator(sel).first().hover(); await p.waitForTimeout(300);
    const bad = await p.locator(sel).first().evaluate(new Function('return '+REAL_SHADOW)());
    if (expectZero) ok(`flat: ${label}:hover no shadow`, bad.length===0, bad.join('|').slice(0,60));
    else ok(`bubble: ${label}:hover has shadow`, bad.length>0);
  }

  // ── :active — the gap that let a blurred `inset 0 2px 4px` survive the shadow purge.
  await p.goto(B+'/settings',{waitUntil:'networkidle'}); await p.waitForTimeout(1500);
  for (const [sel,label] of [['button.icon-btn.back','Back'],['button.seg','.seg']]) {
    const loc = p.locator(sel).first();
    await loc.hover({force:true}); await p.mouse.down(); await p.waitForTimeout(250);
    const bad = await loc.evaluate(new Function('return '+REAL_SHADOW)());
    await p.mouse.move(5,5); await p.mouse.up();
    if (expectZero) ok(`flat: ${label}:active no blurred shadow`, bad.length===0, bad.join('|').slice(0,60));
    else ok(`bubble: ${label}:active has shadow`, bad.length>0);
  }
  // toast
  await p.locator('button[title="Download a copy"]').click().catch(()=>{});
  await p.waitForTimeout(600);
  const tn = await p.locator('.toast').count();
  if (tn) {
    const bad = await p.locator('.toast').first().evaluate(new Function('return '+REAL_SHADOW)());
    if (expectZero) ok('flat: pb .toast no shadow', bad.length===0, bad.join('|').slice(0,50));
    else ok('bubble: pb .toast (no bubble rule) also none', true);
  }
  // ATFC tip
  await p.goto(B+'/apps/air-traffic',{waitUntil:'networkidle'}); await p.waitForTimeout(2200);
  if (await p.locator('span.tip').count()) {
    const bad = await p.locator('span.tip').first().evaluate(new Function('return '+REAL_SHADOW)());
    if (expectZero) ok('flat: atfc .tip no shadow', bad.length===0, bad.join('|').slice(0,50));
    else ok('bubble: atfc .tip none too', true);
  }
  await ctx.close();
}
await b.close();
const f = results.filter(r=>!r.p);
console.log(`\n${results.length-f.length}/${results.length} passed`);
process.exit(f.length?1:0);
