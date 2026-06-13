# Billing Pricing

OS7 charges users in credits. Technical usage, such as LLM input and output tokens, is still stored for audit and debugging, but product UI should present credits.

For the MVP, `usage_prices` stores the amount charged to users directly in credits. Credits are an integer product unit, so final ledger entries are rounded up to whole credits. Credit prices intentionally use a fine-grained scale so short agent messages do not all collapse to the same `1 ₵` minimum. The table also stores estimated provider cost in USD for internal margin analysis. Billing does not convert USD to credits at runtime.

Initial LLM prices are recorded per million tokens:

| Meter | Model | Input credits | Output credits | Input cost USD | Output cost USD |
| --- | --- | ---: | ---: | ---: | ---: |
| `llm_tokens` | `openai/gpt-5-mini` | `2500` | `20000` | `0.25` | `2.00` |
| `llm_tokens` | `openai/gpt-5` | `12500` | `100000` | `1.25` | `10.00` |

Initial S2S prices are recorded per request:

| Meter | Unit credits | Unit cost USD |
| --- | ---: | ---: |
| `s2s_email_send` | `100` | `0.001` |

When usage is billed, OS7 writes an immutable `credit_ledger_entries` row with the charged credits and the estimated cost snapshot. Changing a row in `usage_prices` only affects future ledger entries.
