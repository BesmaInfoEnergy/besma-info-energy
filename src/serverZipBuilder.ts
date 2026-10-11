import zlib from 'zlib';

export interface ZipEntryInput {
  name: string;
  data: Buffer;
}

// Table CRC-32 IEEE 802.3
const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC32_TABLE[i] = c >>> 0;
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC32_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Assemble une archive ZIP binaire standard (PKZIP 2.0) en mémoire sans dépendance externe.
 */
export function buildZipArchive(entries: ZipEntryInput[]): Buffer {
  const localFileParts: Buffer[] = [];
  const centralDirParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf-8');
    const uncompressedData = entry.data;
    const compressedData = zlib.deflateRawSync(uncompressedData);
    const crc = crc32(uncompressedData);

    // Local file header (30 octets + nom)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // Signature PK\x03\x04
    localHeader.writeUInt16LE(20, 4); // Version needed to extract (2.0)
    localHeader.writeUInt16LE(0, 6); // General purpose bit flag
    localHeader.writeUInt16LE(8, 8); // Compression method: 8 (Deflate)
    localHeader.writeUInt16LE(0, 10); // Last mod file time
    localHeader.writeUInt16LE(0x5421, 12); // Last mod file date
    localHeader.writeUInt32LE(crc, 14); // CRC-32
    localHeader.writeUInt32LE(compressedData.length, 18); // Compressed size
    localHeader.writeUInt32LE(uncompressedData.length, 22); // Uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26); // File name length
    localHeader.writeUInt16LE(0, 28); // Extra field length

    localFileParts.push(localHeader, nameBuf, compressedData);

    // Central directory file header (46 octets + nom)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // Signature PK\x01\x02
    centralHeader.writeUInt16LE(20, 4); // Version made by
    centralHeader.writeUInt16LE(20, 6); // Version needed to extract
    centralHeader.writeUInt16LE(0, 8); // Flags
    centralHeader.writeUInt16LE(8, 10); // Compression method: Deflate
    centralHeader.writeUInt16LE(0, 12); // Time
    centralHeader.writeUInt16LE(0x5421, 14); // Date
    centralHeader.writeUInt32LE(crc, 16); // CRC-32
    centralHeader.writeUInt32LE(compressedData.length, 20); // Compressed size
    centralHeader.writeUInt32LE(uncompressedData.length, 24); // Uncompressed size
    centralHeader.writeUInt16LE(nameBuf.length, 28); // File name length
    centralHeader.writeUInt16LE(0, 30); // Extra field length
    centralHeader.writeUInt16LE(0, 32); // File comment length
    centralHeader.writeUInt16LE(0, 34); // Disk number start
    centralHeader.writeUInt16LE(0, 36); // Internal file attributes
    centralHeader.writeUInt32LE(0, 38); // External file attributes
    centralHeader.writeUInt32LE(offset, 42); // Relative offset of local header

    centralDirParts.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + compressedData.length;
  }

  const centralDirBuffer = Buffer.concat(centralDirParts);
  const endOfCentralDir = Buffer.alloc(22);
  endOfCentralDir.writeUInt32LE(0x06054b50, 0); // Signature PK\x05\x06
  endOfCentralDir.writeUInt16LE(0, 4); // Number of this disk
  endOfCentralDir.writeUInt16LE(0, 6); // Disk where central directory starts
  endOfCentralDir.writeUInt16LE(entries.length, 8); // Total entries on this disk
  endOfCentralDir.writeUInt16LE(entries.length, 10); // Total entries
  endOfCentralDir.writeUInt32LE(centralDirBuffer.length, 12); // Size of central directory
  endOfCentralDir.writeUInt32LE(offset, 16); // Offset of start of central directory
  endOfCentralDir.writeUInt16LE(0, 20); // Comment length

  return Buffer.concat([...localFileParts, centralDirBuffer, endOfCentralDir]);
}

/**
 * Génère un fichier PDF 1.4 binaire normé à partir d'un titre et d'une liste de lignes.
 */
export function buildValidPdfDocument(title: string, lines: string[]): Buffer {
  const escapePdf = (str: string) =>
    str
      .replace(/[^\x20-\x7E]/g, ' ')
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');

  const streamCommands = ['BT', '/F1 10 Tf', '36 795 Td', '13 TL'];
  streamCommands.push(`(${escapePdf(title)}) Tj T*`);
  streamCommands.push('() Tj T*');
  for (const line of lines.slice(0, 50)) {
    streamCommands.push(`(${escapePdf(line.slice(0, 105))}) Tj T*`);
  }
  streamCommands.push('ET');
  const streamContent = Buffer.from(streamCommands.join('\n'), 'ascii');

  const objects: Buffer[] = [
    Buffer.from('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n', 'ascii'),
    Buffer.from('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n', 'ascii'),
    Buffer.from(
      '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
      'ascii'
    ),
    Buffer.concat([
      Buffer.from(`4 0 obj\n<< /Length ${streamContent.length} >>\nstream\n`, 'ascii'),
      streamContent,
      Buffer.from('\nendstream\nendobj\n', 'ascii'),
    ]),
    Buffer.from(
      '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
      'ascii'
    ),
  ];

  const header = Buffer.from('%PDF-1.4\n', 'ascii');
  const chunks: Buffer[] = [header];
  const offsets: number[] = [];
  let currentOffset = header.length;

  for (const obj of objects) {
    offsets.push(currentOffset);
    chunks.push(obj);
    currentOffset += obj.length;
  }

  const xrefOffset = currentOffset;
  let xrefStr = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    xrefStr += `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  xrefStr += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(Buffer.from(xrefStr, 'ascii'));

  return Buffer.concat(chunks);
}
