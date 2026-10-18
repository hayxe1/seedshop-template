import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAdminSessionCookieName, verifyAdminSessionToken } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";

export async function getCurrentAdminUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(getAdminSessionCookieName())?.value ?? "";
  const session = await verifyAdminSessionToken(token);

  if (!session.valid) {
    return null;
  }

  const adminUser = await prisma.adminUser.findUnique({
    where: {
      id: session.adminUserId,
    },
    select: {
      id: true,
      email: true,
      name: true,
      isActive: true,
    },
  });

  if (!adminUser?.isActive) {
    return null;
  }

  return {
    id: adminUser.id,
    email: adminUser.email,
    name: adminUser.name,
  };
}

export async function requireAdminUser() {
  const adminUser = await getCurrentAdminUser();

  if (!adminUser) {
    redirect("/admin/login");
  }

  return adminUser;
}

export async function assertAdminApiSession() {
  const adminUser = await getCurrentAdminUser();

  if (!adminUser) {
    return Response.json(
      {
        ok: false,
        error: "Требуется вход в админку.",
      },
      { status: 401 }
    );
  }

  return adminUser;
}
