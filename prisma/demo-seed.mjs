import "dotenv/config";
import { randomBytes, scryptSync } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// Additive fixtures only. Never import or invoke the source store's seed.
const url = new URL(process.env.DATABASE_URL || "postgresql://invalid/invalid");
const database = decodeURIComponent(url.pathname.slice(1));
const e2e = process.env.TEMPLATE_E2E_SETUP === "1";
if (process.env.TEMPLATE_DEMO_DATABASE !== "seedshop-template-demo" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !/^postgres(ql)?:$/.test(url.protocol) ||
    !(e2e ? /(^|_)(e2e|test)(_|$)/i : /(^|_)demo(_|$)/i).test(database) ||
    (e2e && process.env.DATABASE_URL !== process.env.E2E_DATABASE_URL)) {
  throw new Error("Refusing seed: use an explicitly opted-in local demo database, or the isolated E2E runner. No data was changed.");
}
const pool = new Pool({ connectionString: url.toString() });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const samples = [
  ["Томат", "tomaty", "Томаты", "tomato", 120],
  ["Огурец", "ogurtsy", "Огурцы", "cucumber", 90],
  ["Перец", "pertsy", "Перцы", "pepper", 110],
  ["Семена цветов", "tsvety", "Цветы", "flower", 80],
  ["Удобрение", "udobreniya", "Удобрения", "fertilizer", 200],
  ["Грунт", "grunty", "Грунты", "soil", 250],
];
const testSamples = [
  ["Свекла", "svekla", "Свекла", "tomato", 70],
  ["Кукуруза", "kukuruza", "Кукуруза", "flower", 75],
  ["Морковь", "morkov", "Морковь", "pepper", 60],
  ...Array.from({length:7}, (_,i)=>["Томат тестовый " + (i+1), "tomaty", "Томаты", "tomato", 95+i]),
];
try {
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(73668291)`;
    if (!e2e) {
      for (const name of Object.values(Prisma.ModelName)) {
        const delegate = name[0].toLowerCase() + name.slice(1);
        if (await tx[delegate].count()) throw new Error("Demo seed requires an empty application database. Existing data was preserved.");
      }
    }
    const products=[];
    for (const [index, [label, slug, categoryName, image, price]] of [...samples, ...(e2e ? testSamples : [["Томат под заказ", "tomaty", "Томаты", "tomato", 149]])].entries()) {
      let category=await tx.category.findUnique({where:{slug}});
      if (!category) category=await tx.category.create({data:{name:categoryName,slug,description:"Демонстрационная категория. Замените ассортиментом клиента."}});
      const productSlug=`demo-${image}-${index+1}`;
      let product=await tx.product.findUnique({where:{slug:productSlug}});
      const demoImage = !e2e && index === 1 ? "/demo/package-wide.svg" : !e2e && index === 2 ? "/demo/package-square.svg" : !e2e && index === 3 ? "" : `/product-images/demo/${image}.png`;
      const demoValues = e2e ? {} : {
        stock: index === 0 ? 2 : index === 4 ? 0 : index >= 5 ? null : 25,
        inventoryPolicy: index === 5 ? "UNLIMITED" : index === 6 ? "PREORDER" : "TRACKED",
        packSize: ["20 семян", "0,1 г", "10 семян", "", "100 г", "5 л", "20 семян"][index],
      };
      if (!product) product=await tx.product.create({data:{
        name:`${label} — ДЕМО`, slug:productSlug,
        description:"Демонстрационный товар. Условная цена и остаток. Иллюстрация не является фотографией товара. Не является предложением реального продавца.",
        shortDescription:"Демонстрационный пример • условная цена", price,
        mainImageUrl:demoImage, categoryId:category.id, stock:1000,
        inventoryPolicy:"TRACKED", isPublished:true, isPopularToday:true, isNew:index<2,
        manufacturer:"Демонстрационный производитель", packSize:"1 демонстрационная упаковка",
        ...demoValues,
        growingPlaces:index<4||index>5 ? ["Открытый грунт","Теплица","Балкон"] : [],
        difficulty:index<4||index>5 ? "BEGINNER" : null,
        sowMonths:index<4||index>5 ? [3,4,5] : [], transplantMonths:[5], harvestMonths:[7,8,9],
        lightRequirement:"FULL_SUN", maturityDays:90,
        plantingTips:"Демонстрационные агрономические параметры. Замените инструкцией производителя.",
        images:{create:demoImage ? [{url:demoImage,position:1},{url:"/product-images/demo/package.png",position:2}] : []},
      }});
      products.push(product);
    }
    if (!await tx.seedSet.findUnique({where:{slug:"demo-starter-set"}})) {
      await tx.seedSet.create({data:{slug:"demo-starter-set",isPublished:true,publishedAt:new Date(),publishedVersion:1,
        revisions:{create:["DRAFT","PUBLISHED"].map(role=>({role,name:"Демонстрационный набор семян",description:"ДЕМО: томат, огурец и перец. Условная цена. Замените ассортиментом клиента.",shortDescription:"Демонстрационный набор • 3 культуры",imageUrl:"/product-images/demo/package.png",price:300,items:{create:products.slice(0,3).map((p,i)=>({productId:p.id,position:i}))}}))},
      }});
    }
    // The known fixture login exists only in explicitly marked disposable E2E databases.
    if(e2e && !await tx.adminUser.findUnique({where:{email:"admin@seed-store.local"}})) {
      const salt=randomBytes(16).toString("base64url");
      await tx.adminUser.create({data:{name:"E2E only",email:"admin@seed-store.local",passwordHash:`scrypt:${salt}:${scryptSync("change-me",salt,64).toString("base64url")}`}});
    }
  },{timeout:30000,isolationLevel:"Serializable"});
  console.log(e2e ? "Isolated E2E fixtures ready; notifications must stay disabled." : "Created 7 clearly marked demo products and one set. No admin, orders or customer data were created.");
} finally {
  await prisma.$disconnect();
  await pool.end();
}
