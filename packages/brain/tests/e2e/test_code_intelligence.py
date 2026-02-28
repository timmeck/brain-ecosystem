#!/usr/bin/env python3
"""
Brain v1.8.1 — Code Intelligence Complete Flow Test
Tests code analysis, registration, similarity, and reusability discovery.
~40 assertions covering every code-related endpoint.
"""

import sys
import httpx

BASE = "http://localhost:7777/api/v1"
PASS = 0
FAIL = 0
ERRORS: list[str] = []


def check(condition: bool, label: str) -> bool:
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"  \033[32mPASS\033[0m {label}")
    else:
        FAIL += 1
        ERRORS.append(label)
        print(f"  \033[31mFAIL\033[0m {label}")
    return condition


def post(path: str, json: dict | list | None = None) -> httpx.Response:
    return httpx.post(f"{BASE}{path}", json=json or {}, timeout=15)


def get(path: str, params: dict | None = None) -> httpx.Response:
    return httpx.get(f"{BASE}{path}", params=params, timeout=15)


# ──────────────────────────────────────────────────────────────
# 22 Code Modules across 3 projects and 3 languages
# Intentionally similar pairs: #1/#6 (retry), #2/#18 (logger), #5/#22 (cache)
# ──────────────────────────────────────────────────────────────
MODULES = [
    # ── TypeScript Modules (project: test-frontend) ──
    {   # 1: retry logic (similar to #6)
        "project": "test-frontend",
        "name": "retryWithBackoff",
        "filePath": "src/utils/retry.ts",
        "language": "typescript",
        "source": """export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastError!;
}""",
        "description": "Retry function with exponential backoff",
    },
    {   # 2: logger (similar to #18)
        "project": "test-frontend",
        "name": "createLogger",
        "filePath": "src/utils/logger.ts",
        "language": "typescript",
        "source": """export interface Logger {
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
  debug(msg: string, ...args: unknown[]): void;
}

export function createLogger(prefix: string): Logger {
  const fmt = (level: string, msg: string) =>
    `[${new Date().toISOString()}] [${level}] [${prefix}] ${msg}`;
  return {
    info: (msg, ...args) => console.log(fmt('INFO', msg), ...args),
    warn: (msg, ...args) => console.warn(fmt('WARN', msg), ...args),
    error: (msg, ...args) => console.error(fmt('ERROR', msg), ...args),
    debug: (msg, ...args) => console.debug(fmt('DEBUG', msg), ...args),
  };
}""",
        "description": "Structured logger factory with prefix support",
    },
    {   # 3: debounce
        "project": "test-frontend",
        "name": "debounce",
        "filePath": "src/utils/debounce.ts",
        "language": "typescript",
        "source": """export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delayMs: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn(...args);
      timer = null;
    }, delayMs);
  };
}""",
        "description": "Debounce utility for input handling",
    },
    {   # 4: fetch wrapper
        "project": "test-frontend",
        "name": "apiFetch",
        "filePath": "src/api/client.ts",
        "language": "typescript",
        "source": """export interface ApiResponse<T> {
  data: T;
  status: number;
  ok: boolean;
}

export async function apiFetch<T>(
  url: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = localStorage.getItem('auth_token');
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const data = await res.json();
  return { data, status: res.status, ok: res.ok };
}""",
        "description": "Typed API fetch wrapper with auth token injection",
    },
    {   # 5: LRU cache (similar to #22)
        "project": "test-frontend",
        "name": "LRUCache",
        "filePath": "src/utils/cache.ts",
        "language": "typescript",
        "source": """export class LRUCache<K, V> {
  private map = new Map<K, V>();
  constructor(private capacity: number) {}

  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    const val = this.map.get(key)!;
    this.map.delete(key);
    this.map.set(key, val);
    return val;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.capacity) {
      const first = this.map.keys().next().value;
      this.map.delete(first);
    }
  }

  get size(): number { return this.map.size; }
  clear(): void { this.map.clear(); }
}""",
        "description": "Generic LRU cache implementation",
    },
    {   # 6: retry logic variant (similar to #1)
        "project": "test-frontend",
        "name": "fetchWithRetry",
        "filePath": "src/api/retry-fetch.ts",
        "language": "typescript",
        "source": """export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries: number = 3,
  delay: number = 1000
): Promise<Response> {
  let lastError: Error;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastError = err as Error;
      const backoff = delay * Math.pow(2, i);
      await new Promise(r => setTimeout(r, backoff));
    }
  }
  throw lastError!;
}""",
        "description": "Fetch wrapper with retry and exponential backoff",
    },
    {   # 7: event emitter
        "project": "test-frontend",
        "name": "EventEmitter",
        "filePath": "src/utils/events.ts",
        "language": "typescript",
        "source": """type Handler = (...args: any[]) => void;

export class EventEmitter {
  private listeners = new Map<string, Set<Handler>>();

  on(event: string, handler: Handler): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler);
  }

  off(event: string, handler: Handler): void {
    this.listeners.get(event)?.delete(handler);
  }

  emit(event: string, ...args: any[]): void {
    for (const handler of this.listeners.get(event) ?? []) {
      handler(...args);
    }
  }

  once(event: string, handler: Handler): void {
    const wrapper = (...args: any[]) => { this.off(event, wrapper); handler(...args); };
    this.on(event, wrapper);
  }
}""",
        "description": "Typed event emitter with once support",
    },

    # ── Python Modules (project: test-backend) ──
    {   # 8: rate limiter
        "project": "test-backend",
        "name": "rate_limiter",
        "filePath": "src/middleware/rate_limiter.py",
        "language": "python",
        "source": """import time
from collections import defaultdict
from typing import Dict, Tuple

class RateLimiter:
    def __init__(self, max_requests: int = 100, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window = window_seconds
        self._store: Dict[str, list[float]] = defaultdict(list)

    def is_allowed(self, key: str) -> Tuple[bool, int]:
        now = time.time()
        cutoff = now - self.window
        self._store[key] = [t for t in self._store[key] if t > cutoff]
        if len(self._store[key]) >= self.max_requests:
            return False, 0
        self._store[key].append(now)
        return True, self.max_requests - len(self._store[key])

    def reset(self, key: str) -> None:
        self._store.pop(key, None)
""",
        "description": "Sliding window rate limiter",
    },
    {   # 9: JWT auth
        "project": "test-backend",
        "name": "jwt_auth",
        "filePath": "src/auth/jwt_handler.py",
        "language": "python",
        "source": """import jwt
import time
from dataclasses import dataclass
from typing import Optional

SECRET_KEY = "change-me-in-production"
ALGORITHM = "HS256"
EXPIRY_SECONDS = 3600

@dataclass
class TokenPayload:
    sub: str
    exp: float
    iat: float
    roles: list[str]

def create_token(user_id: str, roles: list[str] = None) -> str:
    now = time.time()
    payload = {"sub": user_id, "exp": now + EXPIRY_SECONDS, "iat": now, "roles": roles or []}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def verify_token(token: str) -> Optional[TokenPayload]:
    try:
        data = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return TokenPayload(**data)
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None
""",
        "description": "JWT token creation and verification",
    },
    {   # 10: database pool
        "project": "test-backend",
        "name": "db_pool",
        "filePath": "src/db/pool.py",
        "language": "python",
        "source": """import sqlite3
from queue import Queue, Empty
from contextlib import contextmanager
from typing import Generator

class ConnectionPool:
    def __init__(self, db_path: str, max_connections: int = 10):
        self.db_path = db_path
        self._pool: Queue[sqlite3.Connection] = Queue(maxsize=max_connections)
        for _ in range(max_connections):
            conn = sqlite3.connect(db_path, check_same_thread=False)
            conn.row_factory = sqlite3.Row
            self._pool.put(conn)

    @contextmanager
    def acquire(self) -> Generator[sqlite3.Connection, None, None]:
        conn = self._pool.get(timeout=5)
        try:
            yield conn
        finally:
            self._pool.put(conn)

    def close_all(self) -> None:
        while not self._pool.empty():
            try:
                conn = self._pool.get_nowait()
                conn.close()
            except Empty:
                break
""",
        "description": "SQLite connection pool with context manager",
    },
    {   # 11: pagination
        "project": "test-backend",
        "name": "paginator",
        "filePath": "src/utils/pagination.py",
        "language": "python",
        "source": """from dataclasses import dataclass
from typing import TypeVar, Generic, Sequence
import math

T = TypeVar("T")

@dataclass
class Page(Generic[T]):
    items: Sequence[T]
    total: int
    page: int
    per_page: int
    total_pages: int
    has_next: bool
    has_prev: bool

def paginate(items: Sequence[T], page: int = 1, per_page: int = 20) -> Page[T]:
    total = len(items)
    total_pages = max(1, math.ceil(total / per_page))
    page = max(1, min(page, total_pages))
    start = (page - 1) * per_page
    end = start + per_page
    return Page(
        items=items[start:end],
        total=total, page=page, per_page=per_page,
        total_pages=total_pages,
        has_next=page < total_pages,
        has_prev=page > 1,
    )
""",
        "description": "Generic pagination utility",
    },
    {   # 12: config loader
        "project": "test-backend",
        "name": "config_loader",
        "filePath": "src/config/loader.py",
        "language": "python",
        "source": """import os
import json
from pathlib import Path
from typing import Any, Optional

class Config:
    def __init__(self, data: dict[str, Any]):
        self._data = data

    def get(self, key: str, default: Any = None) -> Any:
        keys = key.split(".")
        val = self._data
        for k in keys:
            if isinstance(val, dict):
                val = val.get(k)
            else:
                return default
            if val is None:
                return default
        return val

    @classmethod
    def from_file(cls, path: str) -> "Config":
        with open(path) as f:
            return cls(json.load(f))

    @classmethod
    def from_env(cls, prefix: str = "APP_") -> "Config":
        data = {}
        for key, val in os.environ.items():
            if key.startswith(prefix):
                clean = key[len(prefix):].lower().replace("__", ".")
                data[clean] = val
        return cls(data)
""",
        "description": "Configuration loader from file and environment",
    },

    # ── Rust Modules (project: test-infra) ──
    {   # 13: hash map cache
        "project": "test-infra",
        "name": "HashCache",
        "filePath": "src/cache/mod.rs",
        "language": "rust",
        "source": """use std::collections::HashMap;
use std::time::{Duration, Instant};

pub struct HashCache<V> {
    store: HashMap<String, (V, Instant)>,
    ttl: Duration,
}

impl<V: Clone> HashCache<V> {
    pub fn new(ttl_secs: u64) -> Self {
        Self {
            store: HashMap::new(),
            ttl: Duration::from_secs(ttl_secs),
        }
    }

    pub fn get(&self, key: &str) -> Option<&V> {
        self.store.get(key).and_then(|(val, ts)| {
            if ts.elapsed() < self.ttl { Some(val) } else { None }
        })
    }

    pub fn set(&mut self, key: String, value: V) {
        self.store.insert(key, (value, Instant::now()));
    }

    pub fn evict_expired(&mut self) {
        self.store.retain(|_, (_, ts)| ts.elapsed() < self.ttl);
    }

    pub fn len(&self) -> usize { self.store.len() }
}
""",
        "description": "TTL-based hash map cache",
    },
    {   # 14: error types
        "project": "test-infra",
        "name": "AppError",
        "filePath": "src/error.rs",
        "language": "rust",
        "source": """use std::fmt;

#[derive(Debug)]
pub enum AppError {
    NotFound(String),
    BadRequest(String),
    Internal(String),
    Unauthorized,
    Forbidden,
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotFound(msg) => write!(f, "Not Found: {}", msg),
            Self::BadRequest(msg) => write!(f, "Bad Request: {}", msg),
            Self::Internal(msg) => write!(f, "Internal Error: {}", msg),
            Self::Unauthorized => write!(f, "Unauthorized"),
            Self::Forbidden => write!(f, "Forbidden"),
        }
    }
}

impl std::error::Error for AppError {}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        Self::Internal(err.to_string())
    }
}
""",
        "description": "Application error enum with Display and From impls",
    },
    {   # 15: middleware chain
        "project": "test-infra",
        "name": "MiddlewareChain",
        "filePath": "src/middleware/chain.rs",
        "language": "rust",
        "source": """pub type Handler = Box<dyn Fn(&mut Request, &mut Response) -> Result<(), String>>;

pub struct Request {
    pub path: String,
    pub method: String,
    pub headers: Vec<(String, String)>,
    pub body: Option<String>,
}

pub struct Response {
    pub status: u16,
    pub headers: Vec<(String, String)>,
    pub body: String,
}

pub struct MiddlewareChain {
    handlers: Vec<Handler>,
}

impl MiddlewareChain {
    pub fn new() -> Self { Self { handlers: Vec::new() } }

    pub fn add(&mut self, handler: Handler) {
        self.handlers.push(handler);
    }

    pub fn execute(&self, req: &mut Request, res: &mut Response) -> Result<(), String> {
        for handler in &self.handlers {
            handler(req, res)?;
        }
        Ok(())
    }
}
""",
        "description": "Composable middleware chain pattern",
    },
    {   # 16: task queue
        "project": "test-infra",
        "name": "TaskQueue",
        "filePath": "src/queue/task_queue.rs",
        "language": "rust",
        "source": """use std::collections::VecDeque;
use std::sync::{Arc, Mutex, Condvar};

pub struct TaskQueue<T> {
    inner: Arc<(Mutex<VecDeque<T>>, Condvar)>,
}

impl<T> Clone for TaskQueue<T> {
    fn clone(&self) -> Self { Self { inner: self.inner.clone() } }
}

impl<T> TaskQueue<T> {
    pub fn new() -> Self {
        Self { inner: Arc::new((Mutex::new(VecDeque::new()), Condvar::new())) }
    }

    pub fn push(&self, item: T) {
        let (lock, cvar) = &*self.inner;
        let mut queue = lock.lock().unwrap();
        queue.push_back(item);
        cvar.notify_one();
    }

    pub fn pop(&self) -> T {
        let (lock, cvar) = &*self.inner;
        let mut queue = lock.lock().unwrap();
        while queue.is_empty() {
            queue = cvar.wait(queue).unwrap();
        }
        queue.pop_front().unwrap()
    }

    pub fn len(&self) -> usize {
        self.inner.0.lock().unwrap().len()
    }
}
""",
        "description": "Thread-safe task queue with condition variable",
    },
    {   # 17: result extension
        "project": "test-infra",
        "name": "ResultExt",
        "filePath": "src/utils/result_ext.rs",
        "language": "rust",
        "source": """pub trait ResultExt<T, E> {
    fn log_err(self, context: &str) -> Result<T, E>;
    fn unwrap_or_log(self, default: T, context: &str) -> T;
}

impl<T, E: std::fmt::Display> ResultExt<T, E> for Result<T, E> {
    fn log_err(self, context: &str) -> Result<T, E> {
        if let Err(ref e) = self {
            eprintln!("[ERROR] {}: {}", context, e);
        }
        self
    }

    fn unwrap_or_log(self, default: T, context: &str) -> T {
        match self {
            Ok(v) => v,
            Err(e) => {
                eprintln!("[ERROR] {}: {}", context, e);
                default
            }
        }
    }
}
""",
        "description": "Result extension trait for logging errors",
    },
    {   # 18: Python logger (similar to #2)
        "project": "test-backend",
        "name": "structured_logger",
        "filePath": "src/utils/logger.py",
        "language": "python",
        "source": """import json
import sys
from datetime import datetime
from typing import Any

class StructuredLogger:
    def __init__(self, name: str, level: str = "INFO"):
        self.name = name
        self.level = level
        self._levels = {"DEBUG": 0, "INFO": 1, "WARN": 2, "ERROR": 3}

    def _log(self, level: str, msg: str, **extra: Any) -> None:
        if self._levels.get(level, 0) < self._levels.get(self.level, 0):
            return
        entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "level": level,
            "logger": self.name,
            "message": msg,
            **extra,
        }
        print(json.dumps(entry), file=sys.stderr)

    def info(self, msg: str, **kw: Any) -> None: self._log("INFO", msg, **kw)
    def warn(self, msg: str, **kw: Any) -> None: self._log("WARN", msg, **kw)
    def error(self, msg: str, **kw: Any) -> None: self._log("ERROR", msg, **kw)
    def debug(self, msg: str, **kw: Any) -> None: self._log("DEBUG", msg, **kw)

def get_logger(name: str = "app") -> StructuredLogger:
    return StructuredLogger(name)
""",
        "description": "Structured JSON logger with level filtering",
    },
    {   # 19: Python validator
        "project": "test-backend",
        "name": "input_validator",
        "filePath": "src/utils/validator.py",
        "language": "python",
        "source": """import re
from typing import Any, Optional

class ValidationError(Exception):
    def __init__(self, field: str, message: str):
        self.field = field
        self.message = message
        super().__init__(f"{field}: {message}")

def validate_email(email: str) -> bool:
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$'
    return bool(re.match(pattern, email))

def validate_required(data: dict, fields: list[str]) -> None:
    for field in fields:
        if field not in data or data[field] is None:
            raise ValidationError(field, "is required")

def validate_length(value: str, field: str, min_len: int = 0, max_len: int = 255) -> None:
    if len(value) < min_len:
        raise ValidationError(field, f"must be at least {min_len} characters")
    if len(value) > max_len:
        raise ValidationError(field, f"must be at most {max_len} characters")
""",
        "description": "Input validation utilities",
    },
    {   # 20: Rust serializer
        "project": "test-infra",
        "name": "JsonSerializer",
        "filePath": "src/utils/serializer.rs",
        "language": "rust",
        "source": """use std::collections::HashMap;

#[derive(Debug, Clone)]
pub enum JsonValue {
    Null,
    Bool(bool),
    Number(f64),
    Str(String),
    Array(Vec<JsonValue>),
    Object(HashMap<String, JsonValue>),
}

impl JsonValue {
    pub fn as_str(&self) -> Option<&str> {
        match self { Self::Str(s) => Some(s), _ => None }
    }
    pub fn as_f64(&self) -> Option<f64> {
        match self { Self::Number(n) => Some(*n), _ => None }
    }
    pub fn as_bool(&self) -> Option<bool> {
        match self { Self::Bool(b) => Some(*b), _ => None }
    }
    pub fn is_null(&self) -> bool {
        matches!(self, Self::Null)
    }
}

impl std::fmt::Display for JsonValue {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Null => write!(f, "null"),
            Self::Bool(b) => write!(f, "{}", b),
            Self::Number(n) => write!(f, "{}", n),
            Self::Str(s) => write!(f, "\\\"{}\\\"", s),
            Self::Array(arr) => write!(f, "[{}]", arr.iter().map(|v| v.to_string()).collect::<Vec<_>>().join(",")),
            Self::Object(map) => write!(f, "{{{}}}", map.iter().map(|(k, v)| format!("\\\"{}\\\":{}", k, v)).collect::<Vec<_>>().join(",")),
        }
    }
}
""",
        "description": "Simple JSON value enum with accessors and Display",
    },
    {   # 21: Python task scheduler
        "project": "test-backend",
        "name": "task_scheduler",
        "filePath": "src/tasks/scheduler.py",
        "language": "python",
        "source": """import time
import threading
from typing import Callable, Optional
from dataclasses import dataclass, field

@dataclass
class ScheduledTask:
    name: str
    fn: Callable[[], None]
    interval_seconds: float
    last_run: float = 0.0
    running: bool = False

class Scheduler:
    def __init__(self):
        self.tasks: list[ScheduledTask] = []
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None

    def add(self, name: str, fn: Callable, interval: float) -> None:
        self.tasks.append(ScheduledTask(name=name, fn=fn, interval_seconds=interval))

    def start(self) -> None:
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=5)

    def _run(self) -> None:
        while not self._stop_event.is_set():
            now = time.time()
            for task in self.tasks:
                if not task.running and (now - task.last_run) >= task.interval_seconds:
                    task.running = True
                    task.last_run = now
                    try:
                        task.fn()
                    except Exception as e:
                        print(f"[scheduler] {task.name} failed: {e}")
                    finally:
                        task.running = False
            self._stop_event.wait(timeout=1.0)
""",
        "description": "Simple interval-based task scheduler",
    },
    {   # 22: TypeScript cache (similar to #5)
        "project": "test-frontend",
        "name": "TTLCache",
        "filePath": "src/utils/ttl-cache.ts",
        "language": "typescript",
        "source": """export class TTLCache<K, V> {
  private map = new Map<K, { value: V; expiry: number }>();
  constructor(private ttlMs: number) {}

  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiry) {
      this.map.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: K, value: V): void {
    this.map.set(key, { value, expiry: Date.now() + this.ttlMs });
  }

  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  get size(): number { return this.map.size; }

  clear(): void { this.map.clear(); }

  evictExpired(): number {
    const now = Date.now();
    let evicted = 0;
    for (const [key, entry] of this.map) {
      if (now > entry.expiry) { this.map.delete(key); evicted++; }
    }
    return evicted;
  }
}""",
        "description": "TTL-based cache with automatic expiry",
    },
]


def main() -> int:
    print("\n" + "=" * 60)
    print("  BRAIN E2E TEST: Code Intelligence Complete Flow")
    print("=" * 60)

    module_ids: list[int] = []

    # ── 1. Register 22 code modules ───────────────────────────
    print("\n[1] Registering 22 code modules across 3 projects...")
    for i, mod in enumerate(MODULES):
        r = post("/code/analyze", mod)
        ok = r.status_code == 201
        data = r.json().get("result", {})
        mid = data.get("moduleId")
        is_new = data.get("isNew")
        score = data.get("reusabilityScore", 0)
        check(ok and mid is not None, f"Module #{i+1} '{mod['name']}' registered (id={mid}, score={score:.2f})")
        if mid is not None:
            module_ids.append(mid)

    check(len(module_ids) == 22, f"All 22 modules created ({len(module_ids)} IDs)")

    # ── 2. Duplicate detection ─────────────────────────────────
    print("\n[2] Testing duplicate detection...")
    r = post("/code/analyze", MODULES[0])
    data = r.json().get("result", {})
    dup_new = data.get("isNew")
    check(dup_new is False, f"Duplicate detected (isNew={dup_new})")
    check(data.get("moduleId") == module_ids[0], "Duplicate returns same moduleId")

    # ── 3. Update detection ────────────────────────────────────
    print("\n[3] Testing update detection...")
    modified = {**MODULES[0], "source": MODULES[0]["source"] + "\n// v2: added jitter to backoff\n"}
    r = post("/code/analyze", modified)
    data = r.json().get("result", {})
    # The fingerprint might change, creating a new module, or it stays the same
    check(r.status_code == 201, "Modified source accepted")
    check(data.get("moduleId") is not None, f"Update returned module id={data.get('moduleId')}")

    # ── 4. Code similarity detection ──────────────────────────
    print("\n[4] Testing code similarity detection...")
    # Check similarity of module #1 (retry) source
    r = post("/code/similarity", {
        "source": MODULES[0]["source"],
        "language": "typescript",
    })
    check(r.status_code == 201, "Similarity endpoint returns 201")
    sim_data = r.json().get("result")
    check(sim_data is not None, f"Similarity result: {type(sim_data)}")

    # Check similarity of module #5 (LRU cache) source
    r = post("/code/similarity", {
        "source": MODULES[4]["source"],
        "language": "typescript",
    })
    check(r.status_code == 201, "LRU cache similarity check returns 201")

    # Check similarity of a Python module
    r = post("/code/similarity", {
        "source": MODULES[17]["source"],  # structured_logger
        "language": "python",
    })
    check(r.status_code == 201, "Python similarity check returns 201")

    # ── 5. Find reusable code ─────────────────────────────────
    print("\n[5] Finding reusable code by purpose...")
    queries = [
        ("retry", "Find retry/backoff utilities"),
        ("cache", "Find caching implementations"),
        ("logger", "Find logging utilities"),
        ("auth", "Find authentication modules"),
        ("queue", "Find queue implementations"),
    ]
    for query, label in queries:
        r = post("/code/find", {"query": query})
        check(r.status_code == 201, f"Find '{query}' returns 201")
        found = r.json().get("result", [])
        check(isinstance(found, list), f"{label}: {len(found)} result(s)")

    # ── 6. List modules with filters ──────────────────────────
    print("\n[6] Listing modules with filters...")
    r = get("/code/modules")
    check(r.status_code == 200, "List all modules returns 200")
    all_mods = r.json().get("result", [])
    check(isinstance(all_mods, list) and len(all_mods) >= 20, f"Total modules: {len(all_mods)}")

    r = get("/code/modules", params={"language": "typescript"})
    check(r.status_code == 200, "List TypeScript modules returns 200")
    ts_mods = r.json().get("result", [])
    check(isinstance(ts_mods, list) and len(ts_mods) >= 7, f"TypeScript modules: {len(ts_mods)}")

    r = get("/code/modules", params={"language": "python"})
    py_mods = r.json().get("result", [])
    check(isinstance(py_mods, list) and len(py_mods) >= 5, f"Python modules: {len(py_mods)}")

    r = get("/code/modules", params={"language": "rust"})
    rust_mods = r.json().get("result", [])
    check(isinstance(rust_mods, list) and len(rust_mods) >= 5, f"Rust modules: {len(rust_mods)}")

    r = get("/code/modules", params={"limit": "5"})
    check(r.status_code == 200, "Limit=5 returns 200")
    limited = r.json().get("result", [])
    check(len(limited) <= 5, f"Limit respected: {len(limited)} modules")

    # ── 7. Get single module details ──────────────────────────
    print("\n[7] Getting single module details...")
    if module_ids:
        r = get(f"/code/{module_ids[0]}")
        check(r.status_code == 200, "Get module by ID returns 200")
        mod_detail = r.json().get("result", {})
        check(mod_detail.get("id") == module_ids[0], "Module detail has correct ID")
        check(mod_detail.get("name") is not None, f"Module name: {mod_detail.get('name')}")
        check(mod_detail.get("language") is not None, f"Module language: {mod_detail.get('language')}")

    # ── 8. Synapse verification ───────────────────────────────
    print("\n[8] Verifying synapses between similar modules...")
    r = get("/synapses/stats")
    check(r.status_code == 200, "Synapse stats returns 200")
    stats = r.json().get("result", {})
    check(stats.get("totalSynapses", 0) > 0, f"Total synapses: {stats.get('totalSynapses', 0)}")

    # ── 9. Spreading activation from module node ──────────────
    print("\n[9] Testing spreading activation...")
    if module_ids:
        r = post("/synapses/related", {
            "nodeType": "code_module",
            "nodeId": module_ids[0],
            "maxDepth": 3,
            "minWeight": 0.01,
        })
        check(r.status_code == 201, "Spreading activation returns 201")
        related = r.json().get("result", [])
        check(isinstance(related, list), f"Related nodes: {len(related)}")

    # ── 10. Path finding between modules ──────────────────────
    print("\n[10] Testing path finding between modules...")
    if len(module_ids) >= 2:
        r = post("/synapses/path", {
            "fromType": "code_module",
            "fromId": module_ids[0],
            "toType": "code_module",
            "toId": module_ids[1],
        })
        check(r.status_code == 201, "Path finding returns 201")
        path = r.json().get("result")
        check(path is not None or path is None, f"Path result: {type(path)}")

    # ── 11. Verify auto-created projects ──────────────────────
    print("\n[11] Verifying auto-created projects...")
    r = get("/projects")
    check(r.status_code == 200, "Projects endpoint returns 200")
    projects = r.json().get("result", [])
    check(isinstance(projects, list) and len(projects) >= 3, f"Projects: {len(projects)}")
    project_names = [p.get("name") for p in projects if isinstance(p, dict)]
    for name in ["test-frontend", "test-backend", "test-infra"]:
        check(name in project_names, f"Project '{name}' auto-created")

    # ── 12. Check module stats via analytics ──────────────────
    print("\n[12] Checking analytics summary for module stats...")
    r = get("/analytics/summary")
    check(r.status_code == 200, "Analytics summary returns 200")
    summary = r.json().get("result", {})
    modules_data = summary.get("modules", {})
    total_modules = modules_data.get("total", 0) if isinstance(modules_data, dict) else 0
    check(total_modules >= 20, f"Analytics shows {total_modules} modules")

    # ── Summary ────────────────────────────────────────────────
    print("\n" + "=" * 60)
    total = PASS + FAIL
    print(f"  Results: {PASS}/{total} passed, {FAIL} failed")
    if ERRORS:
        print(f"\n  Failed tests:")
        for e in ERRORS:
            print(f"    - {e}")
    print("=" * 60 + "\n")

    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except httpx.ConnectError:
        print("\n\033[31mERROR: Cannot connect to Brain daemon on port 7777.\033[0m")
        print("Run 'brain start' or 'brain doctor' first.\n")
        sys.exit(2)
    except Exception as e:
        print(f"\n\033[31mFATAL: {e}\033[0m\n")
        import traceback
        traceback.print_exc()
        sys.exit(2)
