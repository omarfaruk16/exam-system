/** Payload enqueued for the student-import worker. */
export interface StudentImportJobData {
  filePath: string;
  originalName: string;
  batchId: number;
  uploadedByUserId: number;
}

/** The bulk-importable entity types beyond students. */
export type ImportEntity = 'teachers' | 'departments' | 'courses';

/** Payload enqueued for the generic entity-import worker. */
export interface EntityImportJobData {
  entity: ImportEntity;
  filePath: string;
  originalName: string;
  uploadedByUserId: number;
}

/** Minimal shape of an uploaded file we rely on (avoids a hard @types/multer dependency). */
export interface UploadedExcel {
  path: string;
  originalname: string;
  size: number;
  mimetype: string;
}
