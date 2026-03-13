import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Api } from '../../services/api';
import { TaskService } from '../../services/task.service';
import { ProjectService } from '../../services/project.service';
import { CommentService } from '../../services/comment.service';
import { TimeTrackingService } from '../../services/time-tracking.service';
import { SnackbarService } from '../../services/snackbar.service';
import type { Task, Project, TaskComment } from '../../interfaces/database.types';

@Component({
  selector: 'app-my-work',
  standalone: true,
  imports: [RouterLink, FormsModule],
  templateUrl: './my-work.html',
  styleUrl: './my-work.scss',
})
export class MyWork implements OnInit {
  readonly api = inject(Api);
  readonly taskService = inject(TaskService);
  readonly projectService = inject(ProjectService);
  readonly commentService = inject(CommentService);
  readonly timeTrackingService = inject(TimeTrackingService);
  readonly snackbar = inject(SnackbarService);

  readonly loading = signal(true);
  readonly myTasks = signal<Task[]>([]);
  readonly myProjects = signal<Project[]>([]);
  readonly selectedFilter = signal<'all' | 'in_progress' | 'overdue' | 'completed'>('all');

  // Expanded task state
  readonly expandedTaskId = signal<string | null>(null);
  readonly taskComments = signal<TaskComment[]>([]);
  readonly loadingComments = signal(false);
  
  // Reply/Comment form
  newComment = '';
  submittingComment = false;

  // Time log form
  showTimeLogForm = false;
  timeLogForm = { hours: 1, description: '' };
  submittingTimeLog = false;

  get filteredTasks() {
    const filter = this.selectedFilter();
    const tasks = this.myTasks();
    const today = new Date().toISOString().split('T')[0];

    switch (filter) {
      case 'in_progress':
        return tasks.filter((t) => t.status === 'in_progress');
      case 'overdue':
        return tasks.filter((t) => t.expected_end_date && t.expected_end_date < today && t.status !== 'completed');
      case 'completed':
        return tasks.filter((t) => t.status === 'completed');
      default:
        return tasks;
    }
  }

  get stats() {
    const tasks = this.myTasks();
    const today = new Date().toISOString().split('T')[0];
    return {
      total: tasks.length,
      inProgress: tasks.filter((t) => t.status === 'in_progress').length,
      overdue: tasks.filter((t) => t.expected_end_date && t.expected_end_date < today && t.status !== 'completed').length,
      completed: tasks.filter((t) => t.status === 'completed').length,
    };
  }

  async ngOnInit(): Promise<void> {
    await this.loadData();
  }

  async loadData(): Promise<void> {
    this.loading.set(true);
    try {
      const [tasks, projects] = await Promise.all([
        this.taskService.getMyTasks(),
        this.projectService.getMyProjects(),
      ]);
      this.myTasks.set(tasks);
      this.myProjects.set(projects);
    } finally {
      this.loading.set(false);
    }
  }

  setFilter(filter: 'all' | 'in_progress' | 'overdue' | 'completed'): void {
    this.selectedFilter.set(filter);
  }

  async markComplete(task: Task): Promise<void> {
    try {
      await this.taskService.completeTask(task.id);
      this.myTasks.update((list) =>
        list.map((t) =>
          t.id === task.id ? { ...t, status: 'completed' as const, review_status: 'pending_review' as const } : t
        )
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message ?? String(err);
      console.error('Mark complete error:', err);
      this.snackbar.error(`Failed to mark task as complete: ${msg}. If this is a permission error, run the SQL in supabase/RUN_THIS_TO_FIX_TASK_START.md`);
    }
  }

  async updateStatus(task: Task, status: string): Promise<void> {
    try {
      await this.taskService.updateTask(task.id, { status: status as Task['status'] });
      this.myTasks.update((list) => list.map((t) => (t.id === task.id ? { ...t, status: status as Task['status'] } : t)));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message ?? String(err);
      console.error('Task status update error:', err);
      this.snackbar.error(`Failed to update task status: ${msg}. If this is a permission error, run the SQL in supabase/RUN_THIS_TO_FIX_TASK_START.md`);
    }
  }

  async startTask(task: Task): Promise<void> {
    try {
      await this.taskService.updateTaskStatus(task.id, 'in_progress');
      this.myTasks.update((list) =>
        list.map((t) => (t.id === task.id ? { ...t, status: 'in_progress' as const } : t))
      );
      this.expandedTaskId.set(task.id);
      this.loadingComments.set(true);
      try {
        const comments = await this.commentService.getTaskComments(task.id);
        this.taskComments.set(comments);
      } catch {
        this.taskComments.set([]);
      } finally {
        this.loadingComments.set(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message ?? String(err);
      console.error('Start task error:', err);
      this.snackbar.error(`Failed to start task: ${msg}. Run the SQL in supabase/RUN_THIS_TO_FIX_TASK_START.md to fix permission.`);
    }
  }

  getPriorityClass(priority: string): string {
    return { high: 'danger', medium: 'warning', low: 'secondary' }[priority] || 'secondary';
  }

  getStatusClass(status: string): string {
    return { completed: 'success', in_progress: 'primary', delayed: 'danger', on_hold: 'warning', not_started: 'secondary' }[status] || 'secondary';
  }

  isOverdue(task: Task): boolean {
    if (!task.expected_end_date || task.status === 'completed') return false;
    return task.expected_end_date < new Date().toISOString().split('T')[0];
  }

  getDaysRemaining(date: string | null): string {
    if (!date) return '';
    const diff = Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return `${Math.abs(diff)} days overdue`;
    if (diff === 0) return 'Due today';
    if (diff === 1) return 'Due tomorrow';
    return `${diff} days left`;
  }

  async toggleTaskExpand(task: Task): Promise<void> {
    if (this.expandedTaskId() === task.id) {
      this.expandedTaskId.set(null);
      this.taskComments.set([]);
      return;
    }

    this.expandedTaskId.set(task.id);
    this.loadingComments.set(true);
    try {
      const comments = await this.commentService.getTaskComments(task.id);
      this.taskComments.set(comments);
    } catch {
      this.taskComments.set([]);
    } finally {
      this.loadingComments.set(false);
    }
  }

  isExpanded(taskId: string): boolean {
    return this.expandedTaskId() === taskId;
  }

  async submitComment(): Promise<void> {
    const taskId = this.expandedTaskId();
    if (!taskId || !this.newComment.trim()) return;

    this.submittingComment = true;
    try {
      const comment = await this.commentService.addTaskComment(taskId, this.newComment.trim());
      this.taskComments.update((list) => [comment, ...list]);
      this.newComment = '';
    } catch {
      this.snackbar.error('Failed to add comment');
    } finally {
      this.submittingComment = false;
    }
  }

  async submitTimeLog(): Promise<void> {
    const taskId = this.expandedTaskId();
    if (!taskId || this.timeLogForm.hours <= 0) return;

    this.submittingTimeLog = true;
    try {
      await this.timeTrackingService.logTime(taskId, this.timeLogForm.hours, this.timeLogForm.description);
      this.showTimeLogForm = false;
      this.timeLogForm = { hours: 1, description: '' };
      this.snackbar.success('Time logged successfully!');
    } catch {
      this.snackbar.error('Failed to log time');
    } finally {
      this.submittingTimeLog = false;
    }
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  formatTime(date: string): string {
    return new Date(date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  getInitials(name: string): string {
    return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  }
}
