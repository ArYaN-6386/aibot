import "dotenv/config";
import type { NextFunction, Request, Response } from "express";
import { prisma } from "./db";
import { createsupabaseClient } from "./supabase";

const supabase = createsupabaseClient();

export async function middleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace(/^Bearer\s+/i, "");

  if (!token) {
    return res.status(401).json({ message: "No token provided" });
  }

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return res.status(403).json({ message: "Invalid token" });
  }

  const user = data.user;
  const provider =
    user.app_metadata?.provider === "google" ? "GOOGLE" : "GITHUB";
  const name =
    (user.user_metadata?.full_name as string | undefined) ??
    user.email ??
    "Unknown";

  try {
    const dbUser = await prisma.user.upsert({
      where: { email: user.email! },
      update: {
        supabaseId: user.id,
        name,
        provider,
      },
      create: {
        supabaseId: user.id,
        email: user.email!,
        name,
        provider,
      },
    });
    req.userId = dbUser.id;
  } catch (err) {
    console.error("DB sync failed:", err);
    return res.status(500).json({ message: "Failed to sync user" });
  }

  next();
}
