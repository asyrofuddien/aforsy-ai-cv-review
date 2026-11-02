export interface GeneratedCvResult {
  fileName: string;
  htmlPath: string;
  pdfPath: string;
  generatedAt: string;
}

export function generatedCvResponse(result: GeneratedCvResult) {
  return { success: true, message: 'CV generated successfully', data: result };
}
