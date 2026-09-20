import { Component, ElementRef, OnDestroy, OnInit, EventEmitter, Output, ViewChild, signal } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase-client';
import { NOTES_BUCKET, NOTES_TABLE, SUPABASE_URL } from './supabase-config';

type NoteType = 'text' | 'image' | 'video';

interface NoteItem {
  id: number | null;
  clientKey: string;
  type: NoteType;
  text: string;
  mimeType?: string;
  mediaPath?: string;
  mediaUrl?: string;
  createdAt: number;
  updatedAt: number;
  pending: boolean;
}

interface NoteRow {
  id: number;
  type: NoteType;
  text: string | null;
  mime_type: string | null;
  media_path: string | null;
  created_at: number;
  updated_at: number;
}

function publicMediaUrl(path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${NOTES_BUCKET}/${path}`;
}

function mapRowToItem(row: NoteRow, clientKey: string): NoteItem {
  return {
    id: row.id,
    clientKey,
    type: row.type,
    text: row.text ?? '',
    mimeType: row.mime_type ?? undefined,
    mediaPath: row.media_path ?? undefined,
    mediaUrl: row.media_path ? publicMediaUrl(row.media_path) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    pending: false
  };
}

@Component({
  selector: 'app-notes-page',
  templateUrl: './notes-page.html',
  styleUrl: './notes-page.css',
  standalone: true
})
export class NotesPage implements OnInit, OnDestroy {
  @Output() back = new EventEmitter<void>();
  @ViewChild('feedEl') feedRef?: ElementRef<HTMLDivElement>;

  protected readonly items = signal<NoteItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly newText = signal('');
  protected readonly editingKey = signal<string | null>(null);
  protected readonly editingText = signal('');

  protected readonly realtimeStatus = signal<'connecting' | 'connected' | 'error'>('connecting');
  protected readonly dbError = signal<string | null>(null);

  private channel: RealtimeChannel | null = null;

  async ngOnInit() {
    await this.loadInitial();
    this.subscribeRealtime();
  }

  ngOnDestroy() {
    if (this.channel) {
      supabase.removeChannel(this.channel);
    }
    for (const item of this.items()) {
      if (item.mediaUrl?.startsWith('blob:')) URL.revokeObjectURL(item.mediaUrl);
    }
  }

  private async loadInitial() {
    this.loading.set(true);
    const { data, error } = await supabase.from(NOTES_TABLE).select('*').order('created_at', { ascending: true });
    if (error) {
      this.dbError.set(error.message);
      this.loading.set(false);
      return;
    }
    this.items.set((data ?? []).map(row => mapRowToItem(row as NoteRow, `db-${(row as NoteRow).id}`)));
    this.loading.set(false);
    this.scrollToBottomSoon();
  }

  private subscribeRealtime() {
    this.channel = supabase
      .channel('notes-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: NOTES_TABLE }, payload => {
        const row = payload.new as NoteRow;
        this.items.update(list => {
          if (list.some(it => it.id === row.id)) return list;
          const item = mapRowToItem(row, `db-${row.id}`);
          return [...list, item].sort((a, b) => a.createdAt - b.createdAt);
        });
        this.scrollToBottomSoon();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: NOTES_TABLE }, payload => {
        const row = payload.new as NoteRow;
        this.items.update(list => list.map(it => (it.id === row.id ? mapRowToItem(row, it.clientKey) : it)));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: NOTES_TABLE }, payload => {
        const oldId = (payload.old as { id: number }).id;
        this.items.update(list => list.filter(it => it.id !== oldId));
      })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') this.realtimeStatus.set('connected');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') this.realtimeStatus.set('error');
      });
  }

  formatTime(ts: number): string {
    return new Date(ts).toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  handleComposerKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.addText();
    }
  }

  async addText() {
    const text = this.newText().trim();
    if (!text) return;
    const now = Date.now();
    const clientKey = crypto.randomUUID();
    const optimisticItem: NoteItem = {
      id: null,
      clientKey,
      type: 'text',
      text,
      createdAt: now,
      updatedAt: now,
      pending: true
    };
    this.items.update(list => [...list, optimisticItem]);
    this.newText.set('');
    this.scrollToBottomSoon();

    const { data, error } = await supabase
      .from(NOTES_TABLE)
      .insert({ type: 'text', text, created_at: now, updated_at: now })
      .select()
      .single();

    if (error || !data) {
      this.dbError.set(error?.message ?? 'Không thể gửi nội dung.');
      this.items.update(list => list.filter(it => it.clientKey !== clientKey));
      return;
    }
    this.reconcileInserted(clientKey, data as NoteRow);
  }

  async onFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    for (const file of files) {
      await this.addMediaItem(file);
    }
  }

  private async addMediaItem(file: File) {
    const type: NoteType = file.type.startsWith('video') ? 'video' : 'image';
    const clientKey = crypto.randomUUID();
    const now = Date.now();
    const ext = file.name.includes('.') ? file.name.split('.').pop() : '';
    const path = `${clientKey}${ext ? '.' + ext : ''}`;
    const localUrl = URL.createObjectURL(file);

    const optimisticItem: NoteItem = {
      id: null,
      clientKey,
      type,
      text: '',
      mimeType: file.type,
      mediaPath: path,
      mediaUrl: localUrl,
      createdAt: now,
      updatedAt: now,
      pending: true
    };
    this.items.update(list => [...list, optimisticItem]);
    this.scrollToBottomSoon();

    try {
      const { error: uploadError } = await supabase.storage.from(NOTES_BUCKET).upload(path, file, { contentType: file.type });
      if (uploadError) throw uploadError;

      const { data, error: insertError } = await supabase
        .from(NOTES_TABLE)
        .insert({ type, text: '', mime_type: file.type, media_path: path, created_at: now, updated_at: now })
        .select()
        .single();
      if (insertError || !data) throw insertError ?? new Error('Không thể lưu thông tin file.');

      URL.revokeObjectURL(localUrl);
      this.reconcileInserted(clientKey, data as NoteRow);
    } catch (e) {
      URL.revokeObjectURL(localUrl);
      this.dbError.set(this.errorMessage(e));
      this.items.update(list => list.filter(it => it.clientKey !== clientKey));
    }
  }

  /** Merges a just-confirmed insert into the list, deduping against a copy the realtime channel may have already added. */
  private reconcileInserted(clientKey: string, row: NoteRow) {
    this.items.update(list => {
      const fromRealtime = list.find(it => it.id === row.id && it.clientKey !== clientKey);
      if (fromRealtime) {
        const ours = list.find(it => it.clientKey === clientKey);
        if (ours?.mediaUrl?.startsWith('blob:')) URL.revokeObjectURL(ours.mediaUrl);
        return list.filter(it => it.clientKey !== clientKey);
      }
      return list.map(it => (it.clientKey === clientKey ? mapRowToItem(row, clientKey) : it));
    });
  }

  startEdit(item: NoteItem) {
    if (item.pending || item.id === null) return;
    this.editingKey.set(item.clientKey);
    this.editingText.set(item.text);
  }

  cancelEdit() {
    this.editingKey.set(null);
    this.editingText.set('');
  }

  async saveEdit(item: NoteItem) {
    if (item.id === null) return;
    const text = this.editingText().trim();
    const now = Date.now();
    this.items.update(list => list.map(it => (it.clientKey === item.clientKey ? { ...it, text, updatedAt: now } : it)));
    this.editingKey.set(null);

    const { error } = await supabase.from(NOTES_TABLE).update({ text, updated_at: now }).eq('id', item.id);
    if (error) this.dbError.set(error.message);
  }

  async deleteItem(item: NoteItem) {
    if (item.pending || item.id === null) return;
    if (!confirm('Xóa mục này?')) return;
    this.items.update(list => list.filter(it => it.clientKey !== item.clientKey));
    if (item.mediaUrl?.startsWith('blob:')) URL.revokeObjectURL(item.mediaUrl);

    const { error } = await supabase.from(NOTES_TABLE).delete().eq('id', item.id);
    if (error) this.dbError.set(error.message);

    if (item.mediaPath) {
      await supabase.storage.from(NOTES_BUCKET).remove([item.mediaPath]);
    }
  }

  openMedia(url?: string) {
    if (url) window.open(url, '_blank');
  }

  private scrollToBottomSoon() {
    setTimeout(() => {
      const el = this.feedRef?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  private errorMessage(e: unknown): string {
    return e instanceof Error ? e.message : 'Có lỗi không xác định xảy ra.';
  }
}
