import { firefox } from 'playwright';
const B = process.env.BASE || 'http://localhost:5199';
const b = await firefox.launch();
const res=[]; const ok=(n,p,d='')=>{res.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`)};

const scanBlur = () => {
  const out=[];
  for (const el of document.querySelectorAll('*')) {
    const s = getComputedStyle(el);
    const bf = s.backdropFilter || s.webkitBackdropFilter;
    if (bf && bf !== 'none') out.push(el.tagName.toLowerCase()+'.'+[...el.classList].filter(c=>!c.startsWith('svelte-')).join('.')+' → '+bf);
  }
  return out;
};

for (const ui of ['flat','bubble']) {
  const ctx = await b.newContext({ viewport:{width:1500,height:900} });
  const p = await ctx.newPage();
  await p.goto(B+'/',{waitUntil:'domcontentloaded'});
  await p.evaluate(u=>{localStorage.setItem('ksh-ui',u);localStorage.setItem('ksh-sky','off');localStorage.setItem('ksh-theme','light');},ui);
  console.log(`\n--- ${ui.toUpperCase()} ---`);
  for (const path of ['/about','/apps/air-traffic']) {
    await p.goto(B+path,{waitUntil:'networkidle'}); await p.waitForTimeout(1800);
    const blurs = await p.evaluate(scanBlur);
    if (ui==='flat') ok(`flat: ${path} no backdrop-filter`, blurs.length===0, blurs.slice(0,2).join(' | '));
    else ok(`bubble: ${path} keeps backdrop-filter`, blurs.length>0, `${blurs.length}`);
    // The panel's material. Flat used to be an OPAQUE sheet; it is glass now — the sky reads through
    // it, and over a photograph the page measures the picture and firms the wash up until the text
    // clears 4.5:1 (see measureVeil). What still separates Flat from Bubble is the LIVE filter:
    // Bubble frosts what's behind it with a backdrop-filter; Flat never does.
    const bd = await p.locator('.surface-backdrop').evaluate(e=>{const s=getComputedStyle(e);return {bg:s.backgroundColor,bi:s.backgroundImage.slice(0,30)}});
    if (ui==='flat') ok(`flat: ${path} backdrop is glass (translucent, no live filter)`, /rgba|\/ 0?\.\d+\)/.test(bd.bg) && bd.bi==='none', JSON.stringify(bd));
    else ok(`bubble: ${path} backdrop translucent + sheen`, bd.bg.startsWith('rgba') && bd.bi!=='none', JSON.stringify(bd));
  }
  // PB toolbar buttons
  await p.goto(B+'/apps/presentation-builder',{waitUntil:'networkidle'});
  await p.getByRole('button',{name:'New from template'}).click(); await p.waitForTimeout(1400);
  const tb = await p.locator('button.tb').first().evaluate(e=>getComputedStyle(e).backdropFilter||'none');
  if (ui==='flat') ok('flat: pb .tb no backdrop-filter', tb==='none', tb);
  else ok('bubble: pb .tb has backdrop-filter', tb!=='none', tb);
  // left edge colour
  await p.goto(B+'/about',{waitUntil:'networkidle'}); await p.waitForTimeout(1200);
  const edge = await p.locator('aside.surface').evaluate(e=>getComputedStyle(e).borderLeftColor);
  console.log(`     .surface border-left = ${edge}`);
  await ctx.close();
}
await b.close();
const f=res.filter(x=>!x).length;
console.log(`\n${res.length-f}/${res.length} passed`);
process.exit(f?1:0);
