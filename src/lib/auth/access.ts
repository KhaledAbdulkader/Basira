export type CurrentUser = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: "USER" | "ADMIN";
  status: "ACTIVE" | "SUSPENDED";
};

export class AccessError extends Error {
  constructor(public readonly status: 401 | 403) {
    super(status === 401 ? "Sign in to continue." : "Access denied.");
  }
}

// Call only with a freshly loaded server-side identity, never client/token roles.
export function assertAccess(
  user: CurrentUser | null | undefined,
  role?: CurrentUser["role"],
): CurrentUser {
  if (!user) throw new AccessError(401);
  if (user.status !== "ACTIVE" || (role && user.role !== role))
    throw new AccessError(403);
  return user;
}
