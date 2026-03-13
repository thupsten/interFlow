import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../../services/api';
import { SnackbarService } from '../../services/snackbar.service';
import { TaskService } from '../../services/task.service';
import type { Task } from '../../interfaces/database.types';

@Component({
  selector: 'app-tasks',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './tasks.html',
  styleUrl: './tasks.scss',
})
export class Tasks implements OnInit {
  readonly api = inject(Api);
  readonly taskService = inject(TaskService);
  readonly snackbar = inject(SnackbarService);

  readonly loading = signal(true);
  readonly tasks = signal<Task[]>([]);
  readonly searchQuery = signal('');
  readonly selectedStatus = signal<string>('all');
  readonly viewMode = signal<'my' | 'all'>('my');

  readonly filteredTasks = computed(() => {
    let result = this.tasks();
    const query = this.searchQuery().toLowerCase();
    const status = this.selectedStatus();

    if (query) {
      result = result.filter((t) => t.title.toLowerCase().includes(query));
    }
    if (status !== 'all') {
      result = result.filter((t) => t.status === status);
    }
    return result;
  });

  async ngOnInit(): Promise<void> {
    await this.loadTasks();
  }

  async loadTasks(): Promise<void> {
    this.loading.set(true);
    try {
      const tasks =
        this.viewMode() === 'my'
          ? await this.taskService.getMyTasks()
          : await this.taskService.getTasks();
      this.tasks.set(tasks);
    } finally {
      this.loading.set(false);
    }
  }

  async toggleView(mode: 'my' | 'all'): Promise<void> {
    this.viewMode.set(mode);
    await this.loadTasks();
  }

  async markComplete(task: Task): Promise<void> {
    try {
      await this.taskService.completeTask(task.id);
      await this.loadTasks();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message ?? String(err);
      console.error('Complete task error:', err);
      this.snackbar.error(`Failed to complete task: ${msg}. If this is a permission error, run the SQL in supabase/RUN_THIS_TO_FIX_TASK_START.md`);
    }
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

  formatDate(date: string | null): string {
    if (!date) return 'No due date';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  }

  isOverdue(date: string | null): boolean {
    if (!date) return false;
    return new Date(date) < new Date();
  }
}
