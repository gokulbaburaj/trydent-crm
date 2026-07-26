export type UserRole = "admin" | "rep" | "client" | "contractor";
/** Kept here (not in lib/currency) so lib/types stays dependency-free. */
export type CurrencyCode = "USD" | "INR" | "EUR" | "CAD" | "AUD" | "AED";
export type ClientStatus =
  | "Lead"
  | "Prospect"
  | "Active Customer"
  | "Inactive Customer";
export type LeadSource = "Referral" | "Website" | "Social Media" | "Event";
/** "Negotiation" was merged into "Proposal" (migration 2026-07-22d). The enum
 *  value still exists in Postgres but the app no longer produces it. */
export type DealStage =
  | "Lead"
  | "Qualified"
  | "Proposal"
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
export type TaskPriority = "urgent" | "high" | "normal" | "low";
export type Recurrence = "none" | "daily" | "weekly" | "biweekly" | "monthly";

export const RECURRENCES: Recurrence[] = [
  "none",
  "daily",
  "weekly",
  "biweekly",
  "monthly",
];

export const TASK_PRIORITIES: TaskPriority[] = ["urgent", "high", "normal", "low"];

/** Sort weight — lower comes first. */
export const PRIORITY_ORDER: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

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
  team: string | null;
  reports_to: string | null;
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
  currency: CurrencyCode;
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
  recurrence: Recurrence;
  recurrence_parent_id: string | null;
  agenda: string | null;
  notes: string | null;
  attendee_ids: string[];
  /** Off by default — an internal note should never leak by omission. */
  client_visible: boolean;
  created_at: string;
}

export type MeetingRequestStatus = "pending" | "scheduled" | "declined";

export interface MeetingRequest {
  id: string;
  client_id: string;
  requested_by: string | null;
  topic: string;
  preferred_date: string | null;
  note: string | null;
  status: MeetingRequestStatus;
  activity_id: string | null;
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
  priority: TaskPriority;
  recurrence: Recurrence;
  recurrence_parent_id: string | null;
  approved_at: string | null;
  approved_by: string | null;
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

export interface TaskComment {
  id: string;
  task_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
}

export interface PortalUpdate {
  id: string;
  client_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
}

export interface PortalMessage {
  id: string;
  client_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
}

/** Client-visible document. `url` = external link (Drive etc.);
 *  `storage_path` is reserved for Supabase Storage uploads (Phase 2). */
export type DocumentCategory =
  | "proposal"
  | "contract"
  | "invoice"
  | "asset"
  | "other";

export const DOCUMENT_CATEGORIES: DocumentCategory[] = [
  "proposal",
  "contract",
  "invoice",
  "asset",
  "other",
];

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  proposal: "Proposals",
  contract: "Contracts",
  invoice: "Invoices",
  asset: "Assets",
  other: "Other",
};

export interface ClientDocument {
  id: string;
  client_id: string;
  project_id: string | null;
  name: string;
  category: DocumentCategory;
  url: string | null;
  storage_path: string | null;
  added_by: string | null;
  created_at: string;
}

/** Stored statuses only. "Overdue" is derived from due_date at read time by
 *  `effectiveInvoiceStatus` so it can never go stale in the database. */
export type InvoiceStatus = "draft" | "sent" | "paid";
export type InvoiceDisplayStatus = InvoiceStatus | "overdue";

export const INVOICE_STATUSES: InvoiceStatus[] = ["draft", "sent", "paid"];

export const INVOICE_STATUS_LABELS: Record<InvoiceDisplayStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  overdue: "Overdue",
};

export interface Invoice {
  id: string;
  client_id: string;
  deal_id: string | null;
  number: string;
  amount: number;
  currency: CurrencyCode;
  status: InvoiceStatus;
  issue_date: string | null;
  due_date: string | null;
  document_url: string | null;
  storage_path: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** A sent invoice past its due date reads as overdue. Paid and draft never do. */
export function effectiveInvoiceStatus(invoice: Invoice): InvoiceDisplayStatus {
  if (invoice.status !== "sent" || !invoice.due_date) return invoice.status;
  const due = new Date(`${invoice.due_date}T23:59:59`);
  return due.getTime() < Date.now() ? "overdue" : "sent";
}

/** Read-only projection of staff profiles, safe to expose to portal clients.
 *  Backed by the `team_directory` view — never carries email. */
export interface TeamMember {
  id: string;
  full_name: string;
  avatar_url: string | null;
  role: UserRole;
}

/* ============ GOALS / OKRs ============ */

export type GoalStatus = "on_track" | "at_risk" | "off_track" | "achieved";

export const GOAL_STATUSES: GoalStatus[] = [
  "on_track",
  "at_risk",
  "off_track",
  "achieved",
];

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  on_track: "On track",
  at_risk: "At risk",
  off_track: "Off track",
  achieved: "Achieved",
};

/** Where a key result's current value comes from. Everything except `manual`
 *  is computed live from existing rows, so it can't drift. */
export type KeyResultSource =
  | "manual"
  | "revenue_won"
  | "deals_closed"
  | "new_clients"
  | "tasks_done"
  | "invoices_paid";

export const KEY_RESULT_SOURCES: KeyResultSource[] = [
  "manual",
  "revenue_won",
  "deals_closed",
  "new_clients",
  "tasks_done",
  "invoices_paid",
];

export const KEY_RESULT_SOURCE_LABELS: Record<KeyResultSource, string> = {
  manual: "Manual entry",
  revenue_won: "Revenue won (deals)",
  deals_closed: "Deals closed",
  new_clients: "New clients",
  tasks_done: "Tasks completed",
  invoices_paid: "Invoices paid",
};

export interface Goal {
  id: string;
  objective: string;
  description: string | null;
  owner: string | null;
  period: string;
  status: GoalStatus;
  start_date: string | null;
  end_date: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface KeyResult {
  id: string;
  goal_id: string;
  name: string;
  source: KeyResultSource;
  target: number;
  current_manual: number;
  unit: string | null;
  sort_order: number;
  created_at: string;
}

/* ============ RECRUITING / ONBOARDING ============ */

export type ApplicantStage =
  | "applied"
  | "screening"
  | "interview"
  | "offer"
  | "hired"
  | "rejected";

/** Board column order. Rejected sits last deliberately — it's an outcome, not
 *  a step, and burying it keeps the active pipeline readable. */
export const APPLICANT_STAGES: ApplicantStage[] = [
  "applied",
  "screening",
  "interview",
  "offer",
  "hired",
  "rejected",
];

export const APPLICANT_STAGE_LABELS: Record<ApplicantStage, string> = {
  applied: "Applied",
  screening: "Screening",
  interview: "Interview",
  offer: "Offer",
  hired: "Hired",
  rejected: "Rejected",
};

export interface Applicant {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role_title: string | null;
  location: string | null;
  stage: ApplicantStage;
  source: string | null;
  resume_url: string | null;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface OnboardingTemplate {
  id: string;
  name: string;
  is_default: boolean;
  created_at: string;
}

export interface OnboardingTemplateItem {
  id: string;
  template_id: string;
  title: string;
  sort_order: number;
}

export interface OnboardingTask {
  id: string;
  profile_id: string;
  title: string;
  done: boolean;
  sort_order: number;
  created_at: string;
}

export interface Notification {
  id: string;
  recipient_id: string;
  type: string;
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export interface Team {
  id: string;
  name: string;
  created_at: string;
}

export type PaymentStatus = "pending" | "paid";

export interface StaffPayment {
  id: string;
  profile_id: string;
  label: string;
  amount: number;
  status: PaymentStatus;
  due_date: string | null;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  client_id: string;
  status: ProjectStatus;
  /** The single accountable lead. */
  owner: string | null;
  /** Everyone else on the project, lead included after the backfill. */
  member_ids: string[];
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
      staff_payments: { Row: StaffPayment; Insert: Partial<StaffPayment>; Update: Partial<StaffPayment> };
      teams: { Row: Team; Insert: Partial<Team>; Update: Partial<Team> };
      task_items: { Row: TaskItem; Insert: Partial<TaskItem>; Update: Partial<TaskItem> };
      task_comments: { Row: TaskComment; Insert: Partial<TaskComment>; Update: Partial<TaskComment> };
      portal_updates: { Row: PortalUpdate; Insert: Partial<PortalUpdate>; Update: Partial<PortalUpdate> };
      portal_messages: { Row: PortalMessage; Insert: Partial<PortalMessage>; Update: Partial<PortalMessage> };
      client_documents: { Row: ClientDocument; Insert: Partial<ClientDocument>; Update: Partial<ClientDocument> };
      invoices: { Row: Invoice; Insert: Partial<Invoice>; Update: Partial<Invoice> };
      team_directory: { Row: TeamMember; Insert: never; Update: never };
      meeting_requests: { Row: MeetingRequest; Insert: Partial<MeetingRequest>; Update: Partial<MeetingRequest> };
      goals: { Row: Goal; Insert: Partial<Goal>; Update: Partial<Goal> };
      key_results: { Row: KeyResult; Insert: Partial<KeyResult>; Update: Partial<KeyResult> };
      applicants: { Row: Applicant; Insert: Partial<Applicant>; Update: Partial<Applicant> };
      onboarding_templates: { Row: OnboardingTemplate; Insert: Partial<OnboardingTemplate>; Update: Partial<OnboardingTemplate> };
      onboarding_template_items: { Row: OnboardingTemplateItem; Insert: Partial<OnboardingTemplateItem>; Update: Partial<OnboardingTemplateItem> };
      onboarding_tasks: { Row: OnboardingTask; Insert: Partial<OnboardingTask>; Update: Partial<OnboardingTask> };
      notifications: { Row: Notification; Insert: Partial<Notification>; Update: Partial<Notification> };
    };
  };
}
