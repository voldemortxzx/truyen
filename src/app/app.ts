import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface ChapterMeta {
  id: number;
  title: string;
  file: string;
}

export interface Story {
  id: number;
  title: string;
  folder: string;
  chapters: ChapterMeta[];
}

type ViewMode = 'home' | 'story' | 'chapter';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  private readonly http = inject(HttpClient);

  protected readonly stories = signal<Story[]>([]);
  protected readonly selectedStory = signal<Story | null>(null);
  protected readonly selectedChapter = signal<ChapterMeta | null>(null);
  protected readonly chapterContent = signal<string>('');
  protected readonly loadingContent = signal(false);
  protected readonly chapterPage = signal(1);
  protected readonly view = signal<ViewMode>('home');
  protected readonly CHAPTERS_PER_PAGE = 100;

  protected readonly totalChapterPages = computed(() => {
    const story = this.selectedStory();
    if (!story) return 0;
    return Math.ceil(story.chapters.length / this.CHAPTERS_PER_PAGE);
  });

  protected readonly pagedChapters = computed(() => {
    const story = this.selectedStory();
    if (!story) return [];
    const page = this.chapterPage();
    const start = (page - 1) * this.CHAPTERS_PER_PAGE;
    return story.chapters.slice(start, start + this.CHAPTERS_PER_PAGE);
  });

  protected readonly chapterPageNumbers = computed(() => {
    const total = this.totalChapterPages();
    return Array.from({ length: total }, (_, i) => i + 1);
  });

  protected readonly currentChapterIndex = computed(() => {
    const story = this.selectedStory();
    const chapter = this.selectedChapter();
    if (!story || !chapter) return -1;
    return story.chapters.findIndex(c => c.id === chapter.id);
  });

  protected readonly hasPrev = computed(() => this.currentChapterIndex() > 0);
  protected readonly hasNext = computed(() => {
    const story = this.selectedStory();
    return story ? this.currentChapterIndex() < story.chapters.length - 1 : false;
  });

  ngOnInit() {
    this.http.get<Story[]>('data/stories-full.json').subscribe(stories => {
      this.stories.set(stories);
      this.restoreFromUrl(stories);
    });
  }

  private updateUrl() {
    const story = this.selectedStory();
    if (!story) {
      window.location.hash = '';
      return;
    }
    const chapter = this.selectedChapter();
    if (chapter) {
      const slug = chapter.file.replace('.txt', '');
      window.location.hash = `/truyen/${story.folder}/${slug}`;
    } else {
      const page = this.chapterPage();
      const query = page > 1 ? `?page=${page}` : '';
      window.location.hash = `/truyen/${story.folder}${query}`;
    }
  }

  private restoreFromUrl(stories: Story[]) {
    const hash = window.location.hash.replace(/^#/, '');
    const [path, queryString] = hash.split('?');
    const parts = path.split('/').filter(Boolean);
    if (parts[0] !== 'truyen' || !parts[1]) {
      this.view.set('home');
      return;
    }

    const folder = parts[1];
    const chapterSlug = parts[2];
    const story = stories.find(s => s.folder === folder);
    if (!story) {
      this.view.set('home');
      return;
    }

    this.selectedStory.set(story);

    if (chapterSlug) {
      const chapter = story.chapters.find(c => c.file === chapterSlug + '.txt');
      if (chapter) {
        this.selectedChapter.set(chapter);
        this.loadChapterContent(chapter);
        const idx = story.chapters.indexOf(chapter);
        const page = Math.floor(idx / this.CHAPTERS_PER_PAGE) + 1;
        this.chapterPage.set(page);
        this.view.set('chapter');
        return;
      }
    }

    const params = new URLSearchParams(queryString || '');
    const page = parseInt(params.get('page') || '1', 10);
    this.chapterPage.set(Math.max(1, Math.min(page, this.totalChapterPages() || 1)));
    this.view.set('story');
  }

  goHome() {
    this.selectedStory.set(null);
    this.selectedChapter.set(null);
    this.chapterContent.set('');
    this.chapterPage.set(1);
    this.view.set('home');
    this.updateUrl();
    window.scrollTo(0, 0);
  }

  selectStory(story: Story) {
    this.selectedStory.set(story);
    this.selectedChapter.set(null);
    this.chapterContent.set('');
    this.chapterPage.set(1);
    this.view.set('story');
    this.updateUrl();
    window.scrollTo(0, 0);
  }

  goToChapterPage(page: number) {
    const total = this.totalChapterPages();
    const safePage = Math.max(1, Math.min(page, total || 1));
    this.chapterPage.set(safePage);
    this.updateUrl();
    window.scrollTo(0, 0);
  }

  selectChapter(chapter: ChapterMeta) {
    const story = this.selectedStory();
    if (!story) return;
    this.selectedChapter.set(chapter);
    this.loadChapterContent(chapter);
    this.view.set('chapter');
    this.updateUrl();
    window.scrollTo(0, 0);
  }

  backToChapterList() {
    this.selectedChapter.set(null);
    this.chapterContent.set('');
    this.view.set('story');
    this.updateUrl();
    window.scrollTo(0, 0);
  }

  prevChapter() {
    const story = this.selectedStory();
    const idx = this.currentChapterIndex();
    if (story && idx > 0) {
      this.selectChapter(story.chapters[idx - 1]);
    }
  }

  nextChapter() {
    const story = this.selectedStory();
    const idx = this.currentChapterIndex();
    if (story && idx < story.chapters.length - 1) {
      this.selectChapter(story.chapters[idx + 1]);
    }
  }

  private loadChapterContent(chapter: ChapterMeta) {
    const story = this.selectedStory();
    if (!story) return;
    this.loadingContent.set(true);
    const url = `data/content/${story.folder}/${chapter.file}`;
    this.http.get(url, { responseType: 'text' }).subscribe({
      next: (raw) => {
        const lines = raw.split(/\r?\n/);
        let content = lines.slice(1).join('\n').trim()
          .replace(/\n/g, '<br>');
        content = content.replace(/<(?!\/?br\s*\/?>)[^>]+>/gi, '');
        content = content.replace(/[.…]{10,}/g, (match) => {
          return match.slice(0, Math.ceil(match.length / 2));
        });
        this.chapterContent.set(content);
        this.loadingContent.set(false);
      },
      error: () => {
        this.chapterContent.set('Không thể tải nội dung chương.');
        this.loadingContent.set(false);
      }
    });
  }
}
