import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Api } from '../../services/api';
import { TaskService } from '../../services/task.service';
import { TimeTrackingService } from '../../services/time-tracking.service';
import { SnackbarService } from '../../services/snackbar.service';
import type { Task, TimeLog } from '../../interfaces/database.types';

type TaskStatus = 'not_started' | 'in_progress' | 'completed';

interface Column {
  id: TaskStatus;
  title: string;
  icon: string;
  color: string;
}

@Component({
  selector: 'app-task-board',
  standalone: true,
  imports: [RouterLink, FormsModule],
  templateUrl: './task-board.html',
  styleUrl: './task-board.scss',
})
export class TaskBoard implements OnInit {
  readonly api = inject(Api);
  readonly taskService = inject(TaskService);
  readonly timeTrackingService = inject(TimeTrackingService);
  readonly snackbar = inject(SnackbarService);

  readonly loading = signal(true);
  readonly tasks = signal<Task[]>([]);
  readonly draggedTask = signal<Task | null>(null);
  readonly myTimeLogs = signal<TimeLog[]>([]);

  readonly columns: Column[] = [
    { id: 'not_started', title: 'To Do', icon: 'bi-circle', color: '#94a3b8' },
    { id: 'in_progress', title: 'In Progress', icon: 'bi-play-circle-fill', color: '#3b82f6' },
    { id: 'completed', title: 'Done', icon: 'bi-check-circle-fill', color: '#10b981' },
  ];

  showTimeLogModal = false;
  selectedTaskForTimeLog: Task | null = null;
  timeLogForm = { hours: 1, description: '' };
  submittingTimeLog = false;

  readonly tasksByStatus = computed(() => {
    const allTasks = this.tasks();
    const grouped: Record<TaskStatus, Task[]> = {
      not_started: [],
      in_progress: [],
      completed: [],
    };

    allTasks.forEach((task) => {
      const status = task.status as TaskStatus;
      if (grouped[status]) {
        grouped[status].push(task);
      }
    });

    return grouped;
  });

  readonly stats = computed(() => {
    const allTasks = this.tasks();
    return {
      total: allTasks.length,
      notStarted: allTasks.filter((t) => t.status === 'not_started').length,
      inProgress: allTasks.filter((t) => t.status === 'in_progress').length,
      completed: allTasks.filter((t) => t.status === 'completed').length,
    };
  });

  async ngOnInit(): Promise<void> {
    try {
      const [tasks, timeLogs] = await Promise.all([
        this.taskService.getMyTasks(),
        this.timeTrackingService.getMyTimeLogs(),
      ]);
      this.tasks.set(tasks);
      this.myTimeLogs.set(timeLogs);
    } finally {
      this.loading.set(false);
    }
  }

  onDragStart(event: DragEvent, task: Task): void {
    this.draggedTask.set(task);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', task.id);
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  async onDrop(event: DragEvent, newStatus: TaskStatus): Promise<void> {
    event.preventDefault();
    const task = this.draggedTask();
    if (!task || task.status === newStatus) {
      this.draggedTask.set(null);
      return;
    }

    try {
      await this.taskService.updateTaskStatus(task.id, newStatus);
      this.tasks.update((list) =>
        list.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t))
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message ?? String(err);
      console.error('Task status update error:', err);
      this.snackbar.error(`Failed to update task status: ${msg}. If this is a permission error, run the SQL in supabase/RUN_THIS_TO_FIX_TASK_START.md`);
    } finally {
      this.draggedTask.set(null);
    }
  }

  async changeStatus(task: Task, newStatus: TaskStatus): Promise<void> {
    if (task.status === newStatus) return;

    try {
      await this.taskService.updateTaskStatus(task.id, newStatus);
      this.tasks.update((list) =>
        list.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t))
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message ?? String(err);
      console.error('Task status update error:', err);
      this.snackbar.error(`Failed to update task status: ${msg}. If this is a permission error, run the SQL in supabase/RUN_THIS_TO_FIX_TASK_START.md`);
    }
  }

  openTimeLogModal(task: Task): void {
    this.selectedTaskForTimeLog = task;
    this.timeLogForm = { hours: 1, description: '' };
    this.showTimeLogModal = true;
  }

  closeTimeLogModal(): void {
    this.showTimeLogModal = false;
    this.selectedTaskForTimeLog = null;
  }

  async submitTimeLog(): Promise<void> {
    if (!this.selectedTaskForTimeLog || this.timeLogForm.hours <= 0) return;

    const { hours, description } = this.timeLogForm;
    const task = this.selectedTaskForTimeLog;
    this.submittingTimeLog = true;
    try {
      const log = await this.timeTrackingService.logTime(task.id, hours, description);
      this.closeTimeLogModal();
      this.timeLogForm = { hours: 1, description: '' };
      this.myTimeLogs.update((logs) => [{ ...log, task } as TimeLog, ...logs]);
      this.snackbar.success(`Logged ${hours} hour(s) on "${task.title}"`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message ?? 'Unknown error';
      this.snackbar.error(`Failed to log time: ${msg}`);
    } finally {
      this.submittingTimeLog = false;
    }
  }

  getColumnTasks(status: TaskStatus): Task[] {
    return this.tasksByStatus()[status] || [];
  }

  getPriorityClass(priority: string): string {
    const map: Record<string, string> = { high: 'danger', medium: 'warning', low: 'info' };
    return map[priority] || 'secondary';
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  getTimeLogTaskTitle(log: TimeLog): string {
    const t = (log as { task?: { title?: string } }).task;
    return t?.title ?? 'Unknown task';
  }

  getTimeLogProjectTitle(log: TimeLog): string {
    const t = (log as { task?: { project?: { title?: string } } }).task;
    return t?.project?.title ?? '—';
  }

  isOverdue(task: Task): boolean {
    if (!task.expected_end_date || task.status === 'completed') return false;
    return new Date(task.expected_end_date) < new Date();
  }
}
