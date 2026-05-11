const fs = require('fs').promises;
const path = require('path');

const RECORDS_DIR = path.join(__dirname, 'call-records');

// 确保目录存在
async function initCallRecordsDir() {
  await fs.mkdir(RECORDS_DIR, { recursive: true });
  console.log('[CDR] 通话记录目录已初始化:', RECORDS_DIR);
}

// 保存通话记录
async function saveCallRecord(record) {
  const date = new Date().toISOString().split('T')[0]; // 2026-05-09
  const filePath = path.join(RECORDS_DIR, `${date}.json`);
  
  let records = [];
  try {
    const data = await fs.readFile(filePath, 'utf8');
    records = JSON.parse(data);
  } catch (e) {
    // 文件不存在，使用空数组
  }
  
  records.push({
    ...record,
    created_at: new Date().toISOString()
  });
  
  await fs.writeFile(filePath, JSON.stringify(records, null, 2));
  console.log('[CDR] 通话记录已保存:', record.call_uuid);
}

// 更新通话记录
async function updateCallRecord(callUuid, updates) {
  const date = new Date().toISOString().split('T')[0];
  const filePath = path.join(RECORDS_DIR, `${date}.json`);
  
  try {
    const data = await fs.readFile(filePath, 'utf8');
    let records = JSON.parse(data);
    
    const index = records.findIndex(r => r.call_uuid === callUuid);
    if (index !== -1) {
      records[index] = {
        ...records[index],
        ...updates,
        updated_at: new Date().toISOString()
      };
      
      await fs.writeFile(filePath, JSON.stringify(records, null, 2));
      console.log('[CDR] 通话记录已更新:', callUuid);
    }
  } catch (e) {
    console.error('[CDR] 更新通话记录失败:', e.message);
  }
}

// 查询通话记录（按日期）
async function getCallRecords(date, options = {}) {
  const filePath = path.join(RECORDS_DIR, `${date}.json`);
  
  try {
    const data = await fs.readFile(filePath, 'utf8');
    let records = JSON.parse(data);
    
    // 支持简单过滤
    if (options.caller_uid) {
      records = records.filter(r => r.caller_uid === options.caller_uid);
    }
    if (options.status) {
      records = records.filter(r => r.status === options.status);
    }
    
    // 按时间倒序
    records.sort((a, b) => new Date(b.initiated_at) - new Date(a.initiated_at));
    
    return records;
  } catch (e) {
    return [];
  }
}

// 根据 UUID 查找记录
async function getCallRecordByUuid(callUuid) {
  const files = await fs.readdir(RECORDS_DIR);
  
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    
    const filePath = path.join(RECORDS_DIR, file);
    try {
      const data = await fs.readFile(filePath, 'utf8');
      const records = JSON.parse(data);
      const record = records.find(r => r.call_uuid === callUuid);
      if (record) return record;
    } catch (e) {
      continue;
    }
  }
  
  return null;
}

// 查找最近的记录（用于更新）
async function findRecentRecord(callUuid) {
  const date = new Date().toISOString().split('T')[0];
  const filePath = path.join(RECORDS_DIR, `${date}.json`);
  
  try {
    const data = await fs.readFile(filePath, 'utf8');
    const records = JSON.parse(data);
    return records.find(r => r.call_uuid === callUuid);
  } catch (e) {
    return null;
  }
}

module.exports = {
  initCallRecordsDir,
  saveCallRecord,
  updateCallRecord,
  getCallRecords,
  getCallRecordByUuid,
  findRecentRecord
};
