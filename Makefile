.PHONY: dev install
.PHONY: worker

NODE_IMAGE ?= node:22-alpine

install:
	docker run --rm -v "$(PWD):/app" -w /app $(NODE_IMAGE) npm install

dev:
	docker run --rm \
		-v "$(PWD):/app" \
		-w /app \
		--env-file .env \
		-p 3000:3000 \
		-e DATABASE_URL="postgresql://os7:change-me-platform-password@host.docker.internal:8082/os7_platform" \
		-e AUTH_SECRET="change-me-local-auth-secret" \
		-e MANAGER_URL="http://host.docker.internal:8080" \
		-e PROJECT_USE_AGENT_MODEL="x-ai/grok-4.3" \
		-e PROJECT_DEV_AGENT_MODEL="openai/gpt-5" \
		-e USER_AGENT_MODEL="openai/gpt-5" \
		-e PLATFORM_BASE_URL="http://os7.localhost" \
		-e PLATFORM_DOMAIN="localhost" \
		-e PROJECT_PUBLIC_SCHEME="http" \
		-e OAUTH_INTERNAL_BASE_URL="http://os7_traefik" \
		-e REDIS_URL="redis://host.docker.internal:8084" \
		$(NODE_IMAGE) npm run dev -- --hostname 0.0.0.0

worker:
	docker run --rm \
		-v "$(PWD):/app" \
		-w /app \
		--env-file .env \
		-e DATABASE_URL="postgresql://os7:change-me-platform-password@host.docker.internal:8082/os7_platform" \
		-e MANAGER_URL="http://host.docker.internal:8080" \
		-e PROJECT_USE_AGENT_MODEL="x-ai/grok-4.3" \
		-e PROJECT_DEV_AGENT_MODEL="openai/gpt-5" \
		-e USER_AGENT_MODEL="openai/gpt-5" \
		-e PLATFORM_BASE_URL="http://os7.localhost" \
		-e REDIS_URL="redis://host.docker.internal:8084" \
		$(NODE_IMAGE) npm run worker
