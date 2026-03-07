// =============================================================
// 勤怠管理バリデーション（Zod）
// =============================================================
import { z } from "zod";

const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, {
  message: "時刻はHH:MM形式で入力してください",
});

// 出勤打刻
export const attendanceClockInSchema = z.object({
  employeeId: z.string().min(1),
  storeId: z.string().min(1),
  shiftId: z.string().min(1).optional(),
  attendanceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  clockIn: z.string().datetime().optional(), // ISO形式。省略時は現在時刻
  note: z.string().max(500).optional(),
});

// 退勤打刻
export const attendanceClockOutSchema = z.object({
  employeeId: z.string().min(1),
  clockOut: z.string().datetime().optional(), // 省略時は現在時刻
  breakStartTime: timeString.optional(),
  breakEndTime: timeString.optional(),
  actualBreakMinutes: z.number().int().min(0).max(480).optional(),
  note: z.string().max(500).optional(),
});

// 打刻修正
export const attendanceUpdateSchema = z.object({
  clockIn: z.string().datetime().optional(),
  clockOut: z.string().datetime().optional(),
  breakStartTime: timeString.optional(),
  breakEndTime: timeString.optional(),
  actualBreakMinutes: z.number().int().min(0).max(480).optional(),
  status: z.enum(["PENDING", "CLOCKED_IN", "CLOCKED_OUT", "ABSENT", "LATE", "EARLY_LEAVE", "APPROVED"]).optional(),
  note: z.string().max(500).optional(),
});

// 休暇申請
export const leaveRequestCreateSchema = z.object({
  employeeId: z.string().min(1),
  leaveType: z.enum(["PAID_LEAVE", "SICK_LEAVE", "SPECIAL_LEAVE", "ABSENCE"]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().max(500).optional(),
});

// 休暇承認・却下
export const leaveRequestUpdateSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
});

export type AttendanceClockIn = z.infer<typeof attendanceClockInSchema>;
export type AttendanceClockOut = z.infer<typeof attendanceClockOutSchema>;
export type AttendanceUpdate = z.infer<typeof attendanceUpdateSchema>;
export type LeaveRequestCreate = z.infer<typeof leaveRequestCreateSchema>;
export type LeaveRequestUpdate = z.infer<typeof leaveRequestUpdateSchema>;
