// Usage: npx tsx .claude/skills/build-course-data/tools/must_use_check.mts public/courseData/<Course>.json ...
// Reports full-mark sample answers that lack a must-use keyword (a keyword the dot point, question or scenario names).
import fs from 'node:fs';
const stemW=(w:string)=>w.toLowerCase().replace(/(ing|ed|es|s|ion|ions)$/,'');
const wordsOf=(x:string)=>x.toLowerCase().match(/[a-z0-9][a-z0-9'-]*/g)??[];
const hasTerm=(text:string,term:string)=>{const t=wordsOf(term).map(stemW);const w=wordsOf(text).map(stemW);if(!t.length)return true;for(let i=0;i<=w.length-t.length;i++)if(t.every((x,j)=>w[i+j]===x))return true;return false;};
for (const f of process.argv.slice(2)) {
  const c=JSON.parse(fs.readFileSync(f,'utf8'))[0];
  let bad=0,tot=0; const out:string[]=[];
  for(const t of c.topics)for(const st of t.subTopics)for(const dp of st.dotPoints)for(const p of dp.prompts){
    tot++;const full=p.sampleAnswers.find((s:any)=>s.mark===p.totalMarks); if(!full)continue;
    const ctx=[t.name,st.name,dp.description].join(' ')+' '+p.question+' '+(p.scenario??'');
    const must=(p.keywords??[]).filter((k:string)=>hasTerm(ctx,k)); const miss=must.filter((k:string)=>!hasTerm(full.answer,k));
    if(miss.length){bad++; out.push(`${p.id} [${dp.id}] missing: ${miss.join('; ')}`);}
  }
  console.log(f.split('/').pop(),'prompts',tot,'full-mark answers lacking must-use terms',bad); out.slice(0,12).forEach(o=>console.log('  ',o));
}
