use serde::{Deserialize, Serialize};

/// Supported AI providers for command translation.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AiProvider {
    #[serde(rename = "openai")]
    OpenAi,
    #[serde(rename = "anthropic")]
    Anthropic,
}

impl AiProvider {
    pub fn from_str(s: &str) -> Self {
        match s {
            "anthropic" => Self::Anthropic,
            _ => Self::OpenAi,
        }
    }

    pub fn default_model(&self) -> &str {
        match self {
            Self::OpenAi => "gpt-4o-mini",
            Self::Anthropic => "claude-sonnet-4-5-20250929",
        }
    }
}

/// Result returned to the frontend after translation.
#[derive(Debug, Serialize)]
pub struct TranslateResult {
    pub command: String,
    pub provider: String,
    pub model: String,
}
