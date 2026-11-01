const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();
const lang=process.argv[2];
const ctx=await b.newContext({viewport:{width:1440,height:1000}}); const p=await ctx.newPage();
await p.addInitScript((l)=>localStorage.setItem('lab-lang', l), lang);
const errs=[];p.on('pageerror',e=>errs.push('PE '+e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,160))});
for (let n=13;n<=24;n++) {
  const id=String(n).padStart(2,'0');
  await p.goto('http://localhost:4173/#lesson-'+id); await p.reload(); await p.waitForTimeout(500);
  await p.click('.player .btn.primary'); await p.waitForTimeout(4600);
  const st=await p.textContent('.status'); const mon=(await p.textContent('.mon pre')).replace(/\s+/g,' ');
  console.log(lang, id, st, '|', mon.slice(-160));
}
console.log(lang,'errors',errs); await b.close();})();
