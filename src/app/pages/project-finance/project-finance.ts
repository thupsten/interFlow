import { DecimalPipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, NgZone, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Api } from '../../services/api';
import { FinanceEstimateService } from '../../services/finance-estimate.service';
import { ProjectService } from '../../services/project.service';
import { SnackbarService } from '../../services/snackbar.service';
import { EstimateRevisionHistory } from '../../components/estimate-revision-history/estimate-revision-history';
import type { FinanceEstimateStatus, Project, ProjectFinanceEstimate } from '../../interfaces/database.types';

export type ProjectNameMode = 'existing' | 'custom';

export interface EstimateLine {
  id: string;
  resourceLabel: string;
  hours: number;
  ratePerHour: number;
}

function newLine(): EstimateLine {
  return {
    id:
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : String(Date.now() + Math.random()),
    resourceLabel: '',
    hours: 0,
    ratePerHour: 0,
  };
}

const STORAGE_KEY = 'intraflow-pm-finance-estimate-id';

@Component({
  selector: 'app-project-finance',
  standalone: true,
  imports: [RouterLink, FormsModule, DecimalPipe, EstimateRevisionHistory],
  templateUrl: './project-finance.html',
  styleUrl: './project-finance.scss',
})
export class ProjectFinance implements OnInit, OnDestroy {
  readonly api = inject(Api);
  private readonly projectService = inject(ProjectService);
  private readonly snackbar = inject(SnackbarService);
  private readonly financeEstimates = inject(FinanceEstimateService);
  private readonly ngZone = inject(NgZone);

  readonly projects = signal<Project[]>([]);
  readonly loadingProjects = signal(true);
  /** Inbox: your estimates (manager) or all team estimates (admin). */
  readonly inboxEstimates = signal<ProjectFinanceEstimate[]>([]);
  readonly loadingInbox = signal(true);
  /** Filter chips for the inbox table. */
  readonly inboxFilter = signal<'all' | 'submitted' | 'approved'>('all');
  /** Project-linked vs custom title. */
  readonly inboxCategoryFilter = signal<'all' | 'linked' | 'custom'>('all');

  /** Full team inbox (admin or finance). */
  readonly isAdminView = computed(() => this.api.isAdmin() || this.api.isFinance());

  readonly filteredInbox = computed(() => {
    const rows = this.inboxEstimates();
    let list = rows;
    const f = this.inboxFilter();
    if (f !== 'all') {
      list = list.filter((r) => r.status === f);
    }
    const c = this.inboxCategoryFilter();
    if (c === 'linked') {
      list = list.filter((r) => r.project_id != null);
    } else if (c === 'custom') {
      list = list.filter((r) => r.project_id == null);
    }
    return list;
  });

  readonly inboxStats = computed(() => {
    const rows = this.inboxEstimates();
    return {
      total: rows.length,
      pending: rows.filter((r) => r.status === 'submitted').length,
      approved: rows.filter((r) => r.status === 'approved').length,
      linked: rows.filter((r) => r.project_id != null).length,
      custom: rows.filter((r) => r.project_id == null).length,
    };
  });

  /** Editor opens in a modal (new or opened from list). */
  readonly estimateEditorOpen = signal(false);

  /** 1 = pick name, 2 = cost breakdown */
  readonly step = signal<1 | 2>(1);

  /** Use an IntraFlow project, or type a name for proposals / work not yet created as a project. */
  projectNameMode: ProjectNameMode = 'existing';
  selectedProjectId = '';
  customProjectName = '';
  /** When linked to a project, optional title shown in Finance (overrides project name). */
  displayNameOverride = '';
  clientName = '';
  companyName = '';

  /** Plain array so ngModel edits to hours/rate trigger view updates. */
  lines: EstimateLine[] = [newLine()];
  marginPercent = 15;

  readonly savedEstimateId = signal<string | null>(null);
  readonly estimateSubmitterId = signal<string | null>(null);
  readonly estimateStatus = signal<FinanceEstimateStatus | null>(null);
  readonly saving = signal(false);
  readonly deleting = signal(false);
  /** Two-step delete (replaces browser confirm). */
  readonly deletePrompt = signal<{ id: string; title: string } | null>(null);
  readonly liveSync = signal(false);
  /** Bumps revision history panel reload after saves. */
  readonly historyRefresh = signal(0);

  private unsubscribeRealtime: (() => void) | null = null;
  private unsubscribeMyList: (() => void) | null = null;
  private reloadTimer: ReturnType<typeof setTimeout> | null = null;
  private myListDebounce: ReturnType<typeof setTimeout> | null = null;

  getSubtotal(): number {
    return this.lines.reduce((sum, l) => sum + Math.max(0, l.hours) * Math.max(0, l.ratePerHour), 0);
  }

  getTotalWithMargin(): number {
    const m = Math.max(0, this.marginPercent);
    return this.getSubtotal() * (1 + m / 100);
  }

  isLocked(): boolean {
    return this.estimateStatus() === 'approved';
  }

  async ngOnInit(): Promise<void> {
    try {
      const role = this.api.userRole();
      const list =
        this.api.hasProjectOversight() || role === 'finance'
          ? await this.projectService.getProjects()
          : await this.projectService.getManagerProjects();
      this.projects.set(list);
    } finally {
      this.loadingProjects.set(false);
    }

    await this.refreshInboxList();
    this.loadingInbox.set(false);
    this.unsubscribeMyList =
      this.api.isAdmin() || this.api.isFinance()
        ? this.financeEstimates.subscribeInbox(() => this.scheduleInboxRefresh())
        : this.financeEstimates.subscribeMyEstimates(() => this.scheduleInboxRefresh());

    const sid = sessionStorage.getItem(STORAGE_KEY);
    if (sid) {
      await this.loadSavedEstimate(sid);
      if (this.savedEstimateId()) {
        this.estimateEditorOpen.set(true);
      }
    }
  }

  ngOnDestroy(): void {
    this.clearReloadTimer();
    this.unsubscribeRealtime?.();
    this.unsubscribeMyList?.();
    if (this.myListDebounce) clearTimeout(this.myListDebounce);
  }

  private scheduleInboxRefresh(): void {
    if (this.myListDebounce) clearTimeout(this.myListDebounce);
    this.myListDebounce = setTimeout(() => {
      void this.refreshInboxList();
    }, 150);
  }

  private async refreshInboxList(): Promise<void> {
    try {
      const rows = await this.financeEstimates.listForProjectFinancePage();
      this.ngZone.run(() => {
        this.inboxEstimates.set(rows);
      });
    } catch {
      this.ngZone.run(() => this.inboxEstimates.set([]));
    }
  }

  setInboxFilter(f: 'all' | 'submitted' | 'approved'): void {
    this.inboxFilter.set(f);
  }

  setInboxCategoryFilter(c: 'all' | 'linked' | 'custom'): void {
    this.inboxCategoryFilter.set(c);
  }

  clearInboxFilters(): void {
    this.inboxFilter.set('all');
    this.inboxCategoryFilter.set('all');
  }

  scrollToBuilder(): void {
    this.startNewEstimate();
  }

  startNewEstimate(): void {
    this.deletePrompt.set(null);
    this.clearSavedAndStartNew();
    this.estimateEditorOpen.set(true);
  }

  closeEstimateModal(): void {
    this.deletePrompt.set(null);
    this.estimateEditorOpen.set(false);
    this.clearSavedAndStartNew();
  }

  private clearReloadTimer(): void {
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
      this.reloadTimer = null;
    }
  }

  estimateTitle(row: ProjectFinanceEstimate): string {
    return this.financeEstimates.displayTitle(row);
  }

  submitterLabel(row: ProjectFinanceEstimate): string {
    const s = row.submitter;
    const name = s?.full_name?.trim();
    if (name) return name;
    if (s?.email) return s.email;
    return '—';
  }

  rowCategory(row: ProjectFinanceEstimate): 'linked' | 'custom' {
    return row.project_id != null ? 'linked' : 'custom';
  }

  /** Delete allowed only before Finance approval (RLS). Admin/finance may delete any non-approved row. */
  canDeleteEstimate(row: ProjectFinanceEstimate): boolean {
    if (row.status === 'approved') return false;
    const uid = this.api.user()?.id;
    if (!uid) return false;
    if (this.api.isAdmin() || this.api.isFinance()) return true;
    return row.submitted_by === uid;
  }

  canDeleteCurrentEstimate(): boolean {
    if (!this.savedEstimateId() || this.estimateStatus() === 'approved') return false;
    const uid = this.api.user()?.id;
    if (!uid) return false;
    if (this.api.isAdmin() || this.api.isFinance()) return true;
    return this.estimateSubmitterId() === uid;
  }

  requestDeleteFromInbox(row: ProjectFinanceEstimate, ev: Event): void {
    ev.stopPropagation();
    if (!this.canDeleteEstimate(row)) return;
    this.deletePrompt.set({
      id: row.id,
      title: this.financeEstimates.displayTitle(row),
    });
  }

  requestDeleteFromModal(): void {
    const id = this.savedEstimateId();
    if (!id || !this.canDeleteCurrentEstimate()) return;
    this.deletePrompt.set({ id, title: this.modalTitle() });
  }

  cancelDeletePrompt(): void {
    this.deletePrompt.set(null);
  }

  async confirmDeletePrompt(): Promise<void> {
    const p = this.deletePrompt();
    if (!p) return;
    this.deleting.set(true);
    try {
      await this.financeEstimates.deleteEstimate(p.id);
      this.ngZone.run(() => {
        this.deletePrompt.set(null);
        this.inboxEstimates.update((rows) => rows.filter((r) => r.id !== p.id));
        if (this.savedEstimateId() === p.id) {
          this.estimateEditorOpen.set(false);
          this.clearSavedAndStartNew();
        }
      });
      await this.refreshInboxList();
      this.snackbar.success('Estimate removed from the database.');
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'message' in e
          ? String((e as { message: string }).message)
          : 'Delete failed';
      this.snackbar.error(msg);
      await this.refreshInboxList();
    } finally {
      this.ngZone.run(() => this.deleting.set(false));
    }
  }

  /** Open a previous submission for view/edit (live sync when Finance changes it). */
  async openMyEstimate(id: string): Promise<void> {
    this.deletePrompt.set(null);
    sessionStorage.setItem(STORAGE_KEY, id);
    await this.loadSavedEstimate(id);
    if (this.savedEstimateId()) {
      this.estimateEditorOpen.set(true);
    }
  }

  modalTitle(): string {
    if (!this.savedEstimateId()) {
      return 'New estimate';
    }
    return this.effectiveProjectLabel();
  }

  private requestReloadFromServer(): void {
    this.clearReloadTimer();
    this.reloadTimer = setTimeout(() => {
      const id = this.savedEstimateId();
      if (id) void this.pullRemoteSnapshot(id);
    }, 120);
  }

  private subscribeRealtime(id: string): void {
    this.unsubscribeRealtime?.();
    this.unsubscribeRealtime = this.financeEstimates.subscribeEstimate(id, () => {
      this.liveSync.set(true);
      this.requestReloadFromServer();
    });
    this.liveSync.set(true);
  }

  private async loadSavedEstimate(id: string): Promise<void> {
    try {
      const est = await this.financeEstimates.fetchEstimateById(id);
      const uid = this.api.user()?.id;
      const allow =
        !!est &&
        (this.api.isAdmin() || this.api.isFinance() || (uid != null && est.submitted_by === uid));
      if (!allow) {
        sessionStorage.removeItem(STORAGE_KEY);
        return;
      }
      this.savedEstimateId.set(est.id);
      this.estimateSubmitterId.set(est.submitted_by);
      this.estimateStatus.set(est.status);
      if (est.project_id) {
        this.projectNameMode = 'existing';
        this.selectedProjectId = est.project_id;
        this.customProjectName = '';
      } else {
        this.projectNameMode = 'custom';
        this.customProjectName = est.custom_title?.trim() ?? '';
        this.selectedProjectId = '';
      }
      this.displayNameOverride = est.display_name?.trim() ?? '';
      this.clientName = est.client_name?.trim() ?? '';
      this.companyName = est.company_name?.trim() ?? '';
      this.marginPercent = Number(est.margin_percent);
      const linesDb = await this.financeEstimates.fetchLines(est.id);
      this.lines = linesDb.map((l) => ({
        id: l.id,
        resourceLabel: l.resource_label,
        hours: Number(l.hours),
        ratePerHour: Number(l.rate_per_hour),
      }));
      if (this.lines.length === 0) {
        this.lines = [newLine()];
      }
      this.step.set(2);
      this.subscribeRealtime(est.id);
      void this.refreshInboxList();
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }

  private async pullRemoteSnapshot(id: string): Promise<void> {
    try {
      const est = await this.financeEstimates.fetchEstimateById(id);
      if (!est) return;
      this.estimateStatus.set(est.status);
      this.estimateSubmitterId.set(est.submitted_by);
      this.marginPercent = Number(est.margin_percent);
      this.displayNameOverride = est.display_name?.trim() ?? '';
      this.clientName = est.client_name?.trim() ?? '';
      this.companyName = est.company_name?.trim() ?? '';
      const linesDb = await this.financeEstimates.fetchLines(id);
      this.lines = linesDb.map((l) => ({
        id: l.id,
        resourceLabel: l.resource_label,
        hours: Number(l.hours),
        ratePerHour: Number(l.rate_per_hour),
      }));
      if (this.lines.length === 0) {
        this.lines = [newLine()];
      }
      void this.refreshInboxList();
    } catch {
      /* ignore */
    }
  }

  setNameMode(mode: ProjectNameMode): void {
    this.projectNameMode = mode;
    if (mode === 'custom') {
      this.displayNameOverride = '';
    }
  }

  canContinueStep1(): boolean {
    if (this.projectNameMode === 'existing') {
      return !!this.selectedProjectId;
    }
    return this.customProjectName.trim().length > 0;
  }

  continueToStep2(): void {
    if (!this.canContinueStep1()) {
      this.snackbar.error('Select a project or enter a custom name.');
      return;
    }
    if (this.lines.length === 0) {
      this.lines = [newLine()];
    }
    this.step.set(2);
  }

  backToStep1(): void {
    if (this.isLocked()) {
      this.snackbar.info('Project name is locked for an approved estimate.');
      return;
    }
    this.step.set(1);
  }

  addLine(): void {
    if (this.isLocked()) return;
    this.lines = [...this.lines, newLine()];
  }

  removeLine(index: number): void {
    if (this.isLocked()) return;
    if (this.lines.length <= 1) return;
    this.lines = this.lines.filter((_, i) => i !== index);
  }

  lineAmount(line: EstimateLine): number {
    return Math.max(0, line.hours) * Math.max(0, line.ratePerHour);
  }

  clearSavedAndStartNew(): void {
    sessionStorage.removeItem(STORAGE_KEY);
    this.savedEstimateId.set(null);
    this.estimateSubmitterId.set(null);
    this.estimateStatus.set(null);
    this.liveSync.set(false);
    this.unsubscribeRealtime?.();
    this.unsubscribeRealtime = null;
    this.step.set(1);
    this.projectNameMode = 'existing';
    this.selectedProjectId = '';
    this.customProjectName = '';
    this.displayNameOverride = '';
    this.clientName = '';
    this.companyName = '';
    this.marginPercent = 15;
    this.lines = [newLine()];
    void this.refreshInboxList();
  }

  async submitToFinance(): Promise<void> {
    if (this.step() !== 2) {
      this.snackbar.error('Complete the cost breakdown step first.');
      return;
    }
    if (!this.canContinueStep1()) {
      this.snackbar.error('Select a project or enter a custom name.');
      return;
    }
    if (this.isLocked()) {
      this.snackbar.info('This estimate is approved and locked.');
      return;
    }

    this.saving.set(true);
    try {
      const projectId = this.projectNameMode === 'existing' ? this.selectedProjectId || null : null;
      const customTitle =
        this.projectNameMode === 'custom' ? this.customProjectName.trim() || null : null;

      const lineInputs = this.lines.map((l) => ({
        resourceLabel: l.resourceLabel,
        hours: l.hours,
        ratePerHour: l.ratePerHour,
      }));

      const existingId = this.savedEstimateId();
      const metaFields = {
        margin_percent: this.marginPercent,
        display_name:
          this.projectNameMode === 'existing' ? this.displayNameOverride.trim() || null : null,
        client_name: this.clientName.trim() || null,
        company_name: this.companyName.trim() || null,
      };
      if (existingId) {
        if (this.projectNameMode === 'existing') {
          await this.financeEstimates.updateEstimateFields(existingId, {
            ...metaFields,
            project_id: this.selectedProjectId,
            custom_title: null,
          });
        } else {
          await this.financeEstimates.updateEstimateFields(existingId, {
            ...metaFields,
            project_id: null,
            custom_title: this.customProjectName.trim(),
          });
        }
        await this.financeEstimates.replaceLines(existingId, lineInputs);
        await this.pullRemoteSnapshot(existingId);
        const estForRev = await this.financeEstimates.fetchEstimateById(existingId);
        const uid = this.api.user()?.id;
        const revLabel =
          estForRev && uid && estForRev.submitted_by !== uid
            ? this.api.isFinance()
              ? 'Finance update'
              : this.api.isAdmin()
                ? 'Admin update'
                : 'PM update'
            : 'PM update';
        await this.financeEstimates.appendRevision(existingId, revLabel);
        this.historyRefresh.update((x) => x + 1);
        await this.refreshInboxList();
        this.snackbar.success('Estimate updated. Finance sees changes in real time.');
      } else {
        const { id } = await this.financeEstimates.createAndSubmitEstimate({
          projectId,
          customTitle,
          displayName: this.projectNameMode === 'existing' ? this.displayNameOverride : null,
          clientName: this.clientName,
          companyName: this.companyName,
          marginPercent: this.marginPercent,
          lines: lineInputs,
        });
        this.savedEstimateId.set(id);
        sessionStorage.setItem(STORAGE_KEY, id);
        await this.pullRemoteSnapshot(id);
        this.subscribeRealtime(id);
        await this.refreshInboxList();
        this.historyRefresh.update((x) => x + 1);
        this.snackbar.success('Submitted to Finance. Live sync is on for this estimate.');
      }
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'message' in e
          ? String((e as { message: string }).message)
          : 'Save failed';
      this.snackbar.error(msg);
    } finally {
      this.saving.set(false);
    }
  }

  formatEstimateWhen(iso: string): string {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  }

  /** Label that will head the estimate (for display / future save). */
  effectiveProjectLabel(): string {
    if (this.projectNameMode === 'custom') {
      const t = this.customProjectName.trim();
      return t || '(enter a project name)';
    }
    const o = this.displayNameOverride.trim();
    if (o) return o;
    if (!this.selectedProjectId) {
      return '(select a project)';
    }
    const p = this.projects().find((x) => x.id === this.selectedProjectId);
    return p?.title ?? '(unknown project)';
  }

  linkedProjectTitle(): string {
    if (!this.selectedProjectId) return '';
    return this.projects().find((x) => x.id === this.selectedProjectId)?.title ?? '';
  }

  /** Second line in inbox when client/company set. */
  estimateClientCompanyLine(row: ProjectFinanceEstimate): string {
    const c = row.client_name?.trim();
    const co = row.company_name?.trim();
    if (c && co) return `${c} · ${co}`;
    return c || co || '';
  }

  /** Current form values for preview in step 1. */
  previewClientCompanyLine(): string {
    const c = this.clientName.trim();
    const co = this.companyName.trim();
    if (c && co) return `${c} · ${co}`;
    return c || co || '';
  }
}
