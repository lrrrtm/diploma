export type UserRole = "student" | "staff" | "admin";

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: UserRole;
  department_id: number | null;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface Department {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
}

export interface ServiceBrief {
  id: number;
  name: string;
  description: string | null;
  requires_attachment: boolean;
  is_active: boolean;
}

export interface DepartmentWithServices extends Department {
  services: ServiceBrief[];
}

export interface FieldDefinition {
  name: string;
  label: string;
  type: "text" | "textarea" | "select" | "number" | "date";
  required: boolean;
  options?: string[];
}

export interface Service {
  id: number;
  department_id: number;
  name: string;
  description: string | null;
  required_fields: FieldDefinition[];
  requires_attachment: boolean;
  is_active: boolean;
  created_at: string;
}

export type ApplicationStatus = "pending" | "in_progress" | "completed" | "rejected";

export interface AttachmentInfo {
  id: number;
  filename: string;
  file_path: string;
  uploaded_by_id: number;
  created_at: string;
}

export interface ApplicationResponseInfo {
  id: number;
  staff_id: number;
  staff_name: string | null;
  message: string;
  created_at: string;
  attachments: AttachmentInfo[];
}

export interface ApplicationBrief {
  id: number;
  student_name: string | null;
  service_name: string | null;
  department_name: string | null;
  status: ApplicationStatus;
  created_at: string;
}

export interface ApplicationDetail {
  id: number;
  student_id: number;
  student_name: string | null;
  service_id: number;
  service_name: string | null;
  department_name: string | null;
  form_data: Record<string, string>;
  status: ApplicationStatus;
  created_at: string;
  updated_at: string;
  attachments: AttachmentInfo[];
  responses: ApplicationResponseInfo[];
}
