// =============================================================
// シフト管理 型定義
// =============================================================

// シフト（従業員情報付き）
export interface ShiftWithEmployee {
  id: string;
  employeeId: string;
  storeId: string;
  departmentId: string | null;
  shiftDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string;
  breakMinutes: number;
  status: "DRAFT" | "PUBLISHED" | "CONFIRMED" | "CHANGED";
  isHelpShift: boolean;
  laborCost: number | null;
  note: string | null;
  employee: {
    id: string;
    code: string;
    lastName: string;
    firstName: string;
    employmentType: string;
    hourlyWage: number | null;
  };
  department?: {
    id: string;
    name: string;
    code: string;
  } | null;
}

// シフト希望（従業員情報付き）
export interface ShiftRequestWithEmployee {
  id: string;
  employeeId: string;
  storeId: string;
  targetDate: string;
  requestType: "AVAILABLE" | "UNAVAILABLE" | "PREFERRED";
  startTime: string | null;
  endTime: string | null;
  note: string | null;
  employee: {
    id: string;
    code: string;
    lastName: string;
    firstName: string;
  };
}

// 人員充足状況
export interface StaffingCoverage {
  departmentId: string;
  departmentName: string;
  timeSlot: string;
  minStaff: number;
  idealStaff: number;
  assignedStaff: number;
  status: "over" | "ideal" | "minimum" | "short";
}

// カレンダー表示用の日別サマリー
export interface DailyShiftSummary {
  date: string;
  totalShifts: number;
  totalHours: number;
  estimatedLaborCost: number;
  departmentCoverage: StaffingCoverage[];
}
