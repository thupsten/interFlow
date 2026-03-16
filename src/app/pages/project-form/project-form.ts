import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TitleCasePipe } from '@angular/common';
import { Api } from '../../services/api';
import { ProjectService } from '../../services/project.service';
import { UserService } from '../../services/user.service';
import { NotificationService } from '../../services/notification.service';
import type { Tag, Profile, Project } from '../../interfaces/database.types';

interface ReferenceLink {
  type: 'figma' | 'document' | 'github' | 'other';
  title: string;
  url: string;
}

@Component({
  selector: 'app-project-form',
  standalone: true,
  imports: [FormsModule, RouterLink, TitleCasePipe],
  templateUrl: './project-form.html',
  styleUrl: './project-form.scss',
})
export class ProjectForm implements OnInit {
  readonly api = inject(Api);
  readonly route = inject(ActivatedRoute);
  readonly projectService = inject(ProjectService);
  readonly userService = inject(UserService);
  readonly notificationService = inject(NotificationService);
  readonly router = inject(Router);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly tags = signal<Tag[]>([]);
  readonly managers = signal<Profile[]>([]);
  readonly employees = signal<Profile[]>([]);
  readonly error = signal<string | null>(null);
  
  readonly projectId = signal<string | null>(null);
  readonly isEditMode = computed(() => !!this.projectId());
  
  readonly employeeSearch = signal('');
  readonly filteredEmployees = computed(() => {
    const search = this.employeeSearch().toLowerCase().trim();
    const allEmployees = this.employees();
    if (!search) return allEmployees;
    return allEmployees.filter(
      (e) =>
        e.full_name.toLowerCase().includes(search) ||
        e.email.toLowerCase().includes(search) ||
        (e.department?.toLowerCase().includes(search) ?? false)
    );
  });

  form = {
    title: '',
    brief: '',
    description: '',
    start_date: this.formatDateInput(new Date()),
    expected_end_date: '',
    priority: 'medium' as 'high' | 'medium' | 'low',
    visibility: 'company_wide' as 'company_wide' | 'restricted',
    status: 'not_started' as 'not_started' | 'in_progress' | 'completed' | 'delayed' | 'on_hold',
    selectedTags: [] as string[],
    selectedManagers: [] as string[],
    invitedEmployees: [] as string[],
  };

  references: ReferenceLink[] = [];
  
  newReference = {
    type: 'document' as 'figma' | 'document' | 'github' | 'other',
    title: '',
    url: '',
  };

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    this.projectId.set(id);

    try {
      const [tags, users] = await Promise.all([
        this.projectService.getTags(),
        this.userService.getUsers(),
      ]);
      this.tags.set(tags);
      this.managers.set(users.filter((u) => u.role === 'manager'));
      this.employees.set(users.filter((u) => u.role === 'user' && u.status === 'active'));

      if (id) {
        await this.loadProject(id);
      }
    } finally {
      this.loading.set(false);
    }
  }

  private async loadProject(id: string): Promise<void> {
    const project = await this.projectService.getProjectById(id);
    if (!project) {
      this.error.set('Project not found');
      return;
    }

    this.form.title = project.title;
    this.form.brief = project.brief;
    this.form.description = this.extractDescription(project.description);
    this.form.start_date = project.start_date;
    this.form.expected_end_date = project.expected_end_date;
    this.form.priority = project.priority;
    this.form.visibility = project.visibility;
    this.form.status = project.status;
    this.form.selectedTags = project.tags?.map((t) => t.id) || [];
    this.form.selectedManagers = project.managers?.map((m) => m.id) || [];
    this.form.invitedEmployees = project.contributors?.map((c) => c.id) || [];

    this.references = this.extractReferences(project.description);
  }

  private extractDescription(desc: string | null): string {
    if (!desc) return '';
    const refIndex = desc.indexOf('\n\n---\n### References');
    return refIndex > -1 ? desc.substring(0, refIndex) : desc;
  }

  private extractReferences(desc: string | null): ReferenceLink[] {
    if (!desc) return [];
    const refIndex = desc.indexOf('\n\n---\n### References');
    if (refIndex === -1) return [];

    const refSection = desc.substring(refIndex);
    const links: ReferenceLink[] = [];
    const regex = /- \*\*(.+?)\*\* \((\w+)\): (.+)/g;
    let match;

    while ((match = regex.exec(refSection)) !== null) {
      links.push({
        title: match[1],
        type: match[2] as ReferenceLink['type'],
        url: match[3],
      });
    }

    return links;
  }

  addReference(): void {
    if (this.newReference.title.trim() && this.newReference.url.trim()) {
      this.references.push({ ...this.newReference });
      this.newReference = { type: 'document', title: '', url: '' };
    }
  }

  removeReference(index: number): void {
    this.references.splice(index, 1);
  }

  async submit(): Promise<void> {
    if (!this.form.title || !this.form.brief || !this.form.expected_end_date) {
      this.error.set('Please fill in all required fields');
      return;
    }
    if (this.form.expected_end_date < this.form.start_date) {
      this.error.set('End date cannot be before start date');
      return;
    }

    this.saving.set(true);
    this.error.set(null);

    try {
      let fullDescription = this.form.description || '';
      if (this.references.length > 0) {
        fullDescription += '\n\n---\n### References\n';
        this.references.forEach((ref) => {
          fullDescription += `- **${ref.title}** (${ref.type}): ${ref.url}\n`;
        });
      }

      const projectData = {
        title: this.form.title,
        brief: this.form.brief,
        description: fullDescription || null,
        start_date: this.form.start_date,
        expected_end_date: this.form.expected_end_date,
        priority: this.form.priority,
        visibility: this.form.visibility,
        status: this.form.status,
      };

      let projectId: string;
      const currentUserId = this.api.user()?.id;

      if (this.isEditMode()) {
        projectId = this.projectId()!;
        await this.projectService.updateProject(projectId, projectData);
        
        await this.projectService.updateProjectTags(projectId, this.form.selectedTags);
        await this.projectService.updateProjectManagers(projectId, this.form.selectedManagers);
        await this.projectService.updateProjectContributors(projectId, this.form.invitedEmployees);
      } else {
        const project = await this.projectService.createProject(projectData);
        projectId = project.id;

        if (this.form.selectedTags.length > 0) {
          await this.projectService.addProjectTags(projectId, this.form.selectedTags);
        }
        if (this.form.selectedManagers.length > 0) {
          await this.projectService.addProjectManagers(projectId, this.form.selectedManagers);
        }
        
        // Invite employees as contributors
        if (this.form.invitedEmployees.length > 0) {
          for (const employeeId of this.form.invitedEmployees) {
            await this.projectService.addProjectContributor(projectId, employeeId);
          }
          
          // Notify invited employees
          await this.notificationService.notifyUsers(
            this.form.invitedEmployees,
            'project',
            `You've been invited to "${this.form.title}"`,
            'You have been invited to work on this project.',
            `/projects/${projectId}`
          );
        }

        // Notify all users about new project
        await this.notificationService.notifyAllUsers(
          'project',
          `New Project: ${this.form.title}`,
          this.form.brief,
          `/projects/${projectId}`,
          currentUserId
        );
      }

      this.router.navigate(['/projects', projectId]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message ?? String(err);
      this.error.set(msg);
    } finally {
      this.saving.set(false);
    }
  }

  toggleTag(tagId: string): void {
    const idx = this.form.selectedTags.indexOf(tagId);
    if (idx === -1) {
      this.form.selectedTags.push(tagId);
    } else {
      this.form.selectedTags.splice(idx, 1);
    }
  }

  isTagSelected(tagId: string): boolean {
    return this.form.selectedTags.includes(tagId);
  }

  toggleManager(userId: string): void {
    const idx = this.form.selectedManagers.indexOf(userId);
    if (idx === -1) {
      this.form.selectedManagers.push(userId);
    } else {
      this.form.selectedManagers.splice(idx, 1);
    }
  }

  isManagerSelected(userId: string): boolean {
    return this.form.selectedManagers.includes(userId);
  }

  toggleEmployee(userId: string): void {
    const idx = this.form.invitedEmployees.indexOf(userId);
    if (idx === -1) {
      this.form.invitedEmployees.push(userId);
    } else {
      this.form.invitedEmployees.splice(idx, 1);
    }
  }

  isEmployeeInvited(userId: string): boolean {
    return this.form.invitedEmployees.includes(userId);
  }

  formatDateInput(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  getInitials(name: string): string {
    return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  }

  getReferenceIcon(type: string): string {
    const icons: Record<string, string> = {
      figma: 'bi-vector-pen',
      document: 'bi-file-earmark-text',
      github: 'bi-github',
      other: 'bi-link-45deg',
    };
    return icons[type] || 'bi-link-45deg';
  }
}
