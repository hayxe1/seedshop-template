import { NextResponse } from "next/server";
import { createAdminSessionToken, getAdminSessionCookieName, getAdminSessionTtlSeconds, hasAdminSessionSecret } from "@/lib/admin-session";
import { adminPasswordNeedsRehash, hashAdminPassword, verifyAdminPassword } from "@/lib/admin-password";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit, getClientIp, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit";
import { parseJsonBody, loginBodySchema } from "@/shared/api/contracts";

function normalize(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function consumeFailedLoginLimit(clientIp: string, email: string) {
  return consumeRateLimit({
    key: rateLimitKey("admin-login:email-ip", clientIp, email),
    limit: 5,
    windowMs: 10 * 60 * 1000,
  });
}

export async function POST(request: Request) {
  try {
    if (!hasAdminSessionSecret()) {
      return NextResponse.json(
        {
          ok: false,
          error: "Секрет админ-сессии не настроен.",
        },
        { status: 500 }
      );
    }

    const bodyResult = await parseJsonBody(request, loginBodySchema, "Укажите эл. почту и пароль.");
    if (!bodyResult.ok) {
      return bodyResult.response;
    }

    const body = bodyResult.data;
    const email = normalize(body.email).toLowerCase();
    const password = normalize(body.password);

    if (!email || !password) {
      return NextResponse.json(
        {
          ok: false,
          error: "Укажите эл. почту и пароль.",
        },
        { status: 400 }
      );
    }

    const clientIp = getClientIp(request);
    const ipLimit = await consumeRateLimit({
      key: rateLimitKey("admin-login:ip", clientIp),
      limit: 30,
      windowMs: 10 * 60 * 1000,
    });
    if (ipLimit.limited) {
      return rateLimitResponse(ipLimit);
    }

    const admin = await prisma.adminUser.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        isActive: true,
      },
    });

    if (!admin || !admin.isActive) {
      const emailLimit = await consumeFailedLoginLimit(clientIp, email);
      if (emailLimit.limited) {
        return rateLimitResponse(emailLimit);
      }

      return NextResponse.json(
        {
          ok: false,
          error: "Неверный пароль",
        },
        { status: 401 }
      );
    }

    const passwordMatches = await verifyAdminPassword(password, admin.passwordHash);
    if (!passwordMatches) {
      const emailLimit = await consumeFailedLoginLimit(clientIp, email);
      if (emailLimit.limited) {
        return rateLimitResponse(emailLimit);
      }

      return NextResponse.json(
        {
          ok: false,
          error: "Неверный пароль",
        },
        { status: 401 }
      );
    }

    if (adminPasswordNeedsRehash(admin.passwordHash)) {
      await prisma.adminUser.update({
        where: { id: admin.id },
        data: { passwordHash: await hashAdminPassword(password) },
      });
    }

    const token = await createAdminSessionToken(admin.id);
    const response = NextResponse.json({
      ok: true,
      data: {
        admin: {
          id: admin.id,
          email: admin.email,
        },
      },
    });

    response.cookies.set({
      name: getAdminSessionCookieName(),
      value: token,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: getAdminSessionTtlSeconds(),
    });

    return response;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Не удалось войти.",
      },
      { status: 500 }
    );
  }
}
