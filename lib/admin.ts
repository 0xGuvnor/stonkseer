export const ADMIN_EMAIL = "yokeyeong@me.com"

export function resolveUserRole(email: string): "user" | "admin" {
  return email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase()
    ? "admin"
    : "user"
}

export function isAdminUser(
  user: { role: "user" | "admin"; email: string } | null | undefined,
): boolean {
  return user?.role === "admin"
}
