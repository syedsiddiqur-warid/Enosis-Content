"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requestLoginLink, signInWithToken, signOut } from "@/lib/auth";

export async function requestLinkAction(_prev: unknown, formData: FormData) {
  const parsed = z.email().safeParse(String(formData.get("email") ?? "").trim());
  if (!parsed.success) return { error: "Please enter a valid email address." };
  await requestLoginLink(parsed.data);
  return { sent: true as const };
}

export async function verifyAction(formData: FormData) {
  const ok = await signInWithToken(String(formData.get("token") ?? ""));
  redirect(ok ? "/admin" : "/auth/verify?error=invalid");
}

export async function signOutAction() {
  await signOut();
  redirect("/login");
}
