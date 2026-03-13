import { Component, inject, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NgClass } from '@angular/common';
import { SearchService, type SearchResult } from '../../services/search.service';

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [RouterLink, FormsModule, NgClass],
  templateUrl: './search.html',
  styleUrl: './search.scss',
})
export class Search {
  private readonly searchService = inject(SearchService);

  readonly query = signal('');
  readonly results = signal<SearchResult[]>([]);
  readonly loading = signal(false);
  readonly searched = signal(false);

  readonly hasResults = computed(() => this.results().length > 0);
  readonly isEmpty = computed(() => this.searched() && this.results().length === 0 && this.query().trim().length >= 2);

  async onSearch(): Promise<void> {
    const q = this.query().trim();
    if (q.length < 2) {
      this.results.set([]);
      this.searched.set(false);
      return;
    }
    this.loading.set(true);
    this.searched.set(true);
    try {
      const r = await this.searchService.search(q);
      this.results.set(r);
    } finally {
      this.loading.set(false);
    }
  }

  getIcon(type: 'project' | 'task'): string {
    return type === 'project' ? 'bi-folder' : 'bi-check2-square';
  }
}
