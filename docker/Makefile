# docker/Makefile
.PHONY: build run build-and-plan clean

IMAGE := forge
TAG := latest

build:
	docker build -t $(IMAGE):$(TAG) ..

run:
	docker run --rm \
		-v $$(pwd)/..:/repo \
		-v forge-data:/home/forge/.forge \
		-e OPENAI_API_KEY \
		-e ANTHROPIC_API_KEY \
		$(IMAGE):$(TAG) $(CMD)

build-and-plan: build
	docker run --rm \
		-v $$(pwd)/..:/repo \
		-v forge-data:/home/forge/.forge \
		-e OPENAI_API_KEY \
		$(IMAGE):$(TAG) plan --repo /repo --output-dir /repo/.forge

clean:
	docker rmi $(IMAGE):$(TAG) || true
	docker volume rm forge-data 2>/dev/null || true
