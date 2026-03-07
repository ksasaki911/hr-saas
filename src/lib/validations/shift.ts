// =============================================================
// シフト管理バリデーション（Zod）
// =============================================================
import { z } from "zod";

// 時刻文字列バリデーション（"HH:MM"形式）
const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, {
  message: "時刻はHH:MM形式で入力してください",
});

// シフト作成・更新
export const shiftCreateSchema = z.object({
  employeeId: z.string().min(1),
  storeId: z.string().min(1),
  departmentId: z.string().min(1).optional(),
  shiftDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: timeString,
  endTime: timeString,
  breakMinutes: z.number().int().min(0).max(480).default(60),
  isHelpShift: z.boolean().default(false),
  note: z.string().max(500).optional(),
});

export const shiftUpdateSchema = shiftCreateSchema.partial();

// シフト希望
export const shiftRequestCreateSchema = z.object({
  employeeId: z.string().min(1),
  storeId: z.string().min(1),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  requestType: z.enum(["AVAILABLE", "UNAVAILABLE", "PREFERRED"]),
  startTime: timeString.optional(),
  endTime: timeString.optional(),
  note: z.string().max(500).optional(),
});

// 一括シフト作成（週間シフト投入用）
export const shiftBulkCreateSchema = z.object({
  storeId: z.string().min(1),
  weekStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  shifts: z.array(shiftCreateSchema).min(1).max(500),
});

// 必要人員マスタ
export const staffingRequirementSchema = z.object({
  storeId: z.string().min(1),
  departmentId: z.string().min(1),
  dayOfWeek: z.number().int().min(0).max(6),
  timeSlot: z.string(),
  minStaff: z.number().int().min(0),
  idealStaff: z.number().int().min(0),
  isHoliday: z.boolean().default(false),
});

// シフト検索パラメータ
export const shiftQuerySchema = z.object({
  storeId: z.string().min(1).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  departmentId: z.string().min(1).optional(),
  employeeId: z.string().min(1).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "CONFIRMED", "CHANGED"]).optional(),
});

// シフト自動生成
export const shiftGenerateSchema = z.object({
  storeId: z.string().min(1),
  weekStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  departmentFilter: z.array(z.string().min(1)).optional(),
  autoAssignFullTime: z.boolean().default(true),
  priorityStrategy: z.enum(["cost", "balanced", "profile"]).default("cost"),
  useAttendanceProfile: z.boolean().default(false),
  dryRun: z.boolean().default(false),
});

export type ShiftCreate = z.infer<typeof shiftCreateSchema>;
export type ShiftUpdate = z.infer<typeof shiftUpdateSchema>;
export type ShiftRequestCreate = z.infer<typeof shiftRequestCreateSchema>;
export type ShiftBulkCreate = z.infer<typeof shiftBulkCreateSchema>;
export type StaffingRequirement = z.infer<typeof staffingRequirementSchema>;
export type ShiftQuery = z.infer<typeof shiftQuerySchema>;
export type ShiftGenerate = z.infer<typeof shiftGenerateSchema>;
