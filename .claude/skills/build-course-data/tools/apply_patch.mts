// Usage: npx tsx .claude/skills/build-course-data/tools/apply_patch.mts <validate|apply> public/courseData/<Course>.json <patch.json...>
import fs from 'node:fs';
import { commandTermsList, getFullMarkWordRange } from '../../../../data/commandTerms';
import { guideLadderProblem } from '../../../../utils/markingGuideLadder';

const [mode, courseFile, ...patchFiles] = process.argv.slice(2);
const raw = JSON.parse(fs.readFileSync(courseFile, 'utf8'));
const course = Array.isArray(raw) ? raw[0] : raw;
const tierOf = new Map(commandTermsList.map((t: any) => [t.term, t.tier]));
const outcomeCodes = new Set(course.outcomes.map((o: any) => o.code));
const US = /\b(analyz|color|organiz|behavior|center\b|centers\b|favor|summariz|recogniz|prioritiz|optimiz|utiliz|realiz|minimiz|maximiz|labor\b|catalog\b|defense|license\b)/i;
const errs: string[] = [];
const warns: string[] = [];
const err = (id: string, m: string) => errs.push(`${id}: ${m}`);
const warn = (id: string, m: string) => warns.push(`${id}: ${m}`);

const dps = new Map<string, any>();
const allIds = new Set<string>();
for (const t of course.topics) for (const st of t.subTopics) for (const dp of st.dotPoints) {
  dps.set(dp.id, dp);
  for (const p of dp.prompts) { allIds.add(p.id); for (const s of p.sampleAnswers ?? []) allIds.add(s.id); }
}
const ctxMap = new Map<string, string>();
for (const t of course.topics) for (const st of t.subTopics) for (const dp of st.dotPoints) for (const q of dp.prompts) ctxMap.set(q.id, [t.name, st.name, dp.description].join(' '));
const prompts = new Map<string, any>();
for (const dp of dps.values()) for (const p of dp.prompts) prompts.set(p.id, p);

const stemW = (w: string) => w.toLowerCase().replace(/(ing|ed|es|s|ion|ions)$/, '');
const wordsOf = (x: string) => x.toLowerCase().match(/[a-z0-9][a-z0-9'-]*/g) ?? [];
const hasTerm = (text: string, term: string) => { const t = wordsOf(term).map(stemW); const w = wordsOf(text).map(stemW); if (!t.length) return true; for (let i = 0; i <= w.length - t.length; i++) if (t.every((x, j) => w[i + j] === x)) return true; return false; };
let ctxOf: (p: any) => string = () => '';
const checkPrompt = (p: any, where: string, strict: boolean) => {
  const v = p.verb;
  if (!tierOf.has(v)) return err(where, `unknown verb ${v}`);
  const q = String(p.question ?? '');
  if (!q.toUpperCase().includes(String(v).toUpperCase().split(' ')[0])) err(where, `stem does not use verb ${v}: "${q.slice(0, 60)}"`);
  if (!Number.isInteger(p.totalMarks) || p.totalMarks < 1) return err(where, `bad totalMarks ${p.totalMarks}`);
  const prob = guideLadderProblem(String(p.markingCriteria ?? ''), p.totalMarks, tierOf.get(v) as number);
  if (prob) err(where, `marking criteria ladder: ${prob}`);
  if (!Array.isArray(p.keywords) || p.keywords.length < 4 || p.keywords.length > 10) err(where, `keywords ${p.keywords?.length}`);
  if (!Array.isArray(p.markerNotes) || p.markerNotes.length < 2 || p.markerNotes.length > 4) err(where, `markerNotes ${p.markerNotes?.length}`);
  if (!Array.isArray(p.commonStudentErrors) || p.commonStudentErrors.length < 2 || p.commonStudentErrors.length > 4) err(where, `commonStudentErrors ${p.commonStudentErrors?.length}`);
  if (!Array.isArray(p.linkedOutcomes) || !p.linkedOutcomes.length || p.linkedOutcomes.some((c: string) => !outcomeCodes.has(c))) err(where, `linkedOutcomes ${JSON.stringify(p.linkedOutcomes)}`);
  const sa = p.sampleAnswers ?? [];
  const marks = sa.map((s: any) => s.mark);
  if (marks.some((m: any) => !Number.isInteger(m) || m < 0 || m > p.totalMarks)) err(where, `sample marks ${marks}`);
  if (new Set(marks).size !== marks.length) err(where, `duplicate sample marks ${marks}`);
  if (!marks.includes(p.totalMarks)) err(where, 'no full-mark sample');
  const want = p.totalMarks <= 2 ? 2 : 3;
  if (sa.length < want) err(where, `only ${sa.length} samples, need ${want}`);
  if (p.totalMarks >= 4 && !marks.includes(1) && !marks.some((m: number) => m <= 2)) warn(where, 'no bottom sample (1-2)');
  const texts = new Set<string>();
  for (const s of sa) {
    const a = String(s.answer ?? '');
    if (a.trim().length < 3 || /lorem|TBD|TODO|\.\.\.$/i.test(a)) err(where, `bad answer text at mark ${s.mark}`);
    if (texts.has(a)) err(where, 'duplicate answer text'); texts.add(a);
    if (!s.feedback) warn(where, `no feedback at mark ${s.mark}`);
    if (s.mark === p.totalMarks) {
      const w = a.split(/\s+/).length;
      const [lo] = getFullMarkWordRange(p.totalMarks);
      if (w < lo * 0.9) (strict ? err : warn)(where, `full-mark answer ${w} words, band min ${lo}`);
      const [, hiW] = getFullMarkWordRange(p.totalMarks);
      if (w > hiW) err(where, `full-mark answer ${w} words, over the app band max ${hiW}`);
      const mustUse = (p.keywords ?? []).filter((k: string) => hasTerm(ctxOf(p), k));
      const miss = mustUse.filter((k: string) => !hasTerm(a, k));
      if (miss.length) err(where, `full-mark answer lacks must-use terms: ${miss.join('; ')}`);
    }
  }
  const byMark = [...sa].sort((x: any, y: any) => y.mark - x.mark);
  for (let i = 1; i < byMark.length; i++) if (wordsOf(byMark[i].answer).length > wordsOf(byMark[i - 1].answer).length) err(where, `${byMark[i].mark}-mark sample is longer than the ${byMark[i - 1].mark}-mark sample`);
  const blob = JSON.stringify([p.question, p.scenario, p.markingCriteria, p.markerNotes, p.commonStudentErrors, p.keywords, sa.map((s: any) => [s.answer, s.feedback])]);
  const m = blob.replace(/\b[A-Z][a-z]+ Organization\b/g, '').match(US); if (m) err(where, `US spelling: ${m[0]}`);
};

ctxOf = (p: any) => (ctxMap.get(p.id) ?? '') + ' ' + p.question + ' ' + (p.scenario ?? '');
const next = new Map<string, number>();
for (const pf of patchFiles) {
  const patch = JSON.parse(fs.readFileSync(pf, 'utf8'));
  for (const [dpId, spec] of Object.entries<any>(patch.dotPoints ?? {})) {
    const dp = dps.get(dpId);
    if (!dp) { err(pf, `unknown dot point ${dpId}`); continue; }
    for (const [pid, upd] of Object.entries<any>(spec.updates ?? {})) {
      const p = dp.prompts.find((x: any) => x.id === pid);
      if (!p) { err(pf, `unknown prompt ${pid} in ${dpId}`); continue; }
      const upd2: any = { ...upd };
      if (upd2.sampleAnswers) upd2.sampleAnswers = upd2.sampleAnswers.map((s: any, i: number) => ({ id: s.id ?? `${pid}-s${i + 1}`, source: 'AI', ...s, id2: undefined })).map(({ id2, ...s }: any) => s);
      Object.assign(p, upd2);
      checkPrompt(p, `${pid}(updated)`, false);
    }
    for (const np of spec.newPrompts ?? []) {
      const base = dp.prompts[0]?.id ?? 'prompt-' + dpId.replace(/^dp-/, '');
      const k = (next.get(dpId) ?? dp.prompts.length) ; next.set(dpId, k + 1);
      let id = `${base}-n${k}`; while (allIds.has(id)) id += 'x'; allIds.add(id);
      const p: any = { id, ...np };
      ctxMap.set(id, [dp.description].join(' '));
      p.sampleAnswers = (np.sampleAnswers ?? []).map((s: any, i: number) => ({ id: `${id}-s${i + 1}`, source: 'AI', ...s }));
      if (dp.prompts.some((x: any) => x.question.trim().toLowerCase() === String(p.question).trim().toLowerCase())) err(id, 'duplicate question stem');
      if (!p.scenario) warn(id, 'no scenario');
      checkPrompt(p, id, true);
      dp.prompts.push(p);
    }
  }
}
console.log(`${errs.length} errors, ${warns.length} warnings`);
errs.slice(0, 60).forEach((e) => console.log('ERR ', e));
warns.slice(0, 25).forEach((e) => console.log('WARN', e));
if (mode === 'apply') {
  if (errs.length) { console.log('NOT APPLIED'); process.exit(1); }
  fs.writeFileSync(courseFile, JSON.stringify(raw, null, 2) + '\n');
  console.log('applied');
}
