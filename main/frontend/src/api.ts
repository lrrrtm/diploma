const BASE = "/api";
const DEV_MOCK = "dev-mock";

export async function fetchMe(token: string) {
  if (token === DEV_MOCK) return {
    student_id: "123456789",
    student_name: "Ларионенко Артём Александрович",
    student_email: "larionenko.aa@edu.spbstu.ru",
    study_group_str: "5130904/20102",
    faculty_abbr: "ИКНК",
    grade_book_number: "22350659",
  };
  const res = await fetch(`${BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Unauthorized");
  return res.json();
}

export async function fetchMiniApps(token: string) {
  if (token === DEV_MOCK) return [
    { id: "services", name: "Услуги", description: "Подача заявок в административные подразделения", url: "http://localhost:3011", icon: "", color: "" },
    { id: "traffic",  name: "Посещаемость", description: "Отметить присутствие на занятии по QR-коду", url: "http://localhost:3012", icon: "", color: "" },
  ];
  const res = await fetch(`${BASE}/miniapps/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to load mini-apps");
  return res.json();
}

export async function fetchLaunchToken(token: string): Promise<string> {
  if (token === DEV_MOCK) return DEV_MOCK;
  const res = await fetch(`${BASE}/miniapps/launch-token`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to get launch token");
  const data = await res.json();
  return data.launch_token;
}

export async function fetchResolveGroup(
  token: string,
  facultyAbbr: string,
  groupName: string,
): Promise<{ group_id: number; faculty_id: number }> {
  if (token === DEV_MOCK) return { group_id: 12345, faculty_id: 1 };
  const params = new URLSearchParams({ faculty_abbr: facultyAbbr, group_name: groupName });
  const res = await fetch(`${BASE}/schedule/resolve-group?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to resolve group");
  return res.json();
}

export async function fetchGradebook(
  token: string,
): Promise<import("./types").GradebookResponse> {
  if (token === DEV_MOCK) return {
    orders_type_name: "Зачётная книжка",
    academic_years: [
      {
        label: "2024/2025 уч. год",
        entries: [
          { grade: 5, grade_name: "Отлично", test_type_name: "Экзамен", discipline: "Математический анализ", lecturer: "Иванов И.И.", try: 1, date: "15.01.2025", semester: 5, hours: "72", zet: "2" },
          { grade: 4, grade_name: "Хорошо", test_type_name: "Зачёт", discipline: "Теория вероятностей", lecturer: "Петров П.П.", try: 1, date: "20.01.2025", semester: 5, hours: "36", zet: "1" },
          { grade: 5, grade_name: "Отлично", test_type_name: "Экзамен", discipline: "Базы данных", lecturer: "Сидоров С.С.", try: 1, date: "25.01.2025", semester: 5, hours: "54", zet: "1.5" },
        ],
      },
      {
        label: "2023/2024 уч. год",
        entries: [
          { grade: 4, grade_name: "Хорошо", test_type_name: "Экзамен", discipline: "Алгоритмы и структуры данных", lecturer: "Козлов К.К.", try: 1, date: "18.01.2024", semester: 3, hours: "72", zet: "2" },
          { grade: 5, grade_name: "Отлично", test_type_name: "Зачёт", discipline: "Операционные системы", lecturer: "Новиков Н.Н.", try: 1, date: "22.01.2024", semester: 3, hours: "36", zet: "1" },
        ],
      },
    ],
  };
  const res = await fetch(`${BASE}/gradebook`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Ошибка загрузки зачётки" }));
    throw new Error(err.detail || "Ошибка загрузки зачётки");
  }
  return res.json();
}

export async function fetchSchedule(
  token: string,
  groupId: number,
  date?: string,
) {
  if (token === DEV_MOCK) return {
    group_id: groupId,
    week: { date_start: "2025-02-24", date_end: "2025-03-02", is_odd: true },
    days: [
      {
        weekday: 1, date: "2025-02-24",
        lessons: [
          { time_start: "09:30", time_end: "11:00", subject: "Математический анализ", subject_short: "Матан", type_abbr: "Лек", type_name: "Лекция", additional_info: "", teachers: [{ id: 1, full_name: "Иванов И.И." }], auditories: [{ id: 1, name: "101", building: "1" }], webinar_url: "" },
          { time_start: "13:00", time_end: "14:30", subject: "Базы данных", subject_short: "БД", type_abbr: "Пр", type_name: "Практика", additional_info: "", teachers: [{ id: 2, full_name: "Сидоров С.С." }], auditories: [{ id: 2, name: "205", building: "2" }], webinar_url: "" },
        ],
      },
      { weekday: 2, date: "2025-02-25", lessons: [] },
      {
        weekday: 3, date: "2025-02-26",
        lessons: [
          { time_start: "11:10", time_end: "12:40", subject: "Теория вероятностей", subject_short: "Теорвер", type_abbr: "Лек", type_name: "Лекция", additional_info: "", teachers: [{ id: 3, full_name: "Петров П.П." }], auditories: [{ id: 3, name: "303", building: "3" }], webinar_url: "" },
        ],
      },
    ],
  };
  const params = new URLSearchParams({ group_id: String(groupId) });
  if (date) params.set("date", date);
  const res = await fetch(`${BASE}/schedule?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to load schedule");
  return res.json();
}
