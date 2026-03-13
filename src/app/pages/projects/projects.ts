import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Api } from '../../services/api';
import { SnackbarService } from '../../services/snackbar.service';
import { ProjectService } from '../../services/project.service';
import { FavoriteService } from '../../services/favorite.service';
import type { Project, Tag } from '../../interfaces/database.types';

@Component({
  selector: 'app-projects',
  standalone: true,
  imports: [RouterLink, FormsModule],
  templateUrl: './projects.html',
  styleUrl: './projects.scss',
})
export class Projects implements OnInit {
  readonly api = inject(Api);
  readonly projectService = inject(ProjectService);
  readonly favoriteService = inject(FavoriteService);
  readonly snackbar = inject(SnackbarService);

  readonly loading = signal(true);
  readonly projects = signal<Project[]>([]);
  readonly tags = signal<Tag[]>([]);
  readonly searchQuery = signal('');
  readonly selectedStatus = signal<string>('all');
  readonly selectedPriority = signal<string>('all');
  readonly myInterestProjectIds = signal<Set<string>>(new Set());

  // Interest modal state
  readonly showInterestModal = signal(false);
  readonly interestProjectId = signal<string | null>(null);
  readonly interestMessage = signal('');
  readonly submittingInterest = signal(false);

  readonly canCreate = computed(() => this.api.isAdmin() || this.api.isManager());
  readonly isUser = computed(() => this.api.isUser());

  readonly filteredProjects = computed(() => {
    let result = this.projects();
    const query = this.searchQuery().toLowerCase();
    const status = this.selectedStatus();
    const priority = this.selectedPriority();

    if (query) {
      result = result.filter(
        (p) => p.title.toLowerCase().includes(query) || p.brief.toLowerCase().includes(query)
      );
    }
    if (status !== 'all') {
      result = result.filter((p) => p.status === status);
    }
    if (priority !== 'all') {
      result = result.filter((p) => p.priority === priority);
    }
    return result;
  });

  async ngOnInit(): Promise<void> {
    try {
      const includeArchived = this.api.isAdmin();
      const [projects, tags] = await Promise.all([
        this.projectService.getProjects(includeArchived),
        this.projectService.getTags(),
        this.loadMyInterests(),
        this.favoriteService.loadFavorites(),
      ]);
      this.projects.set(projects);
      this.tags.set(tags);
    } finally {
      this.loading.set(false);
    }
  }

  isFavorite(projectId: string): boolean {
    return this.favoriteService.isFavorite(projectId);
  }

  async toggleFavorite(projectId: string, event: Event): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    await this.favoriteService.toggleFavorite(projectId);
  }

  async loadMyInterests(): Promise<void> {
    const userId = this.api.user()?.id;
    if (!userId) return;

    const { data } = await this.api.supabase
      .from('interest_requests')
      .select('project_id')
      .eq('user_id', userId);

    if (data) {
      this.myInterestProjectIds.set(new Set(data.map((d) => d.project_id)));
    }
  }

  hasSubmittedInterest(projectId: string): boolean {
    return this.myInterestProjectIds().has(projectId);
  }

  openInterestModal(projectId: string): void {
    this.interestProjectId.set(projectId);
    this.interestMessage.set('');
    this.showInterestModal.set(true);
  }

  closeInterestModal(): void {
    this.showInterestModal.set(false);
    this.interestProjectId.set(null);
    this.interestMessage.set('');
  }

  async submitInterest(): Promise<void> {
    const projectId = this.interestProjectId();
    if (!projectId) return;

    this.submittingInterest.set(true);
    try {
      await this.projectService.showInterest(projectId, this.interestMessage() || undefined);
      this.myInterestProjectIds.update((ids) => new Set([...ids, projectId]));
      this.closeInterestModal();
    } catch (err) {
      this.snackbar.error('Failed to submit interest. Please try again.');
    } finally {
      this.submittingInterest.set(false);
    }
  }

  getSelectedProject(): Project | undefined {
    const id = this.interestProjectId();
    if (!id) return undefined;
    return this.projects().find((p) => p.id === id);
  }

  getStatusClass(status: string): string {
    const map: Record<string, string> = {
      not_started: 'secondary',
      in_progress: 'primary',
      completed: 'success',
      delayed: 'danger',
      on_hold: 'warning',
    };
    return map[status] || 'secondary';
  }

  getPriorityClass(priority: string): string {
    const map: Record<string, string> = {
      high: 'danger',
      medium: 'warning',
      low: 'info',
    };
    return map[priority] || 'secondary';
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
}
