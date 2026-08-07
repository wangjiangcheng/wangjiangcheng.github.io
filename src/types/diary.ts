export interface DiaryEntry {
  id: string;
  entryDate: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface SaveDiaryEntryInput {
  id?: string;
  entryDate: string;
  title: string;
  content: string;
}
