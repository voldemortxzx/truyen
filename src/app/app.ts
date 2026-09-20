import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { NotesPage } from './notes-page/notes-page';

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
  isAdmin?: boolean;
}
 
type ViewMode = 'home' | 'story' | 'chapter' | 'notes';
type BgTheme = 'light' | 'yellow' | 'dark';
type FontFamilyOption = 'modern' | 'classic';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
  standalone: true,
  imports: [CommonModule, FormsModule, NotesPage]
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
  protected readonly isLoggedInAsAdmin = signal(false);
  protected readonly showLoginPanel = signal(false);
  protected readonly loginPassword = signal('');
  protected readonly CHAPTERS_PER_PAGE = 100;

  protected readonly showReaderSettings = signal(false);
  protected readonly bgTheme = signal<BgTheme>(this.readStored('readerBgTheme', 'light') as BgTheme);
  protected readonly fontSize = signal<number>(Number(this.readStored('readerFontSize', '18')));
  protected readonly fontFamily = signal<FontFamilyOption>(this.readStored('readerFontFamily', 'modern') as FontFamilyOption);

  protected readonly contentFontFamily = computed(() =>
    this.fontFamily() === 'classic'
      ? `'Georgia', 'Noto Serif', serif`
      : `'Segoe UI', Tahoma, Geneva, Verdana, sans-serif`
  );

  protected readonly visibleStories = computed(() => {
    const allStories = this.stories();
    const isAdmin = this.isLoggedInAsAdmin();
    return allStories.filter(story => !story.isAdmin || isAdmin);
  });
 
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
 
      // Lắng nghe nút back/forward của trình duyệt
      window.addEventListener('popstate', () => {
        this.restoreFromUrl(this.stories());
      });
    });
  }
 
  private updateUrl() {
    if (this.view() === 'notes') {
      history.pushState(null, '', '#/nhat-ky');
      return;
    }
    const story = this.selectedStory();
    if (!story) {
      history.pushState(null, '', '#');
      return;
    }
    const chapter = this.selectedChapter();
    if (chapter) {
      const slug = chapter.file.replace('.txt', '');
      history.pushState(null, '', `#/truyen/${story.folder}/${slug}`);
    } else {
      const page = this.chapterPage();
      const query = page > 1 ? `?page=${page}` : '';
      history.pushState(null, '', `#/truyen/${story.folder}${query}`);
    }
  }
 
  private pressTimer: any;
 
  startPress(story: Story) {
    this.pressTimer = setTimeout(() => {
      this.openStoryInNewTab(story);
      this.pressTimer = null;
    }, 400);
  }
 
  startPressChapter(chapter: ChapterMeta) {
    const story = this.selectedStory();
    if (!story) return;
    this.pressTimer = setTimeout(() => {
      this.openChapterInNewTab(chapter);
      this.pressTimer = null;
    }, 400);
  }
 
  endPress() {
    if (this.pressTimer) {
      clearTimeout(this.pressTimer);
      this.pressTimer = null;
    }
  }
 
  private restoreFromUrl(stories: Story[]) {
    const hash = window.location.hash.replace(/^#/, '');
    const [path, queryString] = hash.split('?');
    const parts = path.split('/').filter(Boolean);
    if (parts[0] === 'nhat-ky') {
      this.selectedStory.set(null);
      this.selectedChapter.set(null);
      this.view.set('notes');
      return;
    }
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
 
  goToNotes() {
    this.selectedStory.set(null);
    this.selectedChapter.set(null);
    this.view.set('notes');
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
 
  openStoryInNewTab(story: Story) {
    const url = `#/truyen/${story.folder}`;
    window.open(window.location.origin + window.location.pathname + url, '_blank');
  }
 
  openChapterInNewTab(chapter: ChapterMeta) {
    const story = this.selectedStory();
    if (!story) return;
    const slug = chapter.file.replace('.txt', '');
    const url = `#/truyen/${story.folder}/${slug}`;
    window.open(window.location.origin + window.location.pathname + url, '_blank');
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
 
  toggleLoginPanel() {
    this.showLoginPanel.update(v => !v);
    this.loginPassword.set('');
  }
 
  handleLogin() {
    const password = this.loginPassword().trim();
    if (password === 'a') {
      this.isLoggedInAsAdmin.set(true);
      this.showLoginPanel.set(false);
      this.loginPassword.set('');
    } else {
      alert('Mật khẩu không đúng!');
      this.loginPassword.set('');
    }
  }

  private readStored(key: string, fallback: string): string {
    try {
      return localStorage.getItem(key) ?? fallback;
    } catch {
      return fallback;
    }
  }

  private writeStored(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // ignore (private browsing / storage disabled)
    }
  }

  toggleReaderSettings() {
    this.showReaderSettings.update(v => !v);
  }

  setBgTheme(theme: BgTheme) {
    this.bgTheme.set(theme);
    this.writeStored('readerBgTheme', theme);
  }

  setFontSize(size: number) {
    const clamped = Math.min(32, Math.max(14, Math.round(size)));
    this.fontSize.set(clamped);
    this.writeStored('readerFontSize', String(clamped));
  }

  onFontSizeInput(event: Event) {
    const value = Number((event.target as HTMLInputElement).value);
    this.setFontSize(value);
  }

  increaseFontSize() {
    this.setFontSize(this.fontSize() + 1);
  }

  decreaseFontSize() {
    this.setFontSize(this.fontSize() - 1);
  }

  setFontFamily(family: FontFamilyOption) {
    this.fontFamily.set(family);
    this.writeStored('readerFontFamily', family);
  }
}