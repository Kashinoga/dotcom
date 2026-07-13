import { firefox } from 'playwright';
const B = process.env.BASE || 'http://localhost:5199';
// Every panel wears its place's accent (see `accent` in $lib/network). The line panels
// (/loess, /grays, /terminal-way) were retired with the transit-map motif; the accents they
// used to imply are now stated per place, so the same three colours appear here.
const want = {
  '/home': 'rgb(18, 161, 80)', '/about': 'rgb(18, 161, 80)', '/about/work': 'rgb(18, 161, 80)',
  '/about/projects': 'rgb(18, 161, 80)', '/settings': 'rgb(139, 70, 224)', '/apps': 'rgb(240, 96, 48)',
  '/apps/weather': 'rgb(240, 96, 48)',
};
const b = await firefox.launch();
let bad = 0, n = 0;
// ATFC reference: dot bottom sits this far above the h2's bottom (descender under baseline)
let ref = null;
for (const vp of [{width:1400,height:820},{width:1024,height:800},{width:390,height:844}]) {
  const ctx = await b.newContext({ viewport: vp });
  const p = await ctx.newPage();
  await p.goto(B+'/',{waitUntil:'domcontentloaded'});
  await p.evaluate(()=>{localStorage.setItem('ksh-sky','off');localStorage.setItem('ksh-theme','light')});

  // ground truth from ATFC, which already had the dot
  await p.goto(B+'/apps/air-traffic',{waitUntil:'networkidle'}); await p.waitForTimeout(1500);
  const r = await p.evaluate(()=>{const d=document.querySelector('.tfc-head .accent-dot').getBoundingClientRect();
    const h=document.querySelector('.tfc-head .dest').getBoundingClientRect();
    const fs=parseFloat(getComputedStyle(document.querySelector('.tfc-head .dest')).fontSize);
    return {sameLine:d.left>h.right, drop:+(h.bottom-d.bottom).toFixed(1), ratio:(h.bottom-d.bottom)/fs};});
  console.log(`\n[${vp.width}px] ATFC reference: sameLine=${r.sameLine} baselineDrop=${r.drop}px`);

  for (const [path,color] of Object.entries(want)) {
    await p.goto(B+path,{waitUntil:'networkidle'}); await p.waitForTimeout(1500);
    const g = await p.evaluate(()=>{
      const head=document.querySelector('.surface-head');
      const d=head.querySelector('.accent-dot').getBoundingClientRect();
      const h_el=head.querySelector('.dest');
      const h=h_el.getBoundingClientRect();
      const s=document.querySelector('aside.surface').getBoundingClientRect();
      const fs=parseFloat(getComputedStyle(h_el).fontSize);
      return {bg:getComputedStyle(head.querySelector('.accent-dot')).backgroundColor,
        sameLine:d.left>h.right, drop:+(h.bottom-d.bottom).toFixed(1), ratio:(h.bottom-d.bottom)/fs, fs:+fs.toFixed(0),
        dotRight:+d.right.toFixed(1), panelRight:+s.right.toFixed(1),
        titleFits:h.right <= s.right, w:+d.width.toFixed(0)};
    });
    n++;
    const okLine = g.sameLine;
    const okColor = g.bg === color;
    // The dot rests on its OWN title's baseline. The gap under the baseline is the
    // font's descender, so it scales with font-size — compare the ratio, not the pixels.
    const okDrop = Math.abs(g.ratio - r.ratio) < 0.01;
    const okInside = g.dotRight <= g.panelRight && g.titleFits;
    const pass = okLine && okColor && okDrop && okInside;
    if (!pass) bad++;
    console.log(`  ${pass?'PASS':'FAIL'} ${path.padEnd(18)} sameLine=${g.sameLine} font=${g.fs}px drop=${g.drop} ratio=${g.ratio.toFixed(3)} inside=${okInside} ${okColor?'':'BADCOLOR '+g.bg}`);
  }
  await ctx.close();
}
await b.close();
console.log(bad===0 ? `\nALL GOOD (${n} checks)` : `\n${bad}/${n} failed`);
process.exit(bad?1:0);
