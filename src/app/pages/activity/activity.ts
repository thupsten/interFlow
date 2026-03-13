import { Component, OnInit, AfterViewInit, inject, signal, ElementRef, ViewChild } from '@angular/core';
import { Chart, registerables } from 'chart.js';
import { Api } from '../../services/api';
import type { ActivityLog } from '../../interfaces/database.types';

Chart.register(...registerables);

interface ActivityStats {
  daily: { date: string; count: number }[];
  byAction: { action: string; count: number }[];
  byEntity: { entity: string; count: number }[];
  byUser: { user: string; count: number }[];
}

@Component({
  selector: 'app-activity',
  standalone: true,
  imports: [],
  templateUrl: './activity.html',
  styleUrl: './activity.scss',
})
export class Activity implements OnInit, AfterViewInit {
  readonly api = inject(Api);
  readonly loading = signal(true);
  readonly activities = signal<ActivityLog[]>([]);
  readonly stats = signal<ActivityStats | null>(null);

  @ViewChild('dailyChart') dailyChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('actionChart') actionChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('entityChart') entityChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('userChart') userChartRef!: ElementRef<HTMLCanvasElement>;

  private dailyChart: Chart | null = null;
  private actionChart: Chart | null = null;
  private entityChart: Chart | null = null;
  private userChart: Chart | null = null;

  async ngOnInit(): Promise<void> {
    try {
      const { data, error } = await this.api.supabase
        .from('activity_log')
        .select(`*, actor:profiles(*)`)
        .order('created_at', { ascending: false })
        .limit(200);

      if (!error && data) {
        this.activities.set(data as ActivityLog[]);
        this.calculateStats(data as ActivityLog[]);
      }
    } finally {
      this.loading.set(false);
      // Charts are inside @if (stats()) - wait for DOM to render
      setTimeout(() => this.renderCharts(), 150);
    }
  }

  ngAfterViewInit(): void {}

  private calculateStats(activities: ActivityLog[]): void {
    const dailyMap = new Map<string, number>();
    const actionMap = new Map<string, number>();
    const entityMap = new Map<string, number>();
    const userMap = new Map<string, number>();

    const last7Days: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      last7Days.push(d.toISOString().split('T')[0]);
      dailyMap.set(d.toISOString().split('T')[0], 0);
    }

    activities.forEach((a) => {
      const date = a.created_at.split('T')[0];
      if (dailyMap.has(date)) {
        dailyMap.set(date, (dailyMap.get(date) || 0) + 1);
      }

      actionMap.set(a.action, (actionMap.get(a.action) || 0) + 1);
      entityMap.set(a.entity_type, (entityMap.get(a.entity_type) || 0) + 1);

      const userName = (a as any).actor?.full_name || 'System';
      userMap.set(userName, (userMap.get(userName) || 0) + 1);
    });

    this.stats.set({
      daily: last7Days.map((date) => ({ date, count: dailyMap.get(date) || 0 })),
      byAction: Array.from(actionMap.entries())
        .map(([action, count]) => ({ action, count }))
        .sort((a, b) => b.count - a.count),
      byEntity: Array.from(entityMap.entries())
        .map(([entity, count]) => ({ entity, count }))
        .sort((a, b) => b.count - a.count),
      byUser: Array.from(userMap.entries())
        .map(([user, count]) => ({ user, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
    });
  }

  private renderCharts(): void {
    const stats = this.stats();
    if (!stats) return;

    this.renderDailyChart(stats.daily);
    this.renderActionChart(stats.byAction);
    this.renderEntityChart(stats.byEntity);
    this.renderUserChart(stats.byUser);
  }

  private renderDailyChart(data: { date: string; count: number }[]): void {
    const ctx = this.dailyChartRef?.nativeElement?.getContext('2d');
    if (!ctx) return;

    if (this.dailyChart) this.dailyChart.destroy();

    this.dailyChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.map((d) => {
          const date = new Date(d.date);
          return date.toLocaleDateString('en-US', { weekday: 'short' });
        }),
        datasets: [{
          label: 'Activities',
          data: data.map((d) => d.count),
          borderColor: '#2B318D',
          backgroundColor: 'rgba(13, 148, 136, 0.1)',
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#2B318D',
          pointBorderWidth: 0,
          pointRadius: 4,
          pointHoverRadius: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { stepSize: 1 },
            grid: { color: '#f1f5f9' },
          },
          x: {
            grid: { display: false },
          },
        },
      },
    });
  }

  private renderActionChart(data: { action: string; count: number }[]): void {
    const ctx = this.actionChartRef?.nativeElement?.getContext('2d');
    if (!ctx) return;

    if (this.actionChart) this.actionChart.destroy();

    const colors = ['#2B318D', '#50B748', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6'];

    this.actionChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: data.map((d) => this.formatLabel(d.action)),
        datasets: [{
          data: data.map((d) => d.count),
          backgroundColor: colors.slice(0, data.length),
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '60%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { padding: 15, usePointStyle: true },
          },
        },
      },
    });
  }

  private renderEntityChart(data: { entity: string; count: number }[]): void {
    const ctx = this.entityChartRef?.nativeElement?.getContext('2d');
    if (!ctx) return;

    if (this.entityChart) this.entityChart.destroy();

    const colors = ['#2B318D', '#50B748', '#6366f1', '#f59e0b', '#ef4444'];

    this.entityChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map((d) => this.formatLabel(d.entity)),
        datasets: [{
          label: 'Count',
          data: data.map((d) => d.count),
          backgroundColor: colors.slice(0, data.length),
          borderRadius: 8,
          maxBarThickness: 50,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: { stepSize: 1 },
            grid: { color: '#f1f5f9' },
          },
          y: {
            grid: { display: false },
          },
        },
      },
    });
  }

  private renderUserChart(data: { user: string; count: number }[]): void {
    const ctx = this.userChartRef?.nativeElement?.getContext('2d');
    if (!ctx) return;

    if (this.userChart) this.userChart.destroy();

    this.userChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map((d) => d.user),
        datasets: [{
          label: 'Activities',
          data: data.map((d) => d.count),
          backgroundColor: '#2B318D',
          borderRadius: 8,
          maxBarThickness: 40,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { stepSize: 1 },
            grid: { color: '#f1f5f9' },
          },
          x: {
            grid: { display: false },
          },
        },
      },
    });
  }

  private formatLabel(str: string): string {
    return str.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  getActionIcon(action: string): string {
    const icons: Record<string, string> = {
      created: 'bi-plus-circle',
      updated: 'bi-pencil',
      deleted: 'bi-trash',
      completed: 'bi-check-circle',
      assigned: 'bi-person-plus',
      commented: 'bi-chat-dots',
    };
    return icons[action] || 'bi-activity';
  }

  getActionClass(action: string): string {
    const classes: Record<string, string> = {
      created: 'success',
      updated: 'primary',
      deleted: 'danger',
      completed: 'success',
      assigned: 'info',
      commented: 'secondary',
    };
    return classes[action] || 'secondary';
  }

  formatDate(date: string): string {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;

    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  }
}
