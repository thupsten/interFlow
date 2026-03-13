export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type UserRole = 'admin' | 'manager' | 'user' | 'it_manager';
export type UserStatus = 'invited' | 'active' | 'deactivated';
export type Priority = 'high' | 'medium' | 'low';
export type ProjectStatus = 'not_started' | 'in_progress' | 'completed' | 'delayed' | 'on_hold';
export type Visibility = 'company_wide' | 'restricted';
export type InterestStatus = 'pending' | 'approved' | 'rejected';
export type ReviewStatus = 'pending_review' | 'accepted' | 'changes_requested';

export type Availability = 'available' | 'busy' | 'away' | 'on_leave';
export type Proficiency = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  department: string | null;
  status: UserStatus;
  availability: Availability;
  created_at: string;
  updated_at: string;
  skills?: UserSkill[];
}

export interface Skill {
  id: string;
  name: string;
  category: string | null;
  created_at: string;
}

export interface UserSkill {
  id: string;
  user_id: string;
  skill_id: string;
  proficiency: Proficiency;
  created_at: string;
  skill?: Skill;
}

export interface FavoriteProject {
  id: string;
  user_id: string;
  project_id: string;
  created_at: string;
  project?: Project;
}

export interface TimeLog {
  id: string;
  user_id: string;
  task_id: string;
  hours: number;
  description: string | null;
  log_date: string;
  created_at: string;
  updated_at: string;
  task?: Task;
}

export interface Project {
  id: string;
  title: string;
  brief: string;
  description: string | null;
  start_date: string;
  expected_end_date: string;
  priority: Priority;
  status: ProjectStatus;
  visibility: Visibility;
  created_by: string;
  archived_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  creator?: Profile;
  managers?: Profile[];
  contributors?: ContributorWithJoinInfo[];
  tags?: Tag[];
}

export interface ProjectManager {
  project_id: string;
  user_id: string;
  assigned_at: string;
}

export interface ProjectContributor {
  project_id: string;
  user_id: string;
  approved_by: string;
  approved_at: string;
}

export interface ContributorWithJoinInfo extends Profile {
  joinedViaInterest: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
}

export interface InterestRequest {
  id: string;
  project_id: string;
  user_id: string;
  message: string | null;
  status: InterestStatus;
  reviewed_by: string | null;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  // Joined data
  project?: Project;
  user?: Profile;
  reviewer?: Profile;
}

export interface Task {
  id: string;
  project_id: string;
  parent_task_id: string | null;
  title: string;
  description: string | null;
  start_date: string | null;
  expected_end_date: string | null;
  priority: Priority;
  status: ProjectStatus;
  created_by: string;
  completed_by: string | null;
  completed_at: string | null;
  review_status: ReviewStatus | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  archived_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  project?: Project;
  assignees?: Profile[];
  creator?: Profile;
}

export interface TaskAssignee {
  task_id: string;
  user_id: string;
  assigned_at: string;
}

export interface Comment {
  id: string;
  body: string;
  user_id: string;
  created_at: string;
  edited_at: string | null;
  user?: Profile;
}

export interface ProjectComment extends Comment {
  project_id: string;
}

export interface TaskComment extends Comment {
  task_id: string;
}

export interface Attachment {
  id: string;
  file_name: string;
  storage_path: string;
  file_type: string | null;
  file_size: number | null;
  uploaded_by: string;
  created_at: string;
  uploader?: Profile;
}

export interface ProjectAttachment extends Attachment {
  project_id: string;
}

export interface TaskAttachment extends Attachment {
  task_id: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string | null;
  is_system: boolean;
  created_by: string | null;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  actor_id: string | null;
  entity_type: string;
  entity_id: string;
  action: string;
  metadata: Json | null;
  created_at: string;
  actor?: Profile;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export type ItTicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export interface ItSupportTicket {
  id: string;
  raised_by: string;
  title: string;
  description: string | null;
  status: ItTicketStatus;
  priority: Priority;
  resolution_note: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
  raiser?: Profile;
  resolver?: Profile;
}

// Dashboard Stats
export interface DashboardStats {
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  delayedProjects: number;
  totalTasks: number;
  myTasks: number;
  overdueTasks: number;
  pendingInterests: number;
  totalUsers: number;
}
