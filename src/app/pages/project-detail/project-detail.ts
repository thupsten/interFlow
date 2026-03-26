import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { toLocalDateString } from '../../utils/date';
import { ActivatedRoute, RouterLink, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { UpperCasePipe } from '@angular/common';
import { Api } from '../../services/api';
import { SnackbarService } from '../../services/snackbar.service';
import { ProjectService } from '../../services/project.service';
import { TaskService } from '../../services/task.service';
import { CommentService } from '../../services/comment.service';
import { NotificationService } from '../../services/notification.service';
import { TimeTrackingService } from '../../services/time-tracking.service';
import type { Project, Task, InterestRequest, Profile, ProjectComment, TimeLog } from '../../interfaces/database.types';

@Component({
  selector: 'app-project-detail',
  standalone: true,
  imports: [RouterLink, FormsModule, UpperCasePipe],
  templateUrl: './project-detail.html',
  styleUrl: './project-detail.scss',
})
export class ProjectDetail implements OnInit {
  readonly api = inject(Api);
  readonly route = inject(ActivatedRoute);
  readonly router = inject(Router);
  readonly projectService = inject(ProjectService);
  readonly taskService = inject(TaskService);
  readonly commentService = inject(CommentService);
  readonly notificationService = inject(NotificationService);
  readonly timeTracking = inject(TimeTrackingService);
  readonly snackbar = inject(SnackbarService);

  readonly loading = signal(true);
  readonly project = signal<Project | null>(null);
  readonly tasks = signal<Task[]>([]);
  readonly interests = signal<InterestRequest[]>([]);
  readonly comments = signal<ProjectComment[]>([]);
  readonly timeLogs = signal<TimeLog[]>([]);
  readonly hasSubmittedInterest = signal(false);
  
  readonly activeTab = signal<'overview' | 'tasks' | 'team' | 'comments' | 'interests' | 'time'>('overview');
  readonly showAdminMenu = signal(false);
  
  newComment = '';

  readonly canManage = computed(() => {
    if (this.api.isAdmin()) return true;
    const project = this.project();
    const userId = this.api.user()?.id;
    if (!project || !userId) return false;
    return project.created_by === userId || project.managers?.some((m: Profile) => m.id === userId);
  });

  readonly isContributor = computed(() => {
    const project = this.project();
    const userId = this.api.user()?.id;
    if (!project || !userId) return false;
    return project.contributors?.some((c: Profile) => c.id === userId);
  });

  /** Approved contributors and managers can add tasks on the project. */
  readonly canCreateTask = computed(() => this.canManage() || this.isContributor());

  readonly taskStats = computed(() => {
    const allTasks = this.tasks();
    return {
      total: allTasks.length,
      completed: allTasks.filter((t) => t.status === 'completed').length,
      inProgress: allTasks.filter((t) => t.status === 'in_progress').length,
      overdue: allTasks.filter((t) => {
        if (!t.expected_end_date || t.status === 'completed') return false;
        return t.expected_end_date < toLocalDateString(new Date());
      }).length,
    };
  });

  readonly pendingInterests = computed(() => {
    return this.interests().filter((i) => i.status === 'pending');
  });

  /** Only show interests that actually came from the "Show Interest" flow, plus any pending requests. */
  readonly displayInterests = computed(() => {
    const project = this.project();
    const contributors = (project?.contributors || []) as (Profile & { joinedViaInterest?: boolean })[];
    const joinedViaInterestIds = new Set(
      contributors.filter((c) => c.joinedViaInterest).map((c) => c.id)
    );

    return this.interests().filter((i) => {
      // Always show pending requests (they come from "Show Interest")
      if (i.status === 'pending') return true;
      // For approved/rejected, only show if this user actually joined via interest
      return joinedViaInterestIds.has(i.user_id);
    });
  });

  readonly canComment = computed(() => {
    if (this.api.isAdmin() || this.api.isManager()) return true;
    return this.isContributor();
  });

  readonly projectParticipants = computed(() => {
    const project = this.project();
    if (!project) return [];
    const participants: Profile[] = [];
    if (project.creator) participants.push(project.creator);
    if (project.managers) participants.push(...project.managers);
    if (project.contributors) participants.push(...project.contributors);
    return participants.filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i);
  });

  showMentions = false;
  mentionSearch = '';
  mentionStartPos = 0;

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;

    try {
      const includeArchived = this.api.isAdmin();
      const [project, tasks, comments] = await Promise.all([
        this.projectService.getProjectById(id, includeArchived),
        this.taskService.getTasks(id),
        this.commentService.getProjectComments(id).catch(() => []),
      ]);
      this.project.set(project);
      this.tasks.set(tasks);
      this.comments.set(comments);

      // For regular users, check if they already submitted interest for this project
      if (this.api.isUser() && project) {
        const userId = this.api.user()?.id;
        if (userId) {
          const { data } = await this.api.supabase
            .from('interest_requests')
            .select('id')
            .eq('project_id', project.id)
            .eq('user_id', userId)
            .limit(1)
            .maybeSingle();
          if (data) {
            this.hasSubmittedInterest.set(true);
          }
        }
      }

      // Load interests if manager/admin
      if (this.api.isAdmin() || this.api.isManager()) {
        const allInterests = await this.projectService.getProjectInterests(id);
        this.interests.set(allInterests);
      }
      // Load time logs if admin/manager
      if (this.api.isAdmin() || this.api.isManager()) {
        const logs = await this.timeTracking.getProjectTimeLogs(id).catch(() => []);
        this.timeLogs.set(logs);
      }
    } finally {
      this.loading.set(false);
    }
  }

  setTab(tab: 'overview' | 'tasks' | 'team' | 'comments' | 'interests' | 'time'): void {
    this.activeTab.set(tab);
  }

  getTimeLogUserName(log: TimeLog): string {
    const user = (log as any).user;
    return user?.full_name || user?.email || 'Unknown';
  }

  getTimeLogTaskName(log: TimeLog): string {
    const task = (log as any).task;
    return task?.title ?? '—';
  }

  async deleteComment(commentId: string): Promise<void> {
    if (!confirm('Delete this comment?')) return;
    try {
      await this.commentService.deleteComment(commentId);
      this.comments.update((list) => list.filter((c) => c.id !== commentId));
    } catch {
      this.snackbar.error('Failed to delete comment');
    }
  }

  canDeleteComment(comment: ProjectComment): boolean {
    const userId = this.api.user()?.id;
    return comment.user_id === userId || this.api.isAdmin();
  }

  getStatusClass(status: string): string {
    const map: Record<string, string> = {
      not_started: 'secondary',
      in_progress: 'primary',
      completed: 'success',
      delayed: 'danger',
      on_hold: 'warning',
    };
    return map[status] || 'secondary';
  }

  getPriorityClass(priority: string): string {
    const map: Record<string, string> = {
      high: 'danger',
      medium: 'warning',
      low: 'info',
    };
    return map[priority] || 'secondary';
  }

  formatDate(date: string | null | undefined): string {
    if (!date) return '—';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  getTimeAgo(date: string): string {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return this.formatDate(date);
  }

  getInitials(name: string): string {
    if (!name) return '?';
    return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  }

  getDaysRemaining(): number {
    const project = this.project();
    if (!project?.expected_end_date) return 0;
    const end = new Date(project.expected_end_date);
    const now = new Date();
    return Math.ceil((end.getTime() - now.getTime()) / 86400000);
  }

  getProgressPercentage(): number {
    const stats = this.taskStats();
    if (stats.total === 0) return 0;
    return Math.round((stats.completed / stats.total) * 100);
  }

  async showInterest(): Promise<void> {
    const project = this.project();
    if (!project) return;

    try {
      await this.projectService.showInterest(project.id, undefined);
      this.hasSubmittedInterest.set(true);
      this.snackbar.success('Interest submitted successfully! You will be notified when reviewed.');
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : (err as { message?: string })?.message ?? 'Unknown error';
      console.error('Show interest failed:', err);
      this.snackbar.error(`Failed to submit interest: ${msg}`);
    }
  }

  async approveInterest(interest: InterestRequest): Promise<void> {
    try {
      await this.projectService.approveInterest(interest.id);
      this.interests.update((list) =>
        list.map((i) => (i.id === interest.id ? { ...i, status: 'approved' as const } : i))
      );
      // Reload project to get updated contributors
      const id = this.project()?.id;
      if (id) {
        const project = await this.projectService.getProjectById(id, this.api.isAdmin());
        this.project.set(project);
      }
    } catch {
      this.snackbar.error('Failed to approve');
    }
  }

  async rejectInterest(interest: InterestRequest): Promise<void> {
    const note = prompt('Reason for rejection (optional):');
    try {
      await this.projectService.rejectInterest(interest.id, note || undefined);
      this.interests.update((list) =>
        list.map((i) => (i.id === interest.id ? { ...i, status: 'rejected' as const } : i))
      );
    } catch {
      this.snackbar.error('Failed to reject');
    }
  }

  editProject(): void {
    const id = this.project()?.id;
    if (id) {
      this.router.navigate(['/projects', id, 'edit']);
    }
  }

  async archiveProject(): Promise<void> {
    const project = this.project();
    if (!project || !this.canManage()) return;
    if (!confirm(`Disable project "${project.title}"? It will be hidden from everyone except admins and managers.`)) return;

    try {
      await this.projectService.archiveProject(project.id);
      this.project.update((p) => (p ? { ...p, archived_at: new Date().toISOString() } : p));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message ?? String(err);
      this.snackbar.error(`Failed to disable project: ${msg}`);
    }
  }

  async unarchiveProject(): Promise<void> {
    const project = this.project();
    if (!project || !this.canManage()) return;

    try {
      await this.projectService.unarchiveProject(project.id);
      this.project.update((p) => (p ? { ...p, archived_at: null } : p));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message ?? String(err);
      this.snackbar.error(`Failed to enable project: ${msg}`);
    }
  }

  async deleteProject(): Promise<void> {
    const project = this.project();
    if (!project || !this.canManage()) return;
    if (!confirm(`Permanently delete project "${project.title}"? This cannot be undone. The project will be hidden from everyone.`)) return;

    try {
      await this.projectService.deleteProject(project.id);
      this.router.navigate(['/projects']);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message ?? String(err);
      this.snackbar.error(`Failed to delete project: ${msg}`);
    }
  }

  toggleAdminMenu(): void {
    this.showAdminMenu.update((v) => !v);
  }

  closeAdminMenu(): void {
    this.showAdminMenu.set(false);
  }

  onCommentInput(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement;
    const text = textarea.value;
    const cursorPos = textarea.selectionStart;
    
    const textBeforeCursor = text.substring(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');
    
    if (atIndex !== -1 && (atIndex === 0 || textBeforeCursor[atIndex - 1] === ' ')) {
      const query = textBeforeCursor.substring(atIndex + 1);
      if (!query.includes(' ')) {
        this.showMentions = true;
        this.mentionSearch = query.toLowerCase();
        this.mentionStartPos = atIndex;
        return;
      }
    }
    this.showMentions = false;
  }

  get filteredMentions(): Profile[] {
    const participants = this.projectParticipants();
    const currentUserId = this.api.user()?.id;
    return participants
      .filter((p) => p.id !== currentUserId)
      .filter((p) => 
        p.full_name.toLowerCase().includes(this.mentionSearch) ||
        p.email.toLowerCase().includes(this.mentionSearch)
      )
      .slice(0, 5);
  }

  insertMention(user: Profile): void {
    const beforeMention = this.newComment.substring(0, this.mentionStartPos);
    const afterMention = this.newComment.substring(this.mentionStartPos + this.mentionSearch.length + 1);
    this.newComment = `${beforeMention}@${user.full_name} ${afterMention}`;
    this.showMentions = false;
  }

  extractMentions(text: string): string[] {
    const mentionRegex = /@([A-Za-z\s]+?)(?=\s|$|@)/g;
    const mentions: string[] = [];
    let match;
    while ((match = mentionRegex.exec(text)) !== null) {
      mentions.push(match[1].trim());
    }
    return mentions;
  }

  async addComment(): Promise<void> {
    const project = this.project();
    if (!project || !this.newComment.trim()) return;

    try {
      const commentText = this.newComment.trim();
      const comment = await this.commentService.addProjectComment(project.id, commentText);
      this.comments.update((list) => [comment, ...list]);
      
      const currentUserId = this.api.user()?.id;
      const currentUserName = this.api.profile()?.full_name || 'Someone';
      
      const mentions = this.extractMentions(commentText);
      const participants = this.projectParticipants();
      
      const mentionedUserIds = participants
        .filter((p) => mentions.some((m) => p.full_name.toLowerCase().includes(m.toLowerCase())))
        .map((p) => p.id)
        .filter((id) => id !== currentUserId);

      if (mentionedUserIds.length > 0) {
        await this.notificationService.notifyUsers(
          mentionedUserIds,
          'mention',
          `${currentUserName} mentioned you in "${project.title}"`,
          commentText.substring(0, 100) + (commentText.length > 100 ? '...' : ''),
          `/projects/${project.id}`,
          { projectId: project.id },
        );
      }

      const otherParticipantIds = [
        ...(project.managers?.map(m => m.id) || []),
        ...(project.contributors?.map(c => c.id) || []),
        project.created_by,
      ].filter((id, index, arr) => 
        id && 
        id !== currentUserId && 
        arr.indexOf(id) === index &&
        !mentionedUserIds.includes(id)
      );

      if (otherParticipantIds.length > 0) {
        await this.notificationService.notifyUsers(
          otherParticipantIds as string[],
          'comment',
          `New comment on "${project.title}"`,
          `${currentUserName}: ${commentText.substring(0, 100)}${commentText.length > 100 ? '...' : ''}`,
          `/projects/${project.id}`,
          { projectId: project.id },
        );
      }
      
      this.newComment = '';
      this.showMentions = false;
    } catch {
      this.snackbar.error('Failed to add comment');
    }
  }
}
