// 診断用API: シフト生成に関わるデータの整合性チェック
import { getTenantDb } from "@/lib/tenant";
import { apiSuccess } from "@/lib/api-response";

export async function GET() {
  const { db } = await getTenantDb();

  // 1. 店舗
  const stores = await db.store.findMany({
    select: { id: true, code: true, name: true, isActive: true },
  });

  // 2. 従業員（サンプル）
  const empCount = await db.employee.count();
  const empByType = await db.employee.groupBy({
    by: ["employmentType"],
    _count: true,
  });
  const empSample = await db.employee.findMany({
    take: 3,
    select: { id: true, storeId: true, departmentId: true, employmentType: true, isActive: true },
  });

  // 3. 部門
  const departments = await db.department.findMany({
    select: { id: true, code: true, name: true },
    take: 15,
  });

  // 4. 必要人員
  const staffReqCount = await db.staffingRequirement.count();
  const staffReqSample = await db.staffingRequirement.findMany({
    take: 3,
    select: { storeId: true, departmentId: true, dayOfWeek: true, timeSlot: true },
  });
  const staffReqDepts = await db.staffingRequirement.groupBy({
    by: ["departmentId"],
    _count: true,
  });

  // 5. 勤怠プロファイル
  const profileCount = await db.attendanceProfile.count();

  // 6. シフト希望
  const shiftReqCount = await db.shiftRequest.count();

  // 7. ID整合性チェック
  const storeIds = new Set(stores.map((s: { id: string }) => s.id));
  const deptIds = new Set(departments.map((d: { id: string }) => d.id));
  const empStoreIds = new Set(empSample.map((e: { storeId: string }) => e.storeId));
  const empDeptIds = new Set(empSample.map((e: { departmentId: string | null }) => e.departmentId).filter(Boolean));
  const staffReqStoreIds = new Set(staffReqSample.map((s: { storeId: string }) => s.storeId));
  const staffReqDeptIds = new Set(staffReqDepts.map((s: { departmentId: string }) => s.departmentId));

  return apiSuccess({
    stores,
    employees: {
      total: empCount,
      byType: empByType,
      sampleStoreIds: [...empStoreIds],
      sampleDeptIds: [...empDeptIds],
      sample: empSample,
    },
    departments: departments,
    staffingRequirements: {
      total: staffReqCount,
      sampleStoreIds: [...staffReqStoreIds],
      deptIds: [...staffReqDeptIds],
      byDept: staffReqDepts,
      sample: staffReqSample,
    },
    profiles: { total: profileCount },
    shiftRequests: { total: shiftReqCount },
    idConsistency: {
      storeIdsMatch: [...empStoreIds].every((id) => storeIds.has(id as string)),
      empDeptIdsInDepartments: [...empDeptIds].every((id) => deptIds.has(id as string)),
      staffReqDeptIdsInDepartments: [...staffReqDeptIds].every((id) => deptIds.has(id as string)),
      staffReqStoreIdsInStores: [...staffReqStoreIds].every((id) => storeIds.has(id as string)),
    },
  });
}
