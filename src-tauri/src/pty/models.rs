use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

use serde::Serialize;

const OUTPUT_BUFFER_CAPACITY: usize = 8192; // 8KB ring buffer

/// Ring buffer that stores the last N bytes of PTY output.
/// Used by the pipe feature to forward output between terminals.
pub(crate) struct OutputBuffer {
    buf: VecDeque<u8>,
}

impl OutputBuffer {
    pub fn new() -> Self {
        Self {
            buf: VecDeque::with_capacity(OUTPUT_BUFFER_CAPACITY),
        }
    }

    /// Append bytes, evicting oldest data if buffer exceeds capacity.
    pub fn push(&mut self, data: &[u8]) {
        for &byte in data {
            if self.buf.len() >= OUTPUT_BUFFER_CAPACITY {
                self.buf.pop_front();
            }
            self.buf.push_back(byte);
        }
    }

    /// Read the entire buffer as a contiguous byte slice.
    pub fn read_all(&mut self) -> &[u8] {
        self.buf.make_contiguous()
    }
}

/// Holds the writer + child handle for a single PTY session.
/// The reader runs on a dedicated OS thread (not stored here).
pub(crate) struct PtyInstance {
    pub writer: Box<dyn std::io::Write + Send>,
    #[allow(dead_code)]
    pub master: Box<dyn portable_pty::MasterPty + Send>,
    pub child: Box<dyn portable_pty::Child + Send + Sync>,
    pub label: String,
    pub output_buffer: Arc<Mutex<OutputBuffer>>,
}

#[derive(Serialize, Clone)]
pub struct PtyInfo {
    pub id: String,
    pub label: String,
}
