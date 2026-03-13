import { Component, OnInit, AfterViewInit, inject, signal, ViewChild, ElementRef } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Chart, registerables } from 'chart.js';
import { Api } from '../../services/api';
import { ProjectService } from '../../services/project.service';
import { TaskService } from '../../services/task.service';
import { UserService } from '../../services/user.service';
import type { Project, Task, InterestRequest, Profile, ActivityLog } from '../../interfaces/database.types';

Chart.register(...registerables);

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.scss',
})
export class AdminDashboard implements OnInit, AfterViewInit {
  readonly api = inject(Api);
  readonly projectService = inject(ProjectService);
  readonly taskService = inject(TaskService);
  readonly userService = inject(UserService);

  readonly loading = signal(true);

  @ViewChild('projectStatusChart') projectStatusChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('activityChart') activityChartRef!: ElementRef<HTMLCanvasElement>;
  
  private projectStatusChart: Chart | null = null;
  private activityChart: Chart | null = null;

  readonly stats = signal({
    totalUsers: 0,
    activeUsers: 0,
    pendingInvites: 0,
    totalProjects: 0,
    activeProjects: 0,
    completedProjects: 0,
    delayedProjects: 0,
    notStartedProjects: 0,
    onHoldProjects: 0,
    totalTasks: 0,
    overdueTasks: 0,
    pendingInterests: 0,
  });

  readonly recentProjects = signal<Project[]>([]);
  readonly pendingInterests = signal<InterestRequest[]>([]);
  readonly overdueTasks = signal<Task[]>([]);
  readonly recentUsers = signal<Profile[]>([]);
  readonly recentActivity = signal<ActivityLog[]>([]);

  async ngOnInit(): Promise<void> {
    try {
      await this.loadDashboardData();
    } finally {
      this.loading.set(false);
      // Charts are inside @if (!loading()) - wait for DOM to render
      setTimeout(() => this.renderCharts(), 150);
    }
  }

  ngAfterViewInit(): void {}

  private async loadDashboardData(): Promise<void> {
    const [projectStats, taskStats, userStats, projects, interests, overdue, users, activity] =
      await Promise.all([
        this.projectService.getProjectStats(),
        this.taskService.getTaskStats(),
        this.userService.getUserStats(),
        this.projectService.getProjects(),
        this.projectService.getPendingInterests(),
        this.taskService.getOverdueTasks(),
        this.userService.getUsers(),
        this.loadRecentActivity(),
      ]);

    this.stats.set({
      totalUsers: userStats.total,
      activeUsers: userStats.active,
      pendingInvites: userStats.pending ?? 0,
      totalProjects: projectStats.total,
      activeProjects: projectStats.in_progress,
      completedProjects: projectStats.completed,
      delayedProjects: projectStats.delayed,
      notStartedProjects: projectStats.not_started,
      onHoldProjects: projectStats.on_hold,
      totalTasks: taskStats.total,
      overdueTasks: taskStats.overdue,
      pendingInterests: interests.length,
    });

    this.recentProjects.set(projects.slice(0, 5));
    this.pendingInterests.set(interests.slice(0, 5));
    this.overdueTasks.set(overdue.slice(0, 5));
    this.recentUsers.set(users.slice(0, 5));
    this.recentActivity.set(activity);
  }

  private async loadRecentActivity(): Promise<ActivityLog[]> {
    const { data } = await this.api.supabase
      .from('activity_log')
      .select(`*, actor:profiles(full_name)`)
      .order('created_at', { ascending: false })
      .limit(10);
    return (data as ActivityLog[]) || [];
  }

  private renderCharts(): void {
    this.renderProjectStatusChart();
    this.renderActivityChart();
  }

  private renderProjectStatusChart(): void {
    const ctx = this.projectStatusChartRef?.nativeElement?.getContext('2d');
    if (!ctx) return;

    if (this.projectStatusChart) this.projectStatusChart.destroy();

    const s = this.stats();

    this.projectStatusChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Completed', 'In Progress', 'Not Started', 'Delayed', 'On Hold'],
        datasets: [{
          data: [s.completedProjects, s.activeProjects, s.notStartedProjects, s.delayedProjects, s.onHoldProjects],
          backgroundColor: ['#50B748', '#2B318D', '#64748b', '#dc2626', '#f59e0b'],
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { padding: 15, usePointStyle: true, font: { size: 11 } },
          },
        },
      },
    });
  }

  private renderActivityChart(): void {
    const ctx = this.activityChartRef?.nativeElement?.getContext('2d');
    if (!ctx) return;

    if (this.activityChart) this.activityChart.destroy();

    const last7Days: string[] = [];
    const activityCounts: number[] = [];
    const activities = this.recentActivity();

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      last7Days.push(d.toLocaleDateString('en-US', { weekday: 'short' }));
      activityCounts.push(activities.filter(a => a.created_at.split('T')[0] === dateStr).length);
    }

    this.activityChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: last7Days,
        datasets: [{
          label: 'Activities',
          data: activityCounts,
          backgroundColor: '#2B318D',
          borderRadius: 6,
          maxBarThickness: 40,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: '#f1f5f9' } },
          x: { grid: { display: false } },
        },
      },
    });
  }

  async approveInterest(id: string): Promise<void> {
    await this.projectService.approveInterest(id);
    this.pendingInterests.update((list) => list.filter((i) => i.id !== id));
    this.stats.update((s) => ({ ...s, pendingInterests: s.pendingInterests - 1 }));
  }

  async rejectInterest(id: string): Promise<void> {
    await this.projectService.rejectInterest(id);
    this.pendingInterests.update((list) => list.filter((i) => i.id !== id));
    this.stats.update((s) => ({ ...s, pendingInterests: s.pendingInterests - 1 }));
  }

  getStatusClass(status: string): string {
    const map: Record<string, string> = {
      not_started: 'secondary', in_progress: 'primary', completed: 'success',
      delayed: 'danger', on_hold: 'warning',
    };
    return map[status] || 'secondary';
  }

  getPriorityClass(priority: string): string {
    const map: Record<string, string> = { high: 'danger', medium: 'warning', low: 'info' };
    return map[priority] || 'secondary';
  }

  getRoleClass(role: string): string {
    const map: Record<string, string> = { admin: 'danger', manager: 'primary', user: 'secondary' };
    return map[role] || 'secondary';
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  formatRelativeTime(date: string): string {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return this.formatDate(date);
  }

  getInitials(name: string): string {
    return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  }
}
