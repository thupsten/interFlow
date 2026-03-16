import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Api } from '../../services/api';
import { SnackbarService } from '../../services/snackbar.service';
import { TaskService } from '../../services/task.service';
import { ProjectService } from '../../services/project.service';
import { NotificationService } from '../../services/notification.service';
import type { Project, Profile } from '../../interfaces/database.types';

@Component({
  selector: 'app-task-form',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './task-form.html',
  styleUrl: './task-form.scss',
})
export class TaskForm implements OnInit {
  readonly api = inject(Api);
  readonly route = inject(ActivatedRoute);
  readonly router = inject(Router);
  readonly taskService = inject(TaskService);
  readonly projectService = inject(ProjectService);
  readonly notificationService = inject(NotificationService);
  readonly snackbar = inject(SnackbarService);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly project = signal<Project | null>(null);
  readonly contributors = signal<Profile[]>([]);

  form = {
    title: '',
    description: '',
    start_date: '',
    expected_end_date: '',
    priority: 'medium' as 'high' | 'medium' | 'low',
    assignees: [] as string[],
  };

  async ngOnInit(): Promise<void> {
    const projectId = this.route.snapshot.paramMap.get('projectId');
    if (!projectId) {
      this.router.navigate(['/projects']);
      return;
    }

    try {
      const project = await this.projectService.getProjectById(projectId);
      if (!project) {
        this.router.navigate(['/projects']);
        return;
      }
      this.project.set(project);
      this.contributors.set(project.contributors || []);
    } finally {
      this.loading.set(false);
    }
  }

  toggleAssignee(userId: string): void {
    const idx = this.form.assignees.indexOf(userId);
    if (idx === -1) {
      this.form.assignees.push(userId);
    } else {
      this.form.assignees.splice(idx, 1);
    }
  }

  isAssigned(userId: string): boolean {
    return this.form.assignees.includes(userId);
  }

  async save(): Promise<void> {
    const project = this.project();
    if (!project || !this.form.title.trim()) return;
    if (this.form.start_date && this.form.expected_end_date && this.form.expected_end_date < this.form.start_date) {
      this.snackbar.error('Due date cannot be before start date');
      return;
    }

    this.saving.set(true);
    try {
      const task = await this.taskService.createTask({
        project_id: project.id,
        title: this.form.title.trim(),
        description: this.form.description.trim() || null,
        start_date: this.form.start_date || null,
        expected_end_date: this.form.expected_end_date || null,
        priority: this.form.priority,
        status: 'not_started',
      });

      if (this.form.assignees.length > 0) {
        await this.taskService.assignTask(task.id, this.form.assignees);
        
        // Notify assigned employees
        const currentUserName = this.api.profile()?.full_name || 'A manager';
        await this.notificationService.notifyUsers(
          this.form.assignees,
          'task',
          `New task assigned: ${this.form.title}`,
          `${currentUserName} assigned you to "${this.form.title}" in project "${project.title}"`,
          `/projects/${project.id}`
        );
      }

      this.router.navigate(['/projects', project.id]);
    } catch (err) {
      this.snackbar.error('Failed to create task');
    } finally {
      this.saving.set(false);
    }
  }

  getInitials(name: string): string {
    return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  }
}
