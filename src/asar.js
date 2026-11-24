'use strict';

/**
 * 纯 Node.js 零依赖 Electron ASAR 解析与无损重打包引擎。
 *
 * 设计要点：
 * 1. 严格遵循 Chromium Pickle 头部格式与 4 字节对齐规则。
 * 2. 完整保留原始目录结构、`unpacked` 标记、`executable`、`link` 等元数据，绝不触碰 `app.asar.unpacked`。
 * 3. 为新增或修改的打包文件自动重新计算 Electron SHA-256 分块完整性哈希（4 MiB 块），避免触发完整性校验失败。
 */

const fs = require('fs');
const crypto = require('crypto');

const INTEGRITY_BLOCK_SIZE = 4 * 1024 * 1024; // 4 MiB
const MAX_HEADER_BYTES = 32 * 1024 * 1024; // 32 MiB 防御性上限

/**
 * 计算文件内容的 SHA-256 哈希与 Electron ASAR 分块完整性元数据。
 * @param {Buffer} buffer
 * @returns {{ algorithm: string, hash: string, blockSize: number, blocks: string[] }}
 */
function computeIntegrity(buffer) {
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  const blocks = [];
  if (buffer.length === 0) {
    blocks.push(crypto.createHash('sha256').update(Buffer.alloc(0)).digest('hex'));
  } else {
    for (let offset = 0; offset < buffer.length; offset += INTEGRITY_BLOCK_SIZE) {
      const slice = buffer.subarray(offset, Math.min(offset + INTEGRITY_BLOCK_SIZE, buffer.length));
      blocks.push(crypto.createHash('sha256').update(slice).digest('hex'));
    }
  }
  return {
    algorithm: 'SHA256',
    hash,
    blockSize: INTEGRITY_BLOCK_SIZE,
    blocks,
  };
}

/**
 * 计算指定文件的 SHA-256（流式读取，适合大文件）。
 * @param {string} filePath
 * @returns {string}
 */
function sha256File(filePath) {
  const fd = fs.openSync(filePath, 'r');
  const hash = crypto.createHash('sha256');
  const chunk = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead = 0;
    while ((bytesRead = fs.readSync(fd, chunk, 0, chunk.length, null)) > 0) {
      hash.update(chunk.subarray(0, bytesRead));
    }
    return hash.digest('hex');
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * 校验并规范化 ASAR 内部路径（使用 POSIX `/` 分隔）。
 * @param {string} relPath
 * @returns {string[]}
 */
function splitArchivePath(relPath) {
  const normalized = String(relPath).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!normalized) {
    throw new Error('ASAR 内部路径不能为空');
  }
  const parts = normalized.split('/');
  for (const part of parts) {
    if (!part || part === '.' || part === '..' || part.includes('\0')) {
      throw new Error(`非法 ASAR 内部路径: ${relPath}`);
    }
  }
  return parts;
}

/**
 * 读取 ASAR 归档头部元数据。
 * @param {string} archivePath
 * @returns {{ header: object, headerSize: number, dataOffset: number, fileSize: number }}
 */
function readAsarHeader(archivePath) {
  const fd = fs.openSync(archivePath, 'r');
  try {
    const fileSize = fs.fstatSync(fd).size;
    if (fileSize < 16) {
      throw new Error('无效的 ASAR 文件：文件过小');
    }

    const sizeBuf = Buffer.alloc(8);
    if (fs.readSync(fd, sizeBuf, 0, 8, 0) !== 8) {
      throw new Error('读取 ASAR Pickle 大小失败');
    }

    const pickle1PayloadSize = sizeBuf.readUInt32LE(0);
    const headerSize = sizeBuf.readUInt32LE(4);
    if (pickle1PayloadSize !== 4) {
      throw new Error(`无效的 ASAR 头部格式（size pickle=${pickle1PayloadSize}）`);
    }
    if (headerSize < 8 || headerSize > MAX_HEADER_BYTES || 8 + headerSize > fileSize) {
      throw new Error(`无效的 ASAR 头部长度: ${headerSize}`);
    }

    const headerBuf = Buffer.alloc(headerSize);
    if (fs.readSync(fd, headerBuf, 0, headerSize, 8) !== headerSize) {
      throw new Error('读取 ASAR 头部数据不完整');
    }

    const jsonLength = headerBuf.readUInt32LE(4);
    if (jsonLength > headerSize - 8) {
      throw new Error(`ASAR JSON 长度越界: ${jsonLength}`);
    }

    const headerJson = headerBuf.subarray(8, 8 + jsonLength).toString('utf8');
    const header = JSON.parse(headerJson);
    if (!header || typeof header !== 'object' || !header.files) {
      throw new Error('ASAR 头部缺少根 files 对象');
    }

    return {
      header,
      headerSize,
      dataOffset: 8 + headerSize,
      fileSize,
    };
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * 列出 ASAR 内所有文件条目。
 * @param {string} archivePath
 * @returns {Array<{ path: string, size: number, offset: number|null, unpacked: boolean, link: string|null }>}
 */
function listAsarEntries(archivePath) {
  const { header } = readAsarHeader(archivePath);
  const entries = [];

  function walk(node, prefix, inheritedUnpacked) {
    const unpacked = inheritedUnpacked || node.unpacked === true;
    if (node.files && typeof node.files === 'object') {
      for (const [name, child] of Object.entries(node.files)) {
        if (!name || name === '.' || name === '..' || /[\\/\0]/.test(name)) {
          throw new Error(`ASAR 内存在非法文件名: ${name}`);
        }
        walk(child, prefix ? `${prefix}/${name}` : name, unpacked);
      }
      return;
    }

    entries.push({
      path: prefix,
      size: typeof node.size === 'number' ? node.size : 0,
      offset: node.offset !== undefined ? Number(node.offset) : null,
      unpacked,
      link: typeof node.link === 'string' ? node.link : null,
    });
  }

  walk(header, '', false);
  return entries;
}

/**
 * 在头部树中定位单个文件节点。
 * @param {object} header
 * @param {string} relPath
 * @returns {object|null}
 */
function findEntryNode(header, relPath) {
  const parts = splitArchivePath(relPath);
  let current = header;
  for (const part of parts) {
    if (!current || !current.files || !Object.prototype.hasOwnProperty.call(current.files, part)) {
      return null;
    }
    current = current.files[part];
  }
  return current;
}

/**
 * 从 ASAR 中读取指定打包文件的 Buffer（不适用于 unpacked 文件）。
 * @param {string} archivePath
 * @param {string} relPath
 * @returns {Buffer}
 */
function readAsarFile(archivePath, relPath) {
  const { header, dataOffset, fileSize } = readAsarHeader(archivePath);
  const node = findEntryNode(header, relPath);
  if (!node || node.files) {
    throw new Error(`ASAR 中未找到文件: ${relPath}`);
  }
  if (node.unpacked) {
    throw new Error(`目标文件位于外部 unpacked 目录，无法从 ASAR 内直接读取: ${relPath}`);
  }
  const offset = Number(node.offset);
  const size = Number(node.size);
  if (!Number.isFinite(offset) || !Number.isFinite(size) || offset < 0 || size < 0) {
    throw new Error(`文件偏移或大小无效: ${relPath}`);
  }
  if (dataOffset + offset + size > fileSize) {
    throw new Error(`文件数据越界: ${relPath}`);
  }

  const fd = fs.openSync(archivePath, 'r');
  try {
    const out = Buffer.alloc(size);
    if (size > 0) {
      const bytesRead = fs.readSync(fd, out, 0, size, dataOffset + offset);
      if (bytesRead !== size) {
        throw new Error(`读取文件不完整: ${relPath}`);
      }
    }
    return out;
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * 编码 ASAR 头部 Buffer（两个 Chromium Pickle，4 字节对齐）。
 * @param {object} header
 * @returns {Buffer}
 */
function encodeAsarHeader(header) {
  const jsonBuf = Buffer.from(JSON.stringify(header), 'utf8');
  const paddedPayloadLen = Math.ceil((4 + jsonBuf.length) / 4) * 4;
  const headerPickleSize = 4 + paddedPayloadLen;

  const out = Buffer.alloc(8 + headerPickleSize, 0);
  // Pickle 1: 记录 headerPickleSize
  out.writeUInt32LE(4, 0);
  out.writeUInt32LE(headerPickleSize, 4);
  // Pickle 2: 记录 JSON 字符串
  out.writeUInt32LE(paddedPayloadLen, 8);
  out.writeUInt32LE(jsonBuf.length, 12);
  jsonBuf.copy(out, 16);
  return out;
}

/**
 * 从内存文件映射创建全新 ASAR（便于测试与构造样本）。
 * @param {string} outputPath
 * @param {Record<string, Buffer|string|{ content?: Buffer|string, unpacked?: boolean, executable?: boolean }>} filesMap
 */
function createAsarFromMap(outputPath, filesMap) {
  const root = { files: {} };
  const payloads = [];
  let currentOffset = 0;

  const sortedPaths = Object.keys(filesMap).sort();
  for (const relPath of sortedPaths) {
    const parts = splitArchivePath(relPath);
    let dir = root;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const seg = parts[i];
      if (!dir.files[seg]) {
        dir.files[seg] = { files: {} };
      }
      dir = dir.files[seg];
    }

    const raw = filesMap[relPath];
    const isMetaObj =
      raw && typeof raw === 'object' && !Buffer.isBuffer(raw) && !(raw instanceof Uint8Array);
    const unpacked = isMetaObj ? Boolean(raw.unpacked) : false;
    const executable = isMetaObj ? Boolean(raw.executable) : false;
    const contentRaw = isMetaObj ? raw.content ?? '' : raw;
    const buf = Buffer.isBuffer(contentRaw) ? contentRaw : Buffer.from(String(contentRaw), 'utf8');

    const entry = { size: buf.length };
    if (unpacked) {
      entry.unpacked = true;
    } else {
      entry.offset = String(currentOffset);
      entry.integrity = computeIntegrity(buf);
      payloads.push(buf);
      currentOffset += buf.length;
    }
    if (executable) {
      entry.executable = true;
    }
    dir.files[parts[parts.length - 1]] = entry;
  }

  const headerBuf = encodeAsarHeader(root);
  const fd = fs.openSync(outputPath, 'w');
  try {
    fs.writeSync(fd, headerBuf, 0, headerBuf.length);
    for (const buf of payloads) {
      if (buf.length > 0) {
        fs.writeSync(fd, buf, 0, buf.length);
      }
    }
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * 对现有 ASAR 执行增量无损补丁并输出到 `outputPath`。
 *
 * - 未修改的条目直接从源 ASAR 分块流式拷贝，避免全量载入内存。
 * - `overrides` 中的路径若已存在则覆盖，若不存在则自动创建父目录并注入。
 * - `removals` 中的路径若存在则会从新 ASAR 中移除。
 * - 所有 `unpacked` 条目与目录结构严格保持原样。
 *
 * @param {string} sourcePath
 * @param {string} outputPath
 * @param {{ overrides?: Record<string, Buffer|string>, removals?: string[] }} options
 */
function patchAsar(sourcePath, outputPath, options = {}) {
  const overrides = options.overrides || {};
  const removals = new Set((options.removals || []).map((p) => splitArchivePath(p).join('/')));

  const normalizedOverrides = new Map();
  for (const [relPath, content] of Object.entries(overrides)) {
    const key = splitArchivePath(relPath).join('/');
    const buf = Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8');
    normalizedOverrides.set(key, buf);
  }

  const { header, dataOffset } = readAsarHeader(sourcePath);
  const clonedHeader = JSON.parse(JSON.stringify(header));

  // 删除需要移除的条目
  for (const removePath of removals) {
    const parts = splitArchivePath(removePath);
    let current = clonedHeader;
    let valid = true;
    for (let i = 0; i < parts.length - 1; i += 1) {
      if (!current.files || !current.files[parts[i]]) {
        valid = false;
        break;
      }
      current = current.files[parts[i]];
    }
    if (valid && current.files) {
      delete current.files[parts[parts.length - 1]];
    }
  }

  // 插入或覆盖新条目（确保父目录存在）
  for (const [overridePath, buf] of normalizedOverrides.entries()) {
    const parts = splitArchivePath(overridePath);
    let current = clonedHeader;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const seg = parts[i];
      if (!current.files[seg]) {
        current.files[seg] = { files: {} };
      }
      if (!current.files[seg].files) {
        throw new Error(`路径冲突：${parts.slice(0, i + 1).join('/')} 是文件而非目录`);
      }
      current = current.files[seg];
    }
    const leafName = parts[parts.length - 1];
    const prev = current.files[leafName] || {};
    if (prev.unpacked) {
      throw new Error(`拒绝覆盖外部 unpacked 文件: ${overridePath}`);
    }
    current.files[leafName] = {
      ...prev,
      size: buf.length,
      integrity: computeIntegrity(buf),
    };
    delete current.files[leafName].files;
    delete current.files[leafName].unpacked;
  }

  // 收集写入计划并重算所有打包文件的 offset
  const writePlan = [];
  let newOffset = 0;

  function collectPlan(node, prefix, inheritedUnpacked) {
    const unpacked = inheritedUnpacked || node.unpacked === true;
    if (node.files && typeof node.files === 'object') {
      for (const [name, child] of Object.entries(node.files)) {
        collectPlan(child, prefix ? `${prefix}/${name}` : name, unpacked);
      }
      return;
    }

    if (unpacked || typeof node.link === 'string') {
      return;
    }

    if (normalizedOverrides.has(prefix)) {
      const buf = normalizedOverrides.get(prefix);
      node.offset = String(newOffset);
      node.size = buf.length;
      writePlan.push({ kind: 'buffer', buffer: buf });
      newOffset += buf.length;
      return;
    }

    const oldOffset = Number(node.offset);
    const size = Number(node.size);
    node.offset = String(newOffset);
    writePlan.push({ kind: 'copy', sourceOffset: dataOffset + oldOffset, size });
    newOffset += size;
  }

  collectPlan(clonedHeader, '', false);

  const newHeaderBuf = encodeAsarHeader(clonedHeader);
  const srcFd = fs.openSync(sourcePath, 'r');
  const dstFd = fs.openSync(outputPath, 'w');
  const copyBuf = Buffer.allocUnsafe(1024 * 1024);

  try {
    fs.writeSync(dstFd, newHeaderBuf, 0, newHeaderBuf.length);
    for (const item of writePlan) {
      if (item.kind === 'buffer') {
        if (item.buffer.length > 0) {
          fs.writeSync(dstFd, item.buffer, 0, item.buffer.length);
        }
      } else {
        let remaining = item.size;
        let readPos = item.sourceOffset;
        while (remaining > 0) {
          const toRead = Math.min(remaining, copyBuf.length);
          const bytesRead = fs.readSync(srcFd, copyBuf, 0, toRead, readPos);
          if (bytesRead !== toRead) {
            throw new Error('从源 ASAR 复制数据块时发生意外截断');
          }
          fs.writeSync(dstFd, copyBuf, 0, bytesRead);
          readPos += bytesRead;
          remaining -= bytesRead;
        }
      }
    }
  } finally {
    fs.closeSync(srcFd);
    fs.closeSync(dstFd);
  }
}

module.exports = {
  computeIntegrity,
  sha256File,
  readAsarHeader,
  listAsarEntries,
  findEntryNode,
  readAsarFile,
  encodeAsarHeader,
  createAsarFromMap,
  patchAsar,
};
