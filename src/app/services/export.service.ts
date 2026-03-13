import { Injectable, inject } from '@angular/core';
import { ProjectService } from './project.service';
import { TaskService } from './task.service';
import { TimeTrackingService } from './time-tracking.service';
import { Api } from './api';

@Injectable({
  providedIn: 'root',
})
export class ExportService {
  private readonly api = inject(Api);
  private readonly projectService = inject(ProjectService);
  private readonly taskService = inject(TaskService);
  private readonly timeTracking = inject(TimeTrackingService);

  private escapeCsv(val: unknown): string {
    if (val == null) return '';
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  private downloadCsv(filename: string, rows: string[][]): void {
    const csv = rows.map((row) => row.map((c) => this.escapeCsv(c)).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async exportProjects(): Promise<void> {
    const projects = await this.projectService.getProjects();
    const rows: string[][] = [
      ['Title', 'Status', 'Priority', 'Start Date', 'End Date', 'Created At'],
      ...projects.map((p) => [
        p.title,
        p.status,
        p.priority,
        p.start_date,
        p.expected_end_date,
        p.created_at,
      ]),
    ];
    this.downloadCsv(`projects-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  async exportTasks(projectId?: string): Promise<void> {
    type TaskRow = { title: string; status: string; priority: string; project?: { title: string }; expected_end_date?: string | null; created_at: string };
    let tasks: TaskRow[];
    if (projectId) {
      tasks = await this.taskService.getTasks(projectId) as TaskRow[];
    } else {
      const projects = await this.projectService.getProjects();
      const all: TaskRow[] = [];
      for (const p of projects) {
        const t = await this.taskService.getTasks(p.id);
        all.push(...t.map((x) => ({ ...x, project: { title: p.title } })));
      }
      tasks = all;
    }
    const rows: string[][] = [
      ['Task', 'Project', 'Status', 'Priority', 'Due Date', 'Created'],
      ...tasks.map((t) => [
        t.title,
        t.project?.title ?? '',
        t.status,
        t.priority,
        t.expected_end_date ?? '',
        t.created_at,
      ]),
    ];
    this.downloadCsv(`tasks-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  async exportTimeLogs(userId?: string): Promise<void> {
    const userIdToUse = userId || this.api.user()?.id;
    if (!userIdToUse) return;

    const logs = await this.timeTracking.getEmployeeTimeLogs(userIdToUse);
    const rows: string[][] = [
      ['Date', 'Hours', 'Description', 'Task', 'Project'],
      ...logs.map((l) => {
        const t = (l as { task?: { title?: string; project?: { title?: string } } }).task;
        return [
          l.log_date,
          String(l.hours),
          l.description ?? '',
          t?.title ?? '',
          t?.project?.title ?? '',
        ];
      }),
    ];
    this.downloadCsv(`time-logs-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }
}
