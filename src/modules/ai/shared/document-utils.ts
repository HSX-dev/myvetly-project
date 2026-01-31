/**
 * Document extraction utilities for PDF and DOCX files
 */
import axios from 'axios';

/**
 * Detect file type from URL or filename
 */
export function detectFileType(
  url: string,
): 'pdf' | 'docx' | 'doc' | 'image' | 'unknown' {
  // Extract extension from URL (handle query params)
  const urlPath = url.split('?')[0];
  const ext = urlPath.split('.').pop()?.toLowerCase();

  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx') return 'docx';
  if (ext === 'doc') return 'doc';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) return 'image';

  return 'unknown';
}

/**
 * Extract text from a PDF file
 * Uses pdf-parse library
 */
export async function extractTextFromPDF(url: string): Promise<string | null> {
  try {
    // Dynamic import to avoid issues if not installed
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfParse = require('pdf-parse');

    // Fetch the PDF file
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000,
    });

    const buffer = Buffer.from(response.data);
    const data = await pdfParse(buffer);

    // Return extracted text, trimmed
    const text = data.text?.trim();
    if (!text || text.length === 0) {
      return null;
    }

    // Limit text length to prevent token overflow
    const maxLength = 10000;
    if (text.length > maxLength) {
      return text.substring(0, maxLength) + '... [truncated]';
    }

    return text;
  } catch (error) {
    console.error('Failed to extract text from PDF:', error);
    return null;
  }
}

/**
 * Extract text from a DOCX file
 * Uses mammoth library for clean extraction
 */
export async function extractTextFromDOCX(url: string): Promise<string | null> {
  try {
    // Dynamic import to avoid issues if not installed
    const mammoth = await import('mammoth');

    // Fetch the DOCX file
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000,
    });

    const buffer = Buffer.from(response.data);
    const result = await mammoth.extractRawText({ buffer });

    // Return extracted text, trimmed
    const text = result.value?.trim();
    if (!text || text.length === 0) {
      return null;
    }

    // Limit text length to prevent token overflow
    const maxLength = 10000;
    if (text.length > maxLength) {
      return text.substring(0, maxLength) + '... [truncated]';
    }

    return text;
  } catch (error) {
    console.error('Failed to extract text from DOCX:', error);
    return null;
  }
}

/**
 * Extract text from a DOC file (older Word format)
 * Falls back to regex-based extraction from XML
 */
export async function extractTextFromDOC(url: string): Promise<string | null> {
  try {
    // Fetch the file
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000,
    });

    // Try to extract text using regex (works for some DOC files)
    const text = response.data.toString('utf-8');

    // Extract text from XML-like structure
    const pattern = /<w:t[^>]*>([^<]*)<\/w:t>/g;
    const matches: string[] = [];
    let match;

    while ((match = pattern.exec(text)) !== null) {
      if (match[1]) {
        matches.push(match[1]);
      }
    }

    if (matches.length === 0) {
      return null;
    }

    const extractedText = matches.join(' ').trim();

    // Limit text length
    const maxLength = 10000;
    if (extractedText.length > maxLength) {
      return extractedText.substring(0, maxLength) + '... [truncated]';
    }

    return extractedText;
  } catch (error) {
    console.error('Failed to extract text from DOC:', error);
    return null;
  }
}

/**
 * Process multiple document URLs and extract text
 */
export async function processDocuments(urls: string[]): Promise<string> {
  const texts: string[] = [];

  for (const url of urls) {
    const fileType = detectFileType(url);

    let extractedText: string | null = null;

    switch (fileType) {
      case 'pdf':
        extractedText = await extractTextFromPDF(url);
        if (extractedText) {
          texts.push(`[PDF Document Content]:\n${extractedText}`);
        }
        break;

      case 'docx':
        extractedText = await extractTextFromDOCX(url);
        if (extractedText) {
          texts.push(`[Word Document Content]:\n${extractedText}`);
        }
        break;

      case 'doc':
        extractedText = await extractTextFromDOC(url);
        if (extractedText) {
          texts.push(`[Word Document Content]:\n${extractedText}`);
        }
        break;

      default:
        console.warn(`Unsupported document type for URL: ${url}`);
    }
  }

  return texts.join('\n\n');
}

/**
 * Check if a URL is a supported document type
 */
export function isSupportedDocument(url: string): boolean {
  const type = detectFileType(url);
  return ['pdf', 'docx', 'doc'].includes(type);
}

/**
 * Check if a URL is an image
 */
export function isImage(url: string): boolean {
  return detectFileType(url) === 'image';
}
