import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api } from '../../services/api';
import { TaskService } from '../../services/task.service';
import { ProjectService } from '../../services/project.service';
import type { Task, Project } from '../../interfaces/database.types';

export type ViewMode = 'month' | 'week' | 'agenda';
export type EventFilter = 'all' | 'tasks' | 'projects';

export interface CalendarEvent {
  id: string;
  date: string;
  type: 'task_start' | 'task_due' | 'project_start' | 'project_due';
  title: string;
  priority?: string;
  status?: string;
  projectId: string;
  taskId?: string;
  projectTitle?: string;
}

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  events: CalendarEvent[];
}

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './calendar.html',
  styleUrl: './calendar.scss',
})
export class Calendar implements OnInit {
  readonly api = inject(Api);
  readonly taskService = inject(TaskService);
  readonly projectService = inject(ProjectService);

  readonly loading = signal(true);
  readonly currentDate = signal(new Date());
  readonly viewMode = signal<ViewMode>('month');
  readonly eventFilter = signal<EventFilter>('all');
  readonly tasks = signal<Task[]>([]);
  readonly projects = signal<Project[]>([]);
  readonly selectedDay = signal<CalendarDay | null>(null);

  readonly weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  readonly allEvents = computed(() => {
    const tasks = this.tasks();
    const projects = this.projects();
    const filter = this.eventFilter();
    const events: CalendarEvent[] = [];

    if (filter === 'all' || filter === 'tasks') {
      for (const t of tasks) {
        if (t.start_date) {
          events.push({
            id: `task-start-${t.id}`,
            date: t.start_date,
            type: 'task_start',
            title: t.title,
            priority: t.priority,
            status: t.status,
            projectId: t.project_id,
            taskId: t.id,
          });
        }
        if (t.expected_end_date) {
          events.push({
            id: `task-due-${t.id}`,
            date: t.expected_end_date,
            type: 'task_due',
            title: t.title,
            priority: t.priority,
            status: t.status,
            projectId: t.project_id,
            taskId: t.id,
          });
        }
      }
    }
    if (filter === 'all' || filter === 'projects') {
      for (const p of projects) {
        events.push({
          id: `project-start-${p.id}`,
          date: p.start_date,
          type: 'project_start',
          title: p.title,
          status: p.status,
          projectId: p.id,
          projectTitle: p.title,
        });
        events.push({
          id: `project-due-${p.id}`,
          date: p.expected_end_date,
          type: 'project_due',
          title: p.title,
          status: p.status,
          projectId: p.id,
          projectTitle: p.title,
        });
      }
    }
    return events;
  });

  readonly currentMonth = computed(() => {
    const date = this.currentDate();
    const mode = this.viewMode();
    if (mode === 'week' || mode === 'agenda') {
      const start = new Date(date);
      start.setDate(date.getDate() - date.getDay());
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return `${start.toLocaleDateString('default', { month: 'short' })} ${start.getDate()} – ${end.toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }
    return date.toLocaleString('default', { month: 'long', year: 'numeric' });
  });

  readonly calendarDays = computed(() => {
    const date = this.currentDate();
    const mode = this.viewMode();
    const year = date.getFullYear();
    const month = date.getMonth();
    const allEvents = this.allEvents();

    if (mode === 'week') {
      const startOfWeek = new Date(date);
      startOfWeek.setDate(date.getDate() - date.getDay());
      const days: CalendarDay[] = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (let i = 0; i < 7; i++) {
        const d = new Date(startOfWeek);
        d.setDate(startOfWeek.getDate() + i);
        const dateStr = d.toISOString().split('T')[0];
        const dayEvents = allEvents.filter((e) => e.date === dateStr);
        days.push({
          date: new Date(d),
          isCurrentMonth: d.getMonth() === month,
          isToday: d.getTime() === today.getTime(),
          events: dayEvents,
        });
      }
      return days;
    }

    if (mode === 'agenda') {
      const start = new Date(date);
      start.setDate(start.getDate() - start.getDay());
      const days: CalendarDay[] = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (let i = 0; i < 21; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        const dateStr = d.toISOString().split('T')[0];
        const dayEvents = allEvents.filter((e) => e.date === dateStr);
        days.push({
          date: new Date(d),
          isCurrentMonth: d.getMonth() === month,
          isToday: d.getTime() === today.getTime(),
          events: dayEvents,
        });
      }
      return days;
    }

    // Month view
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    const days: CalendarDay[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < 42; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const dayEvents = allEvents.filter((e) => e.date === dateStr);
      days.push({
        date: new Date(d),
        isCurrentMonth: d.getMonth() === month,
        isToday: d.getTime() === today.getTime(),
        events: dayEvents,
      });
    }
    return days;
  });

  readonly upcomingEvents = computed(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const events = this.allEvents();
    const withDate = events.map((e) => ({
      ...e,
      dateObj: new Date(e.date + 'T12:00:00'),
    }));
    return withDate
      .filter((e) => e.dateObj >= today)
      .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime())
      .slice(0, 10);
  });

  async ngOnInit(): Promise<void> {
    await this.loadData();
  }

  async loadData(): Promise<void> {
    this.loading.set(true);
    try {
      const role = this.api.userRole();
      if (role === 'admin') {
        const [tasks, projects] = await Promise.all([
          this.taskService.getTasks(),
          this.projectService.getProjects(),
        ]);
        this.tasks.set(tasks);
        this.projects.set(projects);
      } else if (role === 'manager') {
        const [tasks, projects] = await Promise.all([
          this.taskService.getManagerTasks(),
          this.projectService.getManagerProjects(),
        ]);
        this.tasks.set(tasks);
        this.projects.set(projects);
      } else {
        const [tasks, projects] = await Promise.all([
          this.taskService.getMyTasks(),
          this.projectService.getMyProjects(),
        ]);
        this.tasks.set(tasks);
        this.projects.set(projects);
      }
    } finally {
      this.loading.set(false);
    }
  }

  setViewMode(mode: ViewMode): void {
    this.viewMode.set(mode);
  }

  setEventFilter(filter: EventFilter): void {
    this.eventFilter.set(filter);
  }

  prevMonth(): void {
    const date = this.currentDate();
    const mode = this.viewMode();
    if (mode === 'week' || mode === 'agenda') {
      const d = new Date(date);
      d.setDate(d.getDate() - 7);
      this.currentDate.set(d);
    } else {
      this.currentDate.set(new Date(date.getFullYear(), date.getMonth() - 1, 1));
    }
  }

  nextMonth(): void {
    const date = this.currentDate();
    const mode = this.viewMode();
    if (mode === 'week' || mode === 'agenda') {
      const d = new Date(date);
      d.setDate(d.getDate() + 7);
      this.currentDate.set(d);
    } else {
      this.currentDate.set(new Date(date.getFullYear(), date.getMonth() + 1, 1));
    }
  }

  goToToday(): void {
    this.currentDate.set(new Date());
  }

  selectDay(day: CalendarDay): void {
    this.selectedDay.set(day);
  }

  closeDetail(): void {
    this.selectedDay.set(null);
  }

  hasEvents(day: CalendarDay): boolean {
    return day.events.length > 0;
  }

  getPriorityClass(priority: string): string {
    return { high: 'danger', medium: 'warning', low: 'secondary' }[priority] || 'secondary';
  }

  getStatusClass(status: string): string {
    return { completed: 'success', in_progress: 'primary', delayed: 'danger' }[status] || 'secondary';
  }

  getEventLabel(event: CalendarEvent): string {
    switch (event.type) {
      case 'task_start':
        return 'Starts';
      case 'task_due':
        return 'Due';
      case 'project_start':
        return 'Kicks off';
      case 'project_due':
        return 'Deadline';
      default:
        return '';
    }
  }

  getEventRoute(event: CalendarEvent): string[] {
    return ['/projects', event.projectId];
  }
}
