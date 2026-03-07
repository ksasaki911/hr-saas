// =============================================================
// シードデータ投入スクリプト
// スーパーマーケットの現実的なデータ構成
// =============================================================
// 実行: npx tsx prisma/seed.ts
// =============================================================

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 シードデータ投入開始...\n");

  // =============================================================
  // 1. テナント
  // =============================================================
  const tenant = await prisma.tenant.upsert({
    where: { subdomain: "marukawa" },
    update: {},
    create: {
      id: "t-marukawa-001",
      name: "株式会社マルカワ",
      subdomain: "marukawa",
      plan: "premium",
    },
  });
  console.log("✅ テナント:", tenant.name);

  // =============================================================
  // 2. 店舗
  // =============================================================
  const stores = await Promise.all([
    prisma.store.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: "S001" } },
      update: {},
      create: {
        id: "store-honten",
        tenantId: tenant.id,
        code: "S001",
        name: "マルカワ本店",
        address: "東京都世田谷区桜丘3-15-1",
        phone: "03-1234-5678",
        openTime: "09:00",
        closeTime: "22:00",
      },
    }),
    prisma.store.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: "S002" } },
      update: {},
      create: {
        id: "store-ekimae",
        tenantId: tenant.id,
        code: "S002",
        name: "マルカワ駅前店",
        address: "東京都世田谷区太子堂1-2-3",
        phone: "03-2345-6789",
        openTime: "08:00",
        closeTime: "23:00",
      },
    }),
  ]);
  console.log(`✅ 店舗: ${stores.length}店舗`);

  // =============================================================
  // 3. 部門（スーパーマーケットの典型的な部門構成）
  // =============================================================
  const deptData = [
    { id: "dept-seika", code: "D01", name: "青果", sortOrder: 1 },
    { id: "dept-sengyo", code: "D02", name: "鮮魚", sortOrder: 2 },
    { id: "dept-seiniku", code: "D03", name: "精肉", sortOrder: 3 },
    { id: "dept-sozai", code: "D04", name: "惣菜", sortOrder: 4 },
    { id: "dept-bakery", code: "D05", name: "ベーカリー", sortOrder: 5 },
    { id: "dept-grocery", code: "D06", name: "グロサリー", sortOrder: 6 },
    { id: "dept-daily", code: "D07", name: "日配", sortOrder: 7 },
    { id: "dept-register", code: "D08", name: "レジ", sortOrder: 8 },
    { id: "dept-service", code: "D09", name: "サービスカウンター", sortOrder: 9 },
  ];

  const departments = await Promise.all(
    deptData.map((d) =>
      prisma.department.upsert({
        where: { tenantId_code: { tenantId: tenant.id, code: d.code } },
        update: {},
        create: { ...d, tenantId: tenant.id },
      })
    )
  );
  console.log(`✅ 部門: ${departments.length}部門`);

  // =============================================================
  // 4. 職位
  // =============================================================
  const posData = [
    { id: "pos-mgr", name: "店長", level: 50 },
    { id: "pos-asst", name: "副店長", level: 40 },
    { id: "pos-chief", name: "チーフ", level: 30 },
    { id: "pos-leader", name: "パートリーダー", level: 20 },
    { id: "pos-staff", name: "一般", level: 10 },
  ];

  const positions = await Promise.all(
    posData.map((p) =>
      prisma.position.upsert({
        where: { tenantId_name: { tenantId: tenant.id, name: p.name } },
        update: {},
        create: { ...p, tenantId: tenant.id },
      })
    )
  );
  console.log(`✅ 職位: ${positions.length}種`);

  // =============================================================
  // 5. 従業員（本店: 正社員5名 + パート15名 + アルバイト10名 = 30名）
  // =============================================================
  const storeId = stores[0].id;

  // --- 正社員 ---
  const fullTimeEmployees = [
    {
      id: "emp-tanaka",
      code: "E0001",
      lastName: "田中",
      firstName: "太郎",
      lastNameKana: "タナカ",
      firstNameKana: "タロウ",
      email: "tanaka@marukawa.co.jp",
      phone: "090-1111-0001",
      employmentType: "FULL_TIME" as const,
      departmentId: null, // 店長は全部門管轄
      positionId: "pos-mgr",
      hireDate: new Date("2010-04-01"),
      monthlySalary: 380000,
      skills: ["店長資格", "衛生管理者", "防火管理者"],
    },
    {
      id: "emp-suzuki",
      code: "E0002",
      lastName: "鈴木",
      firstName: "一郎",
      lastNameKana: "スズキ",
      firstNameKana: "イチロウ",
      email: "suzuki@marukawa.co.jp",
      phone: "090-1111-0002",
      employmentType: "FULL_TIME" as const,
      departmentId: null,
      positionId: "pos-asst",
      hireDate: new Date("2013-04-01"),
      monthlySalary: 320000,
      skills: ["副店長資格", "衛生管理者"],
    },
    {
      id: "emp-sato-m",
      code: "E0003",
      lastName: "佐藤",
      firstName: "雅人",
      lastNameKana: "サトウ",
      firstNameKana: "マサト",
      email: "sato-m@marukawa.co.jp",
      phone: "090-1111-0003",
      employmentType: "FULL_TIME" as const,
      departmentId: "dept-sengyo",
      positionId: "pos-chief",
      hireDate: new Date("2015-04-01"),
      monthlySalary: 290000,
      skills: ["鮮魚技能士2級", "刺身盛付"],
    },
    {
      id: "emp-yamada",
      code: "E0004",
      lastName: "山田",
      firstName: "健太",
      lastNameKana: "ヤマダ",
      firstNameKana: "ケンタ",
      email: "yamada@marukawa.co.jp",
      phone: "090-1111-0004",
      employmentType: "FULL_TIME" as const,
      departmentId: "dept-seiniku",
      positionId: "pos-chief",
      hireDate: new Date("2016-04-01"),
      monthlySalary: 285000,
      skills: ["食肉技能士", "スライサー"],
    },
    {
      id: "emp-takahashi",
      code: "E0005",
      lastName: "高橋",
      firstName: "美咲",
      lastNameKana: "タカハシ",
      firstNameKana: "ミサキ",
      email: "takahashi@marukawa.co.jp",
      phone: "090-1111-0005",
      employmentType: "FULL_TIME" as const,
      departmentId: "dept-sozai",
      positionId: "pos-chief",
      hireDate: new Date("2017-04-01"),
      monthlySalary: 275000,
      skills: ["調理師免許", "惣菜管理士"],
    },
  ];

  // --- パート ---
  const partTimeEmployees = [
    { id: "emp-p01", code: "P0001", lastName: "渡辺", firstName: "花子", dept: "dept-register", pos: "pos-leader", wage: 1200, maxH: 30, skills: ["レジ主任", "接客研修済"] },
    { id: "emp-p02", code: "P0002", lastName: "伊藤", firstName: "恵子", dept: "dept-register", pos: "pos-staff", wage: 1120, maxH: 25, skills: ["レジ", "接客"] },
    { id: "emp-p03", code: "P0003", lastName: "中村", firstName: "美智子", dept: "dept-register", pos: "pos-staff", wage: 1120, maxH: 20, skills: ["レジ", "接客"] },
    { id: "emp-p04", code: "P0004", lastName: "小林", firstName: "和子", dept: "dept-seika", pos: "pos-leader", wage: 1150, maxH: 30, skills: ["青果加工", "品出し"] },
    { id: "emp-p05", code: "P0005", lastName: "加藤", firstName: "良子", dept: "dept-seika", pos: "pos-staff", wage: 1100, maxH: 25, skills: ["青果加工", "品出し"] },
    { id: "emp-p06", code: "P0006", lastName: "吉田", firstName: "幸恵", dept: "dept-sozai", pos: "pos-staff", wage: 1150, maxH: 28, skills: ["調理補助", "パック詰め"] },
    { id: "emp-p07", code: "P0007", lastName: "山口", firstName: "節子", dept: "dept-sozai", pos: "pos-staff", wage: 1130, maxH: 25, skills: ["調理補助", "パック詰め"] },
    { id: "emp-p08", code: "P0008", lastName: "松本", firstName: "由紀", dept: "dept-bakery", pos: "pos-leader", wage: 1180, maxH: 30, skills: ["パン製造", "菓子製造"] },
    { id: "emp-p09", code: "P0009", lastName: "井上", firstName: "明美", dept: "dept-bakery", pos: "pos-staff", wage: 1120, maxH: 25, skills: ["パン製造"] },
    { id: "emp-p10", code: "P0010", lastName: "木村", firstName: "正子", dept: "dept-grocery", pos: "pos-leader", wage: 1150, maxH: 30, skills: ["品出し", "発注", "在庫管理"] },
    { id: "emp-p11", code: "P0011", lastName: "林", firstName: "千代", dept: "dept-grocery", pos: "pos-staff", wage: 1100, maxH: 25, skills: ["品出し"] },
    { id: "emp-p12", code: "P0012", lastName: "清水", firstName: "富子", dept: "dept-daily", pos: "pos-staff", wage: 1100, maxH: 20, skills: ["品出し", "鮮度チェック"] },
    { id: "emp-p13", code: "P0013", lastName: "阿部", firstName: "敏子", dept: "dept-sengyo", pos: "pos-staff", wage: 1180, maxH: 25, skills: ["パック詰め", "魚さばき補助"] },
    { id: "emp-p14", code: "P0014", lastName: "森", firstName: "洋子", dept: "dept-seiniku", pos: "pos-staff", wage: 1130, maxH: 25, skills: ["パック詰め", "計量"] },
    { id: "emp-p15", code: "P0015", lastName: "池田", firstName: "久美", dept: "dept-service", pos: "pos-staff", wage: 1120, maxH: 20, skills: ["接客", "ギフト対応", "宅配受付"] },
  ];

  // --- アルバイト ---
  const arbeitEmployees = [
    { id: "emp-a01", code: "A0001", lastName: "石田", firstName: "翔太", dept: "dept-register", wage: 1100, maxH: 20, skills: ["レジ"] },
    { id: "emp-a02", code: "A0002", lastName: "佐々木", firstName: "優", dept: "dept-register", wage: 1100, maxH: 15, skills: ["レジ"] },
    { id: "emp-a03", code: "A0003", lastName: "前田", firstName: "陸", dept: "dept-grocery", wage: 1080, maxH: 20, skills: ["品出し"] },
    { id: "emp-a04", code: "A0004", lastName: "藤田", firstName: "莉子", dept: "dept-grocery", wage: 1080, maxH: 15, skills: ["品出し"] },
    { id: "emp-a05", code: "A0005", lastName: "岡田", firstName: "大輝", dept: "dept-seika", wage: 1080, maxH: 20, skills: ["品出し"] },
    { id: "emp-a06", code: "A0006", lastName: "後藤", firstName: "美月", dept: "dept-sozai", wage: 1100, maxH: 18, skills: ["調理補助"] },
    { id: "emp-a07", code: "A0007", lastName: "長谷川", firstName: "颯", dept: "dept-register", wage: 1100, maxH: 20, skills: ["レジ", "品出し"] },
    { id: "emp-a08", code: "A0008", lastName: "村上", firstName: "結衣", dept: "dept-bakery", wage: 1100, maxH: 15, skills: ["パン製造補助"] },
    { id: "emp-a09", code: "A0009", lastName: "近藤", firstName: "蓮", dept: "dept-seiniku", wage: 1100, maxH: 18, skills: ["パック詰め"] },
    { id: "emp-a10", code: "A0010", lastName: "遠藤", firstName: "さくら", dept: "dept-daily", wage: 1080, maxH: 15, skills: ["品出し"] },
  ];

  // 正社員を投入
  for (const emp of fullTimeEmployees) {
    await prisma.employee.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: emp.code } },
      update: {},
      create: {
        id: emp.id,
        tenantId: tenant.id,
        code: emp.code,
        lastName: emp.lastName,
        firstName: emp.firstName,
        lastNameKana: emp.lastNameKana,
        firstNameKana: emp.firstNameKana,
        email: emp.email,
        phone: emp.phone,
        employmentType: emp.employmentType,
        storeId: storeId,
        departmentId: emp.departmentId,
        positionId: emp.positionId,
        hireDate: emp.hireDate,
        monthlySalary: emp.monthlySalary,
        skills: emp.skills,
      },
    });
  }
  console.log(`✅ 正社員: ${fullTimeEmployees.length}名`);

  // パートを投入
  for (const emp of partTimeEmployees) {
    await prisma.employee.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: emp.code } },
      update: {},
      create: {
        id: emp.id,
        tenantId: tenant.id,
        code: emp.code,
        lastName: emp.lastName,
        firstName: emp.firstName,
        employmentType: "PART_TIME",
        storeId: storeId,
        departmentId: emp.dept,
        positionId: emp.pos,
        hireDate: new Date("2020-04-01"),
        hourlyWage: emp.wage,
        maxHoursPerWeek: emp.maxH,
        skills: emp.skills,
      },
    });
  }
  console.log(`✅ パート: ${partTimeEmployees.length}名`);

  // アルバイトを投入
  for (const emp of arbeitEmployees) {
    await prisma.employee.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: emp.code } },
      update: {},
      create: {
        id: emp.id,
        tenantId: tenant.id,
        code: emp.code,
        lastName: emp.lastName,
        firstName: emp.firstName,
        employmentType: "ARBEIT",
        storeId: storeId,
        departmentId: emp.dept,
        positionId: "pos-staff",
        hireDate: new Date("2024-04-01"),
        hourlyWage: emp.wage,
        maxHoursPerWeek: emp.maxH,
        skills: emp.skills,
      },
    });
  }
  console.log(`✅ アルバイト: ${arbeitEmployees.length}名`);

  // =============================================================
  // 6. ユーザー（ログインアカウント）
  // =============================================================
  const users = [
    { id: "user-tanaka", employeeId: "emp-tanaka", email: "tanaka@marukawa.co.jp", role: "STORE_MANAGER" },
    { id: "user-suzuki", employeeId: "emp-suzuki", email: "suzuki@marukawa.co.jp", role: "ASSISTANT_MANAGER" },
    { id: "user-admin", employeeId: null, email: "admin@marukawa.co.jp", role: "TENANT_ADMIN" },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: u.email } },
      update: {},
      create: {
        id: u.id,
        tenantId: tenant.id,
        employeeId: u.employeeId,
        email: u.email,
        passwordHash: "$2b$10$dummyhashforseeding000000000000000000000000", // 仮
        role: u.role,
      },
    });
  }
  console.log(`✅ ユーザー: ${users.length}名`);

  // =============================================================
  // 7. 必要人員マスタ（本店の各部門）
  // =============================================================
  const timeSlots = ["09:00-12:00", "12:00-15:00", "15:00-18:00", "18:00-22:00"];

  // 部門ごとの基本配置人数 [minStaff, idealStaff] x 時間帯
  const staffingConfig: Record<string, number[][]> = {
    "dept-seika":    [[2,3], [2,3], [2,3], [1,2]],
    "dept-sengyo":   [[2,3], [1,2], [1,2], [1,1]],
    "dept-seiniku":  [[2,3], [1,2], [1,2], [1,1]],
    "dept-sozai":    [[3,4], [2,3], [2,3], [1,2]],
    "dept-bakery":   [[2,3], [1,2], [1,2], [1,1]],
    "dept-grocery":  [[2,3], [2,3], [2,3], [2,3]],
    "dept-daily":    [[1,2], [1,2], [1,2], [1,1]],
    "dept-register": [[3,4], [4,5], [3,4], [3,4]],
    "dept-service":  [[1,1], [1,2], [1,1], [1,1]],
  };

  let staffReqCount = 0;
  for (const [deptId, config] of Object.entries(staffingConfig)) {
    for (let dow = 0; dow <= 6; dow++) {
      // 土日は1.2倍の人員
      const isWeekend = dow === 0 || dow === 6;
      const multiplier = isWeekend ? 1.2 : 1.0;

      for (let ti = 0; ti < timeSlots.length; ti++) {
        const [minBase, idealBase] = config[ti];
        await prisma.staffingRequirement.create({
          data: {
            tenantId: tenant.id,
            storeId: storeId,
            departmentId: deptId,
            dayOfWeek: dow,
            timeSlot: timeSlots[ti],
            minStaff: Math.ceil(minBase * multiplier),
            idealStaff: Math.ceil(idealBase * multiplier),
          },
        });
        staffReqCount++;
      }
    }
  }
  console.log(`✅ 必要人員マスタ: ${staffReqCount}レコード`);

  // =============================================================
  // 7.5. 月間シフトパターン（パート・アルバイトの曜日別希望）
  // =============================================================
  const patternConfig: { empId: string; days: { dow: number; type: string; start?: string; end?: string }[] }[] = [
    // パート: 週3-5日の固定パターン
    { empId: "emp-p01", days: [{ dow: 1, type: "AVAILABLE", start: "09:00", end: "14:00" }, { dow: 2, type: "AVAILABLE", start: "09:00", end: "14:00" }, { dow: 3, type: "AVAILABLE", start: "09:00", end: "14:00" }, { dow: 4, type: "AVAILABLE", start: "09:00", end: "14:00" }, { dow: 5, type: "AVAILABLE", start: "09:00", end: "14:00" }] },
    { empId: "emp-p02", days: [{ dow: 1, type: "AVAILABLE", start: "09:00", end: "14:00" }, { dow: 3, type: "AVAILABLE", start: "09:00", end: "14:00" }, { dow: 5, type: "AVAILABLE", start: "09:00", end: "14:00" }] },
    { empId: "emp-p03", days: [{ dow: 2, type: "AVAILABLE", start: "10:00", end: "15:00" }, { dow: 4, type: "AVAILABLE", start: "10:00", end: "15:00" }, { dow: 6, type: "AVAILABLE", start: "10:00", end: "15:00" }] },
    { empId: "emp-p04", days: [{ dow: 1, type: "AVAILABLE", start: "08:00", end: "13:00" }, { dow: 2, type: "AVAILABLE", start: "08:00", end: "13:00" }, { dow: 3, type: "AVAILABLE", start: "08:00", end: "13:00" }, { dow: 4, type: "AVAILABLE", start: "08:00", end: "13:00" }] },
    { empId: "emp-p05", days: [{ dow: 1, type: "AVAILABLE", start: "09:00", end: "14:00" }, { dow: 3, type: "AVAILABLE", start: "09:00", end: "14:00" }, { dow: 5, type: "AVAILABLE", start: "09:00", end: "14:00" }, { dow: 6, type: "PREFERRED", start: "09:00", end: "13:00" }] },
    { empId: "emp-p06", days: [{ dow: 1, type: "AVAILABLE", start: "09:00", end: "17:00" }, { dow: 2, type: "AVAILABLE", start: "09:00", end: "17:00" }, { dow: 3, type: "AVAILABLE", start: "09:00", end: "17:00" }, { dow: 4, type: "AVAILABLE", start: "09:00", end: "17:00" }, { dow: 5, type: "AVAILABLE", start: "09:00", end: "17:00" }] },
    { empId: "emp-p07", days: [{ dow: 2, type: "AVAILABLE", start: "09:00", end: "14:00" }, { dow: 3, type: "AVAILABLE", start: "09:00", end: "14:00" }, { dow: 5, type: "AVAILABLE", start: "09:00", end: "14:00" }] },
    { empId: "emp-p08", days: [{ dow: 1, type: "AVAILABLE", start: "06:00", end: "12:00" }, { dow: 2, type: "AVAILABLE", start: "06:00", end: "12:00" }, { dow: 3, type: "AVAILABLE", start: "06:00", end: "12:00" }, { dow: 4, type: "AVAILABLE", start: "06:00", end: "12:00" }, { dow: 5, type: "AVAILABLE", start: "06:00", end: "12:00" }] },
    { empId: "emp-p09", days: [{ dow: 1, type: "AVAILABLE", start: "09:00", end: "14:00" }, { dow: 3, type: "AVAILABLE", start: "09:00", end: "14:00" }, { dow: 6, type: "AVAILABLE", start: "09:00", end: "14:00" }] },
    { empId: "emp-p10", days: [{ dow: 1, type: "AVAILABLE", start: "09:00", end: "17:00" }, { dow: 2, type: "AVAILABLE", start: "09:00", end: "17:00" }, { dow: 3, type: "AVAILABLE", start: "09:00", end: "17:00" }, { dow: 4, type: "AVAILABLE", start: "09:00", end: "17:00" }, { dow: 5, type: "AVAILABLE", start: "09:00", end: "17:00" }] },
    { empId: "emp-p11", days: [{ dow: 1, type: "AVAILABLE", start: "13:00", end: "18:00" }, { dow: 3, type: "AVAILABLE", start: "13:00", end: "18:00" }, { dow: 5, type: "AVAILABLE", start: "13:00", end: "18:00" }] },
    { empId: "emp-p12", days: [{ dow: 2, type: "AVAILABLE", start: "09:00", end: "13:00" }, { dow: 4, type: "AVAILABLE", start: "09:00", end: "13:00" }] },
    { empId: "emp-p13", days: [{ dow: 1, type: "AVAILABLE", start: "08:00", end: "13:00" }, { dow: 2, type: "AVAILABLE", start: "08:00", end: "13:00" }, { dow: 4, type: "AVAILABLE", start: "08:00", end: "13:00" }, { dow: 5, type: "AVAILABLE", start: "08:00", end: "13:00" }] },
    { empId: "emp-p14", days: [{ dow: 1, type: "AVAILABLE", start: "09:00", end: "14:00" }, { dow: 3, type: "AVAILABLE", start: "09:00", end: "14:00" }, { dow: 5, type: "AVAILABLE", start: "09:00", end: "14:00" }] },
    { empId: "emp-p15", days: [{ dow: 2, type: "AVAILABLE", start: "10:00", end: "15:00" }, { dow: 4, type: "AVAILABLE", start: "10:00", end: "15:00" }, { dow: 6, type: "AVAILABLE", start: "10:00", end: "15:00" }] },
    // アルバイト: 週2-3日、夕方中心
    { empId: "emp-a01", days: [{ dow: 2, type: "AVAILABLE", start: "17:00", end: "22:00" }, { dow: 4, type: "AVAILABLE", start: "17:00", end: "22:00" }, { dow: 6, type: "AVAILABLE", start: "14:00", end: "22:00" }] },
    { empId: "emp-a02", days: [{ dow: 1, type: "AVAILABLE", start: "17:00", end: "22:00" }, { dow: 3, type: "AVAILABLE", start: "17:00", end: "22:00" }] },
    { empId: "emp-a03", days: [{ dow: 2, type: "AVAILABLE", start: "17:00", end: "22:00" }, { dow: 5, type: "AVAILABLE", start: "17:00", end: "22:00" }, { dow: 6, type: "AVAILABLE", start: "13:00", end: "22:00" }] },
    { empId: "emp-a04", days: [{ dow: 1, type: "AVAILABLE", start: "17:00", end: "21:00" }, { dow: 4, type: "AVAILABLE", start: "17:00", end: "21:00" }] },
    { empId: "emp-a05", days: [{ dow: 3, type: "AVAILABLE", start: "17:00", end: "22:00" }, { dow: 5, type: "AVAILABLE", start: "17:00", end: "22:00" }, { dow: 0, type: "AVAILABLE", start: "09:00", end: "17:00" }] },
    { empId: "emp-a06", days: [{ dow: 2, type: "AVAILABLE", start: "14:00", end: "19:00" }, { dow: 4, type: "AVAILABLE", start: "14:00", end: "19:00" }, { dow: 6, type: "AVAILABLE", start: "09:00", end: "17:00" }] },
    { empId: "emp-a07", days: [{ dow: 1, type: "AVAILABLE", start: "17:00", end: "22:00" }, { dow: 3, type: "AVAILABLE", start: "17:00", end: "22:00" }, { dow: 5, type: "AVAILABLE", start: "17:00", end: "22:00" }] },
    { empId: "emp-a08", days: [{ dow: 6, type: "AVAILABLE", start: "09:00", end: "15:00" }, { dow: 0, type: "AVAILABLE", start: "09:00", end: "15:00" }] },
    { empId: "emp-a09", days: [{ dow: 2, type: "AVAILABLE", start: "17:00", end: "22:00" }, { dow: 4, type: "AVAILABLE", start: "17:00", end: "22:00" }] },
    { empId: "emp-a10", days: [{ dow: 1, type: "AVAILABLE", start: "17:00", end: "21:00" }, { dow: 3, type: "AVAILABLE", start: "17:00", end: "21:00" }, { dow: 5, type: "AVAILABLE", start: "17:00", end: "21:00" }] },
  ];

  let patternCount = 0;
  for (const cfg of patternConfig) {
    for (const day of cfg.days) {
      await prisma.shiftPattern.upsert({
        where: {
          tenantId_employeeId_dayOfWeek: {
            tenantId: tenant.id,
            employeeId: cfg.empId,
            dayOfWeek: day.dow,
          },
        },
        update: {},
        create: {
          tenantId: tenant.id,
          employeeId: cfg.empId,
          storeId: storeId,
          dayOfWeek: day.dow,
          requestType: day.type,
          startTime: day.start || null,
          endTime: day.end || null,
        },
      });
      patternCount++;
    }
  }
  console.log(`✅ 月間シフトパターン: ${patternCount}件`);

  // =============================================================
  // 8. シフト希望（来週分のサンプルデータ）
  // =============================================================
  // 来週の月曜日を取得
  const nextMonday = new Date();
  nextMonday.setDate(nextMonday.getDate() + ((8 - nextMonday.getDay()) % 7 || 7));
  nextMonday.setHours(0, 0, 0, 0);

  // パート・アルバイトのシフト希望を投入
  const allPAEmployees = [...partTimeEmployees, ...arbeitEmployees];
  let requestCount = 0;

  for (const emp of allPAEmployees) {
    for (let d = 0; d < 7; d++) {
      const targetDate = new Date(nextMonday);
      targetDate.setDate(targetDate.getDate() + d);

      // ランダムに出勤可/不可/希望を割り当て
      const rand = Math.random();
      let requestType: string;
      let startTime: string | null = null;
      let endTime: string | null = null;

      if (rand < 0.15) {
        requestType = "UNAVAILABLE"; // 15%は出勤不可
      } else if (rand < 0.35) {
        requestType = "PREFERRED"; // 20%は時間帯希望あり
        // 午前 or 午後の希望
        if (Math.random() < 0.5) {
          startTime = "09:00";
          endTime = "14:00";
        } else {
          startTime = "14:00";
          endTime = "22:00";
        }
      } else {
        requestType = "AVAILABLE"; // 65%は出勤可
      }

      await prisma.shiftRequest.upsert({
        where: {
          tenantId_employeeId_targetDate: {
            tenantId: tenant.id,
            employeeId: emp.id,
            targetDate: targetDate,
          },
        },
        update: {},
        create: {
          tenantId: tenant.id,
          employeeId: emp.id,
          storeId: storeId,
          targetDate: targetDate,
          requestType: requestType,
          startTime: startTime,
          endTime: endTime,
          note: requestType === "UNAVAILABLE" ? "私用のためお休み希望" : null,
        },
      });
      requestCount++;
    }
  }
  console.log(`✅ シフト希望: ${requestCount}件`);

  // =============================================================
  // 9. シフト（今週分 = サンプルの確定済シフト）
  // =============================================================
  // 今週の月曜日
  const thisMonday = new Date();
  thisMonday.setDate(thisMonday.getDate() - ((thisMonday.getDay() + 6) % 7));
  thisMonday.setHours(0, 0, 0, 0);

  // シフトパターン定義
  const shiftPatterns = {
    early:    { start: "07:00", end: "12:00", breakMin: 0 },   // 早番
    morning:  { start: "09:00", end: "14:00", breakMin: 0 },   // 午前
    day:      { start: "09:00", end: "17:00", breakMin: 60 },   // 日勤
    midday:   { start: "10:00", end: "18:00", breakMin: 60 },   // 中番
    afternoon:{ start: "13:00", end: "18:00", breakMin: 0 },   // 午後
    late:     { start: "14:00", end: "22:00", breakMin: 60 },   // 遅番
    evening:  { start: "17:00", end: "22:00", breakMin: 0 },   // 夕番
    full:     { start: "08:00", end: "17:00", breakMin: 60 },   // フルタイム
  };

  // 正社員は月〜金フル出勤
  let shiftCount = 0;
  for (const emp of fullTimeEmployees) {
    for (let d = 0; d < 5; d++) {
      const shiftDate = new Date(thisMonday);
      shiftDate.setDate(shiftDate.getDate() + d);

      await prisma.shift.create({
        data: {
          tenantId: tenant.id,
          employeeId: emp.id,
          storeId: storeId,
          departmentId: emp.departmentId,
          shiftDate: shiftDate,
          startTime: shiftPatterns.full.start,
          endTime: shiftPatterns.full.end,
          breakMinutes: shiftPatterns.full.breakMin,
          status: "CONFIRMED",
          laborCost: emp.monthlySalary ? Math.round(emp.monthlySalary / 21) : null,
          approvedBy: "user-tanaka",
          approvedAt: new Date(),
        },
      });
      shiftCount++;
    }
  }

  // パートは週3〜5日、ランダムなパターンで
  const partPatternOptions = ["morning", "day", "afternoon", "late"] as const;
  for (const emp of partTimeEmployees) {
    const workDays = Math.floor(Math.random() * 3) + 3; // 3〜5日
    const dayOffsets = [0, 1, 2, 3, 4, 5, 6]
      .sort(() => Math.random() - 0.5)
      .slice(0, workDays);

    for (const d of dayOffsets) {
      const shiftDate = new Date(thisMonday);
      shiftDate.setDate(shiftDate.getDate() + d);

      const pattern = shiftPatterns[
        partPatternOptions[Math.floor(Math.random() * partPatternOptions.length)]
      ];

      const [sH, sM] = pattern.start.split(":").map(Number);
      const [eH, eM] = pattern.end.split(":").map(Number);
      const workMinutes = eH * 60 + eM - (sH * 60 + sM) - pattern.breakMin;
      const laborCost = Math.round((emp.wage * workMinutes) / 60);

      await prisma.shift.create({
        data: {
          tenantId: tenant.id,
          employeeId: emp.id,
          storeId: storeId,
          departmentId: emp.dept,
          shiftDate: shiftDate,
          startTime: pattern.start,
          endTime: pattern.end,
          breakMinutes: pattern.breakMin,
          status: d < 3 ? "CONFIRMED" : "PUBLISHED",
          laborCost: laborCost,
          approvedBy: d < 3 ? "user-tanaka" : null,
          approvedAt: d < 3 ? new Date() : null,
        },
      });
      shiftCount++;
    }
  }

  // アルバイトは週2〜3日、夕方中心
  const arbeitPatternOptions = ["afternoon", "evening", "late"] as const;
  for (const emp of arbeitEmployees) {
    const workDays = Math.floor(Math.random() * 2) + 2; // 2〜3日
    const dayOffsets = [0, 1, 2, 3, 4, 5, 6]
      .sort(() => Math.random() - 0.5)
      .slice(0, workDays);

    for (const d of dayOffsets) {
      const shiftDate = new Date(thisMonday);
      shiftDate.setDate(shiftDate.getDate() + d);

      const pattern = shiftPatterns[
        arbeitPatternOptions[Math.floor(Math.random() * arbeitPatternOptions.length)]
      ];

      const [sH, sM] = pattern.start.split(":").map(Number);
      const [eH, eM] = pattern.end.split(":").map(Number);
      const workMinutes = eH * 60 + eM - (sH * 60 + sM) - pattern.breakMin;
      const laborCost = Math.round((emp.wage * workMinutes) / 60);

      await prisma.shift.create({
        data: {
          tenantId: tenant.id,
          employeeId: emp.id,
          storeId: storeId,
          departmentId: emp.dept,
          shiftDate: shiftDate,
          startTime: pattern.start,
          endTime: pattern.end,
          breakMinutes: pattern.breakMin,
          status: "DRAFT",
          laborCost: laborCost,
        },
      });
      shiftCount++;
    }
  }
  console.log(`✅ シフト: ${shiftCount}件`);

  // =============================================================
  // 10. 勤怠レコード（過去3ヶ月分 = パターン分析に十分なデータ量）
  // =============================================================
  let attendanceCount = 0;

  // パート・アルバイトは月間パターン設定に基づいて出勤データを生成
  const patternLookup = new Map<string, Map<number, { type: string; start?: string; end?: string }>>();
  for (const cfg of patternConfig) {
    const dayMap = new Map<number, { type: string; start?: string; end?: string }>();
    for (const day of cfg.days) {
      dayMap.set(day.dow, { type: day.type, start: day.start, end: day.end });
    }
    patternLookup.set(cfg.empId, dayMap);
  }

  // 過去12週分（約3ヶ月）のデータを生成
  for (let weekOffset = 1; weekOffset <= 12; weekOffset++) {
    const weekMonday = new Date(thisMonday);
    weekMonday.setDate(weekMonday.getDate() - 7 * weekOffset);

    // 正社員: 月〜金
    for (const emp of fullTimeEmployees) {
      for (let d = 0; d < 5; d++) {
        const attDate = new Date(weekMonday);
        attDate.setDate(attDate.getDate() + d);

        // 5%の確率で欠勤（休暇扱い）
        if (Math.random() < 0.05) continue;

        const pat = shiftPatterns.full;
        const [sH, sM] = pat.start.split(":").map(Number);
        const [eH, eM] = pat.end.split(":").map(Number);
        const scheduledMinutes = eH * 60 + eM - (sH * 60 + sM) - pat.breakMin;

        const isLate = Math.random() < 0.05;
        const lateMin = isLate ? Math.floor(Math.random() * 30) + 5 : 0;
        const isEarly = Math.random() < 0.03;
        const earlyMin = isEarly ? Math.floor(Math.random() * 30) + 10 : 0;
        const hasOvertime = Math.random() < 0.2;
        const overtimeMin = hasOvertime ? Math.floor(Math.random() * 90) + 30 : 0;
        const actualWorkMin = scheduledMinutes - lateMin - earlyMin + overtimeMin;
        const computedOvertime = Math.max(0, actualWorkMin - 480);

        const clockInDate = new Date(attDate);
        clockInDate.setHours(sH, sM + lateMin, 0, 0);
        const clockOutDate = new Date(attDate);
        clockOutDate.setHours(eH, eM - earlyMin + (hasOvertime ? Math.floor(overtimeMin / 60) : 0),
          hasOvertime ? overtimeMin % 60 : 0, 0);

        let status = "CLOCKED_OUT";
        if (isLate) status = "LATE";
        if (isEarly) status = "EARLY_LEAVE";

        await prisma.attendanceRecord.upsert({
          where: {
            tenantId_employeeId_attendanceDate: {
              tenantId: tenant.id, employeeId: emp.id, attendanceDate: attDate,
            },
          },
          update: {},
          create: {
            tenantId: tenant.id, employeeId: emp.id, storeId: storeId,
            attendanceDate: attDate, clockIn: clockInDate, clockOut: clockOutDate,
            actualBreakMinutes: pat.breakMin, totalWorkMinutes: actualWorkMin,
            overtimeMinutes: computedOvertime, lateMinutes: lateMin,
            earlyLeaveMinutes: earlyMin, status, laborCost: null,
          },
        });
        attendanceCount++;
      }
    }

    // パート・アルバイト: パターンに基づく出勤
    for (const emp of [...partTimeEmployees, ...arbeitEmployees]) {
      const patterns = patternLookup.get(emp.id);
      if (!patterns) continue;

      for (let d = 0; d < 7; d++) {
        const attDate = new Date(weekMonday);
        attDate.setDate(attDate.getDate() + d);
        const dow = attDate.getDay();

        const pattern = patterns.get(dow);
        if (!pattern || pattern.type === "UNAVAILABLE") continue;

        // 10%の確率で休む（シフトパターンがある日でも）
        if (Math.random() < 0.10) continue;

        const startTime = pattern.start || "09:00";
        const endTime = pattern.end || "14:00";
        const [sH, sM] = startTime.split(":").map(Number);
        const [eH, eM] = endTime.split(":").map(Number);
        const workMin = eH * 60 + eM - (sH * 60 + sM);
        const breakMin = workMin > 360 ? 60 : 0;
        const actualWorkMin = workMin - breakMin;

        // 出勤時刻にランダムなゆらぎ（±5分）
        const jitter = Math.floor(Math.random() * 11) - 5;
        const clockInDate = new Date(attDate);
        clockInDate.setHours(sH, sM + jitter, 0, 0);
        const clockOutDate = new Date(attDate);
        clockOutDate.setHours(eH, eM + Math.floor(Math.random() * 6) - 2, 0, 0);

        const laborCost = emp.wage ? Math.round((emp.wage * actualWorkMin) / 60) : null;

        await prisma.attendanceRecord.upsert({
          where: {
            tenantId_employeeId_attendanceDate: {
              tenantId: tenant.id, employeeId: emp.id, attendanceDate: attDate,
            },
          },
          update: {},
          create: {
            tenantId: tenant.id, employeeId: emp.id, storeId: storeId,
            attendanceDate: attDate, clockIn: clockInDate, clockOut: clockOutDate,
            actualBreakMinutes: breakMin, totalWorkMinutes: actualWorkMin,
            overtimeMinutes: 0, lateMinutes: Math.max(0, jitter),
            earlyLeaveMinutes: 0, status: "CLOCKED_OUT", laborCost,
          },
        });
        attendanceCount++;
      }
    }
  }
  console.log(`✅ 勤怠レコード: ${attendanceCount}件（過去3ヶ月分）`);

  // =============================================================
  // 11. 休暇申請（サンプル）
  // =============================================================
  const leaveRequests = [
    {
      employeeId: "emp-p06",
      leaveType: "PAID_LEAVE",
      startDate: new Date(nextMonday.getTime() + 2 * 86400000),
      endDate: new Date(nextMonday.getTime() + 2 * 86400000),
      reason: "家庭の用事",
      status: "APPROVED",
    },
    {
      employeeId: "emp-p02",
      leaveType: "SICK_LEAVE",
      startDate: new Date(nextMonday.getTime() + 0 * 86400000),
      endDate: new Date(nextMonday.getTime() + 1 * 86400000),
      reason: "体調不良",
      status: "APPROVED",
    },
    {
      employeeId: "emp-p10",
      leaveType: "PAID_LEAVE",
      startDate: new Date(nextMonday.getTime() + 4 * 86400000),
      endDate: new Date(nextMonday.getTime() + 4 * 86400000),
      reason: "通院のため",
      status: "PENDING",
    },
    {
      employeeId: "emp-sato-m",
      leaveType: "SPECIAL_LEAVE",
      startDate: new Date(nextMonday.getTime() + 7 * 86400000),
      endDate: new Date(nextMonday.getTime() + 9 * 86400000),
      reason: "慶弔休暇",
      status: "PENDING",
    },
    {
      employeeId: "emp-a03",
      leaveType: "ABSENCE",
      startDate: new Date(nextMonday.getTime() + 3 * 86400000),
      endDate: new Date(nextMonday.getTime() + 3 * 86400000),
      reason: "学校の試験",
      status: "REJECTED",
    },
  ];

  for (const lr of leaveRequests) {
    await prisma.leaveRequest.create({
      data: {
        tenantId: tenant.id,
        ...lr,
      },
    });
  }
  console.log(`✅ 休暇申請: ${leaveRequests.length}件`);

  // =============================================================
  // 12. 就業規則マスタ（雇用区分別の労働条件）
  // =============================================================
  const employmentRulesData = [
    {
      employmentType: "FULL_TIME",
      name: "正社員就業規則",
      monthlyWorkDays: 21,
      weeklyWorkDays: 5,
      dailyWorkHours: 8.0,
      weeklyMaxHours: 40.0,
      monthlyMaxHours: 176.0,
      maxConsecutiveDays: 6,
      minBreakMinutes: 60,
      overtimeThresholdDaily: 8.0,
      overtimeThresholdWeekly: 40.0,
      nightShiftStartTime: "22:00",
      nightShiftEndTime: "05:00",
      nightShiftPremium: 0.25,
    },
    {
      employmentType: "PART_TIME",
      name: "パートタイマー規則",
      monthlyWorkDays: 16,
      weeklyWorkDays: 4,
      dailyWorkHours: 5.0,
      weeklyMaxHours: 30.0,
      monthlyMaxHours: 120.0,
      maxConsecutiveDays: 5,
      minBreakMinutes: 0,
      overtimeThresholdDaily: 8.0,
      overtimeThresholdWeekly: 40.0,
      nightShiftStartTime: "22:00",
      nightShiftEndTime: "05:00",
      nightShiftPremium: 0.25,
    },
    {
      employmentType: "ARBEIT",
      name: "アルバイト規則",
      monthlyWorkDays: 12,
      weeklyWorkDays: 3,
      dailyWorkHours: 5.0,
      weeklyMaxHours: 20.0,
      monthlyMaxHours: 80.0,
      maxConsecutiveDays: 5,
      minBreakMinutes: 0,
      overtimeThresholdDaily: 8.0,
      overtimeThresholdWeekly: 40.0,
      nightShiftStartTime: "22:00",
      nightShiftEndTime: "05:00",
      nightShiftPremium: 0.25,
    },
    {
      employmentType: "CONTRACT",
      name: "契約社員規則",
      monthlyWorkDays: 20,
      weeklyWorkDays: 5,
      dailyWorkHours: 8.0,
      weeklyMaxHours: 40.0,
      monthlyMaxHours: 176.0,
      maxConsecutiveDays: 6,
      minBreakMinutes: 60,
      overtimeThresholdDaily: 8.0,
      overtimeThresholdWeekly: 40.0,
      nightShiftStartTime: "22:00",
      nightShiftEndTime: "05:00",
      nightShiftPremium: 0.25,
    },
  ];

  for (const rule of employmentRulesData) {
    await prisma.employmentRule.upsert({
      where: {
        tenantId_employmentType: {
          tenantId: tenant.id,
          employmentType: rule.employmentType,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        ...rule,
      },
    });
  }
  console.log(`✅ 就業規則: ${employmentRulesData.length}区分`);

  // =============================================================
  // 13. 会社カレンダー（2026年の休業日・繁忙日）
  // =============================================================
  const calendarEntries = [
    // 年末年始
    { date: "2026-01-01", type: "HOLIDAY", name: "元旦（全店休業）" },
    { date: "2026-01-02", type: "SPECIAL_OPEN", name: "初売り" },
    { date: "2026-01-03", type: "BUSY_DAY", name: "初売り2日目" },
    // お盆
    { date: "2026-08-13", type: "BUSY_DAY", name: "お盆商戦" },
    { date: "2026-08-14", type: "BUSY_DAY", name: "お盆商戦" },
    { date: "2026-08-15", type: "BUSY_DAY", name: "お盆商戦" },
    // 棚卸
    { date: "2026-03-31", type: "INVENTORY", name: "期末棚卸" },
    { date: "2026-09-30", type: "INVENTORY", name: "中間棚卸" },
    // クリスマス・年末
    { date: "2026-12-24", type: "BUSY_DAY", name: "クリスマスイブ" },
    { date: "2026-12-25", type: "BUSY_DAY", name: "クリスマス" },
    { date: "2026-12-28", type: "BUSY_DAY", name: "年末商戦" },
    { date: "2026-12-29", type: "BUSY_DAY", name: "年末商戦" },
    { date: "2026-12-30", type: "BUSY_DAY", name: "年末商戦" },
    { date: "2026-12-31", type: "REDUCED_HOURS", name: "大晦日（短縮営業）" },
    // GW
    { date: "2026-05-03", type: "BUSY_DAY", name: "憲法記念日（繁忙）" },
    { date: "2026-05-04", type: "BUSY_DAY", name: "みどりの日（繁忙）" },
    { date: "2026-05-05", type: "BUSY_DAY", name: "こどもの日（繁忙）" },
  ];

  for (const entry of calendarEntries) {
    await prisma.companyCalendar.create({
      data: {
        tenantId: tenant.id,
        storeId: null,
        calendarDate: new Date(entry.date),
        dayType: entry.type,
        name: entry.name,
      },
    });
  }
  console.log(`✅ 会社カレンダー: ${calendarEntries.length}件`);

  // =============================================================
  // 14. 部門別必須スキル定義
  // =============================================================
  const deptSkillData = [
    // 鮮魚 — 包丁技術が必須（刺身を作れない人は配置不可）
    { deptId: "dept-sengyo", skillName: "包丁技術", isRequired: true, description: "魚をさばく・刺身を作る基本技術" },
    { deptId: "dept-sengyo", skillName: "刺身盛付", isRequired: false, description: "刺身の盛り付け技術" },
    { deptId: "dept-sengyo", skillName: "鮮度管理", isRequired: true, description: "魚の鮮度判定・管理" },
    // 精肉 — 包丁・スライサーが必須
    { deptId: "dept-seiniku", skillName: "包丁技術", isRequired: true, description: "肉のカット・加工" },
    { deptId: "dept-seiniku", skillName: "スライサー操作", isRequired: true, description: "スライサー機械の操作" },
    { deptId: "dept-seiniku", skillName: "鮮度管理", isRequired: false, description: "肉の鮮度管理" },
    // 惣菜 — 調理技術が必須
    { deptId: "dept-sozai", skillName: "調理技術", isRequired: true, description: "揚げ物・煮物・焼き物の基本調理" },
    { deptId: "dept-sozai", skillName: "衛生管理", isRequired: true, description: "食品衛生管理知識" },
    { deptId: "dept-sozai", skillName: "パック詰め", isRequired: false, description: "商品のパック詰め" },
    // ベーカリー — パン製造技術が必須
    { deptId: "dept-bakery", skillName: "パン製造", isRequired: true, description: "パン生地の製造・焼成" },
    { deptId: "dept-bakery", skillName: "オーブン操作", isRequired: false, description: "業務用オーブンの操作" },
    // レジ — レジ操作が必須
    { deptId: "dept-register", skillName: "レジ操作", isRequired: true, description: "POSレジの操作・精算" },
    { deptId: "dept-register", skillName: "接客", isRequired: false, description: "接客マナー" },
    // 青果
    { deptId: "dept-seika", skillName: "青果加工", isRequired: true, description: "野菜・果物のカット加工" },
    { deptId: "dept-seika", skillName: "品出し", isRequired: false, description: "商品の補充・陳列" },
    // グロサリー
    { deptId: "dept-grocery", skillName: "品出し", isRequired: true, description: "商品の補充・陳列" },
    { deptId: "dept-grocery", skillName: "発注", isRequired: false, description: "商品の発注業務" },
  ];

  for (const sk of deptSkillData) {
    await prisma.departmentSkillRequirement.upsert({
      where: {
        tenantId_departmentId_skillName: {
          tenantId: tenant.id,
          departmentId: sk.deptId,
          skillName: sk.skillName,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        departmentId: sk.deptId,
        skillName: sk.skillName,
        isRequired: sk.isRequired,
        description: sk.description,
      },
    });
  }
  console.log(`✅ 部門スキル要件: ${deptSkillData.length}件`);

  // =============================================================
  // 15. 本部応援サンプルデータ
  // =============================================================
  const hqSupportData = [
    {
      storeId: storeId,
      departmentId: "dept-sengyo",
      supportDate: new Date(nextMonday.getTime() + 2 * 86400000), // 水曜
      staffName: "本部 中島",
      staffCode: "H0001",
      startTime: "08:00",
      endTime: "17:00",
      breakMinutes: 60,
      skills: ["包丁技術", "刺身盛付", "鮮度管理", "衛生管理者"],
      note: "鮮魚チーフ休暇対応",
      status: "CONFIRMED",
    },
    {
      storeId: storeId,
      departmentId: null,
      supportDate: new Date(nextMonday.getTime() + 4 * 86400000), // 金曜
      staffName: "本部 田村",
      staffCode: "H0002",
      startTime: "09:00",
      endTime: "18:00",
      breakMinutes: 60,
      skills: ["店舗運営", "レジ操作", "接客"],
      note: "金曜繁忙日応援",
      status: "REQUESTED",
    },
  ];

  for (const hs of hqSupportData) {
    await prisma.headquartersSupport.create({
      data: {
        tenantId: tenant.id,
        ...hs,
      },
    });
  }
  console.log(`✅ 本部応援: ${hqSupportData.length}件`);

  // =============================================================
  console.log("\n🎉 シードデータ投入完了！");
  console.log("---");
  console.log("テナント: 株式会社マルカワ (subdomain: marukawa)");
  console.log(`店舗: ${stores.length}店舗（本店・駅前店）`);
  console.log(`部門: ${departments.length}部門`);
  console.log(`従業員: ${fullTimeEmployees.length + partTimeEmployees.length + arbeitEmployees.length}名`);
  console.log(`  正社員: ${fullTimeEmployees.length}名`);
  console.log(`  パート: ${partTimeEmployees.length}名`);
  console.log(`  アルバイト: ${arbeitEmployees.length}名`);
  console.log(`必要人員マスタ: ${staffReqCount}レコード`);
  console.log(`シフト希望: ${requestCount}件（来週分）`);
  console.log(`シフト: ${shiftCount}件（今週分）`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("❌ シードエラー:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
