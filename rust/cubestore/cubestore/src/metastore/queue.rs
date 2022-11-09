use super::{
    BaseRocksSecondaryIndex, ColumnFamilyName, IdRow, IndexId, MetaStoreEvent, QueueItem,
    QueueItemStatus, RocksSecondaryIndex, RocksTable, TableId,
};
use crate::{base_rocks_secondary_index, rocks_table_impl, CubeError};

use chrono::{DateTime, Utc};
use rocksdb::DB;
use serde::{Deserialize, Deserializer};

fn merge(a: serde_json::Value, b: serde_json::Value) -> Option<serde_json::Value> {
    match (a, b) {
        (mut root @ serde_json::Value::Object(_), serde_json::Value::Object(b)) => {
            let r = root.as_object_mut().unwrap();
            for (k, v) in b {
                if r.contains_key(&k) {
                    r.remove(&k);
                }

                r.insert(k, v);
            }

            Some(root)
        }
        // Special case to truncate extra
        (a, serde_json::Value::Null) => None,
        (a, b) => Some(b),
    }
}

impl QueueItem {
    pub fn new(path: String, value: String, status: QueueItemStatus, priority: i64) -> Self {
        let parts: Vec<&str> = path.rsplitn(2, ":").collect();

        let (prefix, key) = match parts.len() {
            2 => (Some(parts[1].to_string()), parts[0].to_string()),
            _ => (None, path),
        };

        QueueItem {
            prefix,
            key,
            value,
            status,
            priority,
            extra: None,
            created: Utc::now(),
            heartbeat: None,
        }
    }

    pub fn get_key(&self) -> &String {
        &self.key
    }

    pub fn get_prefix(&self) -> &Option<String> {
        &self.prefix
    }

    pub fn get_path(&self) -> String {
        if let Some(prefix) = &self.prefix {
            format!("{}:{}", prefix, self.key)
        } else {
            self.key.clone()
        }
    }

    pub fn get_value(&self) -> &String {
        &self.value
    }

    pub fn get_extra(&self) -> &Option<String> {
        &self.extra
    }

    pub fn get_status(&self) -> &QueueItemStatus {
        &self.status
    }

    pub fn get_heartbeat(&self) -> &Option<DateTime<Utc>> {
        &self.heartbeat
    }

    pub fn get_created(&self) -> &DateTime<Utc> {
        &self.created
    }

    pub fn status_default() -> QueueItemStatus {
        QueueItemStatus::Pending
    }

    pub fn update_heartbeat(&self) -> Self {
        let mut new = self.clone();
        new.heartbeat = Some(Utc::now());

        new
    }

    pub fn merge_extra(&self, payload: String) -> Result<Self, CubeError> {
        let mut new = self.clone();

        if let Some(extra) = &self.extra {
            let prev = serde_json::from_str(&extra)?;
            let next = serde_json::from_str(&payload)?;

            let extra = merge(prev, next);

            new.extra = extra.map(|v| v.to_string())
        } else {
            new.extra = Some(payload);
        }

        Ok(new)
    }
}

#[derive(Clone, Copy, Debug)]
pub(crate) enum QueueItemRocksIndex {
    ByPath = 1,
    ByStatus = 2,
    ByPrefix = 3,
}

rocks_table_impl!(
    QueueItem,
    QueueItemRocksTable,
    TableId::QueueItems,
    {
        vec![
            Box::new(QueueItemRocksIndex::ByPath),
            Box::new(QueueItemRocksIndex::ByStatus),
            Box::new(QueueItemRocksIndex::ByPrefix),
        ]
    },
    ColumnFamilyName::Cache
);

#[derive(Hash, Clone, Debug)]
pub enum QueueItemIndexKey {
    ByPath(String),
    ByStatus(QueueItemStatus),
    ByPrefix(String),
}

base_rocks_secondary_index!(QueueItem, QueueItemRocksIndex);

impl RocksSecondaryIndex<QueueItem, QueueItemIndexKey> for QueueItemRocksIndex {
    fn typed_key_by(&self, row: &QueueItem) -> QueueItemIndexKey {
        match self {
            QueueItemRocksIndex::ByPath => QueueItemIndexKey::ByPath(row.get_path()),
            QueueItemRocksIndex::ByStatus => QueueItemIndexKey::ByStatus(row.get_status().clone()),
            QueueItemRocksIndex::ByPrefix => {
                QueueItemIndexKey::ByPrefix(if let Some(prefix) = row.get_prefix() {
                    prefix.clone()
                } else {
                    "".to_string()
                })
            }
        }
    }

    fn key_to_bytes(&self, key: &QueueItemIndexKey) -> Vec<u8> {
        match key {
            QueueItemIndexKey::ByPath(s) => s.as_bytes().to_vec(),
            QueueItemIndexKey::ByPrefix(s) => s.as_bytes().to_vec(),
            QueueItemIndexKey::ByStatus(s) => {
                let mut r = Vec::with_capacity(1);

                match s {
                    QueueItemStatus::Pending => r.push(0_u8),
                    QueueItemStatus::Active => r.push(1_u8),
                    QueueItemStatus::Finished => r.push(2_u8),
                }

                r
            }
        }
    }

    fn is_unique(&self) -> bool {
        match self {
            QueueItemRocksIndex::ByPath => true,
            QueueItemRocksIndex::ByStatus => false,
            QueueItemRocksIndex::ByPrefix => false,
        }
    }

    fn version(&self) -> u32 {
        match self {
            QueueItemRocksIndex::ByPath => 1,
            QueueItemRocksIndex::ByStatus => 1,
            QueueItemRocksIndex::ByPrefix => 1,
        }
    }

    fn is_ttl(&self) -> bool {
        false
    }

    fn get_id(&self) -> IndexId {
        *self as IndexId
    }
}
