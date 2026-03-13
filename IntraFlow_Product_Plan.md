# IntraFlow

Internal Company Project Management Platform

Product Planning and Architecture Document

**Tech Stack**
- Angular
- Supabase
- PostgreSQL
- TypeScript

Version 1.1 | 2026

## 1. Problem Statement
Growing internal teams often manage work across chats, email, spreadsheets, and informal meetings. That creates poor visibility, unclear ownership, inconsistent approvals, and missed deadlines.

IntraFlow solves a specific internal company problem:

- projects should be visible to the company, not hidden in silos
- admins should control official project creation and governance
- users should be able to show interest in projects before joining work
- managers should be able to approve contributors and coordinate execution
- tasks, files, comments, and status updates should live in one place
- leadership should have a clear view of progress, workload, and delays

The platform turns internal work from an informal process into a governed, transparent, and trackable workflow.

## 2. Product Vision
IntraFlow is the internal workspace where company projects are created with structure, discovered by everyone, staffed through an approval flow, and tracked from idea to completion without the complexity of enterprise-heavy tools.

### Design Principles
- Governed by default: official work starts only after approval and assignment.
- Transparent by default: company-wide projects are visible to all authenticated users.
- Simple by role: each role sees only the actions and information they need.
- Collaboration first: comments, files, activity history, and task ownership are built in.
- Responsive by design: the platform works well on desktop and mobile browsers.

## 3. Final Product Rules
These rules are the implementation baseline.

- Admin creates most projects.
- All `company_wide` projects are visible to all authenticated users.
- Users can open visible projects and click `Show Interest`.
- Users cannot directly join official work without approval.
- Admin or assigned Manager reviews interest requests.
- Approved users become project contributors.
- Only approved contributors can be assigned to tasks.
- Tasks support multiple assignees.
- Projects and tasks use status, priority, dates, comments, and files.
- Some projects may be marked `restricted` when visibility must be limited.
- A simple calendar view is included in the MVP.

## 4. User Roles and Permissions
### Admin
Who they are:
- platform owner
- department head
- operations lead

Responsibilities:
- create, edit, archive, and manage all projects
- assign managers to projects
- approve or reject contributor interest
- manage users and roles
- create and assign tasks when needed
- view all dashboards, reports, and activity

### Manager
Who they are:
- team lead
- project lead
- delivery owner

Responsibilities:
- manage assigned projects
- review interest requests for assigned projects
- create and assign tasks
- track deadlines and progress
- review completed work
- view dashboards and reports for assigned projects

### User
Who they are:
- team member
- contributor
- internal collaborator

Responsibilities:
- view visible projects
- show interest in joining projects
- work on assigned tasks
- update task progress
- comment and upload files where allowed

### Permission Summary
- Only Admin can create projects in MVP.
- Admin and assigned Manager can manage project membership and tasks.
- Users can view visible projects and show interest.
- Only assigned users can update their task progress.
- Restricted projects are visible only to authorized members.

## 5. Visibility Rules
This section is critical for implementation and RLS design.

### All authenticated users can read
- project title
- project brief
- project status
- project priority
- project tags
- project owner and managers
- project start date
- project expected end date
- company-wide project cards and detail pages

### Only Admin, assigned Managers, and approved Contributors can read
- detailed task records
- task comments
- task attachments
- internal work notes
- contributor-only project comments

### Only Admin and assigned Managers can
- approve or reject interest requests
- create tasks
- assign contributors
- assign tasks
- review task completion

### Only assigned users can
- update task status for their own assignments
- add work comments to assigned tasks
- upload task files where allowed

## 6. Core Features
### 6.1 Project Management
Each project supports:
- title
- brief and detailed description
- start date
- expected end date
- priority: `high`, `medium`, `low`
- status: `not_started`, `in_progress`, `completed`, `delayed`, `on_hold`
- tags such as `AI Research`, `App`, `Website`, and custom tags
- reference document uploads
- owner and assigned managers
- visibility: `company_wide` or `restricted`
- archive status

### 6.2 Show Interest and Contributor Approval
- Users can click `Show Interest` on visible projects.
- Interest requests include an optional message.
- Admin or assigned Manager reviews requests.
- Requests can be approved or rejected with an optional note.
- Approved users become project contributors.
- Rejected users may reapply later based on product rule.

### 6.3 Task Management
Each task supports:
- title
- description
- start date
- expected end date
- priority
- status
- optional parent task for subtasks later
- multiple assignees
- comments
- attachments
- completion and review tracking

### 6.4 Collaboration
- Project comments
- Task comments
- File uploads at project and task level
- Activity log for important events
- In-app notifications for assignment, approval, status change, and comment activity

### 6.5 Planning and Tracking
- Dashboard with key widgets
- My Work page for personal assignments
- Calendar view for deadlines and scheduled work
- Delayed work visibility
- Archived projects remain searchable for history and reporting

## 7. User Flow
### Phase 1: Project Creation
1. Admin logs in.
2. Admin creates a project with title, brief, tags, dates, priority, status, managers, and reference files.
3. Project is saved as `company_wide` by default unless marked `restricted`.
4. The project appears in the company project feed.

### Phase 2: Project Discovery and Interest
1. Users browse the `All Projects` page or dashboard.
2. Users open a project and read the brief and project summary.
3. Interested users click `Show Interest` and optionally add a message.
4. The request is saved as `pending`.

### Phase 3: Review and Contributor Approval
1. Admin or assigned Manager sees pending interest requests.
2. Reviewer approves or rejects each request.
3. On approval, the user becomes a project contributor.
4. Approved contributors can now be assigned to project tasks.

### Phase 4: Task Assignment and Work Execution
1. Admin or Manager creates tasks under the project.
2. Tasks are assigned only to approved contributors.
3. Assigned users update task progress, add comments, and upload files.
4. Managers monitor task completion and project progress.

### Phase 5: Completion and Closure
1. Contributor marks a task as completed.
2. Manager reviews the completed work.
3. Manager accepts completion or requests changes.
4. When project work is finished, Admin or Manager marks the project completed or archived.

## 8. Angular App Structure
### Core Modules
- `AuthModule`
- `DashboardModule`
- `ProjectsModule`
- `TasksModule`
- `MyWorkModule`
- `CalendarModule`
- `AdminModule`
- `SharedModule`
- `CoreModule`

### Main Pages
- Login
- Invite Accept and Profile Setup
- Dashboard
- All Projects
- Project Details
- Create/Edit Project
- Interest Review
- Task Board
- Task Details
- My Work
- Calendar
- User Management

### Service Layer
Angular components should not call Supabase directly. Use Angular services such as:
- `AuthService`
- `ProjectService`
- `InterestService`
- `TaskService`
- `CommentService`
- `AttachmentService`
- `NotificationService`
- `ActivityService`
- `UserService`
- `ReportService`

## 9. Supabase and PostgreSQL Schema
The following schema is the implementation baseline.

### 9.1 Profiles
Table: `profiles`
- `id` uuid primary key references `auth.users(id)`
- `email` text unique not null
- `full_name` text not null
- `role` text not null check in `admin`, `manager`, `user`
- `department` text null
- `status` text not null check in `invited`, `active`, `deactivated`
- `created_at` timestamptz not null default `now()`

### 9.2 Projects
Table: `projects`
- `id` uuid primary key
- `title` text not null
- `brief` text not null
- `start_date` date not null
- `expected_end_date` date not null
- `priority` text not null check in `high`, `medium`, `low`
- `status` text not null check in `not_started`, `in_progress`, `completed`, `delayed`, `on_hold`
- `visibility` text not null default `company_wide` check in `company_wide`, `restricted`
- `created_by` uuid not null references `profiles(id)`
- `archived_at` timestamptz null
- `deleted_at` timestamptz null
- `created_at` timestamptz not null default `now()`
- `updated_at` timestamptz not null default `now()`

Constraints:
- `expected_end_date >= start_date`
- soft delete preferred over hard delete

### 9.3 Project Managers
Table: `project_managers`
- `project_id` uuid references `projects(id)`
- `user_id` uuid references `profiles(id)`
- `assigned_at` timestamptz not null default `now()`

Rules:
- referenced user must have role `manager` or `admin`
- composite uniqueness on `project_id`, `user_id`

### 9.4 Project Contributors
Table: `project_contributors`
- `project_id` uuid references `projects(id)`
- `user_id` uuid references `profiles(id)`
- `approved_by` uuid references `profiles(id)`
- `approved_at` timestamptz not null default `now()`

Rules:
- composite uniqueness on `project_id`, `user_id`

### 9.5 Interest Requests
Table: `interest_requests`
- `id` uuid primary key
- `project_id` uuid references `projects(id)`
- `user_id` uuid references `profiles(id)`
- `message` text null
- `status` text not null check in `pending`, `approved`, `rejected`
- `reviewed_by` uuid null references `profiles(id)`
- `review_note` text null
- `created_at` timestamptz not null default `now()`
- `reviewed_at` timestamptz null

Rules:
- one active interest request per user and project
- approved requests should create a contributor membership record

### 9.6 Tasks
Table: `tasks`
- `id` uuid primary key
- `project_id` uuid references `projects(id)`
- `parent_task_id` uuid null references `tasks(id)`
- `title` text not null
- `description` text null
- `start_date` date null
- `expected_end_date` date null
- `priority` text not null check in `high`, `medium`, `low`
- `status` text not null check in `not_started`, `in_progress`, `completed`, `delayed`, `on_hold`
- `created_by` uuid not null references `profiles(id)`
- `completed_by` uuid null references `profiles(id)`
- `completed_at` timestamptz null
- `review_status` text null check in `pending_review`, `accepted`, `changes_requested`
- `reviewed_by` uuid null references `profiles(id)`
- `reviewed_at` timestamptz null
- `review_note` text null
- `archived_at` timestamptz null
- `deleted_at` timestamptz null
- `created_at` timestamptz not null default `now()`
- `updated_at` timestamptz not null default `now()`

Rules:
- if both task dates exist, `expected_end_date >= start_date`
- only approved contributors can be assigned

### 9.7 Task Assignees
Table: `task_assignees`
- `task_id` uuid references `tasks(id)`
- `user_id` uuid references `profiles(id)`
- `assigned_at` timestamptz not null default `now()`

Rules:
- composite uniqueness on `task_id`, `user_id`
- user must be an approved project contributor

### 9.8 Project Comments
Table: `project_comments`
- `id` uuid primary key
- `project_id` uuid references `projects(id)`
- `user_id` uuid references `profiles(id)`
- `body` text not null
- `created_at` timestamptz not null default `now()`
- `edited_at` timestamptz null

### 9.9 Task Comments
Table: `task_comments`
- `id` uuid primary key
- `task_id` uuid references `tasks(id)`
- `user_id` uuid references `profiles(id)`
- `body` text not null
- `created_at` timestamptz not null default `now()`
- `edited_at` timestamptz null

### 9.10 Project Attachments
Table: `project_attachments`
- `id` uuid primary key
- `project_id` uuid references `projects(id)`
- `uploaded_by` uuid references `profiles(id)`
- `file_name` text not null
- `storage_path` text not null
- `file_type` text null
- `file_size` bigint null
- `created_at` timestamptz not null default `now()`

### 9.11 Task Attachments
Table: `task_attachments`
- `id` uuid primary key
- `task_id` uuid references `tasks(id)`
- `uploaded_by` uuid references `profiles(id)`
- `file_name` text not null
- `storage_path` text not null
- `file_type` text null
- `file_size` bigint null
- `created_at` timestamptz not null default `now()`

### 9.12 Activity Log
Table: `activity_log`
- `id` uuid primary key
- `actor_id` uuid references `profiles(id)`
- `entity_type` text not null
- `entity_id` uuid not null
- `action` text not null
- `metadata` jsonb null
- `created_at` timestamptz not null default `now()`

### 9.13 Notifications
Table: `notifications`
- `id` uuid primary key
- `user_id` uuid references `profiles(id)`
- `type` text not null
- `title` text not null
- `link` text null
- `is_read` boolean not null default false
- `created_at` timestamptz not null default `now()`

### 9.14 Tags
Table: `tags`
- `id` uuid primary key
- `name` text unique not null
- `color` text null
- `is_system` boolean not null default false
- `created_by` uuid null references `profiles(id)`
- `created_at` timestamptz not null default `now()`

## 10. Supabase Policy Direction
The app should rely on Row Level Security for enforcement.

### Projects
- authenticated users can read `company_wide` projects
- restricted projects are readable only by authorized members
- only Admin can create projects in MVP
- Admin can update all projects
- assigned Managers can update only their own projects

### Interest Requests
- users can create their own interest request
- users can read their own requests
- Admin and assigned Managers can review project requests

### Project Contributors and Managers
- Admin can manage project membership
- assigned Managers can manage contributors for their projects
- users can read their own membership records

### Tasks
- Admin and assigned Managers can create tasks
- Admin and assigned Managers can assign users
- approved contributors can read detailed tasks in projects they belong to
- assigned users can update allowed progress fields on tasks assigned to them

### Comments and Attachments
- project comments and project files follow project membership access
- task comments and task files follow task visibility and assignment rules

### Activity and Notifications
- Admin sees all activity
- Managers see activity for assigned projects
- users see only activity and notifications relevant to them

## 11. Dashboard and Reporting
### Dashboard Widgets
- projects by status
- active projects count
- overdue tasks
- my assigned tasks
- pending interest requests
- upcoming deadlines
- recent activity
- team workload
- project progress

### Reports
MVP includes dashboard-style summary reporting.

Later phases can add:
- project status report
- overdue report
- contributor workload report
- interest approval report
- activity audit report
- CSV export
- timeline and Gantt reporting

## 12. UI Structure
### Desktop
- left sidebar navigation
- top navbar with search, notifications, and profile menu
- main content area for pages and data views
- optional side panel or modal for detail views and forms

### Mobile
- bottom navigation or compact menu
- card-based project and task lists
- modal-driven detail views and forms
- responsive board and calendar interactions

### UI Principles
- keep project discovery easy
- make approval flow obvious
- separate project summary from internal task detail
- use clear status and priority badges
- provide empty states and action prompts

## 13. MVP Scope
### Included in MVP
- invite-only authentication
- role-based access
- profiles and user management basics
- project CRUD
- company-wide project listing
- project detail page
- show interest flow
- contributor approval
- task CRUD
- multi-assignee task assignment
- project comments
- task comments
- project and task attachments
- my work page
- basic dashboard
- in-app notifications
- activity log
- simple calendar view
- responsive layout

### Excluded from MVP
- advanced CSV export
- full reports module
- Gantt timeline view
- bulk interest approval
- email notifications
- time tracking
- project templates
- advanced search
- custom role types beyond Admin, Manager, and User

## 14. Risks and Recommendations
### Technical Risks
- RLS can become complex without careful testing.
- Realtime usage can grow quickly if subscriptions are too broad.
- File upload limits and storage usage must be controlled.
- Task visibility rules must be implemented consistently across UI and RLS.

### Product Risks
- approval bottlenecks if Managers do not share review responsibility
- project status drift if delayed work is not surfaced clearly
- empty projects if tasks are not created quickly after setup
- confusion if project visibility and editing permissions are not clearly separated

### Recommendations
- use soft delete instead of hard delete where possible
- log role changes and important permission actions in activity log
- create clear staging data for Admin, Manager, and User role testing
- keep restricted project support in schema now even if UI support is basic in MVP
- start with simple calendar and basic dashboard instead of advanced reporting

## 15. Recommended Build Order
1. Set up Supabase project, auth, storage buckets, and baseline policies.
2. Create SQL schema and constraints.
3. Implement RLS policies and role tests.
4. Build Angular auth flow and route guards.
5. Build project list, detail, and create flow.
6. Build show interest and contributor approval flow.
7. Build task management and assignment.
8. Build comments, attachments, and notifications.
9. Build dashboard, My Work, and calendar.
10. Run role-based QA and mobile responsive testing.

## 16. Final Implementation Note
This document is the final reference baseline for implementation. Any future changes should be evaluated against:
- role clarity
- visibility rules
- contributor approval flow
- task ownership rules
- MVP scope discipline

IntraFlow is not intended to copy every feature from ClickUp. The goal is to deliver a focused internal collaboration platform where projects are visible, people can express interest, work is approved and assigned properly, and progress is easy to track. 


