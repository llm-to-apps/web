.PHONY: dev install
.PHONY: worker

NODE_IMAGE ?= node:22-alpine

install:
	docker run --rm -v "$(PWD):/app" -w /app $(NODE_IMAGE) npm install

dev:
	docker run --rm \
		-v "$(PWD):/app" \
		-w /app \
		-p 3000:3000 \
		-e DATABASE_URL="mysql://root:change-me-root-password@host.docker.internal:3306/llagents_platform" \
		-e AUTH_SECRET="change-me-local-auth-secret" \
		-e MANAGER_URL="http://host.docker.internal:8080" \
		-e APP_ROOT_DOMAIN="localhost" \
		-e REDIS_URL="redis://host.docker.internal:6379" \
		$(NODE_IMAGE) npm run dev -- --hostname 0.0.0.0

worker:
	docker run --rm \
		-v "$(PWD):/app" \
		-w /app \
		-e DATABASE_URL="mysql://root:change-me-root-password@host.docker.internal:3306/llagents_platform" \
		-e MANAGER_URL="http://host.docker.internal:8080" \
		-e REDIS_URL="redis://host.docker.internal:6379" \
		$(NODE_IMAGE) npm run worker
