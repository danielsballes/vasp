/* Minimal dependency-free ZIP writer. It compresses with the browser's CompressionStream when
   available and otherwise stores the files uncompressed. */
let crcTable = null;
function crc32(bytes) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let byte = 0; byte < 256; byte++) {
      let crc = byte;
      for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
      crcTable[byte] = crc >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

async function deflate(bytes) {
  if (typeof CompressionStream !== 'function') return null;
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

/* files: [{ name, data }] where data is a string or a Uint8Array. Returns a Blob. */
export async function zip(files) {
  const encoder = new TextEncoder();
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const parts = [], central = [];
  let offset = 0;
  for (const file of files) {
    const data = typeof file.data === 'string' ? encoder.encode(file.data) : file.data;
    const name = encoder.encode(file.name);
    const crc = crc32(data);
    let body = data, method = 0;
    const packed = await deflate(data);
    if (packed && packed.length < data.length) { body = packed; method = 8; }
    const localHeader = new DataView(new ArrayBuffer(30));
    localHeader.setUint32(0, 0x04034b50, true); localHeader.setUint16(4, 20, true); localHeader.setUint16(6, 0x0800, true);
    localHeader.setUint16(8, method, true); localHeader.setUint16(10, time, true); localHeader.setUint16(12, date, true);
    localHeader.setUint32(14, crc, true); localHeader.setUint32(18, body.length, true); localHeader.setUint32(22, data.length, true);
    localHeader.setUint16(26, name.length, true); localHeader.setUint16(28, 0, true);
    parts.push(new Uint8Array(localHeader.buffer), name, body);
    const centralHeader = new DataView(new ArrayBuffer(46));
    centralHeader.setUint32(0, 0x02014b50, true); centralHeader.setUint16(4, 20, true); centralHeader.setUint16(6, 20, true); centralHeader.setUint16(8, 0x0800, true);
    centralHeader.setUint16(10, method, true); centralHeader.setUint16(12, time, true); centralHeader.setUint16(14, date, true);
    centralHeader.setUint32(16, crc, true); centralHeader.setUint32(20, body.length, true); centralHeader.setUint32(24, data.length, true);
    centralHeader.setUint16(28, name.length, true); centralHeader.setUint32(42, offset, true);
    central.push(new Uint8Array(centralHeader.buffer), name);
    offset += 30 + name.length + body.length;
  }
  let centralSize = 0;
  for (const part of central) centralSize += part.length;
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}
