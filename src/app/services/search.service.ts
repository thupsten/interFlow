import { Injectable, inject } from '@angular/core';
import { Api } from './api';

export interface SearchResult {
  type: 'project' | 'task';
  id: string;
  title: string;
  subtitle?: string;
  link: string;
  projectTitle?: string;
}

@Injectable({
  providedIn: 'root',
})
export class SearchService {
  private readonly api = inject(Api);

  async search(query: string, limit = 20): Promise<SearchResult[]> {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];

    const results: SearchResult[] = [];

    // Search projects (title, brief)
    const { data: projects } = await this.api.supabase
      .from('projects')
      .select('id, title, brief')
      .or(`title.ilike.%${q}%,brief.ilike.%${q}%`)
      .is('deleted_at', null)
      .limit(limit);

    projects?.forEach((p) => {
      results.push({
        type: 'project',
        id: p.id,
        title: p.title,
        subtitle: p.brief ? p.brief.slice(0, 80) + (p.brief.length > 80 ? '...' : '') : undefined,
        link: `/projects/${p.id}`,
      });
    });

    // Search tasks (title, description)
    const { data: tasks } = await this.api.supabase
      .from('tasks')
      .select(`
        id,
        title,
        description,
        project:projects!tasks_project_id_fkey(id, title)
      `)
      .or(`title.ilike.%${q}%,description.ilike.%${q}%`)
      .is('deleted_at', null)
      .is('archived_at', null)
      .limit(limit);

    const taskList = tasks as { id: string; title: string; description?: string; project?: { id: string; title: string } | { id: string; title: string }[] }[] | null;
    taskList?.forEach((t) => {
      const proj = Array.isArray(t.project) ? t.project[0] : t.project;
      results.push({
        type: 'task',
        id: t.id,
        title: t.title,
        subtitle: t.description ? t.description.slice(0, 80) + (t.description.length > 80 ? '...' : '') : undefined,
        link: `/projects/${proj?.id ?? ''}`,
        projectTitle: proj?.title,
      });
    });

    // Dedupe and limit
    const seen = new Set<string>();
    return results.filter((r) => {
      const key = `${r.type}:${r.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, limit);
  }
}
