'use strict';

/**
 * 模块化词典加载、合法性校验与用户自定义词典合并工具。
 *
 * 规范说明：
 * - 按文件名升序加载 `dicts/*.json`（跳过 `*.example.json` 模板文件）。
 * - 禁止空键/空值、禁止高危通配英语介词/助动词单字污染自然语言。
 * - 自动收集 `isolatedControlKeys`（独立控件短词清单），供运行时独立控件守卫使用。
 */

const fs = require('fs');
const path = require('path');

/**
 * 禁止作为全局词典键的高危英语高频虚词或通用命令词（防止污染正文与 CLI）。
 */
const FORBIDDEN_WILDCARD_WORDS = new Set([
  'a', 'an', 'the', 'in', 'on', 'at', 'to', 'of', 'for', 'by', 'as', 'is', 'are',
  'was', 'were', 'be', 'do', 'does', 'did', 'will', 'would', 'can', 'could', 'or',
  'and', 'not', 'no', 'if', 'it', 'we', 'you', 'my', 'your', 'this', 'that',
  'plugin', 'skill', 'command', 'automation', 'git', 'npm', 'node', 'code',
]);

/**
 * 规范化文本空白，用于稳定键匹配。
 * @param {string} text
 * @returns {string}
 */
function normalizeKey(text) {
  return String(text).replace(/\s+/g, ' ').trim();
}

/**
 * 判断一个英文词条是否属于需要“独立 UI 控件守卫”保护的短词。
 * @param {string} key
 * @returns {boolean}
 */
function isShortControlCandidate(key) {
  const trimmed = normalizeKey(key);
  if (trimmed.length <= 12 && !trimmed.includes(' ')) {
    return true;
  }
  return false;
}

/**
 * 列出词典目录下所有有效 JSON 分包文件（排除 `*.example.json`）。
 * @param {string} dictDir
 * @returns {string[]}
 */
function listDictFiles(dictDir) {
  if (!fs.existsSync(dictDir)) {
    throw new Error(`词典目录不存在: ${dictDir}`);
  }
  return fs
    .readdirSync(dictDir)
    .filter((name) => name.endsWith('.json') && !name.endsWith('.example.json'))
    .sort()
    .map((name) => path.join(dictDir, name));
}

/**
 * 加载并合并内置词典（可选合并用户自定义词典）。
 * @param {string} dictDir
 * @param {{ userDictPath?: string, strict?: boolean }} [options]
 * @returns {{
 *   entries: Record<string, string>,
 *   isolatedKeys: string[],
 *   filesLoaded: string[],
 *   stats: { total: number, isolatedCount: number, fileCount: number, userOverrides: number },
 *   issues: Array<{ severity: 'error'|'warn', file: string, key: string, message: string }>
 * }}
 */
function loadDictionaries(dictDir, options = {}) {
  const files = listDictFiles(dictDir);
  const entries = {};
  const keyOrigin = new Map();
  const issues = [];
  const filesLoaded = [];

  for (const filePath of files) {
    const fileName = path.basename(filePath);
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      issues.push({
        severity: 'error',
        file: fileName,
        key: '',
        message: `JSON 解析失败: ${err.message}`,
      });
      continue;
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      issues.push({
        severity: 'error',
        file: fileName,
        key: '',
        message: '词典根节点必须是键值对对象',
      });
      continue;
    }

    filesLoaded.push(fileName);

    for (const [rawKey, rawVal] of Object.entries(parsed)) {
      // 允许 `_meta` 注释字段
      if (rawKey.startsWith('_')) continue;

      const key = normalizeKey(rawKey);
      if (!key) {
        issues.push({ severity: 'error', file: fileName, key: rawKey, message: '存在空键名' });
        continue;
      }
      if (typeof rawVal !== 'string' || !rawVal.trim()) {
        issues.push({ severity: 'error', file: fileName, key, message: '译文必须为非空字符串' });
        continue;
      }

      if (FORBIDDEN_WILDCARD_WORDS.has(key.toLowerCase())) {
        issues.push({
          severity: 'error',
          file: fileName,
          key,
          message: `禁止收录高危通配单字 "${key}"，请使用包含上下文的完整短语`,
        });
        continue;
      }

      if (keyOrigin.has(key)) {
        issues.push({
          severity: 'warn',
          file: fileName,
          key,
          message: `键名重复，已在 ${keyOrigin.get(key)} 中定义`,
        });
      }

      // 句末英文句号一致性检查（避免无故吞掉或额外添加句号）
      const keyEndsDot = key.endsWith('.') && !key.endsWith('...');
      const valEndsCnDot = rawVal.trim().endsWith('。');
      if (keyEndsDot && valEndsCnDot) {
        issues.push({
          severity: 'warn',
          file: fileName,
          key,
          message: '源文以半角句点结尾，建议译文保持标点风格一致或核对上下文',
        });
      }

      keyOrigin.set(key, fileName);
      entries[key] = rawVal.trim();
    }
  }

  let userOverrides = 0;
  if (options.userDictPath && fs.existsSync(options.userDictPath)) {
    try {
      const userParsed = JSON.parse(fs.readFileSync(options.userDictPath, 'utf8'));
      if (userParsed && typeof userParsed === 'object' && !Array.isArray(userParsed)) {
        for (const [rawKey, rawVal] of Object.entries(userParsed)) {
          if (rawKey.startsWith('_')) continue;
          const key = normalizeKey(rawKey);
          if (key && typeof rawVal === 'string' && rawVal.trim()) {
            entries[key] = rawVal.trim();
            userOverrides += 1;
          }
        }
      }
    } catch (err) {
      issues.push({
        severity: 'warn',
        file: path.basename(options.userDictPath),
        key: '',
        message: `用户自定义词典解析失败，已跳过: ${err.message}`,
      });
    }
  }

  const isolatedKeys = Object.keys(entries).filter(isShortControlCandidate).sort();

  if (options.strict && issues.some((item) => item.severity === 'error')) {
    const first = issues.find((item) => item.severity === 'error');
    throw new Error(`词典校验失败 [${first.file}] ${first.key}: ${first.message}`);
  }

  return {
    entries,
    isolatedKeys,
    filesLoaded,
    stats: {
      total: Object.keys(entries).length,
      isolatedCount: isolatedKeys.length,
      fileCount: filesLoaded.length,
      userOverrides,
    },
    issues,
  };
}

module.exports = {
  FORBIDDEN_WILDCARD_WORDS,
  normalizeKey,
  isShortControlCandidate,
  listDictFiles,
  loadDictionaries,
};
