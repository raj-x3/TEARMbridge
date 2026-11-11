// src/lib/server/services/auth.ts
// Server-side authentication helpers for API routes
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface AuthenticatedContext {
  userId: string;
  workspaceId: string;
  role: string;
}

/**
 * Verify the current user's authentication and workspace membership.
 * Optionally verifies that the user holds one of the required roles.
 * Returns the authenticated context or throws AuthError.
 */
export async function requireAuth(
  allowedRoles?: string[]
): Promise<AuthenticatedContext> {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new AuthError("Authentication required", 401);
  }

  // Get user's workspace membership from database session using admin client
  // to avoid recursive RLS policy evaluation on workspace_members
  const adminClient = createAdminClient();
  const { data: membership, error: memberError } = await adminClient
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (memberError || !membership) {
    throw new AuthError("No workspace membership found", 403);
  }

  // Enforce role restrictions if specified
  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(membership.role)) {
    throw new AuthError(
      `Access denied. Role '${membership.role}' does not have permission for this operation.`,
      403
    );
  }

  return {
    userId: user.id,
    workspaceId: membership.workspace_id,
    role: membership.role,
  };
}

export class AuthError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number = 401) {
    super(message);
    this.name = "AuthError";
    this.statusCode = statusCode;
  }
}
