/**
 * Tilly chat endpoint — spec §4.2 + §5.6.
 *
 * Phase 2 wires this to `server/tilly/persona.ts` + Anthropic Claude. Each
 * user message persists to `guardian_conversations`; the Tilly reply is
 * generated with the user's tone preference (sibling/coach/quiet) and may
 * include a structured analysis card (rows + note). The memory writer
 * (`server/tilly/memory-writer.ts`) extracts durable observations into
 * `tilly_memory` after each turn.
 *
 * Currently returns 501 stubs so the frontend hooks can compile.
 */
import type { Express, Request, Response } from "express";
import { requireAuth } from "../../middleware/auth";

const NOT_IMPLEMENTED = {
  error: "Tilly chat is not yet wired — Phase 2",
  phase: 2,
} as const;

export function mountTillyChatRoutes(app: Express): void {
  // Send a user message; receive Tilly's reply (text or analysis card).
  // Body: { message: string }
  // Returns: { reply: { id, role: "tilly", kind: "text" | "analysis", ... } }
  app.post("/api/tilly/chat", requireAuth, async (_req: Request, res: Response) => {
    res.status(501).json(NOT_IMPLEMENTED);
  });

  // Conversation history for the current user, paginated.
  // Returns: { messages: Msg[] }
  app.get("/api/tilly/chat/history", requireAuth, async (_req: Request, res: Response) => {
    res.json({ messages: [] });
  });

  // Set or read the user's tone preference (sibling | coach | quiet).
  app.get("/api/tilly/tone", requireAuth, async (_req: Request, res: Response) => {
    res.json({ tone: "sibling", phase: 2 });
  });
  app.put("/api/tilly/tone", requireAuth, async (_req: Request, res: Response) => {
    res.status(501).json(NOT_IMPLEMENTED);
  });
}
