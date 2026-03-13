import { Component, OnInit, inject, signal, computed, ViewChild, ElementRef } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Chart, registerables } from 'chart.js';
import { Api } from '../../services/api';
import { UserService } from '../../services/user.service';
import { ProjectService } from '../../services/project.service';
import { TimeTrackingService } from '../../services/time-tracking.service';
import { ExportService } from '../../services/export.service';
import { SnackbarService } from '../../services/snackbar.service';
import type { Profile, Project, TimeLog } from '../../interfaces/database.types';

Chart.register(...registerables);

@Component({
  selector: 'app-time-logs',
  standalone: true,
  imports: [RouterLink, FormsModule],
  templateUrl: './time-logs.html',
  styleUrl: './time-logs.scss',
})
export class TimeLogs implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly api = inject(Api);
  readonly userService = inject(UserService);
  readonly projectService = inject(ProjectService);
  readonly timeTracking = inject(TimeTrackingService);
  readonly exportService = inject(ExportService);
  readonly snackbar = inject(SnackbarService);

  @ViewChild('chartRef') chartRef!: ElementRef<HTMLCanvasElement>;
  private chart: Chart | null = null;

  readonly loading = signal(true);
  readonly exporting = signal(false);
  readonly employees = signal<Profile[]>([]);
  readonly selectedEmployee = signal<Profile | null>(null);
  readonly employeeProjects = signal<Project[]>([]);
  readonly employeeTimeLogs = signal<TimeLog[]>([]);
  readonly chartData = signal<{ date: string; hours: number }[]>([]);
  readonly searchQuery = signal('');
  readonly periodFilter = signal<'week' | 'month' | 'year'>('week');

  readonly filteredEmployees = computed(() => {
    let list = this.employees();
    const q = this.searchQuery().toLowerCase();
    if (q) {
      list = list.filter(
        (e) =>
          e.full_name.toLowerCase().includes(q) ||
          (e.email?.toLowerCase().includes(q) ?? false) ||
          (e.department?.toLowerCase().includes(q) ?? false)
      );
    }
    return list;
  });

  readonly totalHours = computed(() =>
    this.employeeTimeLogs().reduce((sum, log) => sum + Number(log.hours), 0)
  );

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    await this.loadEmployees();
    const userId = this.route.snapshot.paramMap.get('userId');
    if (userId) {
      const emp = this.employees().find((e) => e.id === userId) ?? (await this.fetchEmployee(userId));
      if (emp) {
        this.selectedEmployee.set(emp);
        await this.loadEmployeeDetail(emp.id);
      }
    }
    this.loading.set(false);
    this.route.paramMap.subscribe(async (params) => {
      const uid = params.get('userId');
      if (uid && uid !== this.selectedEmployee()?.id) {
        const emp = this.employees().find((e) => e.id === uid) ?? (await this.fetchEmployee(uid));
        if (emp) {
          this.selectedEmployee.set(emp);
          await this.loadEmployeeDetail(emp.id);
        }
      } else if (!uid) {
        this.selectedEmployee.set(null);
      }
    });
  }

  private async fetchEmployee(userId: string): Promise<Profile | null> {
    try {
      return await this.userService.getUserById(userId);
    } catch {
      return null;
    }
  }

  private async loadEmployees(): Promise<void> {
    try {
      const users = await this.userService.getUsers();
      this.employees.set(users.filter((u) => u.role === 'user'));
    } catch {
      this.employees.set([]);
    }
  }

  async selectEmployee(emp: Profile): Promise<void> {
    this.selectedEmployee.set(emp);
    this.router.navigate(['/time-logs', emp.id]);
    await this.loadEmployeeDetail(emp.id);
  }

  async loadEmployeeDetail(userId: string): Promise<void> {
    this.loading.set(true);
    try {
      const [projects, logs, chartData] = await Promise.all([
        this.projectService.getProjectsForUser(userId),
        this.timeTracking.getEmployeeTimeLogs(userId, ...this.getDateRange()),
        this.timeTracking.getEmployeeTimeLogsByDay(userId, 7),
      ]);
      this.employeeProjects.set(projects);
      this.employeeTimeLogs.set(logs);
      this.chartData.set(chartData);
      setTimeout(() => this.renderChart(), 100);
    } catch {
      this.employeeProjects.set([]);
      this.employeeTimeLogs.set([]);
      this.chartData.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  private getDateRange(): [string | undefined, string | undefined] {
    const [start, end] = this.timeTracking.getDateRangeForPeriod(this.periodFilter());
    return [start, end];
  }

  async setPeriod(period: 'week' | 'month' | 'year'): Promise<void> {
    this.periodFilter.set(period);
    const emp = this.selectedEmployee();
    if (emp) await this.loadEmployeeDetail(emp.id);
  }

  backToList(): void {
    this.selectedEmployee.set(null);
    this.router.navigate(['/time-logs']);
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

  getTimeLogTaskTitle(log: TimeLog): string {
    const t = (log as { task?: { title?: string } }).task;
    return t?.title ?? '—';
  }

  getTimeLogProjectTitle(log: TimeLog): string {
    const t = (log as { task?: { project?: { title?: string } } }).task;
    return t?.project?.title ?? '—';
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  getInitials(name: string): string {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  async exportTimeLogs(): Promise<void> {
    const emp = this.selectedEmployee();
    if (!emp) return;
    this.exporting.set(true);
    try {
      await this.exportService.exportTimeLogs(emp.id);
      this.snackbar.success('Time logs exported');
    } catch {
      this.snackbar.error('Export failed');
    } finally {
      this.exporting.set(false);
    }
  }
}
