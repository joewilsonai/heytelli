import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, users } from "@workspace/db";
import { LoginBetaUserBody } from "@workspace/api-zod";
import {
  createAuthToken,
  isInviteCodeAllowed,
  normalizeEmail,
  requireAuth,
} from "../lib/auth";

const router: IRouter = Router();

function publicUser(user: typeof users.$inferSelect) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
  };
}

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBetaUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!isInviteCodeAllowed(parsed.data.inviteCode)) {
    res.status(401).json({ error: "Invalid beta invite code" });
    return;
  }

  const email = normalizeEmail(parsed.data.email);
  const displayName = parsed.data.displayName ?? null;

  try {
    let [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user) {
      [user] = await db
        .insert(users)
        .values({ email, displayName })
        .returning();
    } else if (displayName && user.displayName !== displayName) {
      [user] = await db
        .update(users)
        .set({ displayName })
        .where(eq(users.id, user.id))
        .returning();
    }

    const token = createAuthToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    req.log.error({ err }, "Beta login failed");
    res.status(500).json({ error: "Failed to sign in" });
  }
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  res.json({ user: req.auth });
});

export default router;
