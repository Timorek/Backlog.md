#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const myDir = dirname(fileURLToPath(import.meta.url));
const roadmap = JSON.parse(readFileSync(join(myDir, 'roadmap.json'), 'utf8'));
const first = roadmap.tasks.find(t => t.key === 'RAC-01');
first.title = '[RAC-01] Audyt Backlog.md i przygotowanie istniejącego forka';
first.description = first.description.replace('Załóż fork Backlog.md i gałąź feature/remote-agent-control.', 'Fork Timorek/Backlog.md już istnieje i jest sklonowany. Zweryfikuj origin/upstream i pracuj na gałęzi feature/remote-agent-control; nie twórz ponownie forka.');
const bun = process.env.RAC_BUN || 'bun';

const args = process.argv.slice(2);
let projectRoot = null;
let dryRun = false;
let withMilestones = false;
for (let i=0; i<args.length; i++) {
  if (args[i] === '--project-root') {
    if (!args[i+1] || args[i+1].startsWith('--')) throw new Error('Missing --project-root value');
    projectRoot = resolve(args[++i]);
  } else if (args[i] === '--dry-run') dryRun = true;
  else if (args[i] === '--with-milestones') withMilestones = true;
  else if (args[i] === '--help' || args[i] === '-h') {
    console.log('Usage: node docs/rac/import/import-backlog.mjs --project-root "$HOME/Projects/Backlog.md" [--dry-run] [--with-milestones]');
    process.exit(0);
  } else throw new Error(`Unknown argument: ${args[i]}`);
}
if (!projectRoot) throw new Error('Provide --project-root /absolute/path/to/your/fork');
const keys = new Set(roadmap.tasks.map(t=>t.key));
if (keys.size !== roadmap.tasks.length) throw new Error('Duplicate RAC task key in manifest');
for (const t of roadmap.tasks) for (const d of t.dependencies) if (!keys.has(d)) throw new Error(`Unknown ${d} in ${t.key}`);

function cli(command, allowError=false) {
  const result = spawnSync(bun, [join(projectRoot, 'src', 'cli.ts'), ...command], { cwd: projectRoot, encoding: 'utf8', shell:false, maxBuffer: 15*1024*1024 });
  if (result.error) throw new Error(`Failed to execute backlog (${result.error.message}). Install CLI / verify PATH.`);
  if (result.status !== 0 && !allowError) throw new Error(`backlog ${command[0]} ${command[1] ?? ''} failed (${result.status}): ${result.stderr || result.stdout}`);
  return result;
}
function json(command) {
  const result = cli(command);
  try { return JSON.parse(result.stdout); }
  catch { throw new Error(`Unexpected JSON for backlog ${command.join(' ')}. Check CLI version.`); }
}
function tasks() {
  const result = [];
  let skip = 0;
  while (true) {
    const data = json(['task','list','--json','--max-count','100','--skip',String(skip)]);
    if (data.kind !== 'task-list' || !Array.isArray(data.tasks)) throw new Error('Unexpected task-list JSON schema.');
    result.push(...data.tasks);
    if (data.nextSkip === null || data.nextSkip === undefined) return result;
    if (data.nextSkip <= skip) throw new Error('Non-advancing task pagination');
    skip = data.nextSkip;
  }

}
function findTask(all, key) {
  const matches=all.filter(t=>t.title?.startsWith(`[${key}] `));
  if (matches.length > 1) throw new Error(`Duplicate title prefix [${key}]! Resolve manually.`);
  return matches[0] || null;
}
function parseMilestones(output) {
  const map = new Map();
  // backlog milestone list --plain: m-0: M1 - Name (0/0 done)
  for (const line of output.split(/\r?\n/)) {
    const m = line.match(/^\s*(m-\d+): (.+?) \(\d+\/\d+ done\)/);
    if (m) map.set(m[2], m[1]);
  }
  return map;
}
function getMilestones() {
  const res = cli(['milestone','list','--plain']);
  const ms = parseMilestones(res.stdout);
  if (!ms.size && /m-\d+:/.test(res.stdout)) throw new Error('Unable to parse milestone list; refusing to create virtual milestone IDs');
  return ms;
}
function main() {
  console.log(`Project: ${projectRoot}`);
  console.log(`Tasks: ${roadmap.tasks.length}`);
  const before = tasks();
  for (const t of roadmap.tasks) findTask(before, t.key);
  const visit = (key, active = new Set()) => {
    if (active.has(key)) throw new Error(`Dependency cycle at ${key}`);
    for (const dep of roadmap.tasks.find(t => t.key === key).dependencies) visit(dep, new Set([...active, key]));
  };
  for (const t of roadmap.tasks) visit(t.key);
  if (dryRun) {
    for (const t of roadmap.tasks) console.log(`[dry-run] ${t.key}: ${findTask(before,t.key)?.id || 'CREATE (CLI allocator)'} | deps: ${t.dependencies.join(',') || '-'}`);
    console.log('Dry run checked local CLI, all current task pages, duplicate RAC keys and dependency cycles; no writes.');
    return;
  }
  let all = tasks();
  const milestones = new Map();
  if (withMilestones) {
    const phases = [...new Set(roadmap.tasks.map(t=>t.phase))];
    for (const phase of phases) {
      let ms = getMilestones();
      if (!ms.has(phase)) {
        console.log(`Creating milestone: ${phase}`);
        cli(['milestone','add',phase]);
        ms = getMilestones();
      }
      const id=ms.get(phase);
      if (!id) throw new Error(`Milestone not verified after creation: ${phase}`);
      milestones.set(phase,id); // use confirmed ID, never user-friendly alias
    }
  }
  const idByKey = new Map();
  for (const t of roadmap.tasks) {
    let existing = findTask(all, t.key);
    if (!existing) {
      const make=['task','create',t.title,'-d',t.description,'--priority',t.priority,'-s','To Do',
                  '-l',t.labels.join(',')];
      for (const ac of t.acceptanceCriteria) make.push('--ac',ac);
      if (withMilestones) make.push('-m', milestones.get(t.phase));
      console.log(`Creating ${t.key}`);
      cli(make);
      all=tasks();
      existing=findTask(all,t.key);
      if (!existing) throw new Error(`${t.key} was created but cannot be located. Inspect Backlog before retry.`);
      if (t.implementationPlan) cli(['task','edit',existing.id,'--plan',t.implementationPlan]);
    } else console.log(`Existing ${t.key} -> ${existing.id}`);
    idByKey.set(t.key,existing.id);
  }
  for (const t of roadmap.tasks) {
    if (!t.dependencies.length) continue;
    const id=idByKey.get(t.key);
    const view=json(['task',id,'--json']);
    if (!view.task || !Array.isArray(view.task.dependencies)) throw new Error(`Cannot inspect dependencies of ${id}. Aborting dependency import.`);
    const before=new Set(view.task.dependencies.map(String));
    const needed=t.dependencies.map(k=>idByKey.get(k)).filter(dep=>!before.has(String(dep)));
    if (!needed.length) continue;
    console.log(`${t.key}: adding dependencies: ${needed.join(', ')}`);
    cli(['task','edit',id,...Array.from(new Set([...before, ...needed])).flatMap(dep=>['--dep',dep])]);
  }
  console.log(`Completed. Verified ${roadmap.tasks.length} RAC tasks in ${projectRoot}. Open with: backlog board`);
}
try { main(); }
catch (e) { console.error(`ERROR: ${e.message}`); process.exitCode=1; }
