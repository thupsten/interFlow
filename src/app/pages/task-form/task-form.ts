import { Component, OnInit, computed, inject, signal } from '@angular/core';
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

  /** Managers, admins, and project leads can assign anyone on the team. Contributors assign only themselves (enforced on save + RLS). */
  readonly canAssignOthers = computed(() => {
    if (this.api.isAdmin() || this.api.isCsm()) return true;
    if (this.api.isManager()) return true;
    const p = this.project();
    const uid = this.api.user()?.id;
    if (!p || !uid) return false;
    if (p.created_by === uid) return true;
    return !!p.managers?.some((m) => m.id === uid);
  });

  readonly assignableTeam = computed(() => {
    const p = this.project();
    if (!p) return [];
    const map = new Map<string, Profile>();
    (p.managers ?? []).forEach((m) => map.set(m.id, m));
    (p.contributors ?? []).forEach((c) => map.set(c.id, c));
    return Array.from(map.values());
  });

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

      if (!this.userMayCreateTaskOnProject(project)) {
        this.snackbar.error('You can only create tasks on projects you manage or contribute to.');
        this.router.navigate(['/projects', projectId]);
        return;
      }

      const uid = this.api.user()?.id;
      if (uid && !this.canAssignOthers()) {
        this.form.assignees = [uid];
      }
    } finally {
      this.loading.set(false);
    }
  }

  private userMayCreateTaskOnProject(project: Project): boolean {
    const uid = this.api.user()?.id;
    if (!uid) return false;
    if (this.api.isAdmin() || this.api.isCsm()) return true;
    if (this.api.isManager()) return true;
    if (project.created_by === uid) return true;
    if (project.managers?.some((m) => m.id === uid)) return true;
    return !!project.contributors?.some((c) => c.id === uid);
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
      const uid = this.api.user()?.id;
      let assigneeIds = [...this.form.assignees];
      if (uid && !this.canAssignOthers()) {
        assigneeIds = [uid];
      }

      const task = await this.taskService.createTask({
        project_id: project.id,
        title: this.form.title.trim(),
        description: this.form.description.trim() || null,
        start_date: this.form.start_date || null,
        expected_end_date: this.form.expected_end_date || null,
        priority: this.form.priority,
        status: 'not_started',
      });

      if (assigneeIds.length > 0) {
        await this.taskService.assignTask(task.id, assigneeIds);

        const notifyIds = uid ? assigneeIds.filter((id) => id !== uid) : assigneeIds;
        if (notifyIds.length > 0) {
          const currentUserName = this.api.profile()?.full_name || 'A teammate';
          await this.notificationService.notifyUsers(
            notifyIds,
            'task',
            `New task assigned: ${this.form.title}`,
            `${currentUserName} assigned you to "${this.form.title}" in project "${project.title}"`,
            `/projects/${project.id}`,
            { projectId: project.id, taskId: task.id },
          );
        }
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
