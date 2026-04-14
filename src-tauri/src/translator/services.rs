use reqwest::Client;
use serde_json::{json, Value};

use super::models::AiProvider;

/// Handles AI-powered translation of natural language to shell commands.
pub struct TranslatorService {
    client: Client,
}

impl TranslatorService {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
        }
    }

    /// Build the system prompt for command translation.
    fn build_system_prompt(cwd: &str, role: &str) -> String {
        format!(
            "You are a terminal command translator for Maestri-X orchestrator.\n\
             OS: Windows, Shell: PowerShell\n\
             Current directory: {cwd}\n\
             Terminal role: {role}\n\n\
             Translate the user's intent into a valid terminal command.\n\
             Return ONLY the command, no explanation, no markdown, no backticks.\n\
             If multiple commands needed, chain with ;\n\
             If intent is unclear, return the closest interpretation.\n\
             If untranslatable, return: echo \"Cannot translate: [reason]\""
        )
    }

    /// Translate a natural language note into a shell command.
    pub async fn translate(
        &self,
        provider: &AiProvider,
        api_key: &str,
        model: Option<&str>,
        note_content: &str,
        cwd: &str,
        role: &str,
    ) -> Result<String, String> {
        let system_prompt = Self::build_system_prompt(cwd, role);
        let model_name = model.unwrap_or(provider.default_model());

        match provider {
            AiProvider::OpenAi => {
                self.call_openai(api_key, model_name, &system_prompt, note_content)
                    .await
            }
            AiProvider::Anthropic => {
                self.call_anthropic(api_key, model_name, &system_prompt, note_content)
                    .await
            }
        }
    }

    async fn call_openai(
        &self,
        api_key: &str,
        model: &str,
        system_prompt: &str,
        user_content: &str,
    ) -> Result<String, String> {
        let body = json!({
            "model": model,
            "messages": [
                { "role": "system", "content": system_prompt },
                { "role": "user", "content": user_content }
            ],
            "max_tokens": 500,
            "temperature": 0.1
        });

        let response = self
            .client
            .post("https://api.openai.com/v1/chat/completions")
            .header("Authorization", format!("Bearer {api_key}"))
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("OpenAI request failed: {e}"))?;

        let status = response.status();
        let text = response
            .text()
            .await
            .map_err(|e| format!("Failed to read OpenAI response: {e}"))?;

        if !status.is_success() {
            return Err(format!("OpenAI API error ({status}): {text}"));
        }

        let json: Value =
            serde_json::from_str(&text).map_err(|e| format!("Failed to parse OpenAI JSON: {e}"))?;

        json["choices"][0]["message"]["content"]
            .as_str()
            .map(|s| s.trim().to_string())
            .ok_or_else(|| "OpenAI response missing content".to_string())
    }

    async fn call_anthropic(
        &self,
        api_key: &str,
        model: &str,
        system_prompt: &str,
        user_content: &str,
    ) -> Result<String, String> {
        let body = json!({
            "model": model,
            "max_tokens": 500,
            "system": system_prompt,
            "messages": [
                { "role": "user", "content": user_content }
            ]
        });

        let response = self
            .client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Anthropic request failed: {e}"))?;

        let status = response.status();
        let text = response
            .text()
            .await
            .map_err(|e| format!("Failed to read Anthropic response: {e}"))?;

        if !status.is_success() {
            return Err(format!("Anthropic API error ({status}): {text}"));
        }

        let json: Value = serde_json::from_str(&text)
            .map_err(|e| format!("Failed to parse Anthropic JSON: {e}"))?;

        json["content"][0]["text"]
            .as_str()
            .map(|s| s.trim().to_string())
            .ok_or_else(|| "Anthropic response missing content".to_string())
    }
}
