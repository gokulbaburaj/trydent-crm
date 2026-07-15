export type UserRole = "admin" | "rep" | "client";
export type ClientStatus =
  | "Lead"
  | "Prospect"
  | "Active Customer"
  | "Inactive Customer";
export type LeadSource = "Referral" | "Website" | "Social Media" | "Event";
export type DealStage =
  | "Lead"
  | "Qualified"
  | "Proposal"
  | "Negotiation"
  | "Closed Won"
  | "Closed Lost";
export type PortalStatus =
  | "Not Started"
  | "Building"
  | "Live: Shared with Client"
  | "Client Closed";
export type ProjectStatus =
  | "Planning"
  | "In Progress"
  | "Review"
  | "Delivered"
  | "On Hold";
export type TaskStatus = "Not Started" | "In Progress" | "Done" | "Archived";

export const CLIENT_STATUSES: ClientStatus[] = [
  "Lead",
  "Prospect",
  "Active Customer",
  "Inactive Customer",
];

export const DEAL_STAGES: DealStage[] = [
  "Lead",
  "Qualified",
  "Proposal",
  "Negotiation",
  "Closed Won",
  "Closed Lost",
];

export const PORTAL_STATUSES: PortalStatus[] = [
  "Not Started",
  "Building",
  "Live: Shared with Client",
  "Client Closed",
];

export const LEAD_SOURCES: LeadSource[] = [
  "Referral",
  "Website",
  "Social Media",
  "Event",
];

export const PROJECT_STATUSES: ProjectStatus[] = [
  "Planning",
  "In Progress",
  "Review",
  "Delivered",
  "On Hold",
];

export const TASK_STATUSES: TaskStatus[] = [
  "Not Started",
  "In Progress",
  "Done",
  "Archived",
];

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  avatar_url: string | null;
  client_id: string | null;
  created_at: string;
}

export interface Client {
  id: string;
  company: string;
  point_person: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  status: ClientStatus;
  lead_source: LeadSource | null;
  tags: string[];
  account_owner: string | null;
  last_contact: string | null;
  created_at: string;
  updated_at: string;
}

export interface Deal {
  id: string;
  deal_name: string;
  client_id: string;
  deal_stage: DealStage;
  deal_value: number;
  paid: number;
  close_date: string | null;
  account_owner: string | null;
  created_at: string;
  updated_at: string;
}

export interface Activity {
  id: string;
  description: string;
  outcome: string | null;
  location: string | null;
  follow_up_required: boolean;
  client_id: string | null;
  deal_id: string | null;
  assigned_to: string | null;
  activity_date: string;
  color: string | null;
  created_at: string;
}

export interface ClientPortal {
  id: string;
  client_id: string;
  status: PortalStatus;
  notes: string | null;
  portal_username: string | null;
  last_opened_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskLink {
  title: string;
  url: string;
}

export interface ProjectTask {
  id: string;
  project_id: string;
  name: string;
  status: TaskStatus;
  due_date: string | null;
  assigned_to: string | null;
  sort_order: number;
  description: string | null;
  links: TaskLink[];
  label: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskItem {
  id: string;
  task_id: string;
  name: string;
  status: TaskStatus;
  sort_order: number;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  client_id: string;
  status: ProjectStatus;
  owner: string | null;
  start_date: string | null;
  due_date: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile> };
      clients: { Row: Client; Insert: Partial<Client>; Update: Partial<Client> };
      deals: { Row: Deal; Insert: Partial<Deal>; Update: Partial<Deal> };
      activities: { Row: Activity; Insert: Partial<Activity>; Update: Partial<Activity> };
      client_portals: { Row: ClientPortal; Insert: Partial<ClientPortal>; Update: Partial<ClientPortal> };
      projects: { Row: Project; Insert: Partial<Project>; Update: Partial<Project> };
      project_tasks: { Row: ProjectTask; Insert: Partial<ProjectTask>; Update: Partial<ProjectTask> };
      task_items: { Row: TaskItem; Insert: Partial<TaskItem>; Update: Partial<TaskItem> };
    };
  };
}
