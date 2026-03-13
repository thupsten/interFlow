import { Component, OnInit, inject, signal, computed, ViewChild, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Chart, registerables } from 'chart.js';
import { TimeTrackingService } from '../../services/time-tracking.service';
import { TaskService } from '../../services/task.service';
import { SnackbarService } from '../../services/snackbar.service';
import type { TimeLog, Task } from '../../interfaces/database.types';

Chart.register(...registerables);

@Component({
  selector: 'app-my-time-logs',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './my-time-logs.html',
  styleUrl: './my-time-logs.scss',
})
export class MyTimeLogs implements OnInit {
  readonly timeTracking = inject(TimeTrackingService);
  readonly taskService = inject(TaskService);
  readonly snackbar = inject(SnackbarService);

  @ViewChild('chartRef') chartRef!: ElementRef<HTMLCanvasElement>;
  private chart: Chart | null = null;

  readonly loading = signal(true);
  readonly timeLogs = signal<TimeLog[]>([]);
  readonly myTasks = signal<Task[]>([]);
  readonly chartData = signal<{ date: string; hours: number }[]>([]);
  readonly periodFilter = signal<'week' | 'month' | 'year'>('month');
  readonly projectFilter = signal<string>(''); // '' = all projects
  readonly sortOrder = signal<'recent' | 'oldest'>('recent');
  readonly expandedLogId = signal<string | null>(null);
  readonly editingLogId = signal<string | null>(null);
  readonly editForm = signal<{ task_id: string; hours: number; log_date: string; description: string }>({
    task_id: '',
    hours: 1,
    log_date: '',
    description: '',
  });
  readonly savingEdit = signal(false);

  readonly filteredLogs = computed(() => {
    const logs = this.timeLogs();
    const period = this.periodFilter();
    const projectId = this.projectFilter();
    const order = this.sortOrder();
    const [start, end] = this.timeTracking.getDateRangeForPeriod(period);
    let result = logs.filter((l) => l.log_date >= start && l.log_date <= end);
    if (projectId) {
      result = result.filter((l) => {
        const proj = (l as { task?: { project?: { id?: string } } }).task?.project;
        return proj?.id === projectId;
      });
    }
    result = [...result].sort((a, b) => {
      const cmp = a.log_date.localeCompare(b.log_date) || (a.created_at?.localeCompare(b.created_at ?? '') ?? 0);
      return order === 'recent' ? -cmp : cmp;
    });
    return result;
  });

  readonly uniqueProjects = computed(() => {
    const logs = this.timeLogs();
    const seen = new Map<string, { id: string; title: string }>();
    logs.forEach((l) => {
      const proj = (l as { task?: { project?: { id?: string; title?: string } } }).task?.project;
      if (proj?.id && !seen.has(proj.id)) seen.set(proj.id, { id: proj.id, title: proj.title ?? '—' });
    });
    return Array.from(seen.values()).sort((a, b) => a.title.localeCompare(b.title));
  });

  readonly totalHours = computed(() =>
    this.filteredLogs().reduce((sum, log) => sum + Number(log.hours), 0)
  );

  /** Tasks available for the edit dropdown - my tasks + current task from log if not in list */
  getTasksForEdit(log: TimeLog): Task[] {
    const tasks = this.myTasks();
    const currentTaskId = log.task_id;
    const hasCurrent = tasks.some((t) => t.id === currentTaskId);
    if (hasCurrent) return tasks;
    const taskFromLog = (log as { task?: Task }).task;
    if (taskFromLog) return [{ ...taskFromLog, project: taskFromLog.project } as Task, ...tasks];
    return tasks;
  }

  async ngOnInit(): Promise<void> {
    await this.loadData();
  }

  async loadData(): Promise<void> {
    this.loading.set(true);
    try {
      const [logs, chartData, tasks] = await Promise.all([
        this.timeTracking.getMyTimeLogs(),
        this.timeTracking.getMyTimeLogsByDay(30),
        this.taskService.getMyTasks(),
      ]);
      this.timeLogs.set(logs);
      this.chartData.set(chartData);
      this.myTasks.set(tasks);
      setTimeout(() => this.renderChart(), 100);
    } catch {
      this.timeLogs.set([]);
      this.chartData.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  async setPeriod(period: 'week' | 'month' | 'year'): Promise<void> {
    this.periodFilter.set(period);
    const [start, end] = this.timeTracking.getDateRangeForPeriod(period);
    const logs = await this.timeTracking.getMyTimeLogs(start, end);
    this.timeLogs.set(logs);
  }

  toggleLogDetail(logId: string): void {
    this.expandedLogId.update((id) => (id === logId ? null : logId));
    this.editingLogId.set(null);
  }

  isExpanded(logId: string): boolean {
    return this.expandedLogId() === logId;
  }

  startEdit(log: TimeLog): void {
    this.editingLogId.set(log.id);
    this.editForm.set({
      task_id: log.task_id,
      hours: Number(log.hours),
      log_date: log.log_date,
      description: log.description ?? '',
    });
  }

  cancelEdit(): void {
    this.editingLogId.set(null);
  }

  async saveEdit(log: TimeLog): Promise<void> {
    const form = this.editForm();
    if (form.hours <= 0) {
      this.snackbar.error('Hours must be greater than 0');
      return;
    }
    if (!form.task_id) {
      this.snackbar.error('Please select a task');
      return;
    }
    this.savingEdit.set(true);
    try {
      await this.timeTracking.updateTimeLog(log.id, {
        task_id: form.task_id,
        hours: form.hours,
        log_date: form.log_date,
        description: form.description.trim() || undefined,
      });
      const selectedTask = this.myTasks().find((t) => t.id === form.task_id);
      this.timeLogs.update((logs) =>
        logs.map((l) =>
          l.id === log.id
            ? {
                ...l,
                task_id: form.task_id,
                hours: form.hours,
                log_date: form.log_date,
                description: form.description.trim() || null,
                task: selectedTask,
              }
            : l
        )
      );
      this.editingLogId.set(null);
      this.snackbar.success('Time log updated');
      const chartData = await this.timeTracking.getMyTimeLogsByDay(30);
      this.chartData.set(chartData);
      setTimeout(() => this.renderChart(), 100);
    } catch {
      this.snackbar.error('Failed to update time log');
    } finally {
      this.savingEdit.set(false);
    }
  }

  isEditing(logId: string): boolean {
    return this.editingLogId() === logId;
  }

  private renderChart(): void {
    if (!this.chartRef?.nativeElement) return;
    if (this.chart) this.chart.destroy();

    const data = this.chartData();
    const labels = data.map((d) => {
      const date = new Date(d.date);
      return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    });
    const values = data.map((d) => d.hours);

    this.chart = new Chart(this.chartRef.nativeElement, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Hours Logged',
            data: values,
            backgroundColor: '#0d9488',
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
      },
    });
  }

  getTaskTitle(log: TimeLog): string {
    const t = (log as { task?: { title?: string } }).task;
    return t?.title ?? '—';
  }

  getProjectTitle(log: TimeLog): string {
    const t = (log as { task?: { project?: { title?: string } } }).task;
    return t?.project?.title ?? '—';
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  formatTime(date: string): string {
    return new Date(date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }
}
