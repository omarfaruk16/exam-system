/** Payload enqueued for the student-import worker. */
export interface StudentImportJobData {
  filePath: string;
  originalName: string;
  batchId: number;
  uploadedByUserId: number;
}

/** Minimal shape of an uploaded file we rely on (avoids a hard @types/multer dependency). */
export interface UploadedExcel {
  path: string;
  originalname: string;
  size: number;
  mimetype: string;
}
