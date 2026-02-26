export interface Student {
  student_id: string;
  student_email: string;
  student_name: string;
  study_group_str: string;
  grade_book_number: string;
  faculty_abbr: string;
}

export interface LessonEntry {
  time_start: string;
  time_end: string;
  subject: string;
  subject_short: string;
  type_abbr: string;
  type_name: string;
  additional_info: string;
  teachers: { id: number; full_name: string }[];
  auditories: { id: number; name: string; building: string }[];
  webinar_url: string;
}

export interface DaySchedule {
  weekday: number;
  date: string;
  lessons: LessonEntry[];
}

export interface WeekSchedule {
  group_id: number;
  week: { date_start: string; date_end: string; is_odd: boolean };
  days: DaySchedule[];
}

export interface MiniApp {
  id: string;
  name: string;
  description: string;
  icon: string;
  url: string;
  color: string;
}
