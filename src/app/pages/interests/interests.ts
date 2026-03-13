import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgClass, TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Api } from '../../services/api';
import { SnackbarService } from '../../services/snackbar.service';
import { ProjectService } from '../../services/project.service';
import type { InterestRequest } from '../../interfaces/database.types';

@Component({
  selector: 'app-interests',
  standalone: true,
  imports: [RouterLink, NgClass, TitleCasePipe, FormsModule],
  templateUrl: './interests.html',
  styleUrl: './interests.scss',
})
export class Interests implements OnInit {
  readonly api = inject(Api);
  readonly projectService = inject(ProjectService);
  readonly snackbar = inject(SnackbarService);

  readonly loading = signal(true);
  readonly interests = signal<InterestRequest[]>([]);
  readonly selectedStatus = signal<string>('pending');
  readonly selectedIds = signal<Set<string>>(new Set());
  readonly bulkActionLoading = signal(false);

  readonly filteredInterests = computed(() => {
    const status = this.selectedStatus();
    if (status === 'all') return this.interests();
    return this.interests().filter((i) => i.status === status);
  });

  readonly pendingInterests = computed(() =>
    this.filteredInterests().filter((i) => i.status === 'pending')
  );

  readonly selectedCount = computed(() => this.selectedIds().size);

  readonly allSelected = computed(() => {
    const pending = this.pendingInterests();
    const selected = this.selectedIds();
    return pending.length > 0 && pending.every((i) => selected.has(i.id));
  });

  get pendingCount(): number {
    return this.interests().filter((i) => i.status === 'pending').length;
  }

  get approvedCount(): number {
    return this.interests().filter((i) => i.status === 'approved').length;
  }

  get rejectedCount(): number {
    return this.interests().filter((i) => i.status === 'rejected').length;
  }

  toggleSelect(id: string): void {
    this.selectedIds.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  toggleSelectAll(): void {
    const pending = this.pendingInterests();
    if (this.allSelected()) {
      this.selectedIds.set(new Set());
    } else {
      this.selectedIds.set(new Set(pending.map((i) => i.id)));
    }
  }

  async bulkApprove(): Promise<void> {
    const ids = Array.from(this.selectedIds());
    if (!ids.length) return;
    this.bulkActionLoading.set(true);
    try {
      await this.projectService.bulkApproveInterest(ids);
      this.interests.update((list) =>
        list.map((i) =>
          ids.includes(i.id)
            ? { ...i, status: 'approved' as const, reviewed_at: new Date().toISOString() }
            : i
        )
      );
      this.selectedIds.set(new Set());
      this.snackbar.success(`Approved ${ids.length} request(s)`);
    } catch {
      this.snackbar.error('Failed to approve');
    } finally {
      this.bulkActionLoading.set(false);
    }
  }

  async bulkReject(): Promise<void> {
    const ids = Array.from(this.selectedIds());
    if (!ids.length) return;
    const note = prompt('Reason for rejection (optional, applies to all):');
    this.bulkActionLoading.set(true);
    try {
      await this.projectService.bulkRejectInterest(ids, note || undefined);
      this.interests.update((list) =>
        list.map((i) =>
          ids.includes(i.id)
            ? { ...i, status: 'rejected' as const, review_note: note ?? null, reviewed_at: new Date().toISOString() }
            : i
        )
      );
      this.selectedIds.set(new Set());
      this.snackbar.success(`Rejected ${ids.length} request(s)`);
    } catch {
      this.snackbar.error('Failed to reject');
    } finally {
      this.bulkActionLoading.set(false);
    }
  }

  async ngOnInit(): Promise<void> {
    try {
      const interests = await this.projectService.getAllInterests();
      this.interests.set(interests);
    } finally {
      this.loading.set(false);
    }
  }

  async approve(interest: InterestRequest): Promise<void> {
    try {
      await this.projectService.approveInterest(interest.id);
      this.interests.update((list) =>
        list.map((i) =>
          i.id === interest.id
            ? { ...i, status: 'approved' as const, reviewed_at: new Date().toISOString() }
            : i
        )
      );
    } catch {
      this.snackbar.error('Failed to approve');
    }
  }

  async reject(interest: InterestRequest): Promise<void> {
    const note = prompt('Reason for rejection (optional):');
    try {
      await this.projectService.rejectInterest(interest.id, note || undefined);
      this.interests.update((list) =>
        list.map((i) =>
          i.id === interest.id
            ? { ...i, status: 'rejected' as const, review_note: note, reviewed_at: new Date().toISOString() }
            : i
        )
      );
    } catch {
      this.snackbar.error('Failed to reject');
    }
  }

  getInitials(name: string): string {
    if (!name) return '?';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  formatDate(date: string): string {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffDays === 0) {
      return 'Today at ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }
    if (diffDays === 1) {
      return 'Yesterday';
    }
    if (diffDays < 7) {
      return `${diffDays} days ago`;
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
}
