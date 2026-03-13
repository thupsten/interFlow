import { Component, OnInit, AfterViewInit, inject, signal, ViewChild, ElementRef } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Chart, registerables } from 'chart.js';
import { Api } from '../../services/api';
import { ProjectService } from '../../services/project.service';
import { TaskService } from '../../services/task.service';
import { NotificationService } from '../../services/notification.service';
import { FavoriteService } from '../../services/favorite.service';
import { TimeTrackingService } from '../../services/time-tracking.service';
import { SkillService } from '../../services/skill.service';
import { SnackbarService } from '../../services/snackbar.service';
import type { Project, Task, InterestRequest, Notification, UserSkill } from '../../interfaces/database.types';

Chart.register(...registerables);

@Component({
  selector: 'app-employee-dashboard',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './employee-dashboard.html',
  styleUrl: './employee-dashboard.scss',
})
export class EmployeeDashboard implements OnInit, AfterViewInit {
  @ViewChild('taskChartRef') taskChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('hoursChartRef') hoursChartRef!: ElementRef<HTMLCanvasElement>;

  readonly api = inject(Api);
  readonly projectService = inject(ProjectService);
  readonly taskService = inject(TaskService);
  readonly notificationService = inject(NotificationService);
  readonly favoriteService = inject(FavoriteService);
  readonly timeTrackingService = inject(TimeTrackingService);
  readonly skillService = inject(SkillService);
  readonly snackbar = inject(SnackbarService);

  readonly loading = signal(true);

  // Stats
  readonly stats = signal({
    myTasks: 0,
    completedTasks: 0,
    overdueTasks: 0,
    pendingInterests: 0,
    approvedInterests: 0,
    availableProjects: 0,
    weeklyHours: 0,
    monthlyHours: 0,
  });

  // Data
  readonly myTasks = signal<Task[]>([]);
  readonly myInterests = signal<InterestRequest[]>([]);
  readonly recommendedProjects = signal<Project[]>([]);
  readonly favoriteProjects = signal<Project[]>([]);
  readonly mySkills = signal<UserSkill[]>([]);
  readonly notifications = signal<Notification[]>([]);
  readonly upcomingDeadlines = signal<Task[]>([]);

  private taskChart: Chart | null = null;
  private hoursChart: Chart | null = null;

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
    const userId = this.api.user()?.id;
    if (!userId) return;

    // Load my tasks
    const tasks = await this.taskService.getMyTasks();
    this.myTasks.set(tasks.filter((t) => t.status !== 'completed').slice(0, 5));

    // Calculate upcoming deadlines (next 7 days)
    const today = new Date();
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const upcoming = tasks.filter((t) => {
      if (!t.expected_end_date || t.status === 'completed') return false;
      const due = new Date(t.expected_end_date);
      return due >= today && due <= nextWeek;
    });
    this.upcomingDeadlines.set(upcoming.slice(0, 3));

    // Load my interest requests
    const { data: interests } = await this.api.supabase
      .from('interest_requests')
      .select(`*, project:projects(id, title, brief, status)`)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    this.myInterests.set((interests as InterestRequest[]) || []);

    // Load recommended projects (visible projects user hasn't shown interest in)
    const interestProjectIds = new Set(interests?.map((i) => i.project_id) || []);
    const projects = await this.projectService.getProjects();
    const recommended = projects.filter((p) => !interestProjectIds.has(p.id)).slice(0, 4);
    this.recommendedProjects.set(recommended);

    // Load notifications
    await this.notificationService.loadNotifications();
    this.notifications.set(this.notificationService.notifications().slice(0, 5));

    // Calculate stats
    const completedCount = tasks.filter((t) => t.status === 'completed').length;
    const overdueCount = tasks.filter((t) => {
      if (!t.expected_end_date || t.status === 'completed') return false;
      return new Date(t.expected_end_date) < today;
    }).length;
    const pendingInterests = interests?.filter((i) => i.status === 'pending').length || 0;
    const approvedInterests = interests?.filter((i) => i.status === 'approved').length || 0;

    // Load favorite projects
    const favorites = await this.favoriteService.getFavoriteProjects();
    this.favoriteProjects.set(favorites);

    // Load my skills
    const skills = await this.skillService.getMySkills();
    this.mySkills.set(skills);

    // Load time tracking stats
    const weeklyHours = await this.timeTrackingService.getWeeklyHours();
    const monthlyHours = await this.timeTrackingService.getMonthlyHours();

    this.stats.set({
      myTasks: tasks.length,
      completedTasks: completedCount,
      overdueTasks: overdueCount,
      pendingInterests,
      approvedInterests,
      availableProjects: projects.length,
      weeklyHours,
      monthlyHours,
    });
  }

  private renderCharts(): void {
    this.renderTaskChart();
    this.renderHoursChart();
  }

  private renderTaskChart(): void {
    if (!this.taskChartRef?.nativeElement) return;
    if (this.taskChart) this.taskChart.destroy();

    const stats = this.stats();
    const inProgress = stats.myTasks - stats.completedTasks - stats.overdueTasks;

    this.taskChart = new Chart(this.taskChartRef.nativeElement, {
      type: 'doughnut',
      data: {
        labels: ['Completed', 'In Progress', 'Overdue'],
        datasets: [{
          data: [stats.completedTasks, inProgress > 0 ? inProgress : 0, stats.overdueTasks],
          backgroundColor: ['#10b981', '#3b82f6', '#ef4444'],
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { padding: 15 } },
        },
        cutout: '65%',
      },
    });
  }

  private renderHoursChart(): void {
    if (!this.hoursChartRef?.nativeElement) return;
    if (this.hoursChart) this.hoursChart.destroy();

    const stats = this.stats();
    const targetWeekly = 40;
    const targetMonthly = 160;

    this.hoursChart = new Chart(this.hoursChartRef.nativeElement, {
      type: 'bar',
      data: {
        labels: ['This Week', 'This Month'],
        datasets: [
          {
            label: 'Logged Hours',
            data: [stats.weeklyHours, stats.monthlyHours],
            backgroundColor: '#2B318D',
            borderRadius: 6,
          },
          {
            label: 'Target',
            data: [targetWeekly, targetMonthly],
            backgroundColor: '#e2e8f0',
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' },
        },
        scales: {
          y: { beginAtZero: true },
        },
      },
    });
  }

  async removeFavorite(projectId: string): Promise<void> {
    await this.favoriteService.removeFavorite(projectId);
    this.favoriteProjects.update((list) => list.filter((p) => p.id !== projectId));
  }

  async markTaskComplete(task: Task): Promise<void> {
    try {
      await this.taskService.completeTask(task.id);
      this.myTasks.update((list) => list.filter((t) => t.id !== task.id));
      this.stats.update((s) => ({
        ...s,
        myTasks: s.myTasks,
        completedTasks: s.completedTasks + 1,
      }));
    } catch {
      this.snackbar.error('Failed to complete task');
    }
  }

  async showInterest(projectId: string): Promise<void> {
    try {
      await this.projectService.showInterest(projectId);
      this.recommendedProjects.update((list) => list.filter((p) => p.id !== projectId));
      this.stats.update((s) => ({ ...s, pendingInterests: s.pendingInterests + 1 }));
    } catch {
      this.snackbar.error('Failed to submit interest');
    }
  }

  getStatusClass(status: string): string {
    const map: Record<string, string> = {
      not_started: 'secondary', in_progress: 'primary', completed: 'success',
      delayed: 'danger', on_hold: 'warning', pending: 'warning',
      approved: 'success', rejected: 'danger',
    };
    return map[status] || 'secondary';
  }

  getPriorityClass(priority: string): string {
    const map: Record<string, string> = { high: 'danger', medium: 'warning', low: 'info' };
    return map[priority] || 'secondary';
  }

  getInterestIcon(status: string): string {
    const icons: Record<string, string> = {
      pending: 'bi-hourglass-split',
      approved: 'bi-check-circle-fill',
      rejected: 'bi-x-circle-fill',
    };
    return icons[status] || 'bi-circle';
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  formatRelativeTime(date: string): string {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return this.formatDate(date);
  }

  getDaysUntil(date: string): number {
    const due = new Date(date);
    const today = new Date();
    return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  }
}
