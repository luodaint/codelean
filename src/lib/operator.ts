import { requireUser } from "./auth";
import { isOperator } from "./billing-policy";
export async function requireOperator() {
  const session = await requireUser();
  if (!isOperator(session.user))
    throw new Error("Service operator access is required.");
  return session;
}
