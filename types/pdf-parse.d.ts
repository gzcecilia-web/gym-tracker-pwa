declare module 'pdf-parse' {
  type PDFParseResult = {
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: unknown;
    version: string;
    text: string;
  };

  export default function pdfParse(dataBuffer: Buffer): Promise<PDFParseResult>;
}
