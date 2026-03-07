// =============================================================
// 勤怠管理 型定義
// =============================================================

export interface AttendanceWithEmployee {
  id: string;
  employeeId: string;
  storeId: string;
  shiftId: string | null;
  attendanceDate: string;
  clockIn: string | null;
  clockOut: string | null;
  breakStartTime: string | null;
  breakEndTime: string | null;
  actualBreakMinutes: number;
  status: "PENDING" | "CLOCKED_IN" | "CLOCKED_OUT" | "ABSENT" | "LATE" | "EARLY_LEAVE" | "APPROVED";
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  totalWorkMinutes: number;
  laborCost: number | null;
  note: string | null;
  employee: {
    id: string;
    code: string;
    lastName: string;
    firstName: string;
    employmentType: string;
    hourlyWage: number | null;
    departmentId: string | null;
  };
  shift: {
    id: string;
    startTime: string;
    endTime: string;
    breakMinutes: number;
  } | null;
}

export interface DailySummary {
  id: string;
  storeId: string;
  summaryDate: string;
  totalEmployees: number;
  totalPresent: number;
  totalAbsent: number;
  totalLate: number;
  totalEarlyLeave: number;
  totalWorkHours: number;
  totalOvertimeHours: number;
  totalLaborCost: number;
}

export interface MonthlySummary {
  id: string;
  employeeId: string;
  yearMonth: string;
  totalWorkDays: number;
  totalWorkHours: number;
  totalOvertimeHours: number;
  totalLateDays: number;
  totalAbsentDays: number;
  totalEarlyLeaveDays: number;
  totalLaborCost: number;
  employee: {
    id: string;
    code: string;
    lastName: string;
    firstName: string;
    employmentType: string;
    hourlyWage: number | null;
  };
}

export interface LeaveRequestWithEmployee {
  id: string;
  employeeId: string;
  leaveType: "PAID_LEAVE" | "SICK_LEAVE" | "SPECIAL_LEAVE" | "ABSENCE";
  startDate: string;
  endDate: string;
  reason: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  employee: {
    id: string;
    code: string;
    lastName: string;
    firstName: string;
  };
}
