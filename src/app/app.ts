import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router, ActivatedRoute } from '@angular/router';

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

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly title = signal('Truyện Online');
  protected readonly sidebarOpen = signal(true);

  protected readonly stories = signal<Story[]>([]);
  protected readonly selectedStory = signal<Story | null>(null);
  protected readonly selectedChapter = signal<ChapterMeta | null>(null);
  protected readonly chapterContent = signal<string>('');
  protected readonly loadingContent = signal(false);
  protected readonly chapterPage = signal(1);
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
    this.http.get<Story[]>('/data/stories-full.json').subscribe(stories => {
      this.stories.set(stories);
    });
  }

  selectStory(story: Story) {
    this.selectedStory.set(story);
    this.selectedChapter.set(null);
    this.chapterContent.set('');
    // Đọc page từ query params hoặc mặc định = 1
    const qp = this.route.snapshot.queryParamMap.get('page');
    const page = qp ? parseInt(qp, 10) : 1;
    this.goToChapterPage(page);
  }

  goToChapterPage(page: number) {
    const total = this.totalChapterPages();
    const safePage = Math.max(1, Math.min(page, total || 1));
    this.chapterPage.set(safePage);
    this.router.navigate([], {
      queryParams: { page: safePage },
      queryParamsHandling: 'merge',
    });
  }

  selectChapter(chapter: ChapterMeta) {
    this.selectedChapter.set(chapter);
    this.loadChapterContent(chapter);
  }

  backToChapterList() {
    this.selectedChapter.set(null);
    this.chapterContent.set('');
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

  toggleSidebar() {
    this.sidebarOpen.update(v => !v);
  }

  private loadChapterContent(chapter: ChapterMeta) {
    const story = this.selectedStory();
    if (!story) return;
    this.loadingContent.set(true);
    const url = `/data/content/${story.folder}/${chapter.file}`;
    this.http.get(url, { responseType: 'text' }).subscribe({
      next: (raw) => {
        // Dòng đầu tiên là tên chương, bỏ qua khi hiển thị nội dung
        const lines = raw.split(/\r?\n/);
        let content = lines.slice(1).join('\n').trim()
          .replace(/\n/g, '<br>');
        // Loại bỏ tất cả thẻ HTML trừ <br>
        content = content.replace(/<(?!\/?br\s*\/?>)[^>]+>/gi, '');
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
