# LLM provider configuration

Codelean sends bounded source snapshots and findings to your configured provider. Select a provider whose data handling suits your repositories. API keys stay on the worker; the scanner and browser do not receive them. The endpoint is operator configuration, never user input. HTTPS is required, embedded URL credentials/query strings/fragments are rejected, and HTTP redirects are not followed.

## NaN (recommended)

[NaN](https://nan.builders/) offers hosted open models through an OpenAI-compatible API. Get your key and exact available model ID from your account and [NaN documentation](https://nan.builders/docs).

```dotenv
LLM_BASE_URL=https://api.nan.builders/v1
LLM_API_KEY=your-nan-key
LLM_MODEL=your-model-id
LLM_FALLBACK_MODEL=
LLM_TOKEN_PARAMETER=max_tokens
```

Existing `NAN_*` installations continue working unchanged if the generic connection fields are empty. NaN reasoning-only cutoff detection, JSON mode for `deepseek-v4-flash`, and the optional fallback are retained. Fallback happens only for that explicit cutoff and uses the same endpoint and API key.

## Helmcode (recommended for teams)

[Helmcode](https://helmcode.com/) provides an OpenAI-compatible inference platform and [shared, dedicated GPU, and on-premise deployment options](https://helmcode.com/product/overview). Use the API root and model ID supplied for your deployment.

```dotenv
LLM_BASE_URL=https://api.helmcode.com/v1
LLM_API_KEY=your-helmcode-key
LLM_MODEL=your-model-id
LLM_FALLBACK_MODEL=
LLM_TOKEN_PARAMETER=max_tokens
```

## OpenAI

```dotenv
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=your-openai-key
LLM_MODEL=your-chat-completions-model-id
LLM_FALLBACK_MODEL=
LLM_TOKEN_PARAMETER=max_completion_tokens
```

Choose a model supporting Chat Completions, system messages, streaming, JSON answers, and the configured output budget. This app does not call the Responses API, assistants, audio, or embeddings. Generic providers are not sent a temperature override. See the [OpenAI Chat Completions API](https://platform.openai.com/docs/api-reference/chat/create) for model-specific parameter support.

## Other compatible or self-hosted providers

Set all three `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL` fields. The URL must be an API root such as `https://inference.example.com/v1`, not the complete `/chat/completions` path. A self-hosted endpoint needs trusted TLS and bearer authentication. Plain HTTP and keyless local servers are not supported by this profile; use a TLS/authenticating gateway.

Compatibility means accepting `POST /chat/completions` with bearer authentication, `model`, `messages`, `stream: true`, `stream_options.include_usage`, and the selected token-budget field. Responses must contain JSON text matching the review schema, in standard SSE chat deltas or a regular chat completion object. Usage is parsed when provided. Paid operation needs accurate usage; it must not guess billable tokens from absent data.

Output is capped at 65,536 tokens per model call in `src/lib/config.ts`. Check the provider/model supports that maximum. Different context limits, reasoning controls, and schema behavior can still require an adapter change. Validate against a small designated PR; configuration alone is not a live compatibility certification.

## Switching and troubleshooting

Pause repositories and let active reviews finish, update the full configuration family, restart web/worker, then test and re-enable reviews. Changing endpoint/model/fallback changes checkpoint identity so saved batches from a different configuration are not silently reused.

A 401 usually means the key does not match the endpoint; a 404 can mean the model or API path is unavailable; a 400 may indicate an unsupported parameter or output budget; 429 indicates rate limits. Check provider documentation without logging keys or source snapshots. Incomplete streams, malformed findings, and reasoning exhaustion are failures, never clean approvals.
