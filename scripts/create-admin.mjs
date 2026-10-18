import "dotenv/config";
import { randomBytes, scryptSync } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const email=(process.env.TEMPLATE_ADMIN_EMAIL || "").trim().toLowerCase();
const password=process.env.TEMPLATE_ADMIN_PASSWORD || "";
if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length<16) {
  throw new Error("Set TEMPLATE_ADMIN_EMAIL and a unique TEMPLATE_ADMIN_PASSWORD of at least 16 characters locally. No default account is installed.");
}
const pool=new Pool({connectionString:process.env.DATABASE_URL});
const prisma=new PrismaClient({adapter:new PrismaPg(pool)});
try {
  const salt=randomBytes(16).toString("base64url");
  await prisma.adminUser.create({data:{email,name:"Администратор",passwordHash:`scrypt:${salt}:${scryptSync(password,salt,64).toString("base64url")}`}});
  console.log("Administrator created. Existing accounts were not overwritten.");
} finally {await prisma.$disconnect(); await pool.end();}
