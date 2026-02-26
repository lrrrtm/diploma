export type AuthRole = "staff" | "admin" | "executor";

export interface AuthInfo {
  role: AuthRole;
  department_id: string | null;
  department_name: string | null;
  executor_id?: string | null;
  executor_name?: string | null;
}

export interface TokenResponse {
  access_token: string;
  role: AuthRole;
  department_id?: string;
  department_name?: string;
  executor_id?: string;
  executor_name?: string;
}

export interface StudentInfo {
  student_external_id: string;
  student_name: string;
  student_email: string;
}

export interface Department {
  id: string;
  name: string;
  description: string | null;
  login: string | null;
  created_at: string;
}

export interface ServiceBrief {
  id: string;
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
  id: string;
  department_id: string;
  name: string;
  description: string | null;
  required_fields: FieldDefinition[];
  requires_attachment: boolean;
  is_active: boolean;
  created_at: string;
}

export type ApplicationStatus = "pending" | "in_progress" | "completed" | "rejected";

export interface AttachmentInfo {
  id: string;
  filename: string;
  file_path: string;
  created_at: string;
}

export interface ApplicationResponseInfo {
  id: string;
  department_name: string | null;
  message: string;
  created_at: string;
  attachments: AttachmentInfo[];
}

export interface Executor {
  id: string;
  department_id: string;
  name: string;
  login: string;
  created_at: string;
}

export interface ApplicationBrief {
  id: string;
  student_name: string | null;
  service_name: string | null;
  department_name: string | null;
  status: ApplicationStatus;
  executor_id: string | null;
  executor_name: string | null;
  created_at: string;
}

export interface ApplicationDetail {
  id: string;
  student_external_id: string;
  student_name: string | null;
  student_email: string | null;
  service_id: string;
  service_name: string | null;
  department_name: string | null;
  service_fields: FieldDefinition[];
  form_data: Record<string, string>;
  status: ApplicationStatus;
  executor_id: string | null;
  executor_name: string | null;
  created_at: string;
  updated_at: string;
  attachments: AttachmentInfo[];
  responses: ApplicationResponseInfo[];
}
