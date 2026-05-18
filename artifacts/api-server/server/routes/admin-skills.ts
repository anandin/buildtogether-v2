/**
 * Admin skills inspector + actions. Backs /admin/skills.
 *
 * Endpoints (all gated by requireAuth + requireAdmin):
 *   GET  /api/admin/skills              → all skills with stats
 *   POST /api/admin/skills/:id/promote  → status='proposed' → 'active'
 *   POST /api/admin/skills/:id/archive  → status → 'archived'
 *   POST /api/admin/skills/:id/edit     → update instructions
 *   POST /api/admin/skills/induce-now   → manually trigger induction
 *   POST /api/admin/skills/curate-now   → manually trigger curator
 *
 * Plus GET /admin/skills which serves the HTML page.
 */
import type { Express, Request, Response } from "express";

import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/admin";
import {
  curateSkills,
  induceSkillsFromTrajectories,
  listAllSkills,
  setSkillStatus,
  updateSkillInstructions,
} from "../tilly/skills";

export function mountAdminSkillsRoutes(app: Express): void {
  app.get(
    "/api/admin/skills",
    requireAuth,
    requireAdmin,
    async (_req: Request, res: Response) => {
      try {
        const skills = await listAllSkills();
        res.json({
          totalCount: skills.length,
          proposed: skills.filter((s) => s.status === "proposed").length,
          active: skills.filter((s) => s.status === "active").length,
          archived: skills.filter((s) => s.status === "archived").length,
          skills: skills.map((s) => ({
            id: s.id,
            name: s.name,
            description: s.description,
            instructions: s.instructions,
            triggerPhrases: s.triggerPhrases,
            confidence: s.confidence,
            status: s.status,
            usedCount: s.usedCount,
            successCount: s.successCount,
            failCount: s.failCount,
            successRate:
              s.successCount + s.failCount > 0
                ? Math.round((s.successCount / (s.successCount + s.failCount)) * 100) / 100
                : null,
            sourceEventIds: s.sourceEventIds,
            lastUsedAt: s.lastUsedAt,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
          })),
        });
      } catch (err) {
        console.error("[admin-skills] list error:", err);
        res.status(500).json({ error: "list failed" });
      }
    },
  );

  app.post(
    "/api/admin/skills/:id/promote",
    requireAuth,
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        await setSkillStatus(String(req.params.id), "active");
        res.json({ ok: true });
      } catch (err) {
        res.status(500).json({ error: "promote failed", message: (err as Error).message });
      }
    },
  );

  app.post(
    "/api/admin/skills/:id/archive",
    requireAuth,
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        await setSkillStatus(String(req.params.id), "archived");
        res.json({ ok: true });
      } catch (err) {
        res.status(500).json({ error: "archive failed", message: (err as Error).message });
      }
    },
  );

  app.post(
    "/api/admin/skills/:id/edit",
    requireAuth,
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const instructions = String(req.body?.instructions ?? "").trim();
        if (!instructions) return res.status(400).json({ error: "instructions required" });
        await updateSkillInstructions(String(req.params.id), instructions);
        res.json({ ok: true });
      } catch (err) {
        res.status(500).json({ error: "edit failed", message: (err as Error).message });
      }
    },
  );

  app.post(
    "/api/admin/skills/induce-now",
    requireAuth,
    requireAdmin,
    async (_req: Request, res: Response) => {
      try {
        const out = await induceSkillsFromTrajectories();
        res.json({ ok: true, ...out });
      } catch (err) {
        res.status(500).json({ error: "induce failed", message: (err as Error).message });
      }
    },
  );

  app.post(
    "/api/admin/skills/curate-now",
    requireAuth,
    requireAdmin,
    async (_req: Request, res: Response) => {
      try {
        const out = await curateSkills();
        res.json({ ok: true, ...out });
      } catch (err) {
        res.status(500).json({ error: "curate failed", message: (err as Error).message });
      }
    },
  );

  // Server-rendered admin page (auth-gated). All client DOM is built
  // via document.createElement + textContent — no innerHTML on
  // untrusted-ish fields (LLM-generated skill names/descriptions are
  // technically attacker-influenceable if the induction LLM ingests
  // user data). Same pattern + safety bar as /admin/memory.
  app.get("/admin/skills", requireAuth, requireAdmin, async (_req: Request, res: Response) => {
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.send(SKILLS_PAGE_HTML);
  });
}

const SKILLS_PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Tilly · Self-Learned Skills</title>
<style>
  body { font: 14px/1.55 -apple-system, system-ui, sans-serif; max-width: 1100px; margin: 24px auto; padding: 0 24px; color: #1a1a1a; background: #fafafa; }
  h1 { font: 700 26px/1.2 Georgia, serif; border-bottom: 2px solid #1a1a1a; padding-bottom: 10px; }
  .stats { display: flex; gap: 24px; margin: 20px 0; }
  .stat { background: white; border: 1px solid #ddd; border-radius: 8px; padding: 12px 18px; }
  .stat .n { font-size: 24px; font-weight: 700; }
  .stat .l { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
  .actions { margin: 16px 0; }
  button { background: #6b46c1; color: white; border: 0; padding: 8px 14px; border-radius: 6px; font-weight: 600; cursor: pointer; margin-right: 8px; }
  button.secondary { background: #777; }
  button.danger { background: #b91c1c; }
  .skill { background: white; border: 1px solid #ddd; border-radius: 8px; padding: 16px; margin: 12px 0; }
  .skill h3 { margin: 0 0 4px; font: 600 16px Georgia, serif; }
  .skill .desc { font-style: italic; color: #444; margin-bottom: 8px; }
  .skill .tags { margin-bottom: 8px; }
  .tag { background: #eef2ff; color: #6b46c1; padding: 2px 8px; border-radius: 4px; font-size: 11px; margin-right: 4px; display: inline-block; }
  .status { padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; margin-left: 8px; }
  .status.proposed { background: #fef3c7; color: #92400e; }
  .status.active { background: #d1fae5; color: #065f46; }
  .status.archived { background: #e5e7eb; color: #4b5563; }
  pre { background: #f5f5f5; padding: 12px; border-radius: 4px; font-size: 12px; overflow-x: auto; white-space: pre-wrap; }
  .row { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
  .col-meta { font-size: 11px; color: #666; text-align: right; min-width: 120px; }
</style>
</head>
<body>
<h1>Tilly · Self-Learned Skills</h1>
<p style="color: #666;">Skills the agent has induced from successful trajectories (Hermes/Voyager pattern). Active skills get injected into chat turns when the user's message matches their triggers. Proposed skills are awaiting review or automatic promotion via the curator.</p>

<div class="stats" id="stats"></div>

<div class="actions">
  <button id="btn-induce">Induce skills from last 7 days</button>
  <button class="secondary" id="btn-curate">Run curator</button>
  <button class="secondary" id="btn-refresh">Refresh</button>
</div>

<div id="list">Loading…</div>

<script>
// All DOM construction via createElement + textContent. No innerHTML
// for skill fields — LLM-induced names/descriptions could be
// attacker-influenced via crafted user messages.
function el(tag, attrs, children) {
  const e = document.createElement(tag);
  if (attrs) {
    for (const k of Object.keys(attrs)) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'on' && typeof attrs[k] === 'object') {
        for (const evt of Object.keys(attrs[k])) e.addEventListener(evt, attrs[k][evt]);
      }
      else e.setAttribute(k, attrs[k]);
    }
  }
  if (children) {
    const list = Array.isArray(children) ? children : [children];
    for (const c of list) {
      if (c == null || c === false) continue;
      if (typeof c === 'string' || typeof c === 'number') {
        e.appendChild(document.createTextNode(String(c)));
      } else {
        e.appendChild(c);
      }
    }
  }
  return e;
}

function statBox(n, label) {
  return el('div', { class: 'stat' }, [
    el('div', { class: 'n' }, String(n)),
    el('div', { class: 'l' }, label),
  ]);
}

function skillCard(s) {
  const tags = (s.triggerPhrases || []).map(t => el('span', { class: 'tag' }, t));
  const detailsPre = el('pre', null, s.instructions || '');
  const details = el('details', null, [
    el('summary', { style: 'cursor: pointer; font-size: 12px; color: #6b46c1;' }, 'Show instructions'),
    detailsPre,
  ]);
  const statusBadge = el('span', { class: 'status ' + s.status }, s.status);
  const header = el('h3', null, [s.name, statusBadge]);
  const desc = el('div', { class: 'desc' }, s.description);
  const tagWrap = el('div', { class: 'tags' }, tags);

  const meta = el('div', { class: 'col-meta' });
  meta.appendChild(document.createTextNode('conf: '));
  meta.appendChild(el('strong', null, (s.confidence || 0).toFixed(2)));
  meta.appendChild(el('br'));
  meta.appendChild(document.createTextNode('used: ' + s.usedCount + 'x (\\u2713' + s.successCount + ' \\u2717' + s.failCount + ')'));
  meta.appendChild(el('br'));
  if (s.successRate != null) {
    meta.appendChild(document.createTextNode('rate: '));
    meta.appendChild(el('strong', null, Math.round(s.successRate * 100) + '%'));
    meta.appendChild(el('br'));
  }
  meta.appendChild(document.createTextNode(s.lastUsedAt ? 'last: ' + new Date(s.lastUsedAt).toLocaleDateString() : 'never used'));
  meta.appendChild(el('br'));
  meta.appendChild(document.createTextNode('src events: ' + (s.sourceEventIds || []).length));

  const row = el('div', { class: 'row' }, [
    el('div', null, [header, desc, tagWrap, details]),
    meta,
  ]);

  const actions = el('div', { style: 'margin-top: 12px;' });
  if (s.status !== 'active') {
    actions.appendChild(el('button', { on: { click: () => action(s.id, 'promote') } }, 'Promote -> active'));
  }
  if (s.status !== 'archived') {
    actions.appendChild(el('button', { class: 'danger', on: { click: () => action(s.id, 'archive') } }, 'Archive'));
  }

  return el('div', { class: 'skill' }, [row, actions]);
}

async function load() {
  const r = await fetch('/api/admin/skills');
  const d = await r.json();
  const stats = document.getElementById('stats');
  stats.replaceChildren(
    statBox(d.totalCount, 'total'),
    statBox(d.proposed, 'proposed'),
    statBox(d.active, 'active'),
    statBox(d.archived, 'archived'),
  );
  const list = document.getElementById('list');
  list.replaceChildren(...d.skills.map(skillCard));
  if (d.skills.length === 0) {
    list.replaceChildren(el('p', { style: 'color: #666; font-style: italic;' },
      'No skills yet. Click "Induce skills from last 7 days" to scan trajectories, or run the seed script to backfill.'));
  }
}
async function action(id, kind) {
  if (kind === 'archive' && !confirm('Archive this skill? It will stop being injected into chats.')) return;
  await fetch('/api/admin/skills/' + encodeURIComponent(id) + '/' + kind, { method: 'POST' });
  await load();
}
async function induceNow(btn) {
  btn.disabled = true; btn.textContent = 'Inducing...';
  try {
    const r = await fetch('/api/admin/skills/induce-now', { method: 'POST' });
    const d = await r.json();
    alert('Scanned ' + d.trajectoriesScanned + ' trajectories; proposed ' + d.skillsProposed + ' new skills (' + d.errors + ' errors).');
    await load();
  } finally { btn.disabled = false; btn.textContent = 'Induce skills from last 7 days'; }
}
async function curateNow() {
  const r = await fetch('/api/admin/skills/curate-now', { method: 'POST' });
  const d = await r.json();
  alert('Curator: promoted ' + d.promoted + ', archived ' + d.archived + ', unchanged ' + d.unchanged + '.');
  await load();
}
document.getElementById('btn-induce').addEventListener('click', (e) => induceNow(e.currentTarget));
document.getElementById('btn-curate').addEventListener('click', curateNow);
document.getElementById('btn-refresh').addEventListener('click', load);
load();
</script>
</body>
</html>`;
