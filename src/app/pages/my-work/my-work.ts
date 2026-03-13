import { Component, OnInit, AfterViewInit, inject, signal, ViewChild, ElementRef } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Chart, registerables } from 'chart.js';
import { Api } from '../../services/api';
import { TaskService } from '../../services/task.service';
import { ProjectService } from '../../services/project.service';
import { CommentService } from '../../services/comment.service';
import { TimeTrackingService } from '../../services/time-tracking.service';
import { SnackbarService } from '../../services/snackbar.service';
import type { Task, Project, TaskComment, TimeLog } from '../../interfaces/database.types';

Chart.register(...registerables);

@Component({
  selector: 'app-my-work',
  standalone: true,
  imports: [RouterLink, FormsModule],
  templateUrl: './my-work.html',
  styleUrl: './my-work.scss',
})
export class MyWork implements OnInit, AfterViewInit {
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

  // Time log chart
  @ViewChild('timeLogChartRef') timeLogChartRef!: ElementRef<HTMLCanvasElement>;
  private timeLogChart: Chart | null = null;
  readonly timeLogChartData = signal<{ date: string; hours: number }[]>([]);
  readonly myTimeLogs = signal<TimeLog[]>([]);

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
      const [tasks, projects, timeLogData, timeLogs] = await Promise.all([
        this.taskService.getMyTasks(),
        this.projectService.getMyProjects(),
        this.timeTrackingService.getMyTimeLogsByDay(7),
        this.timeTrackingService.getMyTimeLogs(),
      ]);
      this.myTasks.set(tasks);
      this.myProjects.set(projects);
      this.timeLogChartData.set(timeLogData);
      this.myTimeLogs.set(timeLogs);
      setTimeout(() => this.renderTimeLogChart(), 100);
    } finally {
      this.loading.set(false);
    }
  }

  ngAfterViewInit(): void {
    if (this.timeLogChartData().length > 0) {
      setTimeout(() => this.renderTimeLogChart(), 150);
    }
  }

  private renderTimeLogChart(): void {
    if (!this.timeLogChartRef?.nativeElement) return;
    if (this.timeLogChart) this.timeLogChart.destroy();

    const data = this.timeLogChartData();
    const labels = data.map((d) => {
      const date = new Date(d.date);
      return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    });
    const values = data.map((d) => d.hours);

    this.timeLogChart = new Chart(this.timeLogChartRef.nativeElement, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Hours Logged',
            data: values,
            backgroundColor: '#2B318D',
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1 } },
        },
      },
    });
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

    const { hours, description } = this.timeLogForm;
    const task = this.myTasks().find((t) => t.id === taskId);
    this.submittingTimeLog = true;
    try {
      const log = await this.timeTrackingService.logTime(taskId, hours, description);
      this.showTimeLogForm = false;
      this.timeLogForm = { hours: 1, description: '' };
      this.myTimeLogs.update((logs) => [{ ...log, task } as TimeLog, ...logs]);
      this.snackbar.success(`Logged ${hours} hour(s) on "${task?.title ?? 'task'}"`);
      const timeLogData = await this.timeTrackingService.getMyTimeLogsByDay(7);
      this.timeLogChartData.set(timeLogData);
      setTimeout(() => this.renderTimeLogChart(), 100);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message ?? 'Unknown error';
      this.snackbar.error(`Failed to log time: ${msg}`);
    } finally {
      this.submittingTimeLog = false;
    }
  }

  getTimeLogTaskTitle(log: TimeLog): string {
    const t = (log as { task?: { title?: string } }).task;
    return t?.title ?? 'Unknown task';
  }

  getTimeLogProjectTitle(log: TimeLog): string {
    const t = (log as { task?: { project?: { title?: string } } }).task;
    return t?.project?.title ?? '—';
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
