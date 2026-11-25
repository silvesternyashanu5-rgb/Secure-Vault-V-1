import type { HiddenSection } from '../types/hiddenVault';

export function getFileExtension(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : '';
}

export function classifyFileSection(name: string, mimeType: string): HiddenSection {
  const ext = getFileExtension(name);
  const mime = mimeType.toLowerCase();

  if (
    mime.startsWith('video/') ||
    ['mp4', 'webm', 'mov', 'm4v', 'mkv', 'avi', 'ogv', '3gp', 'flv', 'wmv'].includes(ext)
  ) {
    return 'videos';
  }
  if (
    mime.startsWith('audio/') ||
    ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'opus', 'wma', 'mid', 'midi'].includes(ext)
  ) {
    return 'music';
  }
  if (
    ['apk', 'ipa', 'exe', 'msi', 'dmg', 'appimage', 'deb', 'rpm', 'app', 'webloc'].includes(
      ext
    )
  ) {
    return 'apps';
  }
  return 'documents';
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
}

export function detectMagicSignature(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer.slice(0, 16));
  if (bytes.length < 4) return 'Small / Raw Data';

  const hex4 = Array.from(bytes.slice(0, 4), (b) => b.toString(16).padStart(2, '0')).join(' ');
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return 'PDF Document (%PDF)';
  }
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'PNG Raster Image';
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'JPEG Image';
  }
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return 'GIF Image';
  }
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05)) {
    return 'ZIP / OpenXML / Android APK Container (PK)';
  }
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    return 'MP3 Audio (ID3v2)';
  }
  if (bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) {
    return 'Ogg Media Container';
  }
  if (bytes[0] === 0x66 && bytes[1] === 0x4c && bytes[2] === 0x61 && bytes[3] === 0x43) {
    return 'FLAC Lossless Audio';
  }
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    return 'ISO Base Media / MP4 / M4A';
  }
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return 'Matroska / WebM Video (EBML)';
  }
  if (bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46) {
    return 'ELF Executable / Shared Binary';
  }
  if (bytes[0] === 0x4d && bytes[1] === 0x5a) {
    return 'Windows PE / EXE / DLL Binary (MZ)';
  }
  if (bytes[0] === 0x53 && bytes[1] === 0x51 && bytes[2] === 0x4c && bytes[3] === 0x69) {
    return 'SQLite 3 Database';
  }
  return `Binary Signature (${hex4.toUpperCase()})`;
}

export interface ZipEntryInfo {
  fileName: string;
  compressedSize: number;
  uncompressedSize: number;
}

/**
 * Pure-JS ZIP Central Directory parser so .zip, .docx, .xlsx, .pptx, .apk, .epub
 * files can be inspected directly inside the app without external dependencies.
 */
export function parseZipEntries(buffer: ArrayBuffer): ZipEntryInfo[] {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const minOffset = Math.max(0, bytes.length - 65558);

  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= minOffset; i--) {
    if (
      bytes[i] === 0x50 &&
      bytes[i + 1] === 0x4b &&
      bytes[i + 2] === 0x05 &&
      bytes[i + 3] === 0x06
    ) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) return [];

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  let cdOffset = view.getUint32(eocdOffset + 16, true);
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const entries: ZipEntryInfo[] = [];

  for (let idx = 0; idx < totalEntries && idx < 300; idx++) {
    if (cdOffset + 46 > bytes.length) break;
    const sig = view.getUint32(cdOffset, true);
    if (sig !== 0x02014b50) break;

    const compressedSize = view.getUint32(cdOffset + 20, true);
    const uncompressedSize = view.getUint32(cdOffset + 24, true);
    const nameLen = view.getUint16(cdOffset + 28, true);
    const extraLen = view.getUint16(cdOffset + 30, true);
    const commentLen = view.getUint16(cdOffset + 32, true);

    const nameStart = cdOffset + 46;
    const nameEnd = Math.min(bytes.length, nameStart + nameLen);
    const fileName = decoder.decode(bytes.slice(nameStart, nameEnd));
    entries.push({ fileName, compressedSize, uncompressedSize });

    cdOffset = nameEnd + extraLen + commentLen;
  }

  return entries;
}

export function isLikelyTextBuffer(buffer: ArrayBuffer, ext: string, mime: string): boolean {
  const textExts = [
    'txt', 'md', 'markdown', 'json', 'csv', 'tsv', 'xml', 'html', 'htm', 'svg',
    'js', 'ts', 'tsx', 'jsx', 'css', 'scss', 'py', 'rb', 'go', 'rs', 'java',
    'c', 'cpp', 'h', 'sh', 'yaml', 'yml', 'toml', 'ini', 'env', 'log', 'sql', 'rtf',
  ];
  if (mime.startsWith('text/') || mime.includes('json') || mime.includes('xml') || textExts.includes(ext)) {
    return true;
  }

  const sample = new Uint8Array(buffer.slice(0, Math.min(2048, buffer.byteLength)));
  if (sample.length === 0) return true;
  let nonPrintable = 0;
  for (let i = 0; i < sample.length; i++) {
    const b = sample[i];
    if (b === 0) return false;
    if (b < 9 || (b > 13 && b < 32)) nonPrintable++;
  }
  return nonPrintable / sample.length < 0.08;
}

export function parseCsvRows(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0).slice(0, 200);
  return lines.map((line) => {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        cells.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    cells.push(current.trim());
    return cells;
  });
}

export function buildHexDump(buffer: ArrayBuffer, offset = 0, length = 2048): string {
  const slice = new Uint8Array(buffer.slice(offset, Math.min(buffer.byteLength, offset + length)));
  const lines: string[] = [];
  for (let i = 0; i < slice.length; i += 16) {
    const chunk = slice.slice(i, i + 16);
    const addr = (offset + i).toString(16).padStart(8, '0');
    const hexPart = Array.from(chunk, (b) => b.toString(16).padStart(2, '0'))
      .join(' ')
      .padEnd(47, ' ');
    const asciiPart = Array.from(chunk, (b) =>
      b >= 32 && b <= 126 ? String.fromCharCode(b) : '.'
    ).join('');
    lines.push(`${addr}  ${hexPart}  |${asciiPart}|`);
  }
  return lines.join('\n');
}
